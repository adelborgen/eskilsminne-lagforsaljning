/* Allt som läser och skriver i databasen (D1). Alla frågor har parametrar. Ingen text från en användare hamnar i själva SQL-texten.
   k är anropets sammanhang: { env, db, nu } (se api.js). */

import { andringar } from "./regler.js";

export function iso(k) { return new Date(k.nu()).toISOString(); }

/* ---------- Klubb ---------- */
export async function hittaKlubb(k, slug) {
  slug = String(slug || "").toLowerCase().slice(0, 40);
  if (!slug) return null;
  return await k.db.prepare("SELECT id, slug, namn, motto, status, bankgiro FROM klubb WHERE slug = ?1").bind(slug).first();
}

// Klubben som besökare ser: bara en godkänd klubb finns för dem. En väntande eller avstängd klubb svarar som en okänd.
export async function hittaAktivKlubb(k, slug) {
  const kl = await hittaKlubb(k, slug);
  return kl && kl.status === "aktiv" ? kl : null;
}

/* ---------- Lag ---------- */
// Raden i databasen som den form resten av koden (och sidorna) förväntar sig
export function lagFranRad(r) {
  return {
    id: r.id, klubbId: r.klubb_id, slug: r.slug, namn: r.namn, kampanj: r.kampanj, status: r.status,
    swish: { nummer: r.swish_nummer, namnPaKonto: r.mottagare, meddelande: r.meddelande },
    pris: r.pris, inkopspris: r.inkopspris, minimum: r.minimum, mal: r.mal, maxAntal: r.max_antal, kartong: r.kartong,
    kommentar: r.kommentar,
    produkt: { namn: r.produkt, detalj: r.detalj, enhetEn: r.enhet_en, enhet: r.enhet },
    lager: r.lager, intro: r.intro, utlamningsText: r.utlamning_text, belonning: r.belonning,
    hash: r.nyckel_hash,
    bestallt: r.bestallt,
    godkant: r.godkant || "",
    pengar: { skickatKr: r.pengar_skickat_kr || 0, skickatTid: r.pengar_skickat_tid || "", mottagetTid: r.pengar_mottaget_tid || "" }
  };
}

// Fälten som lagföräldern fyller i, platt och med samma namn som i API:t. Jämförs med det klubben godkände (se regler.andringar).
export function egnaVarden(l) {
  return { kampanj: l.kampanj, produkt: l.produkt.namn, detalj: l.produkt.detalj, enhetEn: l.produkt.enhetEn, enhet: l.produkt.enhet,
    intro: l.intro, utlamningsText: l.utlamningsText, belonning: l.belonning,
    swishNummer: l.swish.nummer, mottagare: l.swish.namnPaKonto, meddelande: l.swish.meddelande,
    pris: l.pris, inkopspris: l.inkopspris, minimum: l.minimum, mal: l.mal, lager: l.lager, maxAntal: l.maxAntal, kartong: l.kartong };
}

const LAG_SQL = `SELECT l.*, COALESCE((SELECT SUM(b.antal) FROM bestallning b WHERE b.lag_id = l.id AND b.betald != 'AVBRUTEN'), 0) AS bestallt
  FROM lag l`;

export async function hittaLag(k, klubbId, slug) {
  slug = String(slug || "").toLowerCase().slice(0, 40);
  const r = await k.db.prepare(LAG_SQL + " WHERE l.klubb_id = ?1 AND l.slug = ?2").bind(klubbId, slug).first();
  return r ? lagFranRad(r) : null;
}

export async function lasLag(k, klubbId) {
  const { results } = await k.db.prepare(LAG_SQL + " WHERE l.klubb_id = ?1 ORDER BY l.id").bind(klubbId).all();
  return results.map(lagFranRad);
}

/* ---------- Beställningar ---------- */
export function orderFranRad(r) {
  return { nr: r.nr, id: String(r.nr).padStart(4, "0"), tid: r.tid, barn: r.barn, mobil: r.mobil, antal: r.antal, belopp: r.belopp, betald: r.betald, hamtad: r.hamtad };
}

export async function lasOrdrar(k, lagId) {
  const { results } = await k.db.prepare("SELECT nr, tid, barn, mobil, antal, belopp, betald, hamtad FROM bestallning WHERE lag_id = ?1 ORDER BY nr").bind(lagId).all();
  return results.map(orderFranRad);
}

/* ---------- Logg ---------- */
// Ger ett färdigt uttryck som läggs med i samma körning som ändringen, så att loggen och ändringen alltid hänger ihop.
// Loggen innehåller aldrig barnets namn, mobilnummer eller e-postadresser.
export function loggUttryck(k, klubbId, lagSlug, atgard, orderNr, varde) {
  return k.db.prepare("INSERT INTO logg (tid, klubb_id, lag_slug, atgard, order_nr, varde) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(iso(k), klubbId, lagSlug || "", atgard, orderNr || "", String(varde === undefined ? "" : varde));
}

// Som loggUttryck, men raden skrivs bara om uttrycket före (i samma körning) ändrade någon rad. Då loggas inget som inte hände.
export function loggOmAndrat(k, klubbId, lagSlug, atgard, orderNr, varde) {
  return k.db.prepare("INSERT INTO logg (tid, klubb_id, lag_slug, atgard, order_nr, varde) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE changes() > 0")
    .bind(iso(k), klubbId, lagSlug || "", atgard, orderNr || "", String(varde === undefined ? "" : varde));
}

export async function logga(k, klubbId, lagSlug, atgard, orderNr, varde) {
  await loggUttryck(k, klubbId, lagSlug, atgard, orderNr, varde).run();
}

/* ---------- Räknare för spärrar ---------- */
export async function lasRakning(k, nyckel) {
  const r = await k.db.prepare("SELECT antal FROM sparr WHERE nyckel = ?1 AND till > ?2").bind(nyckel, k.nu()).first();
  return r ? r.antal : 0;
}

// Räknar upp och ger det nya värdet. Räknaren börjar om när fönstret (fonsterMs) har gått ut.
export async function raknaUpp(k, nyckel, fonsterMs) {
  const nu = k.nu();
  const r = await k.db.prepare(`INSERT INTO sparr (nyckel, antal, till) VALUES (?1, 1, ?2)
    ON CONFLICT (nyckel) DO UPDATE SET
      antal = CASE WHEN sparr.till <= ?3 THEN 1 ELSE sparr.antal + 1 END,
      till = CASE WHEN sparr.till <= ?3 THEN ?2 ELSE sparr.till END
    RETURNING antal`).bind(nyckel, nu + fonsterMs, nu).first();
  return r ? r.antal : 1;
}

// Tar bort räknare, länkar och sessioner som har gått ut, så att de inte samlas.
export async function stada(k) {
  const nu = k.nu();
  await k.db.batch([
    k.db.prepare("DELETE FROM sparr WHERE till <= ?1").bind(nu),
    k.db.prepare("DELETE FROM inloggningslank WHERE giltig_till <= ?1").bind(nu),
    k.db.prepare("DELETE FROM session WHERE giltig_till <= ?1").bind(nu)
  ]);
}

/* ---------- Det som besökare och inloggade får se ---------- */
// Det som får visas för alla: aldrig nyckelns hash eller interna nummer.
export function offentlig(l) {
  return { slug: l.slug, namn: l.namn, kampanj: l.kampanj, titel: l.kampanj || l.produkt.namn, status: l.status, swish: l.swish,
    produkt: l.produkt, intro: l.intro, utlamningsText: l.utlamningsText, belonning: l.belonning,
    pris: l.pris, inkopspris: l.inkopspris, minimum: l.minimum, mal: l.mal, lager: l.lager, maxAntal: l.maxAntal, kartong: l.kartong };
}

// Utkast och försäljningar som väntar på godkännande visas bara med namn: inga uppgifter, och ingen kan beställa.
export function publik(l) {
  return l.status === "utkast" || l.status === "granskas" ? { slug: l.slug, namn: l.namn, status: l.status } : offentlig(l);
}

// För inloggade i adminvyn: samma som offentlig plus klubbens kommentar, pengarna efter avslutad försäljning, och det som har ändrats
// sedan klubben godkände den (visas när den granskas igen). Inget av det är publikt.
export function adminLag(l) {
  const u = offentlig(l);
  u.kommentar = l.kommentar;
  u.pengar = l.pengar;
  u.andringar = l.status === "utkast" || l.status === "granskas" ? andringar(l.godkant, egnaVarden(l)) : [];
  return u;
}

export function utOrder(o) {
  return { id: o.id, tid: o.tid, barn: o.barn, mobil: o.mobil, antal: o.antal, belopp: o.belopp, betald: o.betald, hamtad: o.hamtad };
}
