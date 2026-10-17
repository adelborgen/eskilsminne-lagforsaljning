/* Adminvyn: det lagföräldern (med lagets nyckel) och klubbens administratör (inloggad med e-postlänk) kan göra.
   Lagets åtgärder gäller bara det egna laget. Klubbens åtgärder gäller alla lag i klubben.
   Där det går sker ändringen och loggraden i samma körning, och loggraden skrivs bara om ändringen träffade en rad. */
import { hittaKlubb, hittaLag, lasLag, lasOrdrar, orderFranRad, adminLag, utOrder, loggOmAndrat, loggUttryck } from "./data.js";
import { autentisera } from "./auth.js";
import { skapaLag } from "./bestall.js";
import { nyNyckelText, hashNyckel } from "./krypto.js";
import { oversikt, rensaLag, kanInteOppnas, saknas, kontrolleraSiffror, LAG_EGNA_FALT, LAG_KOLUMN } from "./regler.js";

const har = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const EJ_INLOGGAD = { ok: false, fel: "Fel lag eller nyckel." };

export async function hanteraAdmin(k, d) {
  // En klubb som inte finns (eller inte är godkänd, för den som inte är inloggad) svarar likadant som fel nyckel, så att ingen kan leta efter klubbar.
  const klubb = await hittaKlubb(k, d.klubb);
  if (!klubb) return EJ_INLOGGAD;
  const a = await autentisera(k, klubb, d.lag, d.key);
  if (a.fel) return { ok: false, fel: a.fel };
  const op = String(d.op || "");
  const lagOps = { oversikt: opOversikt, lista: opLista, satt: opSatt, hamtad: opHamtad, hamtadAlla: opHamtadAlla,
    lagSpara: opLagSpara, skickaGodkannande: opSkickaGodkannande, dragTillbaka: opDragTillbaka, taBort: opTaBort };
  const superOps = { lagLista: opLagLista, lagNy: opLagNy, lagUppdatera: opLagUppdatera, nyNyckel: opNyNyckel,
    godkann: opGodkann, skickaTillbaka: opSkickaTillbaka, lagTaBort: opLagTaBort };
  let svar;
  if (har(lagOps, op)) {
    if (!a.lag) return { ok: false, fel: "Okänt lag." };
    svar = await lagOps[op](k, klubb, a.lag, d, a.roll);
  } else if (har(superOps, op)) {
    if (a.roll !== "super") return { ok: false, fel: "Bara klubbens administratör får göra det här." };
    svar = await superOps[op](k, klubb, d);
  } else {
    return { ok: false, fel: "Okänd åtgärd." };
  }
  svar.roll = a.roll;
  return svar;
}

/* ---------- Lagets egna åtgärder ---------- */
async function opOversikt(k, klubb, lag) {
  return { ok: true, lag: adminLag(lag), oversikt: oversikt(lag, await lasOrdrar(k, lag.id)) };
}

async function opLista(k, klubb, lag) {
  return { ok: true, lag: adminLag(lag), ordrar: (await lasOrdrar(k, lag.id)).reverse().map(utOrder) };
}

// Ett ordernummer är bara siffror: "1; DELETE …" eller "1abc" är inget ordernummer (parseInt hade gett 1)
const ordernummer = (d) => {
  const id = typeof d.id === "number" ? String(d.id) : d.id;
  return typeof id === "string" && /^\d{1,9}$/.test(id.trim()) ? parseInt(id, 10) : null;
};
const hamtaOrder = (ordrar, nr) => ordrar.find((o) => o.nr === nr);

// Sätter Betald för en order: JA, AVBRUTEN eller tomt (ångra).
async function opSatt(k, klubb, lag, d) {
  const varde = String(d.varde === undefined || d.varde === null ? "" : d.varde).toUpperCase();
  if (["JA", "AVBRUTEN", ""].indexOf(varde) < 0) return { ok: false, fel: "Felaktigt värde." };
  const nr = ordernummer(d);
  if (nr === null) return { ok: false, fel: "Felaktigt ordernummer." };
  if (!hamtaOrder(await lasOrdrar(k, lag.id), nr)) return { ok: false, fel: "Hittar ingen order " + d.id + "." };
  await k.db.batch([
    k.db.prepare("UPDATE bestallning SET betald = ?3 WHERE lag_id = ?1 AND nr = ?2").bind(lag.id, nr, varde),
    loggOmAndrat(k, klubb.id, lag.slug, "betald=" + (varde || "(ångrad)"), String(nr).padStart(4, "0"), varde)
  ]);
  const ordrar = await lasOrdrar(k, lag.id);
  return { ok: true, order: utOrder(hamtaOrder(ordrar, nr)), oversikt: oversikt(lag, ordrar) };
}

// Sätter Hämtad för en order: JA eller tomt (ångra). En avbruten order kan inte hämtas.
async function opHamtad(k, klubb, lag, d) {
  const varde = String(d.varde === undefined || d.varde === null ? "" : d.varde).toUpperCase();
  if (["JA", ""].indexOf(varde) < 0) return { ok: false, fel: "Felaktigt värde." };
  const nr = ordernummer(d);
  if (nr === null) return { ok: false, fel: "Felaktigt ordernummer." };
  const o = hamtaOrder(await lasOrdrar(k, lag.id), nr);
  if (!o) return { ok: false, fel: "Hittar ingen order " + d.id + "." };
  if (varde === "JA" && o.betald === "AVBRUTEN") return { ok: false, fel: "Beställningen är avbruten och kan inte hämtas." };
  await k.db.batch([
    k.db.prepare("UPDATE bestallning SET hamtad = ?3 WHERE lag_id = ?1 AND nr = ?2 AND NOT (?3 = 'JA' AND betald = 'AVBRUTEN')").bind(lag.id, nr, varde),
    loggOmAndrat(k, klubb.id, lag.slug, "hamtad=" + (varde || "(ångrad)"), o.id, varde)
  ]);
  const ordrar = await lasOrdrar(k, lag.id);
  return { ok: true, order: utOrder(hamtaOrder(ordrar, nr)), oversikt: oversikt(lag, ordrar) };
}

// Tar bort en beställning, till exempel en testbeställning eller en dubblett. Betalda och hämtade beställningar kan inte tas bort:
// ångra betalningen eller hämtningen först. Raden försvinner helt, med barnets namn och mobilnummer. I loggen sparas bara
// ordernummer, antal och belopp, aldrig några personuppgifter. Ordernumret används inte igen.
async function opTaBort(k, klubb, lag, d) {
  const nr = ordernummer(d);
  if (nr === null) return { ok: false, fel: "Felaktigt ordernummer." };
  const o = hamtaOrder(await lasOrdrar(k, lag.id), nr);
  if (!o) return { ok: false, fel: "Hittar ingen order " + d.id + "." };
  if (o.betald === "JA") return { ok: false, fel: "En betald beställning kan inte tas bort. Ångra betalningen först om den är fel." };
  if (o.hamtad === "JA") return { ok: false, fel: "En hämtad beställning kan inte tas bort. Ångra hämtningen först." };
  const svar = await k.db.batch([
    k.db.prepare("DELETE FROM bestallning WHERE lag_id = ?1 AND nr = ?2 AND betald != 'JA' AND hamtad != 'JA'").bind(lag.id, nr),
    loggOmAndrat(k, klubb.id, lag.slug, "order borttagen", o.id, o.antal + " st, " + o.belopp + " kr")
  ]);
  if (!svar[0].meta.changes) return { ok: false, fel: "Beställningen ändrades just nu och kunde inte tas bort. Försök igen." };
  return { ok: true, borttagen: o.id, oversikt: oversikt(lag, await lasOrdrar(k, lag.id)) };
}

// Markerar alla betalda beställningar som inte redan är hämtade. Obetalda och avbrutna rörs inte.
async function opHamtadAlla(k, klubb, lag) {
  const svar = await k.db.batch([
    k.db.prepare("UPDATE bestallning SET hamtad = 'JA' WHERE lag_id = ?1 AND hamtad != 'JA' AND betald = 'JA'").bind(lag.id),
    k.db.prepare("INSERT INTO logg (tid, klubb_id, lag_slug, atgard, order_nr, varde) VALUES (?1, ?2, ?3, 'hamtad=alla betalda', '', (SELECT changes() || ' st'))")
      .bind(new Date(k.nu()).toISOString(), klubb.id, lag.slug)
  ]);
  const ordrar = await lasOrdrar(k, lag.id);
  const obetaldaKvar = ordrar.filter((o) => o.hamtad !== "JA" && o.betald === "").length;
  return { ok: true, markerade: svar[0].meta.changes, obetaldaKvar, ordrar: ordrar.slice().reverse().map(utOrder), oversikt: oversikt(lag, ordrar) };
}

/* ---------- Skriva försäljningens uppgifter ---------- */
// Skriver bara kända fält: nyckel, adress och räknare kan aldrig ändras den här vägen. Kolumnnamnen kommer från LAG_KOLUMN, aldrig från anropet.
// Är bara utkast satt ändras ingenting om försäljningen inte är ett utkast (kontrollen är en del av uttrycket, så den håller även om
// något ändrats sedan lagret lästes). Ger antalet ändrade rader.
async function skrivFalt(k, klubb, lag, r, bara_utkast) {
  const falt = Object.keys(r).filter((f) => har(LAG_KOLUMN, f));
  if (!falt.length) return { andrade: falt, rader: 1 };
  const satt = falt.map((f, i) => LAG_KOLUMN[f] + " = ?" + (i + 3)).join(", ");
  const varden = falt.map((f) => r[f]);
  const svar = await k.db.batch([
    k.db.prepare("UPDATE lag SET " + satt + " WHERE id = ?1 AND (?2 = 0 OR status = 'utkast')").bind(lag.id, bara_utkast ? 1 : 0, ...varden),
    loggOmAndrat(k, klubb.id, lag.slug, (bara_utkast ? "försäljning sparad: " : "lag ändrat: ") + falt.join(", "), "", "")
  ]);
  return { andrade: falt, rader: svar[0].meta.changes };
}

// Kontrollerar att siffrorna hänger ihop när de nya värdena läggs på de befintliga.
function kontrolleraNya(lag, r) {
  return kontrolleraSiffror({ pris: r.pris !== undefined ? r.pris : lag.pris, inkopspris: r.inkopspris !== undefined ? r.inkopspris : lag.inkopspris,
    minimum: r.minimum !== undefined ? r.minimum : lag.minimum, mal: r.mal !== undefined ? r.mal : lag.mal });
}

// Lagförälderns egen uppsättning. Bara försäljningens uppgifter (inte namn, status eller adress), och bara medan den är ett utkast.
// Klubbens administratör får ändra även efter godkännande.
async function opLagSpara(k, klubb, lag, d, roll) {
  const inn = d.falt || {}, falt = {};
  LAG_EGNA_FALT.forEach((f) => { if (inn[f] !== undefined) falt[f] = inn[f]; });
  const r = rensaLag(falt, false);
  if (r.fel) return { ok: false, fel: r.fel };
  const l = await hittaLag(k, klubb.id, lag.slug);   // läs om: det kan ha ändrats
  if (!l) return { ok: false, fel: "Okänt lag." };
  const last = { ok: false, fel: "Försäljningen är låst medan klubben granskar eller efter godkännandet. Be klubbens administratör ändra." };
  if (roll !== "super" && l.status !== "utkast") return last;
  const fel = kontrolleraNya(l, r);
  if (fel) return { ok: false, fel };
  const s = await skrivFalt(k, klubb, l, r, roll !== "super");
  if (!s.rader) return last;
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

/* ---------- Godkännande ---------- */
// Byter status bara om försäljningen fortfarande har den status den lästes med. Ger sant om bytet gjordes.
async function sattStatus(k, klubb, l, fran, till, kommentar, atgard, varde) {
  const svar = await k.db.batch([
    k.db.prepare("UPDATE lag SET status = ?3, kommentar = ?4 WHERE id = ?1 AND status = ?2").bind(l.id, fran, till, kommentar || ""),
    loggOmAndrat(k, klubb.id, l.slug, atgard, "", varde)
  ]);
  return svar[0].meta.changes > 0;
}

async function opSkickaGodkannande(k, klubb, lag, d) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status === "granskas") return { ok: false, fel: "Försäljningen väntar redan på godkännande." };
  if (l.status !== "utkast") return { ok: false, fel: "Försäljningen är redan godkänd." };
  if (d.bekraftat !== true) return { ok: false, fel: "Bekräfta de två punkterna först." };
  const fel = saknas(l);
  if (fel) return { ok: false, fel };
  if (!await sattStatus(k, klubb, l, "utkast", "granskas", "", "skickad för godkännande", "")) return { ok: false, fel: "Försäljningen ändrades just nu. Försök igen." };
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

async function opDragTillbaka(k, klubb, lag) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
  if (!await sattStatus(k, klubb, l, "granskas", "utkast", "", "tillbakadragen till utkast", "")) return { ok: false, fel: "Försäljningen ändrades just nu. Försök igen." };
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

/* ---------- Klubbens åtgärder (bara klubbens administratör) ---------- */
async function opLagLista(k, klubb) {
  const lagen = await lasLag(k, klubb.id);
  const { results } = await k.db.prepare(`SELECT b.lag_id, b.antal, b.belopp, b.betald, b.hamtad FROM bestallning b
    JOIN lag l ON l.id = b.lag_id WHERE l.klubb_id = ?1`).bind(klubb.id).all();
  const perLag = {};
  results.forEach((o) => { (perLag[o.lag_id] = perLag[o.lag_id] || []).push(o); });
  return { ok: true, lag: lagen.map((l) => {
    const ov = oversikt(l, perLag[l.id] || []), ut = adminLag(l);
    ut.oversikt = { bestallt: ov.bestallt, betalt: ov.betalt, betaltKr: ov.betaltKr, obetalt: ov.obetalt, hamtat: ov.hamtat, attHamta: ov.attHamta };
    return ut;
  }) };
}

async function opLagNy(k, klubb, d) {
  const r = rensaLag(d.data || {}, true);
  if (r.fel) return { ok: false, fel: r.fel };
  const oppen = kanInteOppnas({ produkt: { namn: r.produkt, enhetEn: r.enhetEn, enhet: r.enhet }, swish: { nummer: r.swishNummer, namnPaKonto: r.mottagare },
    pris: r.pris, inkopspris: r.inkopspris, minimum: r.minimum, mal: r.mal, lager: r.lager }, r.status);
  if (oppen) return { ok: false, fel: oppen };
  return await skapaLag(k, klubb, r, "klubb");
}

// Klubben tar bort ett lag som aldrig har öppnat: ett felaktigt eller dubbelt utkast, eller ett som väntar på godkännande.
// Ett lag som har varit godkänt eller har beställningar kan inte tas bort, så att inga beställningar tappar sitt lag.
async function opLagTaBort(k, klubb, d) {
  const lag = await hittaLag(k, klubb.id, d.slug);
  if (!lag) return { ok: false, fel: "Okänt lag." };
  if (lag.status !== "utkast" && lag.status !== "granskas") return { ok: false, fel: "Bara utkast och försäljningar som väntar på godkännande kan tas bort. Avsluta försäljningen i stället." };
  if ((await lasOrdrar(k, lag.id)).length) return { ok: false, fel: "Laget har beställningar och kan inte tas bort." };
  const svar = await k.db.batch([
    k.db.prepare(`DELETE FROM lag WHERE id = ?1 AND status IN ('utkast', 'granskas')
      AND NOT EXISTS (SELECT 1 FROM bestallning WHERE lag_id = ?1)`).bind(lag.id),
    loggOmAndrat(k, klubb.id, lag.slug, "lag borttaget", "", lag.status)
  ]);
  if (!svar[0].meta.changes) return { ok: false, fel: "Laget ändrades just nu och kunde inte tas bort. Försök igen." };
  return { ok: true, borttaget: lag.slug };
}

async function opLagUppdatera(k, klubb, d) {
  const r = rensaLag(d.falt || {}, false);
  if (r.fel) return { ok: false, fel: r.fel };
  const lag = await hittaLag(k, klubb.id, d.slug);
  if (!lag) return { ok: false, fel: "Okänt lag." };
  const fel = kontrolleraNya(lag, r);
  if (fel) return { ok: false, fel };
  // Hur laget ser ut efter ändringen: får det öppnas (snart eller pagar) måste allt föräldrarna behöver vara ifyllt
  const vp = (f, nuvarande) => r[f] !== undefined ? r[f] : nuvarande;
  const efter = { produkt: { namn: vp("produkt", lag.produkt.namn), enhetEn: vp("enhetEn", lag.produkt.enhetEn), enhet: vp("enhet", lag.produkt.enhet) },
    swish: { nummer: vp("swishNummer", lag.swish.nummer), namnPaKonto: vp("mottagare", lag.swish.namnPaKonto) },
    pris: vp("pris", lag.pris), inkopspris: vp("inkopspris", lag.inkopspris), minimum: vp("minimum", lag.minimum), mal: vp("mal", lag.mal), lager: vp("lager", lag.lager) };
  const oppen = kanInteOppnas(efter, r.status !== undefined ? r.status : lag.status);
  if (oppen) return { ok: false, fel: oppen };
  await skrivFalt(k, klubb, lag, r, false);
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, lag.slug)) };
}

// Klubben godkänner: öppnar direkt (pagar) eller senare (snart). Kontrollerar uppgifterna en gång till eftersom de kan ha ändrats.
async function opGodkann(k, klubb, d) {
  const till = String(d.till || "");
  if (["snart", "pagar"].indexOf(till) < 0) return { ok: false, fel: "Välj om försäljningen ska öppnas nu eller senare." };
  const l = await hittaLag(k, klubb.id, d.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
  const fel = saknas(l);
  if (fel) return { ok: false, fel };
  if (!await sattStatus(k, klubb, l, "granskas", till, "", "godkänd av klubben", till)) return { ok: false, fel: "Försäljningen ändrades just nu. Försök igen." };
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

// Klubben skickar tillbaka med en kommentar som lagföräldern ser.
async function opSkickaTillbaka(k, klubb, d) {
  const kommentar = String(d.kommentar === undefined || d.kommentar === null ? "" : d.kommentar).trim().replace(/^[=+\-@\s]+/, "").slice(0, 300);
  if (!kommentar) return { ok: false, fel: "Skriv vad som behöver ändras." };
  const l = await hittaLag(k, klubb.id, d.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
  if (!await sattStatus(k, klubb, l, "granskas", "utkast", kommentar, "skickad tillbaka till laget", kommentar)) return { ok: false, fel: "Försäljningen ändrades just nu. Försök igen." };
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

async function opNyNyckel(k, klubb, d) {
  const lag = await hittaLag(k, klubb.id, d.slug);
  if (!lag) return { ok: false, fel: "Okänt lag." };
  const key = nyNyckelText();
  await k.db.batch([
    k.db.prepare("UPDATE lag SET nyckel_hash = ?2 WHERE id = ?1").bind(lag.id, await hashNyckel(key)),
    loggUttryck(k, klubb.id, lag.slug, "ny nyckel", "", "")
  ]);
  return { ok: true, slug: lag.slug, key };
}
