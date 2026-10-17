/* Tester av servern (server/): beställning, lager, adminvyn, godkännande och spärrar.
   Körs mot en riktig D1 lokalt (se miljo.js). Portat från server.test.cjs, som testade Apps Script-versionen (Server.gs). */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { skapaMiljo, lagData, ADMIN_EPOST, AGARE_EPOST, CFG, ORIGIN } from "./miljo.js";

const KL = "testklubben";
let m, H;

before(async () => { m = await skapaMiljo(); });
after(async () => { await m.stang(); });
beforeEach(async () => {
  await m.nollstall();
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] });
  H = m.somAdmin((await m.loggaIn(KL, ADMIN_EPOST)).kaka);
});

const klubb = (op, extra, lag = "*") => m.admin(KL, lag, "", op, extra, H);   // som klubbens administratör
const lagAdmin = (slug, key, op, extra) => m.admin(KL, slug, key, op, extra);   // som lagförälder, med lagets nyckel
const lagNy = (o) => m.nyttLag(KL, lagData(o));   // ett färdigt lag direkt i databasen (klubben kan inte lägga till lag)
const starta = (namn, o = {}) => m.post({ action: "starta", klubb: KL, namn, t: 5000, website: "", ...o });
const bestall = (lag, o = {}) => m.post({ klubb: KL, lag, barn: "Emil", mobil: "070 123 45 67", antal: 2, samtycke: true, website: "", t: 5000, ...o });
const lista = () => m.get({ action: "lag", klubb: KL });
const mobil = (i) => "070" + String(8000000 + i);   // ett eget mobilnummer per beställning, så att spärren per nummer inte slår till

/* ---------- Laglistan ---------- */
test("laglistan är publik men innehåller aldrig nyckel, hash eller interna nummer", async () => {
  const a = await lagNy({ namn: "Lag A" });
  await bestall("lag-a", { barn: "Alva", mobil: "070 111 11 11" });
  const s = (await m.anrop("GET", "/api?action=lag&klubb=" + KL)).text;
  assert.ok(JSON.parse(s).ok);
  for (const hemligt of [a.key, a.key.replace(/-/g, ""), "hash", "nyckel", "Alva", "0701111111", "klubb_id", "lag_id"])
    assert.ok(!s.includes(hemligt), "läcker: " + hemligt);
});

test("laglistan har antal beställda per lag: avbrutna räknas inte, och utkast har inget att visa", async () => {
  const a = await lagNy({ namn: "Lag A" });
  await lagNy({ namn: "Lag U", status: "utkast" });
  await bestall("lag-a", { antal: 3, mobil: mobil(1) });
  await bestall("lag-a", { antal: 2, mobil: mobil(2) });
  await lagAdmin("lag-a", a.key, "satt", { id: "0002", varde: "AVBRUTEN" });
  const l = (await lista()).lag;
  assert.equal(l.find((x) => x.slug === "lag-a").bestallt, 3);
  assert.equal(l.find((x) => x.slug === "lag-u").bestallt, undefined);
  assert.equal((await m.get({ action: "status", klubb: KL, lag: "lag-a" })).bestallt, 3);
});

test("en klubb som inte finns eller inte är godkänd svarar som en okänd för besökare och inloggningslösa", async () => {
  await m.skapaKlubb("vantar", "Väntar", { status: "vantar" });
  await m.skapaKlubb("avstangd", "Avstängd", { status: "avstangd" });
  for (const slug of ["vantar", "avstangd", "finns-inte"]) {
    assert.deepEqual(await m.get({ action: "lag", klubb: slug }), { ok: false, fel: "Okänd klubb." }, slug);
    assert.equal((await bestall("lag-a", { klubb: slug })).fel, "Okänt lag.", slug);
    assert.equal((await m.admin(slug, "lag-a", "0123-4567-89ab-cdef-0123-4567-89ab-cdef", "lista")).fel, "Fel lag eller nyckel.", slug);
    assert.equal((await m.post({ action: "starta", klubb: slug, namn: "Lag X", t: 5000, website: "" })).fel, "Okänd klubb.", slug);
  }
});

/* ---------- Nytt lag ---------- */
test("ny försäljning: namnregler, adress och standardvärden, och uppgifterna kontrolleras när de sparas", async () => {
  const r = await starta("P 2019");
  assert.ok(r.ok); assert.equal(r.slug, "p-2019");
  assert.match(r.key, /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);
  assert.equal(r.lag.swish.meddelande, "P 2019 försäljning"); assert.equal(r.lag.maxAntal, 50); assert.equal(r.lag.status, "utkast");
  assert.match((await starta("P 2019")).fel, /redan en försäljning/);
  assert.match((await starta("")).fel, /namn/);
  const spara = (falt) => lagAdmin("p-2019", r.key, "lagSpara", { falt });
  assert.match((await spara({ swishNummer: "12345" })).fel, /Swish/);
  assert.match((await spara({ pris: 5, inkopspris: 9 })).fel, /Inköpspriset/);
  assert.match((await spara({ minimum: 50, mal: 10 })).fel, /Målet/);
  assert.match((await spara({ pris: "abc" })).fel, /Priset/);
});

test("både privata Swish-nummer och Swish Handel-nummer godtas, och formateras lika", async () => {
  const a = await lagNy({ namn: "Lag A", status: "utkast" }), b = await lagNy({ namn: "Lag B", status: "utkast" });
  await lagAdmin("lag-a", a.key, "lagSpara", { falt: { swishNummer: "0701234567" } });
  await lagAdmin("lag-b", b.key, "lagSpara", { falt: { swishNummer: "1234567890" } });
  const l = (await klubb("lagLista")).lag;
  assert.equal(l.find((x) => x.slug === "lag-a").swish.nummer, "070 123 45 67");
  assert.equal(l.find((x) => x.slug === "lag-b").swish.nummer, "123 456 78 90");
});

test("text som börjar med formeltecken rensas innan den sparas", async () => {
  const a = await lagNy({ namn: "Lag F", status: "utkast" });
  await lagAdmin("lag-f", a.key, "lagSpara", { falt: { produkt: "=IMPORTXML(\"x\")", detalj: "+cmd", intro: "@SUM(1+1)", belonning: "-2+3" } });
  const l = (await klubb("lagLista")).lag.find((x) => x.slug === "lag-f");
  assert.equal(l.produkt.namn, "IMPORTXML(\"x\")"); assert.equal(l.produkt.detalj, "cmd"); assert.equal(l.intro, "SUM(1+1)"); assert.equal(l.belonning, "2+3");
});

test("ingen kan lägga till lag eller ändra en försäljning via klubbens vy: lagföräldern startar själv", async () => {
  const a = await lagNy({ namn: "Lag A" });
  for (const op of ["lagNy", "lagUppdatera"]) {
    assert.equal((await klubb(op, { data: lagData({ namn: "Lag B" }), slug: "lag-a", falt: { pris: 1 } })).fel, "Okänd åtgärd.", op + " som klubb");
    assert.equal((await lagAdmin("lag-a", a.key, op, { data: lagData({ namn: "Lag B" }), slug: "lag-a", falt: { pris: 1 } })).fel, "Okänd åtgärd.", op + " som lag");
  }
  assert.match((await klubb("lagSpara", { falt: { pris: 1 } }, "lag-a")).fel, /lagföräldern/);
  assert.equal((await lista()).lag.length, 1); assert.equal((await lista()).lag[0].pris, 30);
});

/* ---------- Beställning ---------- */
test("beställning: priset räknas på servern och ordernumren är löpande per lag", async () => {
  await lagNy({ namn: "Lag A", pris: 30 }); await lagNy({ namn: "Lag B", pris: 20 });
  assert.deepEqual(await bestall("lag-a", { antal: 3, mobil: mobil(1) }), { ok: true, id: "0001", belopp: 90 });
  assert.deepEqual(await bestall("lag-a", { antal: 1, mobil: mobil(2) }), { ok: true, id: "0002", belopp: 30 });
  assert.deepEqual(await bestall("lag-b", { antal: 2, mobil: mobil(3) }), { ok: true, id: "0001", belopp: 40 });
});

test("beställning: avvisas för okänt lag, stängt lag och felaktiga uppgifter", async () => {
  await lagNy({ namn: "Lag A" });
  for (const status of ["utkast", "granskas", "snart", "avslutad"]) {
    await lagNy({ namn: "Lag " + status, status: status === "snart" || status === "avslutad" ? status : "utkast" });
  }
  assert.equal((await bestall("finns-inte")).fel, "Okänt lag.");
  assert.equal((await bestall("lag-snart")).fel, "Försäljningen är inte öppen just nu.");
  assert.equal((await bestall("lag-avslutad")).fel, "Försäljningen är inte öppen just nu.");
  assert.match((await bestall("lag-a", { barn: "" })).fel, /barnets namn/);
  assert.match((await bestall("lag-a", { barn: "Emil123" })).fel, /barnets namn/);
  assert.match((await bestall("lag-a", { mobil: "123" })).fel, /mobilnummer/);
  assert.match((await bestall("lag-a", { mobil: "08 123 456 78" })).fel, /mobilnummer/);
  assert.match((await bestall("lag-a", { antal: 0 })).fel, /Välj mellan 1 och 20/);
  assert.match((await bestall("lag-a", { antal: 21 })).fel, /Välj mellan 1 och 20/);
  assert.match((await bestall("lag-a", { antal: 1.5 })).fel, /Välj mellan/);
  assert.match((await bestall("lag-a", { t: 100 })).fel, /Vänta/);
  assert.equal((await m.rader("bestallning")).length, 0);
});

test("beställning: mobilnummer normaliseras och spärr efter fem beställningar", async () => {
  await lagNy({ namn: "Lag A" });
  assert.ok((await bestall("lag-a", { mobil: "+46 (0)70 123 45 67" })).ok);
  assert.equal((await m.rader("bestallning"))[0].mobil, "0701234567");
  for (let i = 0; i < 4; i++) assert.ok((await bestall("lag-a", { mobil: "0046701234567" })).ok);
  assert.match((await bestall("lag-a", { mobil: "070-123 45 67" })).fel, /Många beställningar/);
  m.tid(CFG.SPARR_MINUTER * 60000 + 1000);
  assert.ok((await bestall("lag-a", { mobil: "070 123 45 67" })).ok, "spärren släpper efter tiden");
});

test("beställning: namn med & och / godtas, formeltecken och siffror gör det inte, och +46 (0)70 fungerar", async () => {
  await lagNy({ namn: "Lag A" });
  assert.ok((await bestall("lag-a", { barn: "Emil & Ella", mobil: mobil(1) })).ok);
  assert.ok((await bestall("lag-a", { barn: "Anna-Lisa (Lisa)", mobil: mobil(2) })).ok);
  assert.ok((await bestall("lag-a", { barn: "Åsa/Örjan", mobil: mobil(3) })).ok);
  assert.ok(!(await bestall("lag-a", { barn: "=1+1", mobil: mobil(4) })).ok);
  assert.ok(!(await bestall("lag-a", { barn: "1Emil", mobil: mobil(5) })).ok);
});

test("försöker föräldern igen med samma kod blir det ingen dubblett, utan samma kvitto", async () => {
  await lagNy({ namn: "Lag A", lager: 5, minimum: 0 });
  const a = await bestall("lag-a", { antal: 2, kod: "kod-aaaaaaaa", mobil: mobil(1) });
  const b = await bestall("lag-a", { antal: 2, kod: "kod-aaaaaaaa", mobil: mobil(1) });
  assert.deepEqual(a, b);
  assert.equal((await m.rader("bestallning")).length, 1);
  assert.equal((await lista()).lag[0].bestallt, 2);
  // en annan kod är en ny beställning, och ogiltiga koder ignoreras
  assert.equal((await bestall("lag-a", { antal: 1, kod: "kod-bbbbbbbb", mobil: mobil(2) })).id, "0002");
  assert.equal((await bestall("lag-a", { antal: 1, kod: "x", mobil: mobil(3) })).id, "0003");
  assert.equal((await bestall("lag-a", { antal: 1, kod: "x", mobil: mobil(4) })).id, "0004");
});

test("samma kod i två lag ger två beställningar: en kod kan aldrig hämta ett annat lags kvitto", async () => {
  await lagNy({ namn: "Lag A", pris: 30 }); await lagNy({ namn: "Lag B", pris: 20 });
  const a = await bestall("lag-a", { antal: 1, kod: "kod-delad-1", mobil: mobil(1) });
  const b = await bestall("lag-b", { antal: 1, kod: "kod-delad-1", mobil: mobil(2) });
  assert.equal(a.belopp, 30); assert.equal(b.belopp, 20);
});

test("samma kod från flera anrop samtidigt ger en enda beställning, och alla får samma kvitto", async () => {
  await lagNy({ namn: "Lag A" });
  const svar = await Promise.all(Array.from({ length: 8 }, () => bestall("lag-a", { antal: 2, kod: "kod-samtidig", mobil: "070 555 55 55" })));
  assert.ok(svar.every((s) => s.ok && s.id === "0001"), JSON.stringify(svar));
  assert.equal((await m.rader("bestallning")).length, 1);
});

test("beställningar samtidigt får unika, löpande nummer", async () => {
  await lagNy({ namn: "Lag A" });
  const svar = await Promise.all(Array.from({ length: 25 }, (_, i) => bestall("lag-a", { antal: 1, mobil: mobil(i) })));
  assert.ok(svar.every((s) => s.ok), JSON.stringify(svar.find((s) => !s.ok)));
  assert.deepEqual(svar.map((s) => Number(s.id)).sort((x, y) => x - y), Array.from({ length: 25 }, (_, i) => i + 1));
});

/* ---------- Lager ---------- */
test("lager: det kan inte beställas mer än det finns, avbrutna och borttagna ger tillbaka, och 0 betyder ingen gräns", async () => {
  const a = await lagNy({ namn: "Lag A", lager: 5, minimum: 0 });
  assert.ok((await bestall("lag-a", { antal: 3, mobil: mobil(1) })).ok);
  const nej = await bestall("lag-a", { antal: 3, mobil: mobil(2) });
  assert.ok(!nej.ok); assert.equal(nej.kvar, 2); assert.match(nej.fel, /bara 2 kvar/);
  assert.ok((await bestall("lag-a", { antal: 2, mobil: mobil(3) })).ok);
  const slut = await bestall("lag-a", { antal: 1, mobil: mobil(4) });
  assert.ok(!slut.ok); assert.equal(slut.kvar, 0); assert.match(slut.fel, /slutsålt/);
  await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "AVBRUTEN" });   // 3 tillbaka
  assert.ok((await bestall("lag-a", { antal: 3, mobil: mobil(5) })).ok);
  await lagAdmin("lag-a", a.key, "taBort", { id: "0003" });                  // 2 tillbaka
  assert.ok((await bestall("lag-a", { antal: 2, mobil: mobil(6) })).ok);
  await lagNy({ namn: "Lag O", lager: 0, maxAntal: 1000, minimum: 10 });
  assert.ok((await bestall("lag-o", { antal: 999, mobil: mobil(7) })).ok, "0 = ingen gräns");
});

test("lager: 20 beställningar samtidigt på den sista lotten ger exakt en beställning", async () => {
  await lagNy({ namn: "Lag L", lager: 3, minimum: 0 });
  assert.ok((await bestall("lag-l", { antal: 2, mobil: mobil(99) })).ok);   // 1 kvar
  const svar = await Promise.all(Array.from({ length: 20 }, (_, i) => bestall("lag-l", { antal: 1, mobil: mobil(i) })));
  assert.equal(svar.filter((s) => s.ok).length, 1, JSON.stringify(svar.map((s) => s.ok || s.fel)));
  assert.equal((await klubb("lagLista")).lag[0].oversikt.bestallt, 3);
});

test("lager: 30 beställningar samtidigt på större antal släpper aldrig igenom mer än lagret", async () => {
  await lagNy({ namn: "Lag L", lager: 40, minimum: 0, maxAntal: 10 });
  const svar = await Promise.all(Array.from({ length: 30 }, (_, i) => bestall("lag-l", { antal: 3 + (i % 3), mobil: mobil(i) })));
  const sald = (await m.rader("bestallning")).reduce((s, o) => s + o.antal, 0);
  assert.ok(sald <= 40, "sålde " + sald + " av 40");
  assert.ok(sald > 34, "lagret ska nästan vara slut: " + sald);   // det som är kvar är mindre än minsta beställningen
  assert.equal(svar.filter((s) => s.ok).length, (await m.rader("bestallning")).length);
});

test("lager syns i listan och översikten, och bara laget får ändra det, som utkast", async () => {
  const a = await lagNy({ namn: "Lag A", lager: 5, minimum: 0, status: "utkast" });
  await lagAdmin("lag-a", a.key, "lagSpara", { falt: { lager: 8 } });
  assert.equal((await lagAdmin("lag-a", a.key, "oversikt")).lag.lager, 8);
  await lagAdmin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  await klubb("godkann", { slug: "lag-a" });
  assert.ok(!(await lagAdmin("lag-a", a.key, "lagSpara", { falt: { lager: 100 } })).ok, "låst efter godkännande");
  await bestall("lag-a", { antal: 2, mobil: mobil(1) });
  const ov = (await lagAdmin("lag-a", a.key, "oversikt")).oversikt;
  assert.equal(ov.kvarILager, 6); assert.equal((await lista()).lag[0].lager, 8);
  assert.ok(!(await klubb("lagSpara", { falt: { lager: 20 } }, "lag-a")).ok, "klubben ändrar inte");
});

test("lager: med ett lager behövs inget minimum, bara ett mål", async () => {
  const fyllt = { produkt: "Lotter", enhetEn: "lott", enhet: "lotter", swishNummer: "070 123 45 67", mottagare: "Laget", pris: 50, inkopspris: 40 };
  const skicka = async (namn, falt) => {
    const r = await lagNy({ namn, status: "utkast", minimum: "", mal: "", lager: "" });
    const s = await lagAdmin(r.slug, r.key, "lagSpara", { falt: { ...fyllt, ...falt } });
    return s.ok ? lagAdmin(r.slug, r.key, "skickaGodkannande", { bekraftat: true }) : s;
  };
  assert.ok((await skicka("Lag A", { lager: 50, minimum: 0, mal: 50 })).ok);
  assert.match((await skicka("Lag B", { lager: 0, minimum: 0, mal: 50 })).fel, /Minimum och mål/);
  assert.match((await skicka("Lag C", { lager: 50, minimum: 0 })).fel, /Mål/);
});

/* ---------- Adminvyn: lagföräldern ---------- */
async function tvaLag() {
  const a = await lagNy({ namn: "Lag A" }), b = await lagNy({ namn: "Lag B" });
  await bestall("lag-a", { barn: "Alva", mobil: "070 111 11 11" });
  await bestall("lag-b", { barn: "Berit", mobil: "070 222 22 21" });
  await bestall("lag-b", { barn: "Bertil", mobil: "070 222 22 22" });
  return { a, b };
}

test("admin: fel nyckel avvisas, och ett lags nyckel ger bara det laget", async () => {
  const { a, b } = await tvaLag();
  assert.equal((await lagAdmin("lag-a", "", "lista")).fel, "Fel lag eller nyckel.");
  assert.equal((await lagAdmin("lag-a", "0123-4567-89ab-cdef-0123-4567-89ab-cdef", "lista")).fel, "Fel lag eller nyckel.");
  assert.ok((await lagAdmin("lag-a", a.key, "lista")).ok);
  assert.ok((await lagAdmin("lag-a", a.key.toUpperCase().replace(/-/g, " "), "lista")).ok, "nyckeln får skrivas med versaler och mellanslag");
  assert.ok(!(await lagAdmin("lag-b", a.key, "lista")).ok);
  assert.ok((await lagAdmin("lag-b", b.key, "lista")).ok);
});

test("admin: lagen ser bara sina egna beställningar och kan inte ändra andras", async () => {
  const { a, b } = await tvaLag();
  const la = (await lagAdmin("lag-a", a.key, "lista")).ordrar;
  assert.deepEqual(la.map((o) => o.barn), ["Alva"]);
  assert.deepEqual((await lagAdmin("lag-b", b.key, "lista")).ordrar.map((o) => o.id), ["0002", "0001"], "nyaste först");
  assert.ok(!(await lagAdmin("lag-a", a.key, "satt", { id: "0002", varde: "JA" })).ok);
  assert.equal((await lagAdmin("lag-b", b.key, "lista")).ordrar.find((o) => o.id === "0002").betald, "");
});

test("admin: betald, avbruten och ångra uppdaterar siffrorna", async () => {
  const a = await lagNy({ namn: "Lag A", pris: 30, inkopspris: 10 });
  await bestall("lag-a", { antal: 4, mobil: mobil(1) }); await bestall("lag-a", { antal: 3, mobil: mobil(2) });
  assert.equal((await lagAdmin("lag-a", a.key, "oversikt")).oversikt.obetalt, 7);
  const r = await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  assert.equal(r.oversikt.betalt, 4); assert.equal(r.oversikt.betaltKr, 120); assert.equal(r.oversikt.obetalt, 3); assert.equal(r.order.betald, "JA");
  const r2 = await lagAdmin("lag-a", a.key, "satt", { id: "0002", varde: "AVBRUTEN" });
  assert.equal(r2.oversikt.bestallt, 4); assert.equal(r2.oversikt.avbrutna, 3);
  const r3 = await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "" });
  assert.equal(r3.oversikt.betalt, 0); assert.equal(r3.oversikt.obetalt, 4);
  assert.ok(!(await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "NEJ" })).ok);
  assert.ok(!(await lagAdmin("lag-a", a.key, "satt", { id: "9999", varde: "JA" })).ok);
  assert.ok(!(await lagAdmin("lag-a", a.key, "satt", { id: "abc", varde: "JA" })).ok);
});

test("hämtad: först betald, sedan hämtad, ångra i omvänd ordning; en avbruten order kan inte hämtas, och bara i det egna laget", async () => {
  const { a, b } = await tvaLag();
  assert.match((await lagAdmin("lag-b", b.key, "hamtad", { id: "0001", varde: "JA" })).fel, /betald först/);
  await lagAdmin("lag-b", b.key, "satt", { id: "0001", varde: "JA" });
  const r = await lagAdmin("lag-b", b.key, "hamtad", { id: "0001", varde: "JA" });
  assert.equal(r.order.hamtad, "JA"); assert.equal(r.oversikt.hamtat, 2); assert.equal(r.oversikt.hamtatObetalt, 0);   // beställningen är på 2 st
  assert.match((await lagAdmin("lag-b", b.key, "satt", { id: "0001", varde: "" })).fel, /Ångra hämtningen först/);
  assert.match((await lagAdmin("lag-b", b.key, "satt", { id: "0001", varde: "AVBRUTEN" })).fel, /Ångra hämtningen först/);
  assert.equal((await m.rader("bestallning")).find((o) => o.nr === 1 && o.barn === "Berit").betald, "JA");
  assert.equal((await lagAdmin("lag-b", b.key, "hamtad", { id: "0001", varde: "" })).oversikt.hamtat, 0);
  assert.equal((await lagAdmin("lag-b", b.key, "satt", { id: "0001", varde: "" })).order.betald, "");
  await lagAdmin("lag-b", b.key, "satt", { id: "0002", varde: "AVBRUTEN" });
  assert.match((await lagAdmin("lag-b", b.key, "hamtad", { id: "0002", varde: "JA" })).fel, /avbruten/);
  assert.ok(!(await lagAdmin("lag-a", a.key, "hamtad", { id: "0002", varde: "JA" })).ok);
  assert.equal((await lagAdmin("lag-b", b.key, "lista")).ordrar.find((o) => o.id === "0002").hamtad, "");
});

test("hämtad: markera alla rör bara betalda och hämtar inte obetalda eller avbrutna", async () => {
  const a = await lagNy({ namn: "Lag A" });
  for (let i = 1; i <= 4; i++) await bestall("lag-a", { antal: 1, mobil: mobil(i) });
  await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  await lagAdmin("lag-a", a.key, "satt", { id: "0002", varde: "JA" });
  await lagAdmin("lag-a", a.key, "satt", { id: "0003", varde: "AVBRUTEN" });
  await lagAdmin("lag-a", a.key, "hamtad", { id: "0001", varde: "JA" });
  const r = await lagAdmin("lag-a", a.key, "hamtadAlla");
  assert.equal(r.markerade, 1); assert.equal(r.obetaldaKvar, 1);
  const per = Object.fromEntries(r.ordrar.map((o) => [o.id, o.hamtad]));
  assert.deepEqual(per, { "0001": "JA", "0002": "JA", "0003": "", "0004": "" });
  assert.equal((await lagAdmin("lag-a", a.key, "hamtadAlla")).markerade, 0);
});

test("ta bort en beställning: bara om den inte är betald eller hämtad, och bara i det egna laget", async () => {
  const { a, b } = await tvaLag();
  assert.ok(!(await lagAdmin("lag-a", a.key, "taBort", { id: "0002" })).ok);   // lag B:s
  await lagAdmin("lag-b", b.key, "satt", { id: "0001", varde: "JA" });
  assert.match((await lagAdmin("lag-b", b.key, "taBort", { id: "0001" })).fel, /betald/);
  await lagAdmin("lag-b", b.key, "satt", { id: "0002", varde: "JA" }); await lagAdmin("lag-b", b.key, "hamtad", { id: "0002", varde: "JA" });
  assert.ok(!(await lagAdmin("lag-b", b.key, "taBort", { id: "0002" })).ok, "en hämtad beställning kan inte tas bort");
  await lagAdmin("lag-b", b.key, "hamtad", { id: "0002", varde: "" }); await lagAdmin("lag-b", b.key, "satt", { id: "0002", varde: "" });
  const r = await lagAdmin("lag-b", b.key, "taBort", { id: "0002" });
  assert.ok(r.ok); assert.equal(r.borttagen, "0002"); assert.equal(r.oversikt.bestallt, 2);   // kvar: 0001 på 2 st
  assert.deepEqual((await lagAdmin("lag-b", b.key, "lista")).ordrar.map((o) => o.id), ["0001"]);
});

test("ta bort: ordernumret används inte igen, och loggen innehåller inga personuppgifter", async () => {
  const a = await lagNy({ namn: "Lag A" });
  await bestall("lag-a", { barn: "Hemligt Barn", mobil: "070 999 88 77" });
  await lagAdmin("lag-a", a.key, "taBort", { id: "0001" });
  assert.equal((await bestall("lag-a", { mobil: mobil(1) })).id, "0002");
  const logg = JSON.stringify(await m.rader("logg"));
  assert.ok(logg.includes("order borttagen")); assert.ok(logg.includes("2 st, 60 kr"));
  for (const pu of ["Hemligt", "0709998877", "070 999"]) assert.ok(!logg.includes(pu), "loggen innehåller " + pu);
});

test("översikt: lag utan kartonger fakturerar det som beställts, med kartonger räknas de upp", async () => {
  const a = await lagNy({ namn: "Lag A", pris: 30, inkopspris: 14.5 });
  await bestall("lag-a", { antal: 10, mobil: mobil(1) });
  assert.equal((await lagAdmin("lag-a", a.key, "oversikt")).oversikt.faktura, 145);
  const b = await lagNy({ namn: "Lag B", pris: 30, inkopspris: 14.5, kartong: 24, minimum: 24, mal: 100 });
  await bestall("lag-b", { antal: 10, mobil: mobil(2) });
  const ov = (await lagAdmin("lag-b", b.key, "oversikt")).oversikt;
  assert.equal(ov.kartonger, 1); assert.equal(ov.levereras, 24); assert.equal(ov.faktura, 348);
});

/* ---------- Godkännande ---------- */
test("utkast och väntande försäljningar syns bara med namn för allmänheten, och går inte att beställa från", async () => {
  await lagNy({ namn: "Lag U", status: "utkast" });
  await lagNy({ namn: "Lag G", status: "utkast", swishNummer: "070 999 99 99" });
  const l = (await lista()).lag;
  assert.deepEqual(l.find((x) => x.slug === "lag-u"), { slug: "lag-u", namn: "Lag U", status: "utkast" });
  assert.ok(!(await bestall("lag-u")).ok);
  assert.ok(!JSON.stringify(l).includes("999 99 99"));
});

test("lagförälderns uppsättning: bara försäljningens uppgifter, bara som utkast", async () => {
  const a = await lagNy({ namn: "Lag A", status: "utkast" });
  const r = await lagAdmin("lag-a", a.key, "lagSpara", { falt: { pris: 40, produkt: "Kakor", namn: "Hackat", status: "pagar", slug: "annat" } });
  assert.ok(r.ok); assert.equal(r.lag.pris, 40); assert.equal(r.lag.produkt.namn, "Kakor"); assert.equal(r.lag.namn, "Lag A"); assert.equal(r.lag.status, "utkast");
  assert.match((await lagAdmin("lag-a", a.key, "lagSpara", { falt: { pris: -5 } })).fel, /Priset/);
  assert.match((await lagAdmin("lag-a", a.key, "lagSpara", { falt: { inkopspris: 99 } })).fel, /Inköpspriset/);
});

test("skicka för godkännande: kräver bekräftelse och ifyllda uppgifter, och låser uppgifterna", async () => {
  const a = await lagNy({ namn: "Lag A", status: "utkast", swishNummer: "", mottagare: "", pris: "", inkopspris: "", minimum: "", mal: "", produkt: "" });
  assert.match((await lagAdmin("lag-a", a.key, "skickaGodkannande", { bekraftat: true })).fel, /Fyll i först/);
  await lagAdmin("lag-a", a.key, "lagSpara", { falt: { produkt: "Kakor", enhetEn: "kaka", enhet: "kakor", swishNummer: "070 123 45 67", mottagare: "Lag A", pris: 30, inkopspris: 14, minimum: 10, mal: 50 } });
  assert.match((await lagAdmin("lag-a", a.key, "skickaGodkannande", { bekraftat: false })).fel, /Bekräfta/);
  const r = await lagAdmin("lag-a", a.key, "skickaGodkannande", { bekraftat: true });
  assert.ok(r.ok); assert.equal(r.lag.status, "granskas");
  assert.match((await lagAdmin("lag-a", a.key, "skickaGodkannande", { bekraftat: true })).fel, /redan/);
  assert.match((await lagAdmin("lag-a", a.key, "lagSpara", { falt: { pris: 99 } })).fel, /låst/);
  assert.equal((await lagAdmin("lag-a", a.key, "dragTillbaka")).lag.status, "utkast");
  assert.ok((await lagAdmin("lag-a", a.key, "lagSpara", { falt: { pris: 31 } })).ok, "går att ändra igen");
  assert.match((await lagAdmin("lag-a", a.key, "dragTillbaka")).fel, /väntar inte/);
});

async function tillGranskning(namn = "Lag A") {
  const a = await lagNy({ namn, status: "utkast" });
  const slug = a.slug;
  await lagAdmin(slug, a.key, "lagSpara", { falt: { produkt: "Kakor", enhetEn: "kaka", enhet: "kakor", swishNummer: "070 123 45 67", mottagare: "Laget", pris: 30, inkopspris: 14, minimum: 10, mal: 50 } });
  await lagAdmin(slug, a.key, "skickaGodkannande", { bekraftat: true });
  return { a, slug };
}

test("klubben godkänner: bara administratören, bara från väntar-på-godkännande, och då öppnar försäljningen", async () => {
  const { a, slug } = await tillGranskning();
  assert.ok(!(await lagAdmin(slug, a.key, "godkann", { slug })).ok, "lagföräldern kan inte godkänna");
  assert.ok(!(await lagAdmin(slug, a.key, "oppna")).ok, "lagföräldern kan inte öppna det som inte är godkänt");
  assert.ok(!(await bestall(slug)).ok);
  const r = await klubb("godkann", { slug });
  assert.equal(r.lag.status, "pagar");
  assert.match((await klubb("godkann", { slug })).fel, /väntar inte/);
  assert.ok((await bestall(slug)).ok);
});

test("lagföräldern avslutar och öppnar igen, och en ändring efter godkännandet granskas av klubben igen", async () => {
  const { a, slug } = await tillGranskning();
  await klubb("godkann", { slug });
  assert.ok((await bestall(slug, { mobil: mobil(1) })).ok);
  assert.equal((await lagAdmin(slug, a.key, "avsluta")).lag.status, "avslutad");
  assert.ok(!(await bestall(slug, { mobil: mobil(2) })).ok, "avslutad: ingen kan beställa");
  assert.match((await lagAdmin(slug, a.key, "avsluta")).fel, /inte öppen/);
  assert.equal((await lagAdmin(slug, a.key, "oppna")).lag.status, "pagar");
  assert.match((await lagAdmin(slug, a.key, "oppna")).fel, /redan öppen/);
  assert.ok(!(await klubb("avsluta", null, slug)).ok && !(await klubb("oppna", null, slug)).ok && !(await klubb("andra", null, slug)).ok, "klubben öppnar, avslutar och ändrar inte");
  // ändra: försäljningen stängs, blir ett utkast, och måste godkännas igen innan den kan öppnas
  assert.equal((await lagAdmin(slug, a.key, "andra")).lag.status, "utkast");
  assert.ok(!(await bestall(slug, { mobil: mobil(3) })).ok);
  assert.ok(!(await lagAdmin(slug, a.key, "oppna")).ok, "ett utkast kan inte öppnas");
  assert.equal((await lagAdmin(slug, a.key, "lagSpara", { falt: { pris: 35 } })).lag.pris, 35);
  assert.equal((await lagAdmin(slug, a.key, "skickaGodkannande", { bekraftat: true })).lag.status, "granskas");
  assert.ok(!(await lagAdmin(slug, a.key, "oppna")).ok, "väntar på granskning: kan inte öppnas");
  await klubb("godkann", { slug });
  assert.equal((await bestall(slug, { mobil: mobil(4), antal: 1 })).belopp, 35);
  assert.equal((await lagAdmin(slug, a.key, "lista")).ordrar.length, 2, "beställningarna finns kvar genom ändringen");
});

test("klubben kan stoppa en försäljning i nödfall: den går tillbaka till lagföräldern och måste godkännas igen", async () => {
  const { a, slug } = await tillGranskning();
  assert.match((await klubb("stoppa", { slug, kommentar: "x" })).fel, /inte godkänd/);
  await klubb("godkann", { slug });
  assert.match((await klubb("stoppa", { slug, kommentar: "  " })).fel, /Skriv varför/);
  assert.ok(!(await lagAdmin(slug, a.key, "stoppa", { slug, kommentar: "x" })).ok, "lagföräldern kan inte stoppa via klubbens åtgärd");
  const r = await klubb("stoppa", { slug, kommentar: "Fel Swish-nummer" });
  assert.equal(r.lag.status, "utkast"); assert.match(r.lag.kommentar, /Klubben stoppade försäljningen: Fel Swish-nummer/);
  assert.ok(!(await bestall(slug)).ok);
  assert.ok(!(await lagAdmin(slug, a.key, "oppna")).ok, "lagföräldern kan inte öppna igen själv");
  assert.ok(!JSON.stringify(await lista()).includes("Fel Swish"), "kommentaren är inte publik");
  // även en avslutad försäljning kan stoppas, så att den inte öppnas igen
  await lagAdmin(slug, a.key, "skickaGodkannande", { bekraftat: true }); await klubb("godkann", { slug }); await lagAdmin(slug, a.key, "avsluta");
  assert.equal((await klubb("stoppa", { slug, kommentar: "Stopp" })).lag.status, "utkast");
});

test("klubben kan skicka tillbaka med en kommentar som bara laget ser", async () => {
  const { a, slug } = await tillGranskning();
  assert.match((await klubb("skickaTillbaka", { slug, kommentar: "  " })).fel, /Skriv vad/);
  const r = await klubb("skickaTillbaka", { slug, kommentar: "=Sänk priset" });
  assert.equal(r.lag.status, "utkast"); assert.equal(r.lag.kommentar, "Sänk priset");
  assert.equal((await lagAdmin(slug, a.key, "oversikt")).lag.kommentar, "Sänk priset");
  assert.ok(!JSON.stringify(await lista()).includes("Sänk priset"));
  assert.equal((await lagAdmin(slug, a.key, "skickaGodkannande", { bekraftat: true })).lag.kommentar, "", "kommentaren rensas när den skickas igen");
});

test("godkännande kontrollerar uppgifterna en gång till: utan Swish-nummer kan klubben inte godkänna", async () => {
  const { slug } = await tillGranskning();
  await m.db.prepare("UPDATE lag SET swish_nummer = '' WHERE slug = ?1").bind(slug).run();   // något har hänt med uppgifterna sedan de skickades
  assert.match((await klubb("godkann", { slug })).fel, /Swish-nummer/);
  assert.equal((await klubb("lagLista")).lag.find((l) => l.slug === slug).status, "granskas");
});

test("en ny försäljning börjar med bara ett namn, och produkten skrivs in av laget själv", async () => {
  const r = await starta("Lag N");
  assert.ok(r.ok); assert.equal(r.lag.status, "utkast"); assert.equal(r.lag.produkt.namn, ""); assert.equal(r.lag.pris, 0);
  const s = await lagAdmin("lag-n", r.key, "lagSpara", { falt: { produkt: "x".repeat(100), detalj: "y".repeat(200), enhetEn: "z".repeat(40) } });
  assert.equal(s.lag.produkt.namn.length, 40); assert.equal(s.lag.produkt.detalj.length, 80); assert.equal(s.lag.produkt.enhetEn.length, 15);
  assert.equal(s.lag.titel, "x".repeat(40));
});

test("lagföräldern kan starta en försäljning själv: bara ett utkast, nyckeln fungerar, och klubben ser den", async () => {
  const r = await m.post({ action: "starta", klubb: KL, namn: "P2019", t: 5000, website: "" });
  assert.ok(r.ok); assert.equal(r.slug, "p2019"); assert.equal(r.lag.status, "utkast");
  assert.ok((await lagAdmin("p2019", r.key, "oversikt")).ok);
  assert.equal((await klubb("lagLista")).lag.find((l) => l.slug === "p2019").status, "utkast");
  assert.ok(!(await bestall("p2019")).ok);
  const rader = JSON.stringify(await m.rader("lag"));
  assert.ok(!rader.includes(r.key) && !rader.includes(r.key.replace(/-/g, "")), "nyckeln sparas aldrig, bara hashen");
});

test("starta en försäljning: honungsfälla, tidsspärr, namnregler, dubbletter och högst tio i timmen", async () => {
  const starta = (o) => m.post({ action: "starta", klubb: KL, namn: "Lag X", t: 5000, website: "", ...o });
  assert.ok(!(await starta({ website: "http://spam.example" })).ok);
  assert.match((await starta({ t: 100 })).fel, /Vänta/);
  assert.match((await starta({ namn: "" })).fel, /namn/);
  assert.match((await starta({ namn: "<b>x</b>" })).fel, /namn/);
  assert.ok((await starta({ namn: "Lag Y" })).ok);
  assert.match((await starta({ namn: "Lag Y" })).fel, /redan en försäljning/);
  for (let i = 0; i < CFG.MAX_STARTER_PER_TIMME - 1; i++) assert.ok((await starta({ namn: "Lag " + i })).ok, "start " + i);
  assert.match((await starta({ namn: "Lag Z" })).fel, /Många försäljningar/);
  m.tid(3600000 + 1000);
  assert.ok((await starta({ namn: "Lag Z" })).ok, "spärren släpper efter en timme");
});

test("klubben kan ta bort ett utkast eller en väntande försäljning, men inte en som har öppnat eller har beställningar", async () => {
  const u = await lagNy({ namn: "Lag U", status: "utkast" });
  const { slug } = await tillGranskning("Lag G");
  assert.ok((await klubb("lagTaBort", { slug: "lag-u" })).ok);
  assert.ok(!(await lagAdmin("lag-u", u.key, "oversikt")).ok, "nyckeln gäller inte längre");
  assert.ok((await klubb("lagTaBort", { slug })).ok);
  await lagNy({ namn: "Lag P" }); await bestall("lag-p");
  assert.match((await klubb("lagTaBort", { slug: "lag-p" })).fel, /Bara utkast/);
  assert.match((await klubb("lagTaBort", { slug: "finns-inte" })).fel, /Okänt/);
  assert.ok(!(await lagAdmin("lag-p", "x".repeat(32), "lagTaBort", { slug: "lag-p" })).ok);
});

test("lagförälderns uppsättning: bara tillåtna fält, och siffrorna kontrolleras mot de befintliga", async () => {
  const a = await lagNy({ namn: "Lag A", status: "utkast", pris: 30, inkopspris: 10, minimum: 10, mal: 100 });
  const spara = (falt) => lagAdmin("lag-a", a.key, "lagSpara", { falt });
  assert.ok((await spara({ pris: 35 })).ok);
  assert.match((await spara({ inkopspris: 40 })).fel, /Inköpspriset/);
  assert.match((await spara({ mal: 5 })).fel, /Målet/);
  assert.ok((await spara({ nyckel_hash: "x", slug: "annat", id: 99, klubb_id: 2, nasta_order: 500, status: "pagar", namn: "Lag B" })).ok);
  const rad = (await m.rader("lag"))[0];
  assert.equal(rad.slug, "lag-a"); assert.equal(rad.id, 1); assert.equal(rad.klubb_id, 1); assert.equal(rad.nasta_order, 1); assert.notEqual(rad.nyckel_hash, "x");
  assert.equal(rad.status, "utkast"); assert.equal(rad.namn, "Lag A"); assert.equal(rad.pris, 35);
});

test("ny nyckel: den gamla slutar fungera och nyckeln syns bara i svaret på just det anropet", async () => {
  const a = await lagNy({ namn: "Lag A" });
  const ny = await klubb("nyNyckel", { slug: "lag-a" });
  assert.ok(ny.ok); assert.notEqual(ny.key, a.key);
  assert.ok(!(await lagAdmin("lag-a", a.key, "lista")).ok);
  assert.ok((await lagAdmin("lag-a", ny.key, "lista")).ok);
  assert.ok(!(await lagAdmin("lag-a", a.key, "nyNyckel", { slug: "lag-a" })).ok, "lagföräldern kan inte byta nyckel");
  const rader = JSON.stringify(await m.rader("lag")) + JSON.stringify(await m.rader("logg"));
  assert.ok(!rader.includes(ny.key.replace(/-/g, "")) && !rader.includes(ny.key));
});

/* ---------- Spärr och trasiga anrop ---------- */
test("spärren bromsar fel nycklar men släpper alltid in rätt nyckel", async () => {
  const a = await lagNy({ namn: "Lag A" });
  for (let i = 0; i < 30; i++) await lagAdmin("lag-a", i.toString(16).padStart(32, "0"), "lista");
  const fel = await lagAdmin("lag-a", "f".repeat(32), "lista");
  assert.match(fel.fel, /För många/);
  assert.ok((await lagAdmin("lag-a", a.key, "lista")).ok, "rätt nyckel kommer in");
  m.tid(CFG.FEL_MINUTER * 60000 + 1000);
  assert.equal((await lagAdmin("lag-a", "f".repeat(32), "lista")).fel, "Fel lag eller nyckel.", "spärren släpper efter tiden");
});

test("påhittade lagnamn fyller inte databasen med räknare", async () => {
  await lagNy({ namn: "Lag A" });
  for (let i = 0; i < 50; i++) await lagAdmin("finns-inte-" + i, "f".repeat(32), "lista");
  const rader = (await m.rader("sparr")).filter((r) => r.nyckel.startsWith("fel:"));
  assert.ok(rader.length <= 2, "räknare: " + rader.map((r) => r.nyckel).join(", "));
});

test("felaktiga anrop ger ett fel, inte en krasch", async () => {
  for (const kropp of ["{inte json", "", "[1,2,3]", "null", "42", "\"text\""]) {
    const s = await m.anrop("POST", "/api", kropp);
    assert.equal(s.status, 200, kropp); assert.equal(s.json.ok, false, kropp); assert.equal(typeof s.json.fel, "string", kropp);
  }
  assert.equal((await m.post({ action: "finns-inte" })).fel, "Okänd åtgärd.");
  assert.equal((await m.post({ action: "admin" })).fel, "Fel lag eller nyckel.");
  assert.equal((await m.admin(KL, "lag-a", "x", "okand")).ok, false);
  assert.equal((await m.get({ action: "finns-inte" })).ok, false);
  assert.equal((await m.anrop("PUT", "/api", "{}")).status, 405);
  assert.equal((await m.anrop("DELETE", "/api")).status, 405);
  const stor = await m.anrop("POST", "/api", JSON.stringify({ barn: "x".repeat(40000) }));
  assert.equal(stor.json.ok, false);
});

test("offentliga svar innehåller aldrig mobilnummer eller barnens namn", async () => {
  await lagNy({ namn: "Lag A" });
  await bestall("lag-a", { barn: "Hemligt Barn", mobil: "070 999 88 77", kod: "kod-0123456789" });
  const alla = [await m.anrop("GET", "/api?action=lag&klubb=" + KL), await m.anrop("GET", "/api?action=status&klubb=" + KL + "&lag=lag-a"),
    await m.anrop("POST", "/api", { klubb: KL, lag: "lag-a", barn: "Hemligt Barn", mobil: "070 999 88 77", antal: 1, samtycke: true, website: "", t: 5000, kod: "kod-0123456789" })];
  for (const s of alla) for (const pu of ["Hemligt", "0709998877", "070 999 88 77"]) assert.ok(!s.text.includes(pu), s.text);
});

/* ---------- Klubben läser beställningarna, mejl till klubben och pengarna efter avslutad försäljning ---------- */
test("klubben ser lagets beställningar men bockar inte av, markerar inte hämtat och tar inte bort", async () => {
  await lagNy({ namn: "Lag A" });
  await bestall("lag-a", { mobil: mobil(1) });
  const l = await klubb("lista", {}, "lag-a");
  assert.ok(l.ok); assert.equal(l.ordrar.length, 1);
  assert.ok((await klubb("oversikt", {}, "lag-a")).ok);
  for (const [op, x] of [["satt", { id: "0001", varde: "JA" }], ["hamtad", { id: "0001", varde: "JA" }], ["hamtadAlla", {}], ["taBort", { id: "0001" }]])
    assert.match((await klubb(op, x, "lag-a")).fel || "", /lagföräldern/, op);
  const rad = (await m.rader("bestallning"))[0];
  assert.equal(rad.betald, ""); assert.equal(rad.hamtad, "");
});

const brevTill = (amne) => m.brev.filter((b) => b.subject.includes(amne));

test("mejl till klubben när en försäljning väntar på godkännande, och vad som ändrats sedan klubben godkände den", async () => {
  await m.db.prepare("INSERT INTO klubb_admin (klubb_id, epost, skapad) SELECT id, 'tva@testklubben.example', 'x' FROM klubb WHERE slug = ?1").bind(KL).run();
  m.brev.length = 0;
  const { a, slug } = await tillGranskning("Lag A");
  await m.vanta();
  let brev = brevTill("Lag A väntar på godkännande");
  assert.deepEqual(brev.map((b) => b.to).sort(), [ADMIN_EPOST, "tva@testklubben.example"], "alla klubbens administratörer får mejlet");
  assert.match(brev[0].text, /inte varit godkänd tidigare/);
  assert.ok(brev[0].text.includes("https://skramlat.test/testklubben/admin.html"), brev[0].text);
  // Godkänd och öppen. Lagföräldern ändrar Swish-numret och priset: försäljningen stängs, och klubben ser exakt vad som ändrats.
  assert.ok((await klubb("godkann", { slug })).ok);
  assert.deepEqual((await klubb("lagLista")).lag.find((l) => l.slug === slug).andringar, []);
  assert.ok((await lagAdmin(slug, a.key, "andra")).ok);
  assert.ok((await lagAdmin(slug, a.key, "lagSpara", { falt: { swishNummer: "070 999 99 99", pris: 35 } })).ok);
  m.brev.length = 0;
  assert.ok((await lagAdmin(slug, a.key, "skickaGodkannande", { bekraftat: true })).ok);
  await m.vanta();
  brev = brevTill("Lag A väntar på godkännande");
  assert.equal(brev.length, 2);
  assert.match(brev[0].text, /Ändrat sedan klubben godkände den senast: Swish-nummer, Pris\./);
  assert.match(brev[0].text, /Swish-uppgifterna är ändrade/);
  assert.ok(!brev[0].text.includes("999 99 99") && !brev[0].text.includes("123 45 67"), "mejlet innehåller inte själva numren");
  const andr = (await klubb("lagLista")).lag.find((l) => l.slug === slug).andringar;
  assert.deepEqual(andr.map((x) => [x.falt, String(x.fore), String(x.nu)]), [["swishNummer", "070 123 45 67", "070 999 99 99"], ["pris", "30", "35"]]);
  // Godkänns den igen är det den nya versionen som gäller
  assert.ok((await klubb("godkann", { slug })).ok);
  assert.ok((await lagAdmin(slug, a.key, "andra")).ok);
  assert.deepEqual((await lagAdmin(slug, a.key, "oversikt")).lag.andringar, []);
});

test("mejl till klubben när försäljningen är avslutad: antal, kartonger och belopp, men inga namn eller mobilnummer", async () => {
  const a = await lagNy({ namn: "Lag A", pris: 30, inkopspris: 10, kartong: 4 });
  await bestall("lag-a", { barn: "Hemligt Barn", mobil: "070 999 88 77", antal: 3 });
  await bestall("lag-a", { antal: 2, mobil: mobil(1) });
  await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  m.brev.length = 0;
  assert.ok((await lagAdmin("lag-a", a.key, "avsluta")).ok);
  await m.vanta();
  const [b] = brevTill("Lag A har avslutat sin försäljning");
  assert.ok(b, "mejlet skickades");
  assert.match(b.text, /Beställt: 5 st\. Att beställa från leverantören: 8 st \(2 kartonger\)\./);
  assert.match(b.text, /Betalt till laget: 90 kr\. Obetalt: 2 st \(60 kr\)\./);
  assert.match(b.text, /Inköpspris enligt lagets uppgifter: 80 kr\./);
  for (const pu of ["Hemligt", "0709998877", "070 999"]) assert.ok(!JSON.stringify(m.brev).includes(pu), "mejlet innehåller " + pu);
});

test("pengarna: lagföräldern markerar dem som skickade efter avslutad försäljning, klubben kvitterar, och bara de kan göra det", async () => {
  const a = await lagNy({ namn: "Lag A", pris: 30 });
  await bestall("lag-a", { antal: 3, mobil: mobil(1) }); await bestall("lag-a", { antal: 1, mobil: mobil(2) });
  await lagAdmin("lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  assert.match((await lagAdmin("lag-a", a.key, "pengarSkickade", { ja: true })).fel, /Avsluta försäljningen först/);
  // Klubbens bankgiro: bara klubben skriver in det, och lagföräldern ser det
  assert.match((await klubb("klubbSpara", { bankgiro: "12" })).fel, /Bankgirot/);
  assert.ok((await klubb("klubbSpara", { bankgiro: "1234 5678" })).ok);
  assert.ok(!(await lagAdmin("lag-a", a.key, "klubbSpara", { bankgiro: "9999-9999" })).ok);
  assert.equal((await lagAdmin("lag-a", a.key, "oversikt")).klubb.bankgiro, "1234-5678");
  await lagAdmin("lag-a", a.key, "avsluta");
  m.brev.length = 0;
  assert.ok(!(await klubb("pengarSkickade", { ja: true }, "lag-a")).ok, "klubben markerar inte åt laget");
  assert.match((await klubb("pengarMottagna", { slug: "lag-a", ja: true })).fel, /inte markerat/);
  const s = await lagAdmin("lag-a", a.key, "pengarSkickade", { ja: true, belopp: 1 });
  assert.ok(s.ok); assert.equal(s.lag.pengar.skickatKr, 90, "beloppet räknas av servern: det som är betalt");
  assert.match((await lagAdmin("lag-a", a.key, "pengarSkickade", { ja: true })).fel, /redan/);
  await m.vanta();
  const [b] = brevTill("Lag A har skickat pengarna");
  assert.ok(b && /90 kr är skickade till klubbens bankgiro 1234-5678/.test(b.text), b && b.text);
  assert.ok(!(await lagAdmin("lag-a", a.key, "pengarMottagna", { slug: "lag-a", ja: true })).ok, "laget kvitterar inte själv");
  assert.ok((await klubb("pengarMottagna", { slug: "lag-a", ja: true })).ok);
  assert.match((await lagAdmin("lag-a", a.key, "pengarSkickade", { ja: false })).fel, /redan kvitterat/);
  const p = (await lagAdmin("lag-a", a.key, "oversikt")).lag.pengar;
  assert.equal(p.skickatKr, 90); assert.ok(p.skickatTid && p.mottagetTid);
  // Klubben kan ångra sin kvittens, och då kan lagföräldern ångra sin markering
  assert.ok((await klubb("pengarMottagna", { slug: "lag-a", ja: false })).ok);
  assert.ok((await lagAdmin("lag-a", a.key, "pengarSkickade", { ja: false })).ok);
  assert.equal((await lagAdmin("lag-a", a.key, "oversikt")).lag.pengar.skickatTid, "");
  // Öppnas försäljningen igen redovisas pengarna på nytt när den är avslutad
  await lagAdmin("lag-a", a.key, "pengarSkickade", { ja: true });
  assert.ok((await lagAdmin("lag-a", a.key, "oppna")).ok);
  assert.equal((await lagAdmin("lag-a", a.key, "oversikt")).lag.pengar.skickatTid, "");
  const logg = JSON.stringify(await m.rader("logg"));
  assert.ok(logg.includes("pengar skickade till klubben") && logg.includes("pengar mottagna av klubben"));
});

test("kommer mejlet till klubben inte fram görs åtgärden ändå, och felet innehåller ingen adress", async () => {
  m.brev.length = 0; m.epostFel = true;
  const orig = console.error, loggat = [];
  console.error = (...x) => { loggat.push(x.join(" ")); };
  try {
    const { slug } = await tillGranskning("Lag A");
    await m.vanta();
    assert.equal((await m.rader("lag")).find((l) => l.slug === slug).status, "granskas");
  } finally { console.error = orig; }
  assert.equal(m.brev.length, 0);
  assert.ok(loggat.length && loggat.every((l) => !l.includes("@")), loggat.join(" | "));
});

/* ---------- Förfrågan från en klubb eller skola (kom-igang) ---------- */
const forfragan = (o = {}, origin = "https://skramlat.se", ip = "203.0.113.7") => m.anrop("POST", "/api", { action: "forfragan", klubb: "Nya IF", typ: "Förening",
  namn: "Kim Exempel", epost: "kim@nyaif.example", telefon: "070 123 45 67", antal: "4–10", meddelande: "Vi vill prova i vår.\nGår det?", website: "", t: 5000, ...o },
  Object.assign({ "CF-Connecting-IP": ip }, origin ? { Origin: origin } : {}));

test("förfrågan från skramlat.se mejlas till Skramlat, med CORS för skramlat.se, och sparas inte i databasen", async () => {
  m.brev.length = 0;
  const fore = { klubb: (await m.rader("klubb")).length, logg: (await m.rader("logg")).length };
  const s = await forfragan();
  assert.equal(s.json.ok, true, s.text);
  assert.equal(s.rubriker.get("Access-Control-Allow-Origin"), "https://skramlat.se");
  assert.equal(s.rubriker.get("Cache-Control"), "no-store");
  assert.equal(m.brev.length, 1);
  const b = m.brev[0];
  assert.equal(b.to, AGARE_EPOST); assert.equal(b.subject, "Förfrågan: Nya IF");
  for (const t of ["Klubb eller skola: Nya IF (Förening)", "Namn: Kim Exempel", "E-post: kim@nyaif.example", "Telefon: 070 123 45 67", "lag eller klasser: 4–10", "Vi vill prova i vår.\nGår det?"])
    assert.ok(b.text.includes(t), t + " saknas i " + b.text);
  // Inget om den som frågade finns i databasen, bara en räknare med hash
  const allt = JSON.stringify(await Promise.all(["klubb", "klubb_admin", "lag", "logg", "sparr", "bestallning", "session", "inloggningslank"].map((t) => m.rader(t))));
  for (const pu of ["Kim", "nyaif", "0701234567", "070 123 45 67", "Nya IF", "203.0.113.7"]) assert.ok(!allt.includes(pu), pu + " finns i databasen");
  assert.equal((await m.rader("klubb")).length, fore.klubb); assert.equal((await m.rader("logg")).length, fore.logg);
  // Även ett fel får läsas från skramlat.se, så att sidan kan visa vad som gick fel, och http:// fungerar tills GitHub Pages tvingar https
  const fel = await forfragan({ namn: "" }, "https://skramlat.se", "203.0.113.9");
  assert.match(fel.json.fel, /namn/); assert.equal(fel.rubriker.get("Access-Control-Allow-Origin"), "https://skramlat.se");
  const http = await forfragan({ epost: "http@nyaif.example" }, "http://skramlat.se", "203.0.113.10");
  assert.equal(http.json.ok, true); assert.equal(http.rubriker.get("Access-Control-Allow-Origin"), "http://skramlat.se");
  m.dbFel = true;
  const orig = console.error; console.error = () => {};
  try {
    const krasch = await forfragan({}, "https://www.skramlat.se", "203.0.113.11");
    assert.equal(krasch.status, 500); assert.equal(krasch.rubriker.get("Access-Control-Allow-Origin"), "https://www.skramlat.se");
  } finally { m.dbFel = false; console.error = orig; }
  // Andra åtgärder från skramlat.se avvisas som förut (svaret går att läsa, men inget görs)
  const best = await m.anrop("POST", "/api", { klubb: KL, lag: "x", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 }, { Origin: "https://skramlat.se" });
  assert.equal(best.json.fel, "Felaktig förfrågan.");
  // Från sidornas egen adress behövs ingen CORS-rubrik
  const egen = await forfragan({ epost: "egen@nyaif.example" }, ORIGIN, "203.0.113.8");
  assert.equal(egen.json.ok, true); assert.equal(egen.rubriker.get("Access-Control-Allow-Origin"), null);
});

test("förfrågan: fel och tomma fält, honungsfälla, för snabbt, och bara från tillåtna adresser", async () => {
  m.brev.length = 0;
  assert.match((await forfragan({ klubb: " " })).json.fel, /klubb eller skola/);
  assert.match((await forfragan({ namn: "" })).json.fel, /namn/);
  assert.match((await forfragan({ epost: "inte-en-adress" })).json.fel, /e-postadress/);
  assert.match((await forfragan({ telefon: "ring mig" })).json.fel, /Telefonnumret/);
  assert.match((await forfragan({ t: 100 })).json.fel, /Vänta/);
  const robot = await forfragan({ website: "http://spam.example" });
  assert.equal(robot.json.ok, true, "en robot får samma svar");
  for (const o of ["https://ond.example", "null", "", "https://skramlat.se.ond.example"]) {
    const s = await forfragan({}, o || null);
    assert.equal(s.json.ok, false, "från " + (o || "ingen adress")); assert.equal(s.rubriker.get("Access-Control-Allow-Origin"), null);
  }
  assert.equal(m.brev.length, 0, "inget av det skickades");
  // Bara kända val följer med, och inledande formeltecken tas bort
  await forfragan({ typ: "<script>", antal: "1000", klubb: "=HYPERLINK(1)" });
  assert.ok(m.brev[0].text.includes("Klubb eller skola: HYPERLINK(1)\n") && m.brev[0].text.includes("lag eller klasser: –"), m.brev[0].text);
});

test("förfrågan: spärr per IP-nummer och totalt, och utan mottagare eller med trasig e-post får den som frågar ett tydligt besked", async () => {
  m.brev.length = 0;
  const svar = [];
  for (let i = 0; i < CFG.FORFRAGAN_PER_IP_TIMME + 2; i++) svar.push((await forfragan()).json);
  assert.equal(svar.filter((s) => s.ok).length, CFG.FORFRAGAN_PER_IP_TIMME);
  assert.match(svar.pop().fel, /Många förfrågningar/);
  m.tid(3600000 + 1000); m.brev.length = 0;   // en ny timme
  for (let i = 0; i < CFG.FORFRAGAN_PER_TIMME + 2; i++) await forfragan({}, "https://skramlat.se", "198.51.100." + i);
  assert.equal(m.brev.length, CFG.FORFRAGAN_PER_TIMME, "högst så många per timme totalt, även från olika IP-nummer");
  m.tid(3600000 + 1000);
  m.epostFel = true;
  const orig = console.error, loggat = [];
  console.error = (...x) => { loggat.push(x.join(" ")); };
  try { assert.match((await forfragan()).json.fel, /hej@skramlat\.se/); } finally { console.error = orig; }
  assert.ok(loggat.every((l) => !l.includes("@") && !l.includes("Kim")), loggat.join(" | "));
});
