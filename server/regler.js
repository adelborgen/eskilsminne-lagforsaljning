/* Reglerna: kontroller av uppgifter och uträkningar. Inga anrop till databasen här, så allt går att pröva för sig.
   Portat från Server.gs (Apps Script), med samma regler och samma felmeddelanden. */

export const CFG = {
  MIN_TID_MS: 3000,        // snabbare än så från att sidan laddats = robot
  MAX_PER_MOBIL: 5,        // högst så många beställningar per mobilnummer ...
  SPARR_MINUTER: 10,       // ... under så här många minuter
  FEL_MAX: 10,             // högst så många felaktiga nyckelförsök per lag ...
  FEL_MAX_ALLA: 40,        // ... och totalt för klubben ...
  FEL_MINUTER: 10,         // ... under så här många minuter
  MAX_STARTER_PER_TIMME: 10, // så många försäljningar kan lagföräldrar starta själva per timme och klubb
  LANK_GILTIG_MIN: 15,     // en inloggningslänk gäller så här länge och kan användas en gång
  SESSION_DAGAR: 14,       // en inloggning gäller så här länge
  LANK_PER_EPOST_TIMME: 5, // högst så många inloggningslänkar per e-postadress ...
  LANK_PER_IP_TIMME: 20    // ... och per IP-nummer och timme
};

export const BARN_RE = /^[\p{L}][\p{L}\p{M} '’\-.&\/,()]{1,39}$/u;   // barnets namn: börjar med en bokstav
export const NAMN_RE = /^[\p{L}\p{N}][\p{L}\p{N} .\-]{1,19}$/u;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
export const SWISH_RE = /^(123\d{7}|07\d{8})$/;
export const KOD_RE = /^[A-Za-z0-9:_-]{8,80}$/;
export const EPOST_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export const STATUSAR = ["utkast", "granskas", "snart", "pagar", "avslutad"];
// De fält lagföräldern själv får ändra (som utkast). Namn, status, adress, nyckel och räknare ändras aldrig den vägen.
export const LAG_EGNA_FALT = ["kampanj", "produkt", "detalj", "enhetEn", "enhet", "intro", "utlamningsText", "belonning",
  "swishNummer", "mottagare", "meddelande", "pris", "inkopspris", "minimum", "mal", "lager", "maxAntal", "kartong"];
// Fältets namn i API:t och kolumnen i databasen. Bara de här kan skrivas, så ingen text från en användare blir en kolumn.
export const LAG_KOLUMN = {
  namn: "namn", kampanj: "kampanj", status: "status", swishNummer: "swish_nummer", mottagare: "mottagare", meddelande: "meddelande",
  pris: "pris", inkopspris: "inkopspris", minimum: "minimum", mal: "mal", lager: "lager", maxAntal: "max_antal", kartong: "kartong",
  produkt: "produkt", detalj: "detalj", enhetEn: "enhet_en", enhet: "enhet", intro: "intro", utlamningsText: "utlamning_text", belonning: "belonning"
};

export function avrunda(n) { return Math.round(n * 100) / 100; }

export function tal(v) {
  if (v === undefined || v === null || String(v).trim() === "") return NaN;
  const n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : NaN;
}

export function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizeMobil(s) {
  s = String(s || "").replace(/\(0\)/g, "").replace(/[\s\-().]/g, "");   // +46 (0)70 … skrivs ofta med (0) som ska bort
  if (s.indexOf("+46") === 0) s = "0" + s.slice(3); else if (s.indexOf("0046") === 0) s = "0" + s.slice(4);
  return s;
}

export function normEpost(s) {
  const e = String(s || "").trim().toLowerCase();
  return e.length <= 254 && EPOST_RE.test(e) ? e : "";
}

export function kontrolleraSiffror(l) {
  if (l.inkopspris > l.pris) return "Inköpspriset kan inte vara högre än priset.";
  if (l.mal < l.minimum) return "Målet kan inte vara lägre än minimum.";
  return null;
}

// Rensar och kontrollerar uppgifter om ett lag. Vid krav = true krävs alla obligatoriska fält (nytt lag),
// annars kontrolleras bara de fält som finns med (ändring).
export function rensaLag(d, krav) {
  const ut = {};
  const finns = (k) => d[k] !== undefined && d[k] !== null;
  // Text visas som ren text på sidan. Inledande =, +, - eller @ tas bort så att inget tolkas som formel om uppgifterna exporteras till ett kalkylprogram.
  const text = (k, max) => { ut[k] = String(d[k]).trim().replace(/^[=+\-@\s]+/, "").slice(0, max); };

  if (finns("namn") || krav) {
    const namn = String(d.namn || "").trim();
    if (!NAMN_RE.test(namn)) return { fel: "Skriv lagets namn (2–20 tecken)." };
    ut.namn = namn;
  }
  if (krav) {
    const slug = finns("slug") && d.slug !== "" ? String(d.slug).toLowerCase() : slugify(ut.namn);
    if (!SLUG_RE.test(slug)) return { fel: "Adressen får bara innehålla små bokstäver, siffror och bindestreck (2–30 tecken)." };
    ut.slug = slug;
  }
  if (finns("kampanj")) text("kampanj", 40); else if (krav) ut.kampanj = "";   // tomt = produktens namn används som rubrik
  // Produkten skrivs in av laget själv: inga färdiga produkter finns i koden
  [["produkt", 40], ["detalj", 80], ["enhetEn", 15], ["enhet", 15], ["intro", 400], ["utlamningsText", 200], ["belonning", 160]].forEach((f) => {
    if (finns(f[0])) text(f[0], f[1]); else if (krav) ut[f[0]] = "";
  });
  if (finns("status") || krav) {
    const st = finns("status") ? String(d.status) : "utkast";
    if (STATUSAR.indexOf(st) < 0) return { fel: "Felaktig status." };
    ut.status = st;
  }
  if (finns("swishNummer")) {
    const sw = String(d.swishNummer).replace(/[\s\-]/g, "");
    if (sw !== "" && !SWISH_RE.test(sw)) return { fel: "Swish-numret ska vara tio siffror, till exempel 123 456 78 90." };
    ut.swishNummer = sw.replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
  } else if (krav) ut.swishNummer = "";
  if (finns("mottagare")) text("mottagare", 40); else if (krav) ut.mottagare = "";
  if (finns("meddelande")) text("meddelande", 40);
  if (krav && !ut.meddelande) ut.meddelande = ut.namn + " försäljning";

  const siffra = (k, min, max, heltal, namnTxt, standard) => {
    if (!finns(k) || String(d[k]).trim() === "") {
      if (standard === undefined) { if (krav) return namnTxt + " saknas."; return null; }
      if (krav) ut[k] = standard;
      return null;
    }
    const n = tal(d[k]);
    if (isNaN(n) || n < min || n > max || (heltal && n % 1 !== 0)) return namnTxt + " är felaktigt.";
    ut[k] = n; return null;
  };
  // Ett nytt utkast behöver bara ett namn: lagföräldern fyller i priser och mål, och servern kräver dem först när försäljningen ska godkännas
  const utk = krav && ut.status === "utkast" ? 0 : undefined;
  let fel = siffra("pris", 0.01, 10000, false, "Priset", utk) || siffra("inkopspris", 0, 10000, false, "Inköpspriset", utk) ||
    siffra("minimum", 0, 100000, true, "Minimum", utk) || siffra("mal", 1, 100000, true, "Målet", utk) ||
    siffra("lager", 0, 100000, true, "Antal i lager", 0) || siffra("maxAntal", 1, 1000, true, "Max antal", 50) || siffra("kartong", 0, 1000, true, "Antal per kartong", 0);
  if (fel) return { fel };
  if (krav) { fel = kontrolleraSiffror(ut); if (fel) return { fel }; }
  return ut;
}

// Det som måste vara ifyllt innan klubben kan godkänna. Ger en text om något saknas, annars null.
export function saknas(l) {
  const s = [];
  if (!l.produkt || !l.produkt.namn) s.push("Produkt");
  if (!l.produkt || !l.produkt.enhetEn || !l.produkt.enhet) s.push("Enhet (ental och flertal)");
  if (!l.swish.nummer) s.push("Swish-nummer");
  if (!l.swish.namnPaKonto) s.push("Mottagarens namn i Swish");
  if (!(l.pris > 0)) s.push("Pris");
  // Har laget ett lager (till exempel bingolotter laget fått) finns inget minimum att nå, bara ett mål
  if (l.lager > 0) { if (!(l.mal > 0)) s.push("Mål"); }
  else if (!(l.minimum > 0) || !(l.mal > 0)) s.push("Minimum och mål");
  if (s.length) return "Fyll i först: " + s.join(", ") + ".";
  return kontrolleraSiffror(l);
}

// En försäljning som är godkänd eller öppen (snart, pagar) måste ha allt som föräldrarna behöver, till exempel Swish-numret.
// Ger en text om något saknas, annars null. Gäller även när klubben sätter status direkt.
export function kanInteOppnas(l, status) {
  if (status !== "snart" && status !== "pagar") return null;
  const s = saknas(l);
  return s ? "Försäljningen kan inte vara " + (status === "pagar" ? "öppen" : "godkänd") + " än. " + s : null;
}

// Siffrorna som lagföräldern behöver. ordrar: lagets beställningar med antal, belopp, betald och hamtad.
export function oversikt(lag, ordrar) {
  let bestallt = 0, betalt = 0, betaltKr = 0, obetalt = 0, obetaltKr = 0, avbrutna = 0;
  let hamtat = 0, hamtatObetalt = 0, attHamta = 0;   // hamtatObetalt: hämtat men inte betalt, att reda ut
  ordrar.forEach((o) => {
    if (o.betald === "AVBRUTEN") { avbrutna += o.antal; return; }
    bestallt += o.antal;
    if (o.betald === "JA") { betalt += o.antal; betaltKr += o.belopp; } else { obetalt += o.antal; obetaltKr += o.belopp; }
    if (o.hamtad === "JA") { hamtat += o.antal; if (o.betald !== "JA") hamtatObetalt += o.antal; }
    else if (o.betald === "JA") attHamta += o.antal;
  });
  const kartonger = lag.kartong > 0 ? Math.ceil(bestallt / lag.kartong) : 0;
  const levereras = lag.kartong > 0 ? kartonger * lag.kartong : bestallt;
  const faktura = avrunda(levereras * lag.inkopspris);
  return {
    bestallt, betalt, betaltKr: avrunda(betaltKr), obetalt, obetaltKr: avrunda(obetaltKr), avbrutna,
    hamtat, hamtatObetalt, attHamta,
    minimumNatt: bestallt >= lag.minimum, minimumKvar: Math.max(0, lag.minimum - bestallt),
    lager: lag.lager, kvarILager: lag.lager > 0 ? Math.max(0, lag.lager - bestallt) : 0,
    kartonger, levereras, faktura, betaltMinusFaktura: avrunda(betaltKr - faktura)
  };
}
