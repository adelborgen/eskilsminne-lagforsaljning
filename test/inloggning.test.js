/* Tester av klubbadministratörens inloggning med e-postlänk, sessionen och klubbens status (väntar, aktiv, avstängd). */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { skapaMiljo, lagData, ADMIN_EPOST, CFG, ORIGIN } from "./miljo.js";

const KL = "testklubben";
let m;

before(async () => { m = await skapaMiljo(); });
after(async () => { await m.stang(); });
beforeEach(async () => {
  await m.nollstall();
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] });
});

const begar = async (epost, extra = {}, rubriker) => {
  const s = await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: KL, epost, ...extra }, rubriker);
  await m.vanta();
  return s;
};
const anvand = (token, rubriker = { Origin: ORIGIN }) => m.anrop("POST", "/api", { action: "login", op: "anvand", token }, rubriker);
const sistaToken = (till = ADMIN_EPOST) => m.brev.filter((b) => b.to === till).pop().text.match(/#lank=([a-f0-9]{64})/)[1];
const kakaFran = (s) => (s.rubriker.get("Set-Cookie") || "").split(";")[0];
const klubbAnrop = (kaka, op, extra, klubb = KL, rubriker) => m.admin(klubb, "*", "", op, extra, rubriker || m.somAdmin(kaka));

test("begäran: svaret är detsamma för en registrerad och en oregistrerad adress, och bara administratören får ett mejl", async () => {
  const a = await begar(ADMIN_EPOST), b = await begar("okand@example.com");
  assert.deepEqual(a.json, b.json); assert.equal(a.status, b.status);
  assert.equal(a.json.ok, true);
  assert.equal(m.brev.length, 1); assert.equal(m.brev[0].to, ADMIN_EPOST);
  assert.ok(!a.text.includes(sistaToken()), "svaret innehåller inte länken");
});

test("mejlet: länken ligger efter # och pekar på klubbens adminsida, och innehåller inga uppgifter om barn", async () => {
  await begar(ADMIN_EPOST);
  const b = m.brev[0];
  assert.match(b.text, /https:\/\/skramlat\.test\/testklubben\/admin\.html#lank=[a-f0-9]{64}/);
  assert.ok(!/[?&]lank=|[?&]token=/.test(b.text), "ingen länk med nyckeln före #");
  assert.equal(b.from.email, "inloggning@skramlat.test"); assert.match(b.subject, /inloggningslänk/i); assert.match(b.text, /15 minuter/);
});

test("adressen normaliseras: blanksteg och versaler spelar ingen roll, och en trasig adress får ett tydligt fel", async () => {
  await begar("  ADMIN@Testklubben.Example ");
  assert.equal(m.brev.length, 1);
  assert.equal((await begar("inte-en-adress")).json.ok, false);
  assert.equal((await begar("")).json.ok, false);
  assert.equal((await begar("a@b")).json.ok, false);
  assert.equal(m.brev.length, 1);
});

test("länken gäller i 15 minuter", async () => {
  await begar(ADMIN_EPOST);
  const token = sistaToken();
  m.tid(CFG.LANK_GILTIG_MIN * 60000 - 1000);
  const ok = await anvand(token);
  assert.equal(ok.json.ok, true);
  await begar(ADMIN_EPOST);
  const t2 = sistaToken();
  m.tid(CFG.LANK_GILTIG_MIN * 60000 + 1000);
  const sent = await anvand(t2);
  assert.equal(sent.json.ok, false); assert.match(sent.json.fel, /gäller inte längre/);
});

test("länken kan användas en gång, även när två försöker samtidigt", async () => {
  await begar(ADMIN_EPOST);
  const token = sistaToken();
  const svar = await Promise.all([anvand(token), anvand(token), anvand(token)]);
  assert.equal(svar.filter((s) => s.json.ok).length, 1);
  assert.equal((await m.rader("session")).length, 1);
  assert.equal((await anvand(token)).json.ok, false);
});

test("ogiltiga länkar och länkar i adressen gör ingenting", async () => {
  await begar(ADMIN_EPOST);
  const token = sistaToken();
  for (const t of ["", "abc", "x".repeat(64), "0".repeat(64), token.toUpperCase(), token + "0", undefined, null, 42, { a: 1 }]) {
    const s = await anvand(t); assert.equal(s.json.ok, false, String(t)); assert.equal(s.rubriker.get("Set-Cookie"), null);
  }
  const get = await m.anrop("GET", "/api?action=login&op=anvand&token=" + token);
  assert.equal(get.json.ok, false); assert.equal((await m.rader("session")).length, 0);
  assert.equal((await anvand(token)).json.ok, true, "den riktiga länken fungerar fortfarande");
});

test("cookien: bara https, inte läsbar för skript, bara den egna sidan, och sparas aldrig i klartext", async () => {
  await begar(ADMIN_EPOST);
  const s = await anvand(sistaToken());
  const c = s.rubriker.get("Set-Cookie");
  assert.match(c, /^__Host-session=[a-f0-9]{64};/);
  for (const del of ["Path=/", "Secure", "HttpOnly", "SameSite=Lax", "Max-Age=" + CFG.SESSION_DAGAR * 86400]) assert.ok(c.includes(del), del + " saknas i " + c);
  assert.ok(!/Domain=/i.test(c));
  const secret = c.match(/__Host-session=([a-f0-9]{64})/)[1], token = sistaToken();
  const allt = JSON.stringify(await m.rader("session")) + JSON.stringify(await m.rader("inloggningslank"));
  assert.ok(!allt.includes(secret) && !allt.includes(token), "varken länken eller sessionen sparas i klartext");
  assert.ok(!JSON.stringify(s.json).includes(secret), "cookien syns inte i svaret");
  assert.equal(s.json.klubbar[0].slug, KL);
});

test("sessionen ger klubbens administratör behörighet, och utan den (eller med en påhittad) ger ingenting", async () => {
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  const r = await klubbAnrop(kaka, "lagNy", { data: lagData({ namn: "Lag A" }) });
  assert.ok(r.ok); assert.equal(r.roll, "super");
  assert.ok((await klubbAnrop(kaka, "lagLista")).ok);
  assert.ok((await m.admin(KL, "lag-a", "", "oversikt", {}, m.somAdmin(kaka))).ok, "klubbens administratör kommer in i varje lag");
  assert.ok(!(await klubbAnrop("", "lagLista", {}, KL, { Origin: ORIGIN })).ok);
  assert.ok(!(await klubbAnrop("__Host-session=" + "a".repeat(64), "lagLista")).ok);
  assert.ok(!(await klubbAnrop("__Host-session=inte-hex", "lagLista")).ok);
});

test("förfrågan från en annan webbplats gäller inte, inte ens med rätt cookie", async () => {
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  const fel = await klubbAnrop(kaka, "lagLista", {}, KL, { Cookie: kaka, Origin: "https://ond.example" });
  assert.equal(fel.ok, false); assert.equal(fel.fel, "Felaktig förfrågan.");
  const utan = await klubbAnrop(kaka, "lagLista", {}, KL, { Cookie: kaka });
  assert.equal(utan.ok, false, "cookie utan Origin godtas inte för administratörsåtgärder");
  assert.ok((await klubbAnrop(kaka, "lagLista")).ok);
  // även en beställning eller en inloggning från en annan webbplats avvisas
  await m.skapaKlubb("k2", "K2", { admins: [] });
  assert.equal((await m.anrop("POST", "/api", { action: "login", op: "anvand", token: "0".repeat(64) }, { Origin: "https://ond.example" })).json.fel, "Felaktig förfrågan.");
  assert.equal((await m.anrop("POST", "/api", { klubb: KL, lag: "x" }, { Origin: "https://ond.example" })).json.fel, "Felaktig förfrågan.");
});

test("sessionen gäller i 14 dagar", async () => {
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  m.tid(CFG.SESSION_DAGAR * 86400000 - 1000);
  assert.ok((await klubbAnrop(kaka, "lagLista")).ok);
  m.tid(2000);
  assert.ok(!(await klubbAnrop(kaka, "lagLista")).ok);
});

test("utloggning raderar sessionen, och cookien slutar fungera", async () => {
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  const ut = await m.anrop("POST", "/api", { action: "login", op: "utlogga" }, m.somAdmin(kaka));
  assert.ok(ut.json.ok); assert.match(ut.rubriker.get("Set-Cookie"), /Max-Age=0/);
  assert.equal((await m.rader("session")).length, 0);
  assert.ok(!(await klubbAnrop(kaka, "lagLista")).ok);
});

test("vem: visar om man är inloggad och vilka klubbar man administrerar", async () => {
  const fore = await m.anrop("POST", "/api", { action: "login", op: "vem" });
  assert.deepEqual(fore.json, { ok: true, inloggad: false, klubbar: [] });
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  const efter = await m.anrop("POST", "/api", { action: "login", op: "vem" }, m.somAdmin(kaka));
  assert.deepEqual(efter.json, { ok: true, inloggad: true, klubbar: [{ slug: KL, namn: "Testklubben" }] });
});

test("spärr: högst fem länkar per adress och timme, och svaret avslöjar inte spärren", async () => {
  const svar = [];
  for (let i = 0; i < CFG.LANK_PER_EPOST_TIMME + 3; i++) svar.push(await begar(ADMIN_EPOST));
  assert.ok(svar.every((s) => JSON.stringify(s.json) === JSON.stringify(svar[0].json)));
  assert.equal(m.brev.length, CFG.LANK_PER_EPOST_TIMME);
  m.tid(3600000 + 1000);
  await begar(ADMIN_EPOST);
  assert.equal(m.brev.length, CFG.LANK_PER_EPOST_TIMME + 1, "spärren släpper efter en timme");
});

test("spärr: högst 20 länkar per IP-nummer och timme, även med olika adresser", async () => {
  for (let i = 0; i < CFG.LANK_PER_IP_TIMME + 5; i++) await begar("x" + i + "@example.com", {}, { "CF-Connecting-IP": "203.0.113.7" });
  const ip = (await m.rader("sparr")).find((r) => r.nyckel.startsWith("lank:ip:"));
  assert.ok(ip.antal > CFG.LANK_PER_IP_TIMME);
  // en adminadress från samma IP-nummer får inget mejl när spärren slagit till, men en från ett annat IP-nummer får det
  await begar(ADMIN_EPOST, {}, { "CF-Connecting-IP": "203.0.113.7" });
  assert.equal(m.brev.length, 0);
  await begar(ADMIN_EPOST, {}, { "CF-Connecting-IP": "203.0.113.8" });
  assert.equal(m.brev.length, 1);
});

test("honungsfälla: ett ifyllt robotfält ger samma svar men inget mejl", async () => {
  const s = await begar(ADMIN_EPOST, { website: "http://spam.example" });
  assert.equal(s.json.ok, true); assert.equal(m.brev.length, 0); assert.equal((await m.rader("inloggningslank")).length, 0);
});

test("en administratör i en klubb kommer inte in i en annan", async () => {
  await m.skapaKlubb("k2", "Klubb 2", { admins: ["annan@klubb2.example"] });
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  assert.ok((await klubbAnrop(kaka, "lagNy", { data: lagData({ namn: "Lag A" }) })).ok);
  const nej = await klubbAnrop(kaka, "lagNy", { data: lagData({ namn: "Lag B" }) }, "k2");
  assert.equal(nej.ok, false); assert.equal(nej.fel, "Fel lag eller nyckel.");
  assert.equal((await m.admin("k2", "*", "", "lagLista", {}, { ...m.somAdmin(kaka) })).ok, false);
  // och en länk begärd för klubb 2 med den adressen skickas inte
  await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: "k2", epost: ADMIN_EPOST }); await m.vanta();
  assert.equal(m.brev.length, 1, "bara det första mejlet");
  assert.equal((await m.rader("lag")).length, 1);
});

test("en person som administrerar två klubbar har en inloggning för båda", async () => {
  await m.skapaKlubb("k2", "Klubb 2", { admins: [ADMIN_EPOST] });
  await begar(ADMIN_EPOST);
  const s = await anvand(sistaToken());
  assert.deepEqual(s.json.klubbar.map((k) => k.slug).sort(), ["k2", KL]);
  const kaka = kakaFran(s);
  assert.ok((await klubbAnrop(kaka, "lagLista", {}, "k2")).ok);
});

test("en avstängd klubb: administratören tappar åtkomsten direkt, och inga nya länkar skickas", async () => {
  await begar(ADMIN_EPOST);
  const kaka = kakaFran(await anvand(sistaToken()));
  assert.ok((await klubbAnrop(kaka, "lagLista")).ok);
  await m.db.prepare("UPDATE klubb SET status = 'avstangd'").run();
  assert.ok(!(await klubbAnrop(kaka, "lagLista")).ok);
  const fore = m.brev.length;
  await begar(ADMIN_EPOST);
  assert.equal(m.brev.length, fore);
  assert.deepEqual((await m.anrop("POST", "/api", { action: "login", op: "vem" }, m.somAdmin(kaka))).json.klubbar, []);
});

test("en klubb som väntar på godkännande: administratören kan sätta upp, men inget syns eller går att beställa från", async () => {
  await m.skapaKlubb("vantar", "Väntar", { status: "vantar", admins: [ADMIN_EPOST] });
  const beg = async () => { await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: "vantar", epost: ADMIN_EPOST }); await m.vanta(); };
  await beg();
  const kaka = kakaFran(await anvand(sistaToken()));
  const ny = await m.admin("vantar", "*", "", "lagNy", { data: lagData({ namn: "Lag V", status: "utkast" }) }, m.somAdmin(kaka));
  assert.ok(ny.ok, "administratören kan skapa lag");
  assert.ok((await m.admin("vantar", "*", "", "lagLista", {}, m.somAdmin(kaka))).lag.length === 1);
  // inget syns för besökare
  assert.equal((await m.get({ action: "lag", klubb: "vantar" })).ok, false);
  // lagförälderns nyckel fungerar inte i en klubb som inte är godkänd
  assert.equal((await m.admin("vantar", "lag-v", ny.key, "oversikt")).ok, false);
  assert.equal((await m.post({ action: "starta", klubb: "vantar", namn: "Lag W", t: 5000, website: "" })).ok, false);
  // även om administratören sätter försäljningen som öppen kan ingen beställa, och inget sparas
  await m.admin("vantar", "*", "", "lagUppdatera", { slug: "lag-v", falt: { swishNummer: "070 123 45 67", mottagare: "x", pris: 30, inkopspris: 10, minimum: 10, mal: 50, produkt: "Kakor", enhetEn: "kaka", enhet: "kakor", status: "pagar" } }, m.somAdmin(kaka));
  const best = await m.post({ klubb: "vantar", lag: "lag-v", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 });
  assert.equal(best.ok, false); assert.equal((await m.rader("bestallning")).length, 0);
  // och direkt i databasen: själva sparandet kräver också en godkänd klubb
  const direkt = await m.db.prepare(`INSERT INTO bestallning (lag_id, nr, tid, barn, mobil, antal, belopp)
    SELECT l.id, l.nasta_order, 't', 'x', 'y', 1, 1 FROM lag l JOIN klubb kl ON kl.id = l.klubb_id WHERE kl.status = 'aktiv' RETURNING nr`).all();
  assert.equal(direkt.results.length, 0);
  // när Skramlat godkänner klubben syns den och går att beställa från
  await m.db.prepare("UPDATE klubb SET status = 'aktiv' WHERE slug = 'vantar'").run();
  assert.ok((await m.get({ action: "lag", klubb: "vantar" })).ok);
  assert.ok((await m.post({ klubb: "vantar", lag: "lag-v", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 })).ok);
});

test("utgångna länkar, sessioner och räknare städas bort", async () => {
  await begar(ADMIN_EPOST);
  await anvand(sistaToken());
  assert.equal((await m.rader("session")).length, 1);
  m.tid(15 * 86400000);
  await begar("annan@example.com");   // en begäran städar
  assert.equal((await m.rader("session")).length, 0);
  assert.equal((await m.rader("inloggningslank")).length, 0);
  assert.ok((await m.rader("sparr")).every((r) => r.till > m.klocka));
});

test("e-postadresser finns bara i tabellerna för administratörer, länkar och sessioner, aldrig i loggen eller räknarna", async () => {
  await begar(ADMIN_EPOST);
  await anvand(sistaToken());
  await begar("okand@example.com");
  for (const t of ["logg", "sparr", "lag", "klubb"]) {
    const rader = JSON.stringify(await m.rader(t)).toLowerCase();
    assert.ok(!rader.includes("testklubben.example") && !rader.includes("okand@"), "e-postadress i " + t);
  }
});

test("går e-postutskicket sönder får ändå den som begär länken samma svar, och felet innehåller ingen adress", async () => {
  const bra = await begar("okand@example.com");
  m.epostFel = true;
  const orig = console.error, loggat = [];
  console.error = (...a) => { loggat.push(a.join(" ")); };
  try {
    const s = await begar(ADMIN_EPOST);
    assert.deepEqual(s.json, bra.json); assert.equal(s.status, 200);
  } finally { console.error = orig; }
  assert.equal(m.brev.length, 0);
  assert.equal(loggat.length, 1); assert.ok(!loggat[0].includes("@") && !loggat[0].includes("testklubben"), loggat[0]);
});
