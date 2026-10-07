/* ==========================================================================
   Eskilsminne IF Lagförsäljning: klubbens server (Google Apps Script). Se README.md.

   Ett skript och ett kalkylark för alla lag. Kalkylarket har tre flikar:
     Lag             lagens uppgifter (Swish-nummer, pris, mål, status) och nyckelns hash
     Beställningar   alla beställningar, en rad per beställning
     Logg            vem som gjorde vad i adminvyn

   Sidan tar aldrig emot pengar. Föräldern swishar direkt till lagets eget nummer.
   Kalkylarket ska ligga på ett Google-konto som klubben äger och bara delas med
   administratörerna. Lagens kassörer använder adminvyn, inte kalkylarket.

   Nycklar: varje lag har en adminnyckel och klubben har en superadmin-nyckel.
   Bara hashen av nyckeln sparas. Nyckeln visas en enda gång när den skapas.
   ========================================================================== */
var CFG = {
  MIN_TID_MS: 3000,     // snabbare än så från att sidan laddats = robot
  MAX_PER_MOBIL: 5,     // högst så många beställningar per mobilnummer ...
  SPARR_MINUTER: 10,    // ... under så här många minuter
  FEL_MAX: 10,          // högst så många felaktiga nyckelförsök per lag ...
  FEL_MAX_ALLA: 40,     // ... och totalt ...
  FEL_MINUTER: 10       // ... under så här många minuter
};

var LAG_FLIK = "Lag";
var ORDER_FLIK = "Beställningar";
var LOGG_FLIK = "Logg";
var LAG_RUBRIKER = ["Slug", "Namn", "Kampanj", "Status", "Swish-nummer", "Mottagare", "Meddelande", "Pris", "Inköpspris",
                    "Minimum", "Mål", "Max antal", "Per kartong", "Nyckel (hash)", "Nästa order"];
var LAG_COL = { SLUG: 1, NAMN: 2, KAMPANJ: 3, STATUS: 4, SWISH: 5, MOTTAGARE: 6, MEDDELANDE: 7, PRIS: 8, INKOP: 9,
                MINIMUM: 10, MAL: 11, MAXANTAL: 12, KARTONG: 13, HASH: 14, NASTA: 15 };
var ORDER_RUBRIKER = ["Tid", "Order-ID", "Lag", "Barn", "Mobil", "Antal", "Belopp", "Betald"];
var OCOL = { ID: 2, LAG: 3, BARN: 4, MOBIL: 5, ANTAL: 6, BELOPP: 7, BETALD: 8 };
var LOGG_RUBRIKER = ["Tid", "Lag", "Åtgärd", "Order-ID", "Värde"];
var STATUSAR = ["pagar", "snart", "avslutad"];

var NAMN_RE = /^[\p{L}\p{N}][\p{L}\p{N} .\-]{1,19}$/u;
var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
var SWISH_RE = /^(123\d{7}|07\d{8})$/;

/* ---------- Kör en gång från redigeraren ---------- */
function setup() {
  sakraFlik(LAG_FLIK, LAG_RUBRIKER);
  var o = sakraFlik(ORDER_FLIK, ORDER_RUBRIKER);
  o.getRange("B:B").setNumberFormat("@");   // Order-ID och mobilnummer som text, så att nollan i början finns kvar
  o.getRange("E:E").setNumberFormat("@");
  sakraFlik(LOGG_FLIK, LOGG_RUBRIKER);
  if (!PropertiesService.getScriptProperties().getProperty("SUPER_HASH")) nySuperNyckel();
}

// Skapar en ny superadmin-nyckel och skriver ut den i körningsloggen (visas bara nu). Den gamla slutar fungera.
function nySuperNyckel() {
  var key = nyNyckelText();
  PropertiesService.getScriptProperties().setProperty("SUPER_HASH", hash(key));
  console.log("SUPERADMIN-NYCKEL (visas bara nu, spara den i en lösenordshanterare): " + key);
  return key;
}

function sakraFlik(namn, rubriker) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(namn) || ss.insertSheet(namn);
  // Rubrikraden måste ligga på rad 1. Saknas den läggs den in ovanför befintliga rader.
  if (sh.getRange(1, 1).getValue() !== rubriker[0]) {
    if (sh.getLastRow() > 0) sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, rubriker.length).setValues([rubriker]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, rubriker.length).setFontWeight("bold");
  return sh;
}

function flik(namn) { return SpreadsheetApp.getActive().getSheetByName(namn); }

/* ---------- Webbapp ---------- */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === "lag") return json({ ok: true, lag: lasLag().map(offentlig) });
    if (p.action === "status") {
      var lag = hittaLag(String(p.lag || "").toLowerCase());
      if (!lag) return json({ ok: false, fel: "Okänt lag." });
      return json({ ok: true, bestallt: oversikt(lag, lasOrdrar()).bestallt });
    }
    return json({ ok: false, fel: "Okänd förfrågan." });
  } catch (err) {
    console.error(err);
    return json({ ok: false, fel: "Tekniskt fel. Försök igen om en stund." });
  }
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, fel: "Felaktig förfrågan." }); }
  try {
    return d && d.action === "admin" ? hanteraAdmin(d) : hanteraBestallning(d || {});
  } catch (err) {
    console.error(err);
    return json({ ok: false, fel: "Tekniskt fel. Hör av dig i lagets WhatsApp-grupp." });
  }
}

/* ---------- Beställning från föräldern ---------- */
function hanteraBestallning(d) {
  // Honeypot: låtsas att det gick bra, spara inget.
  if (d.website) return json({ ok: true, id: "0000", belopp: 0 });
  if (typeof d.t !== "number" || d.t < CFG.MIN_TID_MS) return json({ ok: false, fel: "Vänta några sekunder och försök igen." });

  var lag = hittaLag(String(d.lag || "").toLowerCase());
  var barn = String(d.barn || "").trim();
  var mobil = normalizeMobil(d.mobil);
  var antal = Number(d.antal);
  if (!lag) return json({ ok: false, fel: "Okänt lag." });
  if (lag.status !== "pagar") return json({ ok: false, fel: "Försäljningen är inte öppen just nu." });
  if (!/^[\p{L}][\p{L} '\-.]{1,39}$/u.test(barn)) return json({ ok: false, fel: "Skriv barnets namn (2–40 tecken)." });
  if (!/^07\d{8}$/.test(mobil)) return json({ ok: false, fel: "Skriv ett svenskt mobilnummer, till exempel 070 123 45 67." });
  if (!(antal >= 1 && antal <= lag.maxAntal && antal % 1 === 0)) return json({ ok: false, fel: "Välj mellan 1 och " + lag.maxAntal + "." });
  if (d.samtycke !== true) return json({ ok: false, fel: "Du behöver godkänna för att kunna beställa." });

  // Spärr per mobilnummer
  var cache = CacheService.getScriptCache();
  var nyckel = "m" + mobil;
  var tidigare = Number(cache.get(nyckel) || 0);
  if (tidigare >= CFG.MAX_PER_MOBIL) return json({ ok: false, fel: "Många beställningar på kort tid. Vänta en stund eller skriv i lagets WhatsApp-grupp." });

  var belopp = antal * lag.pris;   // räknas alltid här, aldrig från sidan
  return medLas(function () {
    // Läs om laget inne i låset: radnumret kan ha ändrats och numreringen ska inte kunna dubbleras.
    var l = hittaLag(lag.slug);
    var cell = flik(LAG_FLIK).getRange(l._rad, LAG_COL.NASTA);
    var nr = Number(cell.getValue()) || 1;
    cell.setValue(nr + 1);
    var id = String(nr).padStart(4, "0");
    var sh = flik(ORDER_FLIK) || sakraFlik(ORDER_FLIK, ORDER_RUBRIKER);
    sh.appendRow([new Date(), "'" + id, l.slug, barn, "'" + mobil, antal, belopp, ""]);
    SpreadsheetApp.flush();
    cache.put(nyckel, String(tidigare + 1), CFG.SPARR_MINUTER * 60);
    return json({ ok: true, id: id, belopp: belopp });
  });
}

/* ---------- Adminvy ---------- */
function hanteraAdmin(d) {
  var slug = String(d.lag || "").toLowerCase().slice(0, 40);
  var a = autentisera(slug, d.key);
  if (a.fel) return json({ ok: false, fel: a.fel });
  var op = String(d.op || "");
  var lagOps = { oversikt: opOversikt, lista: opLista, satt: opSatt };
  var superOps = { lagLista: opLagLista, lagNy: opLagNy, lagUppdatera: opLagUppdatera, nyNyckel: opNyNyckel };
  var har = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var svar;
  if (har(lagOps, op)) {
    if (!a.lag) return json({ ok: false, fel: "Okänt lag." });
    svar = lagOps[op](a.lag, d);
  } else if (har(superOps, op)) {
    if (a.roll !== "super") return json({ ok: false, fel: "Bara klubbens administratör får göra det här." });
    svar = superOps[op](d);
  } else {
    return json({ ok: false, fel: "Okänd åtgärd." });
  }
  svar.roll = a.roll;
  return json(svar);
}

// Kontrollerar nyckeln. Lagets nyckel ger tillgång till det laget, superadmin-nyckeln till alla lag.
function autentisera(slug, key) {
  var cache = CacheService.getScriptCache();
  var kLag = "fel:" + slug, kAlla = "fel:alla";
  if (Number(cache.get(kLag) || 0) >= CFG.FEL_MAX || Number(cache.get(kAlla) || 0) >= CFG.FEL_MAX_ALLA)
    return { fel: "För många felaktiga försök. Vänta en stund och försök igen." };
  var k = normNyckel(key);
  var hk = k.length >= 20 ? hash(k) : "";
  var superHash = PropertiesService.getScriptProperties().getProperty("SUPER_HASH");
  var lag = slug && slug !== "*" ? hittaLag(slug) : null;
  if (hk && superHash && hk === superHash) return { roll: "super", lag: lag };
  if (hk && lag && lag._hash && hk === lag._hash) return { roll: "lag", lag: lag };
  cache.put(kLag, String(Number(cache.get(kLag) || 0) + 1), CFG.FEL_MINUTER * 60);
  cache.put(kAlla, String(Number(cache.get(kAlla) || 0) + 1), CFG.FEL_MINUTER * 60);
  return { fel: "Fel lag eller nyckel." };
}

function opOversikt(lag) {
  return { ok: true, lag: offentlig(lag), oversikt: oversikt(lag, lasOrdrar()) };
}

function opLista(lag) {
  var ordrar = lasOrdrar().filter(function (o) { return o.lag === lag.slug; }).reverse().map(utOrder);
  return { ok: true, lag: offentlig(lag), ordrar: ordrar };
}

// Sätter Betald för en order: JA, AVBRUTEN eller tomt (ångra).
function opSatt(lag, d) {
  var varde = String(d.varde === undefined || d.varde === null ? "" : d.varde).toUpperCase();
  if (["JA", "AVBRUTEN", ""].indexOf(varde) < 0) return { ok: false, fel: "Felaktigt värde." };
  var nr = parseInt(d.id, 10);
  if (isNaN(nr)) return { ok: false, fel: "Felaktigt ordernummer." };
  return medLasObj(function () {
    var ordrar = lasOrdrar();
    var o = ordrar.filter(function (x) { return x.lag === lag.slug && parseInt(x.id, 10) === nr; })[0];
    if (!o) return { ok: false, fel: "Hittar ingen order " + d.id + "." };
    flik(ORDER_FLIK).getRange(o.rad, OCOL.BETALD).setValue(varde);
    o.betald = varde;
    logga(lag.slug, "betald=" + (varde || "(ångrad)"), o.id, varde);
    return { ok: true, order: utOrder(o), oversikt: oversikt(lag, ordrar) };
  });
}

function opLagLista() {
  var ordrar = lasOrdrar();
  return { ok: true, lag: lasLag().map(function (l) {
    var ov = oversikt(l, ordrar), ut = offentlig(l);
    ut.oversikt = { bestallt: ov.bestallt, betalt: ov.betalt, betaltKr: ov.betaltKr, obetalt: ov.obetalt };
    return ut;
  }) };
}

function opLagNy(d) {
  var r = rensaLag(d.data || {}, true);
  if (r.fel) return { ok: false, fel: r.fel };
  return medLasObj(function () {
    if (hittaLag(r.slug)) return { ok: false, fel: "Det finns redan ett lag med adressen " + r.slug + "." };
    var key = nyNyckelText();
    sakraFlik(LAG_FLIK, LAG_RUBRIKER).appendRow([r.slug, r.namn, r.kampanj, r.status, r.swishNummer, r.mottagare, r.meddelande,
      r.pris, r.inkopspris, r.minimum, r.mal, r.maxAntal, r.kartong, hash(key), 1]);
    logga(r.slug, "lag skapat", "", "");
    return { ok: true, slug: r.slug, key: key, lag: offentlig(hittaLag(r.slug)) };
  });
}

function opLagUppdatera(d) {
  var r = rensaLag(d.falt || {}, false);
  if (r.fel) return { ok: false, fel: r.fel };
  var kol = { namn: LAG_COL.NAMN, kampanj: LAG_COL.KAMPANJ, status: LAG_COL.STATUS, swishNummer: LAG_COL.SWISH,
    mottagare: LAG_COL.MOTTAGARE, meddelande: LAG_COL.MEDDELANDE, pris: LAG_COL.PRIS, inkopspris: LAG_COL.INKOP,
    minimum: LAG_COL.MINIMUM, mal: LAG_COL.MAL, maxAntal: LAG_COL.MAXANTAL, kartong: LAG_COL.KARTONG };
  return medLasObj(function () {
    var lag = hittaLag(String(d.slug || "").toLowerCase());
    if (!lag) return { ok: false, fel: "Okänt lag." };
    var ny = { pris: r.pris !== undefined ? r.pris : lag.pris, inkopspris: r.inkopspris !== undefined ? r.inkopspris : lag.inkopspris,
      minimum: r.minimum !== undefined ? r.minimum : lag.minimum, mal: r.mal !== undefined ? r.mal : lag.mal };
    var fel = kontrolleraSiffror(ny);
    if (fel) return { ok: false, fel: fel };
    var sh = flik(LAG_FLIK), andrade = [];
    Object.keys(r).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(kol, k)) return;   // nyckel, slug och räknare kan aldrig ändras här
      sh.getRange(lag._rad, kol[k]).setValue(r[k]);
      andrade.push(k);
    });
    logga(lag.slug, "lag ändrat: " + andrade.join(", "), "", "");
    return { ok: true, lag: offentlig(hittaLag(lag.slug)) };
  });
}

function opNyNyckel(d) {
  return medLasObj(function () {
    var lag = hittaLag(String(d.slug || "").toLowerCase());
    if (!lag) return { ok: false, fel: "Okänt lag." };
    var key = nyNyckelText();
    flik(LAG_FLIK).getRange(lag._rad, LAG_COL.HASH).setValue(hash(key));
    logga(lag.slug, "ny nyckel", "", "");
    return { ok: true, slug: lag.slug, key: key };
  });
}

/* ---------- Lag: läsa, kontrollera ---------- */
function lasLag() {
  var sh = flik(LAG_FLIK);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, LAG_RUBRIKER.length).getValues(), ut = [];
  rows.forEach(function (r, i) {
    if (!r[0]) return;
    ut.push({
      slug: String(r[0]), namn: String(r[1]), kampanj: String(r[2]), status: String(r[3] || "snart"),
      swish: { nummer: String(r[4] || ""), namnPaKonto: String(r[5] || ""), meddelande: String(r[6] || "") },
      pris: Number(r[7]) || 0, inkopspris: Number(r[8]) || 0, minimum: Number(r[9]) || 0, mal: Number(r[10]) || 0,
      maxAntal: Number(r[11]) || 50, kartong: Number(r[12]) || 0,
      _rad: i + 2, _hash: String(r[13] || "")
    });
  });
  return ut;
}

function hittaLag(slug) {
  return lasLag().filter(function (l) { return l.slug === slug; })[0] || null;
}

// Det som får visas för alla: aldrig nyckelns hash eller radnummer.
function offentlig(l) {
  return { slug: l.slug, namn: l.namn, kampanj: l.kampanj, status: l.status, swish: l.swish,
    pris: l.pris, inkopspris: l.inkopspris, minimum: l.minimum, mal: l.mal, maxAntal: l.maxAntal, kartong: l.kartong };
}

function tal(v) {
  if (v === undefined || v === null || String(v).trim() === "") return NaN;
  var n = Number(String(v).replace(",", "."));
  return isFinite(n) ? n : NaN;
}

function kontrolleraSiffror(l) {
  if (l.inkopspris > l.pris) return "Inköpspriset kan inte vara högre än priset.";
  if (l.mal < l.minimum) return "Målet kan inte vara lägre än minimum.";
  return null;
}

// Rensar och kontrollerar uppgifter om ett lag. Vid krav = true krävs alla obligatoriska fält (nytt lag),
// annars kontrolleras bara de fält som finns med (ändring).
function rensaLag(d, krav) {
  var ut = {};
  var finns = function (k) { return d[k] !== undefined && d[k] !== null; };
  // Text visas som ren text på sidan. Inledande =, +, - eller @ tas bort så att inget tolkas som formel i kalkylarket.
  var text = function (k, max) { ut[k] = String(d[k]).trim().replace(/^[=+\-@\s]+/, "").slice(0, max); };

  if (finns("namn") || krav) {
    var namn = String(d.namn || "").trim();
    if (!NAMN_RE.test(namn)) return { fel: "Skriv lagets namn (2–20 tecken)." };
    ut.namn = namn;
  }
  if (krav) {
    var slug = finns("slug") && d.slug !== "" ? String(d.slug).toLowerCase() : slugify(ut.namn);
    if (!SLUG_RE.test(slug)) return { fel: "Adressen får bara innehålla små bokstäver, siffror och bindestreck (2–30 tecken)." };
    ut.slug = slug;
  }
  if (finns("kampanj")) text("kampanj", 40); else if (krav) ut.kampanj = "Lagförsäljning";
  if (finns("status") || krav) {
    var st = finns("status") ? String(d.status) : "snart";
    if (STATUSAR.indexOf(st) < 0) return { fel: "Felaktig status." };
    ut.status = st;
  }
  if (finns("swishNummer")) {
    var sw = String(d.swishNummer).replace(/[\s\-]/g, "");
    if (sw !== "" && !SWISH_RE.test(sw)) return { fel: "Swish-numret ska vara tio siffror, till exempel 123 456 78 90." };
    ut.swishNummer = sw.replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
  } else if (krav) ut.swishNummer = "";
  if (finns("mottagare")) text("mottagare", 40); else if (krav) ut.mottagare = "";
  if (finns("meddelande")) text("meddelande", 40);
  if (krav && !ut.meddelande) ut.meddelande = ut.namn + " försäljning";

  var siffra = function (k, min, max, heltal, namnTxt, standard) {
    if (!finns(k) || String(d[k]).trim() === "") {
      if (standard === undefined) { if (krav) return namnTxt + " saknas."; return null; }
      if (krav) ut[k] = standard;
      return null;
    }
    var n = tal(d[k]);
    if (isNaN(n) || n < min || n > max || (heltal && n % 1 !== 0)) return namnTxt + " är felaktigt.";
    ut[k] = n; return null;
  };
  var fel = siffra("pris", 0.01, 10000, false, "Priset") || siffra("inkopspris", 0, 10000, false, "Inköpspriset") ||
    siffra("minimum", 1, 100000, true, "Minimum") || siffra("mal", 1, 100000, true, "Målet") ||
    siffra("maxAntal", 1, 1000, true, "Max antal", 50) || siffra("kartong", 0, 1000, true, "Antal per kartong", 0);
  if (fel) return { fel: fel };
  if (krav) { fel = kontrolleraSiffror(ut); if (fel) return { fel: fel }; }
  return ut;
}

function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* ---------- Beställningar: läsa, räkna ---------- */
function lasOrdrar() {
  var sh = flik(ORDER_FLIK);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ORDER_RUBRIKER.length).getValues().map(function (r, i) {
    var mobil = String(r[OCOL.MOBIL - 1]);
    if (/^7\d{8}$/.test(mobil)) mobil = "0" + mobil;   // nollan kan ha försvunnit om cellen blev ett tal
    var nr = parseInt(r[OCOL.ID - 1], 10);
    return {
      rad: i + 2,
      tid: r[0] && r[0].toISOString ? r[0].toISOString() : String(r[0]),
      id: isNaN(nr) ? "" : String(nr).padStart(4, "0"),
      lag: String(r[OCOL.LAG - 1]),
      barn: String(r[OCOL.BARN - 1]),
      mobil: mobil,
      antal: Number(r[OCOL.ANTAL - 1]) || 0,
      belopp: Number(r[OCOL.BELOPP - 1]) || 0,
      betald: String(r[OCOL.BETALD - 1] || "").toUpperCase()
    };
  });
}

function utOrder(o) {
  return { id: o.id, tid: o.tid, barn: o.barn, mobil: o.mobil, antal: o.antal, belopp: o.belopp, betald: o.betald };
}

function avrunda(n) { return Math.round(n * 100) / 100; }

// Siffrorna som kassören behöver: samma som Översikt-fliken i det gamla skriptet.
function oversikt(lag, ordrar) {
  var bestallt = 0, betalt = 0, betaltKr = 0, obetalt = 0, obetaltKr = 0, avbrutna = 0;
  ordrar.forEach(function (o) {
    if (o.lag !== lag.slug) return;
    if (o.betald === "AVBRUTEN") { avbrutna += o.antal; return; }
    bestallt += o.antal;
    if (o.betald === "JA") { betalt += o.antal; betaltKr += o.belopp; } else { obetalt += o.antal; obetaltKr += o.belopp; }
  });
  var kartonger = lag.kartong > 0 ? Math.ceil(bestallt / lag.kartong) : 0;
  var levereras = lag.kartong > 0 ? kartonger * lag.kartong : bestallt;
  var faktura = avrunda(levereras * lag.inkopspris);
  return {
    bestallt: bestallt, betalt: betalt, betaltKr: avrunda(betaltKr), obetalt: obetalt, obetaltKr: avrunda(obetaltKr), avbrutna: avbrutna,
    minimumNatt: bestallt >= lag.minimum, minimumKvar: Math.max(0, lag.minimum - bestallt),
    kartonger: kartonger, levereras: levereras, faktura: faktura, betaltMinusFaktura: avrunda(betaltKr - faktura)
  };
}

/* ---------- Hjälpfunktioner ---------- */
function normalizeMobil(s) {
  s = String(s || "").replace(/[\s\-().]/g, "");
  if (s.indexOf("+46") === 0) s = "0" + s.slice(3); else if (s.indexOf("0046") === 0) s = "0" + s.slice(4);
  return s;
}

function normNyckel(k) { return String(k || "").toLowerCase().replace(/[^a-f0-9]/g, ""); }

function hash(k) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normNyckel(k), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b < 0 ? b + 256 : b) + 256).toString(16).slice(1); }).join("");
}

// 32 slumpade hex-tecken (122 bit) i grupper om fyra: a1b2-c3d4-…
function nyNyckelText() {
  return Utilities.getUuid().replace(/-/g, "").match(/.{4}/g).join("-");
}

function logga(lag, atgard, orderId, varde) {
  (flik(LOGG_FLIK) || sakraFlik(LOGG_FLIK, LOGG_RUBRIKER)).appendRow([new Date(), lag, atgard, orderId ? "'" + orderId : "", varde]);
}

// Kör fn när skriptlåset är fritt, så att två skrivningar aldrig sker samtidigt.
function medLasObj(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, fel: "Många jobbar just nu. Försök igen om en stund." }; }
  try { return fn(); } finally { lock.releaseLock(); }
}

function medLas(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json({ ok: false, fel: "Många beställer just nu. Försök igen om en stund." }); }
  try { return fn(); } finally { lock.releaseLock(); }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
