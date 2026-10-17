/* Adminvyn: det lagföräldern (med lagets nyckel) och klubbens administratör (inloggad med e-postlänk) kan göra.
   Lagföräldern äger försäljningen: fyller i den, skickar den till klubben, öppnar och avslutar den, ändrar den (då granskas den igen),
   bockar av betalt och hämtat, och skickar pengarna till klubben när försäljningen är avslutad.
   Klubbens administratör granskar: godkänner (då öppnar försäljningen), skickar tillbaka, stoppar i nödfall, ger ny nyckel, tar bort
   skräputkast, skriver in klubbens bankgiro och kvitterar pengarna. Klubben ser beställningarna men ändrar dem inte, ändrar aldrig
   försäljningens uppgifter och lägger inte till lag. Klubben får mejl när en försäljning väntar på godkännande, när den är avslutad och
   när pengarna är skickade.
   Där det går sker ändringen och loggraden i samma körning, och loggraden skrivs bara om ändringen träffade en rad. */
import { hittaKlubb, hittaLag, lasLag, lasOrdrar, adminLag, utOrder, loggOmAndrat, loggUttryck, iso } from "./data.js";
import { autentisera } from "./auth.js";
import { nyNyckelText, hashNyckel } from "./krypto.js";
import { skickaNotis } from "./epost.js";
import { oversikt, rensaLag, saknas, kontrolleraSiffror, normBankgiro, LAG_EGNA_FALT, LAG_KOLUMN } from "./regler.js";

const har = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const EJ_INLOGGAD = { ok: false, fel: "Fel lag eller nyckel." };

export async function hanteraAdmin(k, d) {
  // En klubb som inte finns (eller inte är godkänd, för den som inte är inloggad) svarar likadant som fel nyckel, så att ingen kan leta efter klubbar.
  const klubb = await hittaKlubb(k, d.klubb);
  if (!klubb) return EJ_INLOGGAD;
  const a = await autentisera(k, klubb, d.lag, d.key);
  if (a.fel) return { ok: false, fel: a.fel };
  const op = String(d.op || "");
  const delade = { oversikt: opOversikt, lista: opLista };
  const lagOps = { satt: opSatt, hamtad: opHamtad, hamtadAlla: opHamtadAlla, taBort: opTaBort,
    lagSpara: opLagSpara, skickaGodkannande: opSkickaGodkannande, dragTillbaka: opDragTillbaka,
    oppna: opOppna, avsluta: opAvsluta, andra: opAndra, pengarSkickade: opPengarSkickade };
  const superOps = { lagLista: opLagLista, godkann: opGodkann, skickaTillbaka: opSkickaTillbaka, stoppa: opStoppa,
    nyNyckel: opNyNyckel, lagTaBort: opLagTaBort, pengarMottagna: opPengarMottagna, klubbSpara: opKlubbSpara };
  let svar;
  if (har(delade, op)) {
    if (!a.lag) return { ok: false, fel: "Okänt lag." };
    svar = await delade[op](k, klubb, a.lag, d);
  } else if (har(lagOps, op)) {
    if (a.roll !== "lag") return { ok: false, fel: "Det här gör lagföräldern. Klubben ser försäljningen och beställningarna men ändrar dem inte." };
    svar = await lagOps[op](k, klubb, a.lag, d);
  } else if (har(superOps, op)) {
    if (a.roll !== "super") return { ok: false, fel: "Bara klubbens administratör får göra det här." };
    svar = await superOps[op](k, klubb, d);
  } else {
    return { ok: false, fel: "Okänd åtgärd." };
  }
  svar.roll = a.roll;
  svar.klubb = { namn: klubb.namn, bankgiro: klubb.bankgiro || "" };
  return svar;
}

/* ---------- Notiser till klubben ---------- */
const kr = (n) => (Math.round(n * 100) / 100).toLocaleString("sv-SE") + " kr";

// Mejl till klubbens administratörer. Det skickas efter svaret och stoppar aldrig åtgärden: kommer det inte fram syns ändå allt i klubbens vy.
// Bara lagets namn, antal och belopp: aldrig barnens uppgifter eller värden som lagföräldern skrivit in (se epost.js).
async function notis(k, klubb, amne, rader) {
  const { results } = await k.db.prepare("SELECT epost FROM klubb_admin WHERE klubb_id = ?1 ORDER BY epost").bind(klubb.id).all();
  if (!results.length) return;
  const bas = (k.env.SIDA_ORIGIN || new URL(k.request.url).origin).replace(/\/$/, "");
  const skicka = skickaNotis(k, results.map((r) => r.epost), amne, [...rader, "", "Klubbens vy: " + bas + "/" + klubb.slug + "/admin.html"])
    .catch(() => { console.error("notisen kunde inte skickas"); });
  if (k.waitUntil) k.waitUntil(skicka); else await skicka;
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
  const o = hamtaOrder(await lasOrdrar(k, lag.id), nr);
  if (!o) return { ok: false, fel: "Hittar ingen order " + d.id + "." };
  // Först betald, sedan hämtad, och ångra i omvänd ordning: en hämtad beställning blir inte obetald eller avbruten
  if (varde !== "JA" && o.hamtad === "JA") return { ok: false, fel: "Beställningen är hämtad. Ångra hämtningen först." };
  await k.db.batch([
    k.db.prepare("UPDATE bestallning SET betald = ?3 WHERE lag_id = ?1 AND nr = ?2 AND (?3 = 'JA' OR hamtad != 'JA')").bind(lag.id, nr, varde),
    loggOmAndrat(k, klubb.id, lag.slug, "betald=" + (varde || "(ångrad)"), String(nr).padStart(4, "0"), varde)
  ]);
  const ordrar = await lasOrdrar(k, lag.id);
  return { ok: true, order: utOrder(hamtaOrder(ordrar, nr)), oversikt: oversikt(lag, ordrar) };
}

// Sätter Hämtad för en order: JA eller tomt (ångra). Bara en betald beställning kan hämtas: betalar föräldern på plats markeras den
// som betald först.
async function opHamtad(k, klubb, lag, d) {
  const varde = String(d.varde === undefined || d.varde === null ? "" : d.varde).toUpperCase();
  if (["JA", ""].indexOf(varde) < 0) return { ok: false, fel: "Felaktigt värde." };
  const nr = ordernummer(d);
  if (nr === null) return { ok: false, fel: "Felaktigt ordernummer." };
  const o = hamtaOrder(await lasOrdrar(k, lag.id), nr);
  if (!o) return { ok: false, fel: "Hittar ingen order " + d.id + "." };
  if (varde === "JA" && o.betald === "AVBRUTEN") return { ok: false, fel: "Beställningen är avbruten och kan inte hämtas." };
  if (varde === "JA" && o.betald !== "JA") return { ok: false, fel: "Markera beställningen som betald först." };
  await k.db.batch([
    k.db.prepare("UPDATE bestallning SET hamtad = ?3 WHERE lag_id = ?1 AND nr = ?2 AND NOT (?3 = 'JA' AND betald != 'JA')").bind(lag.id, nr, varde),
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
// Ingenting ändras om försäljningen inte är ett utkast (kontrollen är en del av uttrycket, så den håller även om något ändrats sedan
// laget lästes). Ger antalet ändrade rader.
async function skrivFalt(k, klubb, lag, r) {
  const falt = Object.keys(r).filter((f) => har(LAG_KOLUMN, f));
  if (!falt.length) return { andrade: falt, rader: 1 };
  const satt = falt.map((f, i) => LAG_KOLUMN[f] + " = ?" + (i + 2)).join(", ");
  const varden = falt.map((f) => r[f]);
  const svar = await k.db.batch([
    k.db.prepare("UPDATE lag SET " + satt + " WHERE id = ?1 AND status = 'utkast'").bind(lag.id, ...varden),
    loggOmAndrat(k, klubb.id, lag.slug, "försäljning sparad: " + falt.join(", "), "", "")
  ]);
  return { andrade: falt, rader: svar[0].meta.changes };
}

// Kontrollerar att siffrorna hänger ihop när de nya värdena läggs på de befintliga.
function kontrolleraNya(lag, r) {
  return kontrolleraSiffror({ pris: r.pris !== undefined ? r.pris : lag.pris, inkopspris: r.inkopspris !== undefined ? r.inkopspris : lag.inkopspris,
    minimum: r.minimum !== undefined ? r.minimum : lag.minimum, mal: r.mal !== undefined ? r.mal : lag.mal });
}

// Lagförälderns egen uppsättning. Bara försäljningens uppgifter (inte namn, status eller adress), och bara medan den är ett utkast.
// Efter godkännandet ändrar lagföräldern genom att välja Ändra uppgifter (opAndra), och då granskas försäljningen igen.
async function opLagSpara(k, klubb, lag, d) {
  const inn = d.falt || {}, falt = {};
  LAG_EGNA_FALT.forEach((f) => { if (inn[f] !== undefined) falt[f] = inn[f]; });
  const r = rensaLag(falt, false);
  if (r.fel) return { ok: false, fel: r.fel };
  const l = await hittaLag(k, klubb.id, lag.slug);   // läs om: det kan ha ändrats
  if (!l) return { ok: false, fel: "Okänt lag." };
  const last = { ok: false, fel: "Försäljningen är låst medan klubben granskar eller efter godkännandet. Välj Ändra uppgifter för att ändra den." };
  if (l.status !== "utkast") return last;
  const fel = kontrolleraNya(l, r);
  if (fel) return { ok: false, fel };
  const s = await skrivFalt(k, klubb, l, r);
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
  if (!await sattStatus(k, klubb, l, "utkast", "granskas", "", "skickad för godkännande", "")) return andrades();
  const ny = adminLag(await hittaLag(k, klubb.id, l.slug));
  const andr = ny.andringar.map((a) => a.namn);
  await notis(k, klubb, l.namn + " väntar på godkännande", [
    l.namn + " har skickat in sin försäljning till klubben.",
    andr.length ? "Ändrat sedan klubben godkände den senast: " + andr.join(", ") + "." : (l.godkant ? "Inget är ändrat sedan klubben godkände den senast." : "Den har inte varit godkänd tidigare."),
    ny.andringar.some((a) => a.falt === "swishNummer" || a.falt === "mottagare") ? "Swish-uppgifterna är ändrade. Kontrollera att numret är lagets innan du godkänner." : "",
    "Försäljningen syns inte för föräldrarna förrän klubben har godkänt den."
  ].filter(Boolean));
  return { ok: true, lag: ny };
}

async function opDragTillbaka(k, klubb, lag) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
  if (!await sattStatus(k, klubb, l, "granskas", "utkast", "", "tillbakadragen till utkast", "")) return andrades();
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

/* ---------- Lagföräldern öppnar, avslutar och ändrar en godkänd försäljning ---------- */
const andrades = () => ({ ok: false, fel: "Försäljningen ändrades just nu. Försök igen." });   // ett nytt svar varje gång (roll läggs till på svaret)

// Öppnar en godkänd försäljning, eller öppnar en avslutad igen. Bara det klubben har godkänt kan öppnas: ett utkast eller en försäljning
// som väntar på granskning (till exempel efter att klubben stoppat den) går inte.
async function opOppna(k, klubb, lag) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "snart" && l.status !== "avslutad") return { ok: false, fel: l.status === "pagar" ? "Försäljningen är redan öppen." : "Försäljningen måste godkännas av klubben innan den kan öppnas." };
  const fel = saknas(l);
  if (fel) return { ok: false, fel };
  if (!await sattStatus(k, klubb, l, l.status, "pagar", "", "öppnad av lagföräldern", "")) return andrades();
  // Pengarna redovisas när försäljningen är avslutad igen. Det som redan skickats och kvitterats finns kvar i loggen.
  if (l.pengar.skickatTid) await k.db.prepare("UPDATE lag SET pengar_skickat_kr = 0, pengar_skickat_tid = '', pengar_mottaget_tid = '' WHERE id = ?1").bind(l.id).run();
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

async function opAvsluta(k, klubb, lag) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "pagar" && l.status !== "snart") return { ok: false, fel: "Försäljningen är inte öppen." };
  if (!await sattStatus(k, klubb, l, l.status, "avslutad", "", "avslutad av lagföräldern", "")) return andrades();
  const ov = oversikt(l, await lasOrdrar(k, l.id));
  await notis(k, klubb, l.namn + " har avslutat sin försäljning", [
    l.namn + " har avslutat försäljningen.",
    "Beställt: " + ov.bestallt + " st" + (l.kartong > 0 ? ". Att beställa från leverantören: " + ov.levereras + " st (" + ov.kartonger + " kartonger)." : "."),
    "Betalt till laget: " + kr(ov.betaltKr) + (ov.obetalt ? ". Obetalt: " + ov.obetalt + " st (" + kr(ov.obetaltKr) + ")." : "."),
    "Inköpspris enligt lagets uppgifter: " + kr(ov.faktura) + ".",
    "Lagföräldern skickar pengarna till klubbens bankgiro och markerar det i appen. Du får ett mejl när det är gjort."
  ]);
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

// Lagföräldern markerar att pengarna är skickade till klubben (ja: true), eller ångrar det (ja: false) innan klubben har kvitterat.
// Beloppet räknas av servern: allt som är markerat som betalt.
async function opPengarSkickade(k, klubb, lag, d) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "avslutad") return { ok: false, fel: "Avsluta försäljningen först. Sedan skickar du pengarna till klubben." };
  if (l.pengar.mottagetTid) return { ok: false, fel: "Klubben har redan kvitterat pengarna." };
  if (d.ja === false) {
    const svar = await k.db.batch([
      k.db.prepare("UPDATE lag SET pengar_skickat_kr = 0, pengar_skickat_tid = '' WHERE id = ?1 AND pengar_mottaget_tid = '' AND pengar_skickat_tid != ''").bind(l.id),
      loggOmAndrat(k, klubb.id, l.slug, "pengar skickade ångrat", "", "")
    ]);
    if (!svar[0].meta.changes) return { ok: false, fel: "Pengarna är inte markerade som skickade." };
    return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
  }
  if (d.ja !== true) return { ok: false, fel: "Felaktigt värde." };
  if (l.pengar.skickatTid) return { ok: false, fel: "Pengarna är redan markerade som skickade." };
  const belopp = oversikt(l, await lasOrdrar(k, l.id)).betaltKr;
  if (!(belopp > 0)) return { ok: false, fel: "Inga beställningar är markerade som betalda, så det finns inga pengar att skicka." };
  const svar = await k.db.batch([
    k.db.prepare(`UPDATE lag SET pengar_skickat_kr = ?2, pengar_skickat_tid = ?3 WHERE id = ?1 AND status = 'avslutad'
      AND pengar_skickat_tid = '' AND pengar_mottaget_tid = ''`).bind(l.id, belopp, iso(k)),
    loggOmAndrat(k, klubb.id, l.slug, "pengar skickade till klubben", "", belopp + " kr")
  ]);
  if (!svar[0].meta.changes) return andrades();
  await notis(k, klubb, l.namn + " har skickat pengarna", [
    l.namn + " har markerat att " + kr(belopp) + " är skickade till klubbens bankgiro" + (klubb.bankgiro ? " " + klubb.bankgiro : "") + ".",
    "Kvittera i klubbens vy när pengarna har kommit."
  ]);
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

// Ändra uppgifter efter godkännandet: försäljningen stängs och blir ett utkast igen, som lagföräldern ändrar och skickar till klubben.
// Beställningarna finns kvar.
async function opAndra(k, klubb, lag) {
  const l = await hittaLag(k, klubb.id, lag.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (["snart", "pagar", "avslutad"].indexOf(l.status) < 0) return { ok: false, fel: "Försäljningen går redan att ändra." };
  if (!await sattStatus(k, klubb, l, l.status, "utkast", "", "öppnad för ändring av lagföräldern", l.status)) return andrades();
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

// Det klubben godkänner, som JSON. Byggs av databasen i samma uttryck som godkännandet, så att det är exakt det som godkändes.
// Kolumnnamnen kommer från LAG_KOLUMN, aldrig från anropet.
const OGONBLICK = "json_object(" + LAG_EGNA_FALT.map((f) => "'" + f + "', " + LAG_KOLUMN[f]).join(", ") + ")";

// Klubben godkänner, och då öppnar försäljningen: den syns för föräldrarna och går att beställa från. Lagföräldern kan sedan avsluta den
// och öppna den igen. Uppgifterna kontrolleras en gång till, och det som godkändes sparas, så att en senare ändring syns för klubben.
async function opGodkann(k, klubb, d) {
  const l = await hittaLag(k, klubb.id, d.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
  const fel = saknas(l);
  if (fel) return { ok: false, fel };
  const svar = await k.db.batch([
    // En ny försäljningsperiod: pengarna redovisas på nytt när den är avslutad (det som redan skickats finns kvar i loggen)
    k.db.prepare("UPDATE lag SET status = 'pagar', kommentar = '', godkant = " + OGONBLICK + `,
      pengar_skickat_kr = 0, pengar_skickat_tid = '', pengar_mottaget_tid = '' WHERE id = ?1 AND status = 'granskas'`).bind(l.id),
    loggOmAndrat(k, klubb.id, l.slug, "godkänd av klubben", "", "pagar")
  ]);
  if (!svar[0].meta.changes) return andrades();
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

// Klubben kvitterar att pengarna har kommit (ja: true), eller ångrar kvittensen (ja: false).
async function opPengarMottagna(k, klubb, d) {
  const l = await hittaLag(k, klubb.id, d.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (d.ja !== true && d.ja !== false) return { ok: false, fel: "Felaktigt värde." };
  if (!l.pengar.skickatTid) return { ok: false, fel: "Laget har inte markerat att pengarna är skickade." };
  const svar = await k.db.batch([
    k.db.prepare("UPDATE lag SET pengar_mottaget_tid = ?2 WHERE id = ?1 AND pengar_skickat_tid != ''").bind(l.id, d.ja ? iso(k) : ""),
    loggOmAndrat(k, klubb.id, l.slug, d.ja ? "pengar mottagna av klubben" : "kvittens ångrad", "", l.pengar.skickatKr + " kr")
  ]);
  if (!svar[0].meta.changes) return andrades();
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

// Klubbens egna uppgifter. Än så länge bara bankgirot som lagen skickar pengarna till.
async function opKlubbSpara(k, klubb, d) {
  const bg = normBankgiro(d.bankgiro);
  if (bg === null) return { ok: false, fel: "Bankgirot ska vara sju eller åtta siffror, till exempel 1234-5678." };
  await k.db.batch([
    k.db.prepare("UPDATE klubb SET bankgiro = ?2 WHERE id = ?1").bind(klubb.id, bg),
    loggUttryck(k, klubb.id, "", "bankgiro ändrat", "", bg)
  ]);
  klubb.bankgiro = bg;
  return { ok: true };
}

// Klubben skickar tillbaka med en kommentar som lagföräldern ser.
async function opSkickaTillbaka(k, klubb, d) {
  const kommentar = String(d.kommentar === undefined || d.kommentar === null ? "" : d.kommentar).trim().replace(/^[=+\-@\s]+/, "").slice(0, 300);
  if (!kommentar) return { ok: false, fel: "Skriv vad som behöver ändras." };
  const l = await hittaLag(k, klubb.id, d.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (l.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
  if (!await sattStatus(k, klubb, l, "granskas", "utkast", kommentar, "skickad tillbaka till laget", kommentar)) return andrades();
  return { ok: true, lag: adminLag(await hittaLag(k, klubb.id, l.slug)) };
}

// Klubben stoppar en godkänd försäljning i nödfall, till exempel om Swish-numret är fel. Den blir ett utkast igen med klubbens kommentar,
// syns inte för föräldrarna och kan inte öppnas förrän lagföräldern har rättat den och klubben har godkänt den igen. Beställningarna finns kvar.
async function opStoppa(k, klubb, d) {
  const kommentar = String(d.kommentar === undefined || d.kommentar === null ? "" : d.kommentar).trim().replace(/^[=+\-@\s]+/, "").slice(0, 300);
  if (!kommentar) return { ok: false, fel: "Skriv varför försäljningen stoppas. Lagföräldern ser det." };
  const l = await hittaLag(k, klubb.id, d.slug);
  if (!l) return { ok: false, fel: "Okänt lag." };
  if (["snart", "pagar", "avslutad"].indexOf(l.status) < 0) return { ok: false, fel: "Försäljningen är inte godkänd, så det finns inget att stoppa." };
  if (!await sattStatus(k, klubb, l, l.status, "utkast", "Klubben stoppade försäljningen: " + kommentar, "stoppad av klubben", kommentar)) return andrades();
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
