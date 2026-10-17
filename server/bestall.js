/* Det som besökare kan göra utan inloggning: beställa, och lagföräldern som startar en försäljning. */
import { hittaAktivKlubb, hittaLag, iso, raknaUpp, lasRakning, loggUttryck, stada, adminLag } from "./data.js";
import { sha256, nyNyckelText, hashNyckel } from "./krypto.js";
import { CFG, BARN_RE, KOD_RE, normalizeMobil, rensaLag } from "./regler.js";

// Kvittot för en beställning som redan har sparats med den här koden (föräldern försökte igen efter ett svar som uteblev).
async function kvittoFranKod(k, lagId, kod) {
  const r = await k.db.prepare("SELECT nr, belopp FROM bestallning WHERE lag_id = ?1 AND kod = ?2").bind(lagId, kod).first();
  return r ? { ok: true, id: String(r.nr).padStart(4, "0"), belopp: r.belopp } : null;
}

/* ---------- Beställning från föräldern ---------- */
export async function hanteraBestallning(k, d) {
  // Honeypot: låtsas att det gick bra, spara inget.
  if (d.website) return { ok: true, id: "0000", belopp: 0 };

  const slug = String(d.lag || "").toLowerCase();
  const klubb = await hittaAktivKlubb(k, d.klubb);
  const lag = klubb ? await hittaLag(k, klubb.id, slug) : null;

  // Har den här beställningskoden redan gett en beställning får föräldern samma kvitto igen.
  const kod = KOD_RE.test(String(d.kod || "")) ? String(d.kod) : "";
  if (kod && lag) { const redan = await kvittoFranKod(k, lag.id, kod); if (redan) return redan; }
  if (typeof d.t !== "number" || d.t < CFG.MIN_TID_MS) return { ok: false, fel: "Vänta några sekunder och försök igen." };

  const barn = String(d.barn || "").trim();
  const mobil = normalizeMobil(d.mobil);
  const antal = typeof d.antal === "number" ? d.antal : NaN;   // sidan skickar alltid ett tal: sant, listor och text godtas inte som antal
  if (!lag) return { ok: false, fel: "Okänt lag." };
  if (lag.status !== "pagar") return { ok: false, fel: "Försäljningen är inte öppen just nu." };
  if (!BARN_RE.test(barn)) return { ok: false, fel: "Skriv barnets namn med bokstäver (2–40 tecken). Mellanslag, bindestreck och & går bra." };
  if (!/^07\d{8}$/.test(mobil)) return { ok: false, fel: "Skriv ett svenskt mobilnummer, till exempel 070 123 45 67." };
  if (!(antal >= 1 && antal <= lag.maxAntal && antal % 1 === 0)) return { ok: false, fel: "Välj mellan 1 och " + lag.maxAntal + "." };

  // Spärr per mobilnummer. Numret sparas inte i klartext i räknaren.
  const sparrNyckel = "m:" + klubb.id + ":" + (await sha256(mobil)).slice(0, 24);
  if ((await lasRakning(k, sparrNyckel)) >= CFG.MAX_PER_MOBIL)
    return { ok: false, fel: "Många beställningar på kort tid. Vänta en stund eller hör av dig där du brukar prata med laget." };

  // Allt som måste hänga ihop sker i EN körning (ett batch, som D1 kör som en transaktion utan att något annat hinner emellan):
  //  1. Beställningen sparas bara om försäljningen är öppen, antalet är tillåtet och det finns kvar i lagret. Ordernumret är lagets
  //     nästa nummer, och beloppet räknas här, av priset i databasen, aldrig av det sidan skickar.
  //  2. Räknaren för nästa ordernummer räknas upp bara om beställningen sparades.
  // Lagerkontrollen och ordernumret är alltså samma uttryck som sparar beställningen: två föräldrar kan inte ta samma sista.
  const sparaUttryck = k.db.prepare(`INSERT INTO bestallning (lag_id, nr, tid, barn, mobil, antal, belopp, kod)
    SELECT l.id, l.nasta_order, ?3, ?4, ?5, ?6, ROUND(?6 * l.pris, 2), ?7
    FROM lag l JOIN klubb kl ON kl.id = l.klubb_id
    WHERE l.id = ?1 AND kl.id = ?2 AND kl.status = 'aktiv' AND l.status = 'pagar'
      AND ?6 >= 1 AND ?6 <= l.max_antal
      AND (l.lager = 0 OR l.lager - (SELECT COALESCE(SUM(b.antal), 0) FROM bestallning b WHERE b.lag_id = l.id AND b.betald != 'AVBRUTEN') >= ?6)
    RETURNING nr, belopp`).bind(lag.id, klubb.id, iso(k), barn, mobil, antal, kod || null);
  const rakna = k.db.prepare(`UPDATE lag SET nasta_order = nasta_order + 1
    WHERE id = ?1 AND EXISTS (SELECT 1 FROM bestallning b WHERE b.lag_id = lag.id AND b.nr = lag.nasta_order)`).bind(lag.id);

  let svar;
  try {
    svar = await k.db.batch([sparaUttryck, rakna]);
  } catch (e) {
    // Samma kod från två anrop samtidigt: databasen släpper bara igenom den ena. Den andra får den förstas kvitto.
    if (kod) { const redan = await kvittoFranKod(k, lag.id, kod); if (redan) return redan; }
    throw e;
  }
  const rad = svar[0].results[0];
  if (!rad) {
    // Ingen beställning sparades. Läs om laget för att kunna säga varför.
    const nu = await hittaLag(k, klubb.id, slug);
    if (!nu || nu.status !== "pagar") return { ok: false, fel: "Försäljningen är inte öppen just nu." };
    if (nu.lager > 0) {
      const kvar = Math.max(0, nu.lager - nu.bestallt);
      return { ok: false, kvar, fel: kvar > 0 ? "Det finns bara " + kvar + " kvar. Välj högst " + kvar + "." : "Det är slutsålt just nu." };
    }
    return { ok: false, fel: "Beställningen kunde inte sparas. Försök igen." };
  }
  await raknaUpp(k, sparrNyckel, CFG.SPARR_MINUTER * 60000);
  return { ok: true, id: String(rad.nr).padStart(4, "0"), belopp: rad.belopp };
}

/* ---------- Lagföräldern startar en försäljning själv ---------- */
// Vem som helst kan starta ett utkast med lagets namn. Det syns inte för föräldrarna och kan inte öppnas förrän klubben
// har godkänt det, och klubben kan ta bort felaktiga eller dubbla utkast. Nyckeln visas bara i det här svaret.
export async function hanteraStart(k, d) {
  if (d.website) return { ok: false, fel: "Det gick inte att starta just nu. Försök igen om en stund." };   // honungsfälla
  if (typeof d.t !== "number" || d.t < CFG.MIN_TID_MS) return { ok: false, fel: "Vänta några sekunder och försök igen." };
  const klubb = await hittaAktivKlubb(k, d.klubb);
  if (!klubb) return { ok: false, fel: "Okänd klubb." };
  const nyckel = "starter:" + klubb.id;
  if ((await lasRakning(k, nyckel)) >= CFG.MAX_STARTER_PER_TIMME)
    return { ok: false, fel: "Många försäljningar har startats den senaste timmen. Försök igen senare, eller be klubben lägga till laget." };
  const r = rensaLag({ namn: d.namn }, true);   // bara namnet: resten fyller lagföräldern i efteråt, och status blir alltid utkast
  if (r.fel) return { ok: false, fel: r.fel };
  const svar = await skapaLag(k, klubb, r, "lagforalder");
  if (svar.ok) { await raknaUpp(k, nyckel, 3600000); await stada(k); }
  return svar;
}

// Skapar lagets rad och ger tillbaka lagets nyckel. Bara hashen sparas. Används av klubben (lagNy, fran = "klubb")
// och av lagföräldern (starta, fran = "lagforalder").
export async function skapaLag(k, klubb, r, fran) {
  const duplett = fran === "lagforalder"
    ? "Det finns redan en försäljning för " + r.namn + ". Hör av dig till den som startade den eller till klubben. Säljer laget något nytt kan du skriva till exempel " + r.namn + " Lotter."
    : "Det finns redan ett lag med adressen " + r.slug + ".";
  if (await hittaLag(k, klubb.id, r.slug)) return { ok: false, fel: duplett };
  const key = nyNyckelText();
  try {
    await k.db.batch([
      k.db.prepare(`INSERT INTO lag (klubb_id, slug, namn, kampanj, status, swish_nummer, mottagare, meddelande, pris, inkopspris, minimum, mal,
          max_antal, kartong, nyckel_hash, produkt, detalj, enhet_en, enhet, intro, utlamning_text, belonning, lager)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)`)
        .bind(klubb.id, r.slug, r.namn, r.kampanj, r.status, r.swishNummer, r.mottagare, r.meddelande, r.pris, r.inkopspris, r.minimum, r.mal,
          r.maxAntal, r.kartong, await hashNyckel(key), r.produkt, r.detalj, r.enhetEn, r.enhet, r.intro, r.utlamningsText, r.belonning, r.lager),
      loggUttryck(k, klubb.id, r.slug, fran === "lagforalder" ? "försäljning startad av lagförälder" : "lag skapat", "", r.status)
    ]);
  } catch (e) {
    // Två anrop med samma namn samtidigt: databasen släpper bara igenom det ena
    if (await hittaLag(k, klubb.id, r.slug)) return { ok: false, fel: duplett };
    throw e;
  }
  return { ok: true, slug: r.slug, key, lag: adminLag(await hittaLag(k, klubb.id, r.slug)) };
}
