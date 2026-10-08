/* Tester för Server.gs. Kör: node --test test/server.test.cjs
   Servern körs mot låtsas-versioner av Googles tjänster (se harness.cjs), så ingen riktig data rörs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { skapaMiljo } = require("./harness.cjs");

function ny() {
  const m = skapaMiljo();
  m.setup();
  return { m, sk: m.superNyckel() };
}
const lagData = (o = {}) => ({ namn: "F2017", kampanj: "Chokladförsäljning", produkt: "Klubbkaka", enhetEn: "kaka", enhet: "kakor",
  swishNummer: "123 456 78 90", mottagare: "Eskilsminne IF F2017", pris: 30, inkopspris: 14.5, minimum: 240, mal: 300, kartong: 24, status: "pagar", ...o });
function skapaLag(m, sk, o) {
  const r = m.admin("*", sk, "lagNy", { data: lagData(o) });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;   // { slug, key }
}
const bestall = (m, lag, o = {}) => m.post({ lag, barn: "Emil", mobil: "070 123 45 67", antal: 5, samtycke: true, website: "", t: 5000, ...o });

test("setup skapar flikarna och sparar bara hashen av superadmin-nyckeln", () => {
  const { m, sk } = ny();
  assert.deepEqual(Object.keys(m.blad), ["Lag", "Beställningar", "Logg"]);
  assert.match(sk, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
  const lagrad = m.props.get("SUPER_HASH");
  assert.match(lagrad, /^[0-9a-f]{64}$/);
  assert.ok(!lagrad.includes(sk.replace(/-/g, "")));
  const forsta = m.props.get("SUPER_HASH");
  m.setup();   // en andra körning ska inte byta nyckeln
  assert.equal(m.props.get("SUPER_HASH"), forsta);
});

test("laglistan är publik men innehåller aldrig nyckel, hash eller radnummer", () => {
  const { m, sk } = ny();
  assert.deepEqual(m.get({ action: "lag" }), { ok: true, lag: [] });
  const { key } = skapaLag(m, sk);
  const txt = JSON.stringify(m.get({ action: "lag" }));
  assert.ok(txt.includes('"slug":"f2017"') && txt.includes("123 456 78 90"));
  for (const hemligt of ["hash", "_rad", "nyckel", key, key.replace(/-/g, "")]) assert.ok(!txt.includes(hemligt), "läcker: " + hemligt);
});

test("nytt lag: kontroller, standardvärden och slug", () => {
  const { m, sk } = ny();
  const fel = (o) => m.admin("*", sk, "lagNy", { data: lagData(o) });
  assert.match(fel({ namn: "" }).fel, /namn/i);
  assert.match(fel({ namn: "=HYPERLINK" }).fel, /namn/i);
  assert.match(fel({ swishNummer: "12345" }).fel, /Swish/);
  assert.match(fel({ pris: 0 }).fel, /Priset/);
  assert.match(fel({ pris: "abc" }).fel, /Priset/);
  assert.match(fel({ inkopspris: 31 }).fel, /Inköpspriset/);
  assert.match(fel({ minimum: 400 }).fel, /Målet/);
  assert.match(fel({ minimum: 2.5 }).fel, /Minimum/);
  assert.match(fel({ status: "hej" }).fel, /status/i);
  assert.match(fel({ slug: "Fel Slug!" }).fel, /Adressen/);
  assert.equal(fel({ pris: undefined }).ok, false);

  const r = m.admin("*", sk, "lagNy", { data: { namn: "Flickor Å-Ö", pris: "35,5", inkopspris: 10, minimum: 100, mal: 150 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.slug, "flickor-a-o");
  assert.deepEqual(r.lag, { slug: "flickor-a-o", namn: "Flickor Å-Ö", kampanj: "", titel: "", status: "utkast",
    swish: { nummer: "", namnPaKonto: "", meddelande: "Flickor Å-Ö försäljning" }, produkt: { namn: "", detalj: "", enhetEn: "", enhet: "" },
    intro: "", utlamningsText: "", belonning: "", pris: 35.5, inkopspris: 10, minimum: 100, mal: 150, maxAntal: 50, kartong: 0, kommentar: "", harUtlamningslank: false });
  assert.match(m.admin("*", sk, "lagNy", { data: { namn: "Flickor Å-Ö", pris: 1, inkopspris: 0, minimum: 1, mal: 1 } }).fel, /finns redan/);
});

test("både privata Swish-nummer och Swish Handel-nummer godtas, och formateras lika", () => {
  const { m, sk } = ny();
  const a = m.admin("*", sk, "lagNy", { data: lagData({ namn: "A", swishNummer: "0701234567" }) });
  assert.equal(a.ok, false);   // namnet "A" är för kort, inte numret
  const b = m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag A", swishNummer: "070 123 45 67" }) });
  const c = m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag B", swishNummer: "1234567890" }) });
  assert.equal(b.lag.swish.nummer, "070 123 45 67");
  assert.equal(c.lag.swish.nummer, "123 456 78 90");
});

test("text som börjar med formeltecken rensas innan den hamnar i kalkylarket", () => {
  const { m, sk } = ny();
  const r = m.admin("*", sk, "lagNy", { data: lagData({ kampanj: "=IMPORTXML(\"http://x\")", mottagare: "+46 hej", meddelande: "@SUM(A1)" }) });
  assert.equal(r.ok, true);
  assert.ok(!/^[=+\-@]/.test(r.lag.kampanj) && !/^[=+\-@]/.test(r.lag.swish.namnPaKonto) && !/^[=+\-@]/.test(r.lag.swish.meddelande));
});

test("bara superadmin kan lägga till lag", () => {
  const { m, sk } = ny();
  const { slug, key } = skapaLag(m, sk);
  assert.match(m.admin("*", key, "lagNy", { data: lagData({ namn: "Nytt" }) }).fel, /Fel lag eller nyckel/);
  assert.match(m.admin(slug, key, "lagNy", { data: lagData({ namn: "Nytt" }) }).fel, /Bara klubbens administratör/);
  assert.match(m.admin(slug, key, "lagLista").fel, /Bara klubbens administratör/);
  assert.match(m.admin(slug, key, "nyNyckel", { slug }).fel, /Bara klubbens administratör/);
  assert.match(m.admin(slug, key, "lagUppdatera", { slug, falt: { pris: 1 } }).fel, /Bara klubbens administratör/);
});

test("beställning: priset räknas på servern och ordernumren är löpande per lag", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A", pris: 30 }), b = skapaLag(m, sk, { namn: "Lag B", pris: 50, inkopspris: 20, mal: 300 });
  const r1 = bestall(m, "lag-a", { antal: 5, belopp: 1, pris: 1 });   // ett fuskat belopp ska ignoreras
  assert.deepEqual([r1.ok, r1.id, r1.belopp], [true, "0001", 150]);
  const r2 = bestall(m, "lag-a", { mobil: "0702222222", antal: 2 });
  const r3 = bestall(m, "lag-b", { mobil: "0703333333", antal: 3 });
  assert.deepEqual([r2.id, r2.belopp, r3.id, r3.belopp], ["0002", 60, "0001", 150]);
  assert.deepEqual(m.get({ action: "status", lag: "lag-a" }), { ok: true, bestallt: 7 });
  assert.deepEqual(m.get({ action: "status", lag: "lag-b" }), { ok: true, bestallt: 3 });
  assert.equal(m.blad["Beställningar"].data[1][1], "0001");   // sparas som text, nollan finns kvar
  assert.equal(m.blad["Beställningar"].data[1][2], "lag-a");
  assert.equal(a.slug, "lag-a"); assert.equal(b.slug, "lag-b");
});

test("beställning: avvisas för okänt lag, stängt lag och felaktiga uppgifter", () => {
  const { m, sk } = ny();
  skapaLag(m, sk, { namn: "Lag A", maxAntal: 10 }); skapaLag(m, sk, { namn: "Snart", status: "snart" }); skapaLag(m, sk, { namn: "Klar", status: "avslutad" });
  assert.match(bestall(m, "finns-inte").fel, /Okänt lag/);
  assert.match(bestall(m, "snart").fel, /inte öppen/);
  assert.match(bestall(m, "klar").fel, /inte öppen/);
  assert.match(bestall(m, "lag-a", { t: 100 }).fel, /Vänta/);
  assert.match(bestall(m, "lag-a", { t: "5000" }).fel, /Vänta/);
  assert.match(bestall(m, "lag-a", { barn: "1" }).fel, /barnets namn/);
  assert.match(bestall(m, "lag-a", { barn: "=cmd" }).fel, /barnets namn/);
  assert.match(bestall(m, "lag-a", { mobil: "123" }).fel, /mobilnummer/);
  assert.match(bestall(m, "lag-a", { antal: 0 }).fel, /Välj mellan 1 och 10/);
  assert.match(bestall(m, "lag-a", { antal: 11 }).fel, /Välj mellan 1 och 10/);
  assert.match(bestall(m, "lag-a", { antal: 1.5 }).fel, /Välj mellan/);
  assert.match(bestall(m, "lag-a", { samtycke: false }).fel, /godkänna/);
  assert.equal(m.blad["Beställningar"].getLastRow(), 1, "inget av det här fick sparas");
  const hp = bestall(m, "lag-a", { website: "http://spam" });   // honeypot: låtsas lyckas, spara inget
  assert.deepEqual([hp.ok, hp.id], [true, "0000"]);
  assert.equal(m.blad["Beställningar"].getLastRow(), 1);
  assert.equal(bestall(m, "LAG-A").ok, true);   // versaler i adressen går bra
});

test("beställning: mobilnummer normaliseras och spärr efter fem beställningar", () => {
  const { m, sk } = ny();
  skapaLag(m, sk, { namn: "Lag A" });
  assert.equal(bestall(m, "lag-a", { mobil: "+46 70 123 45 67" }).ok, true);
  assert.equal(m.blad["Beställningar"].data[1][4], "0701234567");
  for (let i = 0; i < 4; i++) assert.equal(bestall(m, "lag-a").ok, true);
  assert.match(bestall(m, "lag-a").fel, /Många beställningar/);
  assert.equal(bestall(m, "lag-a", { mobil: "0709999999" }).ok, true, "andra nummer påverkas inte");
});

test("admin: fel nyckel avvisas, och ett lags nyckel ger bara det laget", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" }), b = skapaLag(m, sk, { namn: "Lag B" });
  const fel = /Fel lag eller nyckel/;
  assert.match(m.admin("lag-a", "", "oversikt").fel, fel);
  assert.match(m.admin("lag-a", "abc", "oversikt").fel, fel);
  assert.match(m.admin("lag-a", "0".repeat(32), "oversikt").fel, fel);
  assert.match(m.admin("lag-a", b.key, "oversikt").fel, fel);
  assert.match(m.admin("lag-b", a.key, "lista").fel, fel);
  assert.match(m.admin("finns-inte", a.key, "oversikt").fel, fel);
  assert.equal(m.admin("lag-a", a.key, "oversikt").roll, "lag");
  assert.equal(m.admin("lag-a", a.key.toUpperCase().replace(/-/g, " "), "oversikt").ok, true, "nyckeln får klistras in med versaler och mellanslag");
  const s = m.admin("lag-b", sk, "oversikt");
  assert.deepEqual([s.ok, s.roll], [true, "super"]);
  assert.equal(m.admin("*", sk, "lagLista").lag.length, 2);
  assert.match(m.admin("*", a.key, "oversikt").fel, fel, "lagets nyckel gäller inte för '*'");
  assert.match(m.admin("*", sk, "oversikt").fel, /Okänt lag/, "superadmin utan lag har inget lag att visa");
});

test("admin: lagen ser bara sina egna beställningar och kan inte ändra andras", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" }), b = skapaLag(m, sk, { namn: "Lag B" });
  bestall(m, "lag-a", { barn: "Alva" }); bestall(m, "lag-b", { barn: "Bosse", mobil: "0702222222" });
  const la = m.admin("lag-a", a.key, "lista");
  assert.deepEqual(la.ordrar.map((o) => o.barn), ["Alva"]);
  assert.equal(la.ordrar[0].mobil, "0701234567");
  assert.match(JSON.stringify(la), /^((?!Bosse).)*$/s);
  // Lag B:s admin försöker sätta Lag A:s order 0001 (som har samma nummer som B:s egen)
  const r = m.admin("lag-b", b.key, "satt", { id: "0001", varde: "JA" });
  assert.equal(r.order.barn, "Bosse");
  assert.equal(m.admin("lag-a", a.key, "lista").ordrar[0].betald, "", "Lag A:s order är orörd");
  assert.match(m.admin("lag-b", b.key, "satt", { id: "0002", varde: "JA" }).fel, /Hittar ingen order/);
});

test("admin: betald, avbruten och ångra uppdaterar siffrorna", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A", pris: 30, inkopspris: 14.5, minimum: 10, mal: 20, kartong: 24 });
  bestall(m, "lag-a", { antal: 10, barn: "Alva" });
  bestall(m, "lag-a", { antal: 5, barn: "Bo", mobil: "0702222222" });
  bestall(m, "lag-a", { antal: 2, barn: "Cia", mobil: "0703333333" });
  let ov = m.admin("lag-a", a.key, "oversikt").oversikt;
  assert.deepEqual([ov.bestallt, ov.betalt, ov.obetalt, ov.obetaltKr, ov.minimumNatt, ov.kartonger, ov.levereras, ov.faktura],
    [17, 0, 17, 510, true, 1, 24, 348]);
  let r = m.admin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  assert.deepEqual([r.order.betald, r.oversikt.betalt, r.oversikt.betaltKr, r.oversikt.betaltMinusFaktura], ["JA", 10, 300, -48]);
  r = m.admin("lag-a", a.key, "satt", { id: "2", varde: "avbruten" });   // "2" och gemener går bra
  assert.deepEqual([r.order.id, r.order.betald, r.oversikt.bestallt, r.oversikt.avbrutna, r.oversikt.minimumNatt, r.oversikt.minimumKvar], ["0002", "AVBRUTEN", 12, 5, true, 0]);
  assert.deepEqual(m.get({ action: "status", lag: "lag-a" }), { ok: true, bestallt: 12 }, "avbrutna räknas inte i mätaren");
  r = m.admin("lag-a", a.key, "satt", { id: "0001", varde: "" });
  assert.deepEqual([r.order.betald, r.oversikt.betalt], ["", 0]);
  assert.match(m.admin("lag-a", a.key, "satt", { id: "0001", varde: "NEJ" }).fel, /Felaktigt värde/);
  assert.match(m.admin("lag-a", a.key, "satt", { id: "x", varde: "JA" }).fel, /ordernummer/);
  assert.match(m.admin("lag-a", a.key, "satt", { id: "0099", varde: "JA" }).fel, /Hittar ingen order/);
  const logg = m.blad["Logg"].data.slice(1).map((r) => r[2]);
  assert.deepEqual(logg.filter((x) => x.startsWith("betald")), ["betald=JA", "betald=AVBRUTEN", "betald=(ångrad)"]);
});

test("hämtad: markera och ångra per order, och bara i det egna laget", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" }), b = skapaLag(m, sk, { namn: "Lag B" });
  bestall(m, "lag-a", { antal: 10, barn: "Alva" });
  bestall(m, "lag-a", { antal: 5, barn: "Bo", mobil: "0702222222" });
  bestall(m, "lag-b", { antal: 3, barn: "Bosse", mobil: "0703333333" });   // samma ordernummer 0001 som Alva
  assert.equal(m.admin("lag-a", a.key, "lista").ordrar.every((o) => o.hamtad === ""), true, "inget är hämtat från början");
  m.admin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  let ov = m.admin("lag-a", a.key, "oversikt").oversikt;
  assert.deepEqual([ov.hamtat, ov.attHamta, ov.hamtatObetalt], [0, 10, 0]);
  let r = m.admin("lag-a", a.key, "hamtad", { id: "0001", varde: "JA" });
  assert.deepEqual([r.ok, r.order.hamtad, r.order.betald, r.oversikt.hamtat, r.oversikt.attHamta], [true, "JA", "JA", 10, 0]);
  assert.equal(m.blad["Beställningar"].data[1][8], "JA", "sparas i kolumnen Hämtad");
  r = m.admin("lag-a", a.key, "hamtad", { id: "1", varde: "" });   // ångra, "1" går bra
  assert.deepEqual([r.order.hamtad, r.oversikt.hamtat, r.oversikt.attHamta], ["", 0, 10]);
  // en obetald order kan hämtas, men syns som något att reda ut
  r = m.admin("lag-a", a.key, "hamtad", { id: "0002", varde: "ja" });
  assert.deepEqual([r.order.hamtad, r.oversikt.hamtat, r.oversikt.hamtatObetalt, r.oversikt.attHamta], ["JA", 5, 5, 10]);
  // Lag B:s admin kan bara röra sitt eget 0001
  r = m.admin("lag-b", b.key, "hamtad", { id: "0001", varde: "JA" });
  assert.equal(r.order.barn, "Bosse");
  assert.equal(m.admin("lag-a", a.key, "lista").ordrar.find((o) => o.id === "0001").hamtad, "", "Lag A:s order är orörd");
  assert.match(m.admin("lag-b", b.key, "hamtad", { id: "0002", varde: "JA" }).fel, /Hittar ingen order/);
  // felaktiga anrop
  assert.match(m.admin("lag-a", a.key, "hamtad", { id: "0001", varde: "NEJ" }).fel, /Felaktigt värde/);
  assert.match(m.admin("lag-a", a.key, "hamtad", { id: "x", varde: "JA" }).fel, /ordernummer/);
  assert.match(m.admin("lag-a", a.key, "hamtad", { id: "0099", varde: "JA" }).fel, /Hittar ingen order/);
  assert.match(m.admin("lag-a", b.key, "hamtad", { id: "0001", varde: "JA" }).fel, /Fel lag eller nyckel/);
  assert.match(m.admin("lag-a", "", "hamtadAlla").fel, /Fel lag eller nyckel/);
  const logg = m.blad["Logg"].data.slice(1).filter((x) => x[2].startsWith("hamtad")).map((x) => [x[1], x[2]]);
  assert.deepEqual(logg.slice(0, 3), [["lag-a", "hamtad=JA"], ["lag-a", "hamtad=(ångrad)"], ["lag-a", "hamtad=JA"]]);
});

test("hämtad: en avbruten order kan inte hämtas, och räknas inte med", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  bestall(m, "lag-a", { antal: 4, barn: "Alva" });
  m.admin("lag-a", a.key, "satt", { id: "0001", varde: "AVBRUTEN" });
  assert.match(m.admin("lag-a", a.key, "hamtad", { id: "0001", varde: "JA" }).fel, /avbruten/);
  assert.equal(m.admin("lag-a", a.key, "hamtad", { id: "0001", varde: "" }).ok, true, "att ångra går alltid");
  const ov = m.admin("lag-a", a.key, "oversikt").oversikt;
  assert.deepEqual([ov.bestallt, ov.avbrutna, ov.hamtat, ov.attHamta], [0, 4, 0, 0]);
});

test("hämtad: markera alla rör bara betalda och hämtar inte obetalda eller avbrutna", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" }), b = skapaLag(m, sk, { namn: "Lag B" });
  ["Alva", "Bo", "Cia", "Dan"].forEach((barn, i) => bestall(m, "lag-a", { barn, antal: i + 1, mobil: "07000000" + (10 + i) }));
  bestall(m, "lag-b", { barn: "Bosse", antal: 2, mobil: "0703333333" });
  m.admin("lag-b", b.key, "satt", { id: "0001", varde: "JA" });
  m.admin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });   // Alva, 1 st
  m.admin("lag-a", a.key, "satt", { id: "0002", varde: "JA" });   // Bo, 2 st
  m.admin("lag-a", a.key, "satt", { id: "0004", varde: "AVBRUTEN" });   // Dan avbruten, Cia (3 st) obetald
  m.admin("lag-a", a.key, "hamtad", { id: "0002", varde: "JA" });   // Bo är redan hämtad
  const r = m.admin("lag-a", a.key, "hamtadAlla");
  assert.deepEqual([r.ok, r.markerade, r.obetaldaKvar], [true, 1, 1]);
  assert.deepEqual(r.ordrar.map((o) => [o.barn, o.hamtad]), [["Dan", ""], ["Cia", ""], ["Bo", "JA"], ["Alva", "JA"]]);
  assert.deepEqual([r.oversikt.hamtat, r.oversikt.attHamta, r.oversikt.hamtatObetalt], [3, 0, 0]);
  const kol = m.blad["Beställningar"].data.slice(1).map((x) => [x[3], x[8]]);
  assert.deepEqual(kol, [["Alva", "JA"], ["Bo", "JA"], ["Cia", ""], ["Dan", ""], ["Bosse", ""]], "andra lags order är orörda");
  assert.match(JSON.stringify(r), /^((?!Bosse).)*$/s, "svaret innehåller bara det egna lagets order");
  const igen = m.admin("lag-a", a.key, "hamtadAlla");
  assert.deepEqual([igen.markerade, igen.obetaldaKvar], [0, 1], "en andra körning ändrar inget");
  const logg = m.blad["Logg"].data.slice(1).filter((x) => x[2] === "hamtad=alla betalda").map((x) => [x[1], x[4]]);
  assert.deepEqual(logg, [["lag-a", "1 st"], ["lag-a", "0 st"]]);
  assert.equal(m.admin("*", sk, "lagLista").lag.find((l) => l.slug === "lag-a").oversikt.hamtat, 3, "klubbens översikt visar hur mycket som är hämtat");
});

test("setup lägger till kolumnen Hämtad i en äldre beställningsflik utan att röra raderna", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  bestall(m, "lag-a", { barn: "Alva" });
  const sh = m.blad["Beställningar"];
  sh.maxCols = 8; sh.data.forEach((rad) => { rad.length = Math.min(rad.length, 8); });   // så såg fliken ut innan kolumnen fanns
  assert.throws(() => m.ctx.lasOrdrar(), /outside the dimensions/);
  m.setup();
  assert.equal(sh.data[0][8], "Hämtad");
  assert.ok(sh.maxCols >= 9);
  assert.equal(sh.data[1][3], "Alva");
  assert.equal(m.admin("lag-a", a.key, "hamtad", { id: "0001", varde: "JA" }).ok, true);
  m.setup();   // en andra körning ändrar inget
  assert.deepEqual(sh.data[0].slice(0, 9), ["Tid", "Order-ID", "Lag", "Barn", "Mobil", "Antal", "Belopp", "Betald", "Hämtad"]);
  assert.equal(sh.data[1][8], "JA");
});

// Ett lag som klubben skapat som utkast, så som lagföräldern får det.
function utkast(m, sk, o = {}) {
  const r = skapaLag(m, sk, { namn: "Lag A", status: "utkast", swishNummer: "", mottagare: "", kampanj: "", produkt: "", enhetEn: "", enhet: "", pris: 30, inkopspris: 14.5, minimum: 10, mal: 20, ...o });
  return { ...r, slug: r.slug };
}
const komplett = { kampanj: "Chokladförsäljning", produkt: "Klubbkaka", enhetEn: "kaka", enhet: "kakor", swishNummer: "070 123 45 67", mottagare: "Eskilsminne IF Lag A", pris: 30, inkopspris: 14.5, minimum: 10, mal: 20 };

test("utkast och väntande försäljningar syns bara med namn för allmänheten, och går inte att beställa från", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  skapaLag(m, sk, { namn: "Lag B", status: "granskas", swishNummer: "070 123 45 67", mottagare: "Hemlig mottagare", kommentar: "x" });
  skapaLag(m, sk, { namn: "Lag C", status: "pagar" });
  const lista = m.get({ action: "lag" }).lag;
  assert.deepEqual(lista.find((l) => l.slug === "lag-a"), { slug: "lag-a", namn: "Lag A", status: "utkast" });
  assert.deepEqual(Object.keys(lista.find((l) => l.slug === "lag-b")).sort(), ["namn", "slug", "status"]);
  assert.ok("swish" in lista.find((l) => l.slug === "lag-c"), "ett öppet lag visas som förut");
  assert.ok(!JSON.stringify(lista).includes("Hemlig mottagare"));
  assert.match(bestall(m, "lag-a").fel, /inte öppen/);
  assert.match(bestall(m, "lag-b").fel, /inte öppen/);
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.status, "utkast", "lagföräldern kommer åt sitt utkast");
});

test("lagförälderns uppsättning: bara försäljningens uppgifter, bara som utkast", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  let r = m.admin("lag-a", a.key, "lagSpara", { falt: { ...komplett, namn: "Kapat", status: "pagar", slug: "kapad", hash: "x", _rad: 9 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.lag.namn, r.lag.status, r.lag.slug], ["Lag A", "utkast", "lag-a"], "namn, status och adress kan inte ändras av laget");
  assert.deepEqual([r.lag.kampanj, r.lag.swish.nummer, r.lag.swish.namnPaKonto, r.lag.pris], ["Chokladförsäljning", "070 123 45 67", "Eskilsminne IF Lag A", 30]);
  assert.match(m.admin("lag-a", a.key, "lagSpara", { falt: { swishNummer: "12" } }).fel, /Swish/);
  assert.match(m.admin("lag-a", a.key, "lagSpara", { falt: { inkopspris: 99 } }).fel, /Inköpspriset/);
  assert.match(m.admin("lag-a", a.key, "lagSpara", { falt: { mal: 5 } }).fel, /Målet/);
  assert.equal(m.admin("lag-a", a.key, "lagSpara", { falt: { kampanj: "=HYPERLINK" } }).lag.kampanj, "HYPERLINK", "formeltecken rensas");
  const b = skapaLag(m, sk, { namn: "Lag B", status: "utkast" });
  assert.match(m.admin("lag-a", b.key, "lagSpara", { falt: { pris: 1 } }).fel, /Fel lag eller nyckel/);
  // ett lag som klubben redan godkänt kan inte ändras av laget, men av klubben
  m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { status: "pagar" } });
  assert.match(m.admin("lag-a", a.key, "lagSpara", { falt: { pris: 99 } }).fel, /låst/);
  assert.equal(m.admin("lag-a", sk, "lagSpara", { falt: { pris: 31 } }).lag.pris, 31, "klubbens administratör får ändra");
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.pris, 31);
});

test("skicka för godkännande: kräver bekräftelse och ifyllda uppgifter, och låser uppgifterna", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  assert.match(m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true }).fel, /Fyll i först: Produkt, Enhet \(ental och flertal\), Swish-nummer, Mottagarens namn i Swish/);
  m.admin("lag-a", a.key, "lagSpara", { falt: komplett });
  assert.match(m.admin("lag-a", a.key, "skickaGodkannande", {}).fel, /Bekräfta/);
  assert.match(m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: "ja" }).fel, /Bekräfta/);
  assert.equal(m.blad["Lag"].data[1][3], "utkast", "inget skickades");
  const r = m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  assert.deepEqual([r.ok, r.lag.status], [true, "granskas"]);
  assert.match(m.admin("lag-a", a.key, "lagSpara", { falt: { pris: 99 } }).fel, /låst/);
  assert.match(m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true }).fel, /väntar redan/);
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.pris, 30);
  // dra tillbaka, ändra, skicka igen
  assert.equal(m.admin("lag-a", a.key, "dragTillbaka").lag.status, "utkast");
  assert.match(m.admin("lag-a", a.key, "dragTillbaka").fel, /väntar inte/);
  assert.equal(m.admin("lag-a", a.key, "lagSpara", { falt: { pris: 35 } }).lag.pris, 35);
  assert.equal(m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true }).lag.status, "granskas");
  const logg = m.blad["Logg"].data.slice(1).map((x) => x[2]);
  assert.deepEqual(logg.filter((x) => /godkännande|tillbakadragen/.test(x)), ["skickad för godkännande", "tillbakadragen till utkast", "skickad för godkännande"]);
});

test("klubben godkänner: bara administratören, bara från väntar-på-godkännande, och först då går det att beställa", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  m.admin("lag-a", a.key, "lagSpara", { falt: komplett });
  assert.match(m.admin("*", sk, "godkann", { slug: "lag-a", till: "pagar" }).fel, /väntar inte/, "ett utkast kan inte godkännas");
  m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  assert.match(m.admin("lag-a", a.key, "godkann", { slug: "lag-a", till: "pagar" }).fel, /Bara klubbens administratör/);
  assert.match(m.admin("lag-a", a.key, "skickaTillbaka", { slug: "lag-a", kommentar: "nej" }).fel, /Bara klubbens administratör/);
  assert.match(m.admin("*", a.key, "godkann", { slug: "lag-a", till: "pagar" }).fel, /Fel lag eller nyckel/);
  assert.match(m.admin("*", sk, "godkann", { slug: "lag-a", till: "avslutad" }).fel, /nu eller senare/);
  assert.match(m.admin("*", sk, "godkann", { slug: "lag-a" }).fel, /nu eller senare/);
  assert.match(m.admin("*", sk, "godkann", { slug: "finns-inte", till: "pagar" }).fel, /Okänt lag/);
  assert.match(bestall(m, "lag-a").fel, /inte öppen/, "ingen beställning innan godkännande");
  let r = m.admin("*", sk, "godkann", { slug: "lag-a", till: "snart" });
  assert.deepEqual([r.ok, r.lag.status], [true, "snart"]);
  assert.match(bestall(m, "lag-a").fel, /inte öppen/, "godkänd men inte öppnad än");
  assert.match(m.admin("*", sk, "godkann", { slug: "lag-a", till: "pagar" }).fel, /väntar inte/, "redan godkänd");
  m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { status: "pagar" } });
  assert.equal(bestall(m, "lag-a").ok, true);
  assert.ok("swish" in m.get({ action: "lag" }).lag[0], "när försäljningen är godkänd syns uppgifterna");
  assert.ok(m.blad["Logg"].data.some((x) => x[2] === "godkänd av klubben" && x[4] === "snart"));
});

test("klubben kan skicka tillbaka med en kommentar som bara laget ser", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  m.admin("lag-a", a.key, "lagSpara", { falt: komplett });
  m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  assert.match(m.admin("*", sk, "skickaTillbaka", { slug: "lag-a", kommentar: "  " }).fel, /Skriv vad som behöver ändras/);
  assert.equal(m.blad["Lag"].data[1][3], "granskas", "oförändrad utan kommentar");
  const r = m.admin("*", sk, "skickaTillbaka", { slug: "lag-a", kommentar: "=Sätt priset till 35 kr, och byt Swish-nummer" });
  assert.deepEqual([r.ok, r.lag.status, r.lag.kommentar], [true, "utkast", "Sätt priset till 35 kr, och byt Swish-nummer"]);
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.kommentar, "Sätt priset till 35 kr, och byt Swish-nummer", "laget ser kommentaren");
  assert.ok(!JSON.stringify(m.get({ action: "lag" })).includes("Sätt priset"), "kommentaren är aldrig publik");
  assert.match(m.admin("*", sk, "skickaTillbaka", { slug: "lag-a", kommentar: "igen" }).fel, /väntar inte/);
  m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.kommentar, "", "kommentaren töms när laget skickar igen");
  const lagLista = m.admin("*", sk, "lagLista").lag[0];
  assert.deepEqual([lagLista.status, lagLista.kommentar], ["granskas", ""]);
  assert.ok(m.blad["Logg"].data.some((x) => x[2] === "skickad tillbaka till laget" && /Sätt priset/.test(x[4])));
  // även om klubben öppnar ett lag som har en gammal kommentar kvar syns den inte för allmänheten
  m.admin("*", sk, "skickaTillbaka", { slug: "lag-a", kommentar: "Sätt priset till 35 kr" });
  m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { status: "pagar" } });
  const oppet = m.get({ action: "lag" }).lag[0];
  assert.equal(oppet.status, "pagar");
  assert.ok(!("kommentar" in oppet) && !JSON.stringify(oppet).includes("Sätt priset"));
});

test("godkännande kontrollerar uppgifterna en gång till om klubben ändrat dem", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  m.admin("lag-a", a.key, "lagSpara", { falt: komplett });
  m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { swishNummer: "" } });   // klubben tömmer numret
  assert.match(m.admin("*", sk, "godkann", { slug: "lag-a", till: "pagar" }).fel, /Swish-nummer/);
  assert.equal(m.blad["Lag"].data[1][3], "granskas");
});

test("klubben kan inte öppna eller godkänna en försäljning utan Swish-nummer och de andra uppgifterna", () => {
  const { m, sk } = ny();
  const tomt = { namn: "Lag X", pris: 30, inkopspris: 10, minimum: 10, mal: 20 };
  // direkt vid skapandet
  assert.match(m.admin("*", sk, "lagNy", { data: { ...tomt, status: "pagar" } }).fel, /kan inte vara öppen än\. Fyll i först: Produkt, Enhet \(ental och flertal\), Swish-nummer, Mottagarens namn i Swish/);
  assert.match(m.admin("*", sk, "lagNy", { data: { ...tomt, status: "snart" } }).fel, /kan inte vara godkänd än/);
  assert.equal(m.blad["Lag"].getLastRow(), 1, "inget lag skapades");
  assert.equal(m.admin("*", sk, "lagNy", { data: { ...tomt, status: "utkast" } }).ok, true, "ett utkast får vara tomt");
  assert.equal(m.admin("*", sk, "lagNy", { data: { ...tomt, namn: "Lag Z", status: "avslutad" } }).ok, true, "ett avslutat lag kräver inget");
  // vid ändring av status
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-x", falt: { status: "pagar" } }).fel, /Fyll i först: .*Swish-nummer/);
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-x", falt: { status: "snart", swishNummer: "070 123 45 67", produkt: "Bulle", enhetEn: "bulle", enhet: "bullar" } }).fel, /Mottagarens namn/, "några av uppgifterna räcker inte");
  assert.equal(m.blad["Lag"].data[1][3], "utkast", "statusen är oförändrad");
  assert.match(bestall(m, "lag-x").fel, /inte öppen/);
  const ok = m.admin("*", sk, "lagUppdatera", { slug: "lag-x", falt: { status: "pagar", kampanj: "Bullar", produkt: "Bulle", enhetEn: "bulle", enhet: "bullar", swishNummer: "070 123 45 67", mottagare: "Eskilsminne IF Lag X" } });
  assert.deepEqual([ok.ok, ok.lag.status], [true, "pagar"]);
  assert.equal(bestall(m, "lag-x").ok, true);
  // ett öppet lag kan inte göras ofullständigt
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-x", falt: { swishNummer: "" } }).fel, /Swish-nummer/);
  assert.equal(m.admin("*", sk, "lagUppdatera", { slug: "lag-x", falt: { swishNummer: "070 999 99 99" } }).ok, true, "men ett nytt nummer går bra");
  assert.equal(m.admin("*", sk, "lagUppdatera", { slug: "lag-x", falt: { swishNummer: "", status: "avslutad" } }).ok, true, "och ett avslutat lag får sakna det");
});

test("ett nytt lag kan skapas med bara ett namn: allt annat fyller laget i själv", () => {
  const { m, sk } = ny();
  const r = m.admin("*", sk, "lagNy", { data: { namn: "Lag Y" } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.lag.status, "utkast", "alltid ett utkast till att börja med");
  assert.equal(r.lag.produkt.namn, "", "ingen färdig produkt");
  assert.equal(typeof r.key, "string");
  assert.equal(m.get({ action: "lag" }).lag.filter(l => l.slug === "lag-y")[0].status, "utkast");
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-y", falt: { status: "pagar" } }).fel, /Fyll i först: Produkt/);
});

test("produkten skrivs in av laget själv: fälten rensas, rubriken följer produkten, och inget finns färdigt", () => {
  const { m, sk } = ny();
  const a = utkast(m, sk);
  assert.deepEqual(m.admin("lag-a", a.key, "oversikt").lag.produkt, { namn: "", detalj: "", enhetEn: "", enhet: "" }, "inga färdiga produkter");
  const r = m.admin("lag-a", a.key, "lagSpara", { falt: { ...komplett, kampanj: "", produkt: "  =Kanelbullar", detalj: "Påse med sex bullar", enhetEn: "påse", enhet: "påsar",
    intro: "Bullarna bakas av föräldrarna.", utlamningsText: "På träningen.", belonning: "Fika för hela laget." } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.lag.produkt, { namn: "Kanelbullar", detalj: "Påse med sex bullar", enhetEn: "påse", enhet: "påsar" }, "formeltecken och blanksteg rensas");
  assert.deepEqual([r.lag.intro, r.lag.utlamningsText, r.lag.belonning], ["Bullarna bakas av föräldrarna.", "På träningen.", "Fika för hela laget."]);
  assert.equal(r.lag.titel, "Kanelbullar", "utan egen rubrik används produktens namn");
  assert.equal(m.admin("lag-a", a.key, "lagSpara", { falt: { kampanj: "Julbullar" } }).lag.titel, "Julbullar", "en egen rubrik går före");
  // längder begränsas
  const lang = m.admin("lag-a", a.key, "lagSpara", { falt: { produkt: "x".repeat(100), intro: "y".repeat(900) } }).lag;
  assert.deepEqual([lang.produkt.namn.length, lang.intro.length], [40, 400]);
  // produkt och enheter krävs för att få vara godkänd
  m.admin("lag-a", a.key, "lagSpara", { falt: { produkt: "Bulle", enhetEn: "", enhet: "" } });
  assert.match(m.admin("lag-a", a.key, "skickaGodkannande", { bekraftat: true }).fel, /Enhet \(ental och flertal\)/);
  m.admin("lag-a", a.key, "lagSpara", { falt: { enhetEn: "bulle", enhet: "bullar" } });
  m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { status: "pagar" } });
  const publikt = m.get({ action: "lag" }).lag[0];
  assert.deepEqual([publikt.produkt.namn, publikt.produkt.enhet, publikt.titel], ["Bulle", "bullar", "Julbullar"], "föräldrarna får produkten från laget");
});

test("utlämningslänk: skapas av laget, ger en begränsad vy och kan bytas och stängas av", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" }), b = skapaLag(m, sk, { namn: "Lag B" });
  bestall(m, "lag-a", { antal: 10, barn: "Alva", mobil: "0701111111" });
  bestall(m, "lag-a", { antal: 5, barn: "Bosse", mobil: "0702222222" });
  bestall(m, "lag-a", { antal: 2, barn: "Cia", mobil: "0703333333" });
  bestall(m, "lag-b", { antal: 3, barn: "Dan", mobil: "0704444444" });
  m.admin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  m.admin("lag-a", a.key, "satt", { id: "0003", varde: "AVBRUTEN" });
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.harUtlamningslank, false);
  // bara laget (och klubben) skapar den
  const n = m.admin("lag-a", a.key, "nyUtlamningslank");
  assert.deepEqual([n.ok, n.slug], [true, "lag-a"]);
  assert.match(n.key, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
  const u = n.key;
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.harUtlamningslank, true);
  assert.equal(m.admin("lag-a", sk, "nyUtlamningslank").ok, true, "klubben får också skapa den");
  const u2 = m.admin("lag-a", a.key, "nyUtlamningslank").key;
  assert.match(m.admin("lag-a", u, "lista").fel, /Fel lag eller nyckel/, "en ny länk gör den gamla ogiltig");
  // vyn: namn och antal, inga mobilnummer, belopp, tider eller avbrutna
  const ov = m.admin("lag-a", u2, "oversikt");
  assert.deepEqual([ov.ok, ov.roll, Object.keys(ov.lag).sort(), ov.sammanfattning], [true, "utlamning", ["namn", "produkt", "slug", "status", "titel"], { hamtat: 0, kvar: 15 }]);
  const li = m.admin("lag-a", u2, "lista");
  assert.deepEqual(li.ordrar, [{ id: "0001", barn: "Alva", antal: 10, betald: true, hamtad: false }, { id: "0002", barn: "Bosse", antal: 5, betald: false, hamtad: false }]);
  assert.ok(!/0701111111|0702222222|belopp|"tid"|Cia/.test(JSON.stringify([ov, li])), "inga mobilnummer, belopp, tider eller avbrutna");
  // bocka av hämtat
  const h = m.admin("lag-a", u2, "hamtad", { id: "0001", varde: "JA" });
  assert.deepEqual([h.ok, h.order, h.sammanfattning], [true, { id: "0001", barn: "Alva", antal: 10, betald: true, hamtad: true }, { hamtat: 10, kvar: 5 }]);
  assert.ok(!/mobil|belopp|oversikt/.test(JSON.stringify(h)), "svaret har inga pengar eller mobilnummer");
  assert.equal(m.admin("lag-a", u2, "hamtad", { id: "0001", varde: "" }).ok, true, "går att ångra");
  assert.match(m.admin("lag-a", u2, "hamtad", { id: "0003", varde: "JA" }).fel, /avbruten/);
  // allt annat är stängt för länken
  const stangt = /bara bocka av utlämningen/;
  for (const [op, extra] of [["satt", { id: "0002", varde: "JA" }], ["taBort", { id: "0002" }], ["hamtadAlla", {}], ["lagSpara", { falt: { pris: 1 } }], ["nyUtlamningslank", {}],
    ["stangUtlamningslank", {}], ["skickaGodkannande", { bekraftat: true }], ["dragTillbaka", {}], ["lagLista", {}], ["lagNy", { data: lagData() }], ["godkann", { slug: "lag-a", till: "pagar" }], ["nyNyckel", { slug: "lag-a" }]])
    assert.match(m.admin("lag-a", u2, op, extra).fel, stangt, op);
  assert.equal(m.blad["Beställningar"].data.slice(1).find((x) => x[3] === "Bosse")[7], "", "inget ändrades");
  // bara för det egna laget, och inte som lagets eller klubbens nyckel
  assert.match(m.admin("lag-b", u2, "lista").fel, /Fel lag eller nyckel/);
  assert.match(m.admin("*", u2, "lagLista").fel, /Fel lag eller nyckel/);
  assert.equal(m.admin("lag-a", a.key, "lista").roll, "lag");
  // stäng av
  const s = m.admin("lag-a", a.key, "stangUtlamningslank");
  assert.deepEqual([s.ok, s.lag.harUtlamningslank], [true, false]);
  assert.match(m.admin("lag-a", u2, "lista").fel, /Fel lag eller nyckel/);
  // nycklarna och deras hashar syns aldrig, och alla steg loggas utan nycklar
  const alla = JSON.stringify([m.get({ action: "lag" }), m.admin("lag-a", a.key, "oversikt"), m.admin("*", sk, "lagLista")]);
  for (const hemlig of [u, u2, u2.replace(/-/g, ""), m.ctx.hash(u2)]) assert.ok(!alla.includes(hemlig) && !JSON.stringify(m.blad["Logg"].data).includes(hemlig), "läcker: " + hemlig);
  const logg = m.blad["Logg"].data.slice(1).map((x) => x[2]).filter((x) => /utlämningslänk/.test(x));
  assert.deepEqual(logg, ["utlämningslänk skapad", "ny utlämningslänk", "ny utlämningslänk", "utlämningslänk avstängd"]);
});

test("setup lägger till produkt- och utlämningskolumnerna i en äldre lagflik", () => {
  const { m, sk } = ny();
  utkast(m, sk);
  const sh = m.blad["Lag"];
  sh.data.forEach((rad) => { rad.length = Math.min(rad.length, 16); });
  m.setup();
  assert.deepEqual(sh.data[0].slice(16), ["Produkt", "Produktbeskrivning", "Enhet (ental)", "Enhet (flertal)", "Om försäljningen", "Utlämning (text)", "Belöning", "Utlämningsnyckel (hash)"]);
  assert.equal(sh.data[1][0], "lag-a");
  assert.deepEqual(m.admin("lag-a", m.admin("*", sk, "nyNyckel", { slug: "lag-a" }).key, "oversikt").lag.produkt, { namn: "", detalj: "", enhetEn: "", enhet: "" });
});

test("setup lägger till kolumnen Klubbens kommentar i en äldre lagflik", () => {
  const { m, sk } = ny();
  utkast(m, sk);
  const sh = m.blad["Lag"];
  sh.data.forEach((rad) => { rad.length = Math.min(rad.length, 15); });   // så såg fliken ut innan kolumnen fanns
  assert.equal(sh.data[0][15], undefined);
  m.setup();
  assert.equal(sh.data[0][15], "Klubbens kommentar");
  assert.equal(sh.data[1][0], "lag-a");
  assert.equal(m.admin("lag-a", m.admin("*", sk, "nyNyckel", { slug: "lag-a" }).key, "oversikt").lag.kommentar, "");
});

test("ta bort en beställning: bara om den inte är betald eller hämtad, och bara i det egna laget", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" }), b = skapaLag(m, sk, { namn: "Lag B" });
  bestall(m, "lag-a", { antal: 10, barn: "Alva", mobil: "0701111111" });
  bestall(m, "lag-a", { antal: 5, barn: "Bosse", mobil: "0702222222" });
  bestall(m, "lag-a", { antal: 2, barn: "Cia", mobil: "0703333333" });
  bestall(m, "lag-b", { antal: 3, barn: "Dan", mobil: "0704444444" });   // också 0001
  m.admin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  const namn = () => m.blad["Beställningar"].data.slice(1).map((x) => x[3]);
  // Lag B:s admin kan bara röra sitt eget lag: 0002 finns bara hos A, och B:s egen 0001 är Dan, inte A:s betalda Alva
  assert.match(m.admin("lag-b", b.key, "taBort", { id: "0002" }).fel, /Hittar ingen order/);
  assert.ok(namn().includes("Bosse"), "Lag A:s Bosse finns kvar");
  assert.match(m.admin("lag-a", b.key, "taBort", { id: "0001" }).fel, /Fel lag eller nyckel/);
  assert.match(m.admin("lag-a", "", "taBort", { id: "0001" }).fel, /Fel lag eller nyckel/);
  assert.equal(m.admin("lag-b", b.key, "taBort", { id: "0001" }).borttagen, "0001");
  assert.deepEqual(namn(), ["Alva", "Bosse", "Cia"], "Dan försvann, inte Alva");
  // betald: skyddad
  assert.match(m.admin("lag-a", a.key, "taBort", { id: "0001" }).fel, /betald beställning kan inte tas bort/);
  assert.equal(m.blad["Beställningar"].getLastRow(), 4, "inget togs bort");
  // hämtad men inte betald: skyddad
  m.admin("lag-a", a.key, "hamtad", { id: "0002", varde: "JA" });
  assert.match(m.admin("lag-a", a.key, "taBort", { id: "0002" }).fel, /hämtad beställning kan inte tas bort/);
  m.admin("lag-a", a.key, "hamtad", { id: "0002", varde: "" });
  // obetald: tas bort, och siffrorna uppdateras
  const r = m.admin("lag-a", a.key, "taBort", { id: "0002" });
  assert.deepEqual([r.ok, r.borttagen, r.oversikt.bestallt, r.oversikt.betalt, r.oversikt.obetalt], [true, "0002", 12, 10, 2]);
  assert.deepEqual(namn(), ["Alva", "Cia"]);
  assert.deepEqual(m.get({ action: "status", lag: "lag-a" }), { ok: true, bestallt: 12 });
  assert.deepEqual(m.admin("lag-a", a.key, "lista").ordrar.map((o) => o.id), ["0003", "0001"]);
  // en avbruten beställning kan också tas bort
  m.admin("lag-a", a.key, "satt", { id: "0003", varde: "AVBRUTEN" });
  assert.equal(m.admin("lag-a", a.key, "taBort", { id: "3" }).ok, true, "'3' går bra");
  // en betalning som ångras kan sedan tas bort
  m.admin("lag-a", a.key, "satt", { id: "0001", varde: "" });
  assert.equal(m.admin("lag-a", a.key, "taBort", { id: "0001" }).ok, true);
  assert.equal(m.admin("lag-a", a.key, "lista").ordrar.length, 0);
  assert.match(m.admin("lag-a", a.key, "taBort", { id: "x" }).fel, /ordernummer/);
  assert.match(m.admin("lag-a", a.key, "taBort", { id: "0099" }).fel, /Hittar ingen order/);
  assert.match(m.admin("lag-a", a.key, "taBort", {}).fel, /ordernummer/);
});

test("ta bort: ordernumret används inte igen, och loggen innehåller inga personuppgifter", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  bestall(m, "lag-a", { antal: 4, barn: "Hemligsson", mobil: "0705551234" });
  assert.equal(m.admin("lag-a", sk, "taBort", { id: "0001" }).ok, true, "klubbens administratör får ta bort");
  assert.equal(bestall(m, "lag-a", { barn: "Ny", mobil: "0706666666" }).id, "0002", "0001 används inte igen");
  const logg = JSON.stringify(m.blad["Logg"].data);
  assert.ok(logg.includes("order borttagen") && logg.includes("4 st, 120 kr"));
  assert.ok(!logg.includes("Hemligsson") && !logg.includes("0705551234"), "inga personuppgifter i loggen");
  assert.ok(!JSON.stringify(m.blad["Beställningar"].data).includes("Hemligsson"), "uppgifterna är borta ur beställningarna");
});

test("översikt: lag utan kartonger fakturerar det som beställts", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Bullar", pris: 50, inkopspris: 20, minimum: 100, mal: 200, kartong: 0 });
  bestall(m, "bullar", { antal: 7 });
  const ov = m.admin("bullar", a.key, "oversikt").oversikt;
  assert.deepEqual([ov.kartonger, ov.levereras, ov.faktura, ov.minimumNatt, ov.minimumKvar], [0, 7, 140, false, 93]);
});

test("ändra lag: bara tillåtna fält, och siffrorna kontrolleras mot de befintliga", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  const hashFore = m.blad["Lag"].data[1][13];
  let r = m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { pris: 40, status: "avslutad", slug: "kapad", hash: "x", nyckel: "y", _hash: "z", _rad: 9 } });
  assert.equal(r.ok, true);
  assert.deepEqual([r.lag.slug, r.lag.pris, r.lag.status], ["lag-a", 40, "avslutad"]);
  assert.equal(m.blad["Lag"].data[1][13], hashFore, "nyckelns hash kan inte ändras den vägen");
  assert.equal(m.blad["Lag"].data[1][0], "lag-a");
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { mal: 100 } }).fel, /Målet/);   // minimum är 240
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { inkopspris: 99 } }).fel, /Inköpspriset/);
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { swishNummer: "0" } }).fel, /Swish/);
  assert.match(m.admin("*", sk, "lagUppdatera", { slug: "finns-inte", falt: { pris: 1 } }).fel, /Okänt lag/);
  assert.equal(m.admin("lag-a", a.key, "oversikt").lag.pris, 40);
  assert.match(bestall(m, "lag-a").fel, /inte öppen/, "ett avslutat lag tar inte emot beställningar");
  assert.equal(m.admin("*", sk, "lagUppdatera", { slug: "lag-a", falt: { status: "pagar", swishNummer: "070-123 45 67" } }).lag.swish.nummer, "070 123 45 67");
});

test("ny nyckel: den gamla slutar fungera och nyckeln syns bara i svaret på just det anropet", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  const svar = [];
  const spara = (r) => { svar.push(JSON.stringify(r)); return r; };
  spara(m.get({ action: "lag" })); spara(m.admin("lag-a", a.key, "oversikt")); spara(m.admin("lag-a", a.key, "lista")); spara(m.admin("*", sk, "lagLista"));
  const n = m.admin("*", sk, "nyNyckel", { slug: "lag-a" });
  assert.equal(n.ok, true);
  assert.notEqual(n.key, a.key);
  assert.match(m.admin("lag-a", a.key, "oversikt").fel, /Fel lag eller nyckel/);
  assert.equal(m.admin("lag-a", n.key, "oversikt").ok, true);
  spara(m.admin("lag-a", n.key, "oversikt")); spara(m.admin("*", sk, "lagLista"));
  const alla = svar.join("\n");
  for (const hemlig of [a.key, n.key, sk, a.key.replace(/-/g, ""), n.key.replace(/-/g, ""), m.props.get("SUPER_HASH"), m.blad["Lag"].data[1][13]]) assert.ok(!alla.includes(hemlig), "läcker: " + hemlig);
  assert.match(m.admin("*", sk, "nyNyckel", { slug: "finns-inte" }).fel, /Okänt lag/);
});

test("ny superadmin-nyckel byter ut den gamla", () => {
  const { m, sk } = ny();
  const ny2 = m.ctx.nySuperNyckel();
  assert.equal(m.admin("*", sk, "lagLista").ok, false);
  assert.equal(m.admin("*", ny2, "lagLista").ok, true);
});

test("spärr efter för många felaktiga försök, även med rätt nyckel tills spärren löpt ut", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  for (let i = 0; i < 10; i++) assert.match(m.admin("lag-a", "f".repeat(32), "oversikt").fel, /Fel lag eller nyckel/);
  assert.match(m.admin("lag-a", a.key, "oversikt").fel, /För många felaktiga försök/);
  assert.equal(m.admin("*", sk, "lagLista").ok, true, "en annan adress och rätt superadmin-nyckel påverkas inte av ett enskilt lags spärr");
  m.cache.clear();
  assert.equal(m.admin("lag-a", a.key, "oversikt").ok, true);
  for (let i = 0; i < 40; i++) m.admin("slug" + i, "f".repeat(32), "oversikt");
  assert.match(m.admin("lag-a", a.key, "oversikt").fel, /För många felaktiga försök/, "den gemensamma spärren gäller alla lag");
});

test("felaktiga anrop ger ett fel, inte ett krasch", () => {
  const { m, sk } = ny();
  const a = skapaLag(m, sk, { namn: "Lag A" });
  assert.match(m.postRaw("inte json").fel, /Felaktig förfrågan/);
  assert.match(m.postRaw("null").fel, /Okänt lag|Vänta/);
  assert.match(m.get({ action: "x" }).fel, /Okänd förfrågan/);
  assert.match(m.get({}).fel, /Okänd förfrågan/);
  assert.match(m.get({ action: "status", lag: "finns-inte" }).fel, /Okänt lag/);
  assert.match(m.admin("lag-a", a.key, "constructor").fel, /Okänd åtgärd/);
  assert.match(m.admin("lag-a", a.key, "__proto__").fel, /Okänd åtgärd/);
  assert.match(m.admin("lag-a", a.key, "").fel, /Okänd åtgärd/);
  assert.match(m.admin("*", sk, "lagNy", { data: null }).fel, /namn/i);
});

test("offentliga svar innehåller aldrig mobilnummer eller barnens namn", () => {
  const { m, sk } = ny();
  skapaLag(m, sk, { namn: "Lag A" });
  bestall(m, "lag-a", { barn: "Hemligsson", mobil: "0705551234" });
  const alla = JSON.stringify([m.get({ action: "lag" }), m.get({ action: "status", lag: "lag-a" })]);
  assert.ok(!alla.includes("Hemligsson") && !alla.includes("0705551234"));
});
