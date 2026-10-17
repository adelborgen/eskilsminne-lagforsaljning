/* Vaktprov för "Lagring bara i EU" (se PLAN-gemensam-server.md). De gör reglerna till något som kan fallera:
     1. Inget svar från servern får cachas.
     2. Servern får inte använda något som sparar uppgifter utanför D1: KV, R2, köer, Durable Objects, Cache-API, eller skicka dem vidare
        (fetch), och den får inte logga uppgifter om personer.
     3. Konfigurationen får inte lägga till lagring eller loggning.
     4. Uppgifter om personer (barnets namn, mobilnummer, e-postadresser) finns bara i de tabeller där de hör hemma.
     5. Kontrollskriptet för jurisdiktion bedömer rätt.
   De kan inte bevisa att databasen faktiskt skapades med jurisdiktion eu hos Cloudflare: det gör node scripts/kontrollera-eu.js. */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { skapaMiljo, lagData, ADMIN_EPOST, ORIGIN, ROT, SERVER_DIR } from "./miljo.js";
import { bedom, databasId } from "../scripts/kontrollera-eu.js";
import { schemaText } from "../scripts/schema.js";
import { pathToFileURL } from "node:url";

const KL = "testklubben";
let m;
before(async () => { m = await skapaMiljo(); });
after(async () => { await m.stang(); });
beforeEach(async () => { await m.nollstall(); await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] }); });

/* ---------- 1. Inget cachas ---------- */
test("inget svar från servern får cachas: alla anrop ger Cache-Control: no-store", async () => {
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const H = m.somAdmin(li.kaka);
  const a = await m.admin(KL, "*", "", "lagNy", { data: lagData({ namn: "Lag A" }) }, H);
  const best = { klubb: KL, lag: "lag-a", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 };
  const anrop = [
    ["GET", "/api?action=lag&klubb=" + KL], ["GET", "/api?action=lag&klubb=finns-inte"], ["GET", "/api?action=version"], ["GET", "/api?action=status&klubb=" + KL + "&lag=lag-a"],
    ["GET", "/api?action=finns-inte"], ["GET", "/api"],
    ["POST", "/api", best], ["POST", "/api", best], ["POST", "/api", { ...best, antal: 0 }], ["POST", "/api", { ...best, website: "x" }],
    ["POST", "/api", { action: "admin", klubb: KL, lag: "lag-a", key: a.key, op: "lista" }], ["POST", "/api", { action: "admin", klubb: KL, lag: "lag-a", key: a.key, op: "oversikt" }],
    ["POST", "/api", { action: "admin", klubb: KL, lag: "*", key: "", op: "lagLista" }, H], ["POST", "/api", { action: "admin", klubb: KL, lag: "lag-a", key: "fel", op: "lista" }],
    ["POST", "/api", { action: "starta", klubb: KL, namn: "Lag B", t: 5000, website: "" }],
    ["POST", "/api", { action: "login", op: "begar", klubb: KL, epost: ADMIN_EPOST }], ["POST", "/api", { action: "login", op: "begar", klubb: KL, epost: "okand@example.com" }],
    ["POST", "/api", { action: "login", op: "anvand", token: "0".repeat(64) }], ["POST", "/api", { action: "login", op: "vem" }, H], ["POST", "/api", { action: "login", op: "utlogga" }, H],
    ["POST", "/api", "{inte json"], ["POST", "/api", ""], ["POST", "/api", { action: "finns-inte" }],
    ["PUT", "/api", "{}"], ["DELETE", "/api"]
  ];
  for (const [metod, url, kropp, rubriker] of anrop) {
    const s = await m.anrop(metod, url, kropp, rubriker);
    assert.equal(s.rubriker.get("Cache-Control"), "no-store", metod + " " + url + " " + JSON.stringify(kropp) + " gav " + s.rubriker.get("Cache-Control"));
    assert.equal(s.rubriker.get("X-Content-Type-Options"), "nosniff");
    assert.match(s.rubriker.get("Content-Type"), /^application\/json/);
  }
});

test("även det oväntade felet ger no-store, och innehåller varken uppgifter om personer eller felets text", async () => {
  await m.skapaKlubb("k2", "K2");
  m.dbFel = true;
  const orig = console.error, loggat = [];
  console.error = (...a) => { loggat.push(a.join(" ")); };
  try {
    for (const [metod, url, kropp] of [["GET", "/api?action=lag&klubb=k2"], ["POST", "/api", { klubb: "k2", lag: "x", barn: "Hemligt Barn", mobil: "070 999 88 77", antal: 1, samtycke: true, website: "", t: 5000 }]]) {
      const s = await m.anrop(metod, url, kropp);
      assert.equal(s.status, 500); assert.equal(s.rubriker.get("Cache-Control"), "no-store"); assert.equal(s.json.ok, false);
      assert.ok(!s.text.includes("databasen är nere") && !s.text.includes("Hemligt"), s.text);
    }
  } finally { console.error = orig; m.dbFel = false; }
  assert.ok(loggat.length >= 2);
  for (const l of loggat) assert.ok(!/Hemligt|0709998877|databasen/.test(l) && l.length < 60, "loggen innehåller för mycket: " + l);
});

/* ---------- 2. Källkoden ---------- */
const kallfiler = () => fs.readdirSync(SERVER_DIR).filter((f) => f.endsWith(".js")).map((f) => ({ f, text: fs.readFileSync(path.join(SERVER_DIR, f), "utf8") }));
// Kommentarer bort, så att en förklaring i en kommentar inte räknas som användning
const utanKommentarer = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("servern använder ingen annan lagring än D1: inget KV, R2, köer, Durable Objects eller Cache-API", () => {
  const FORBJUDET = [
    [/\bKVNamespace\b|\benv\.KV\w*|\bKV_\w+/, "KV"], [/\bR2Bucket\b|\benv\.(R2|BUCKET)\w*/, "R2"], [/\bDurableObject\w*|\benv\.DO\w*/, "Durable Objects"],
    [/\bQueue\b|\benv\.QUEUE\w*/, "köer"], [/\bcaches\b|\bcaches\.default\b/, "Cache-API"], [/\bHyperdrive\b|\bVectorize\b|\bAnalyticsEngine\w*/, "annan lagring"],
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, "lagring i webbläsare"]
  ];
  for (const { f, text } of kallfiler()) {
    const t = utanKommentarer(text);
    for (const [re, namn] of FORBJUDET) assert.ok(!re.test(t), f + " använder " + namn);
  }
});

test("servern skickar inga uppgifter vidare: inga anrop till andra adresser, och inga importer från nätet", () => {
  for (const { f, text } of kallfiler()) {
    const t = utanKommentarer(text).replace(/env\.ASSETS\.fetch\(request\)/g, "").replace(/async fetch\(request, env, ctx\)/g, "");
    assert.ok(!/\bfetch\s*\(/.test(t), f + " anropar fetch");
    assert.ok(!/\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bconnect\s*\(/.test(t), f + " öppnar en anslutning");
    assert.ok(!/from\s+["']https?:/.test(t) && !/import\s*\(\s*["']https?:/.test(t), f + " importerar från nätet");
    for (const imp of t.match(/from\s+["'][^"']+["']/g) || []) assert.ok(/from\s+["']\.\//.test(imp), f + " importerar något utifrån: " + imp);
  }
});

test("servern loggar inte: inget console.log, och console.error bara med en fast text och felets typ", () => {
  for (const { f, text } of kallfiler()) {
    const t = utanKommentarer(text);
    assert.ok(!/\bconsole\.(log|info|debug|warn|trace|dir|table)\b/.test(t), f + " använder console.log eller liknande");
    for (const anrop of t.match(/console\.error\([^;]*\);/g) || [])
      assert.match(anrop, /^console\.error\("[^"+`$\\]{3,60}"(, e && e\.name)?\);$/, f + ": " + anrop);
  }
});

/* ---------- 3. Konfigurationen ---------- */
const toml = () => fs.readFileSync(path.join(ROT, "wrangler.toml"), "utf8");
const rubrikerI = (t) => [...t.replace(/^\s*#.*$/gm, "").matchAll(/^\s*\[\[?([A-Za-z0-9_.]+)\]\]?/gm)].map((x) => x[1]);

test("wrangler.toml lägger inte till lagring eller loggning: bara databasen, filerna, e-posten och inställningarna", () => {
  const t = toml();
  const tillatet = ["build", "assets", "d1_databases", "send_email", "vars", "observability"];
  const fel = rubrikerI(t).filter((r) => !tillatet.includes(r));
  assert.deepEqual(fel, [], "otillåtna avsnitt i wrangler.toml: " + fel.join(", "));
  const rent = t.replace(/^\s*#.*$/gm, "").replace(/#.*$/gm, "");
  for (const forbjudet of ["kv_namespaces", "r2_buckets", "queues", "durable_objects", "analytics_engine", "logpush", "tail_consumers", "hyperdrive", "vectorize", "workers_dev", "triggers", "unsafe", "placement"])
    assert.ok(!new RegExp("^\\s*(\\[+)?" + forbjudet + "\\b", "m").test(rent), forbjudet + " finns i wrangler.toml");
  assert.match(rent, /\[observability\]\s*enabled\s*=\s*false/, "Workers Logs ska vara uttryckligen avstängt");
  assert.match(rent, /\[\[d1_databases\]\][\s\S]*binding\s*=\s*"DB"/);
  assert.match(rent, /run_worker_first\s*=\s*\[\s*"\/api"\s*,\s*"\/api\/\*"\s*\]/, "bara /api ska gå via koden");
});

const TABELLER = ["bestallning", "d1_migrations", "inloggningslank", "klubb", "klubb_admin", "lag", "logg", "session", "sparr"];
const tabeller = async () => (await m.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map((r) => r.name);

test("migrationerna skapar inga tabeller med personuppgifter utöver de som är avsedda", async () => {
  await m.get({ action: "version" });   // första anropet lägger in migreringarna
  assert.deepEqual(await tabeller(), TABELLER);
});

test("Workern lägger in migreringarna själv i en tom databas, och tål att göra det igen", async () => {
  const { korMigreringar } = await import(pathToFileURL(path.join(SERVER_DIR, "migrera.js")).href);
  for (const t of ["bestallning", "logg", "sparr", "inloggningslank", "session", "lag", "klubb_admin", "klubb", "d1_migrations"]) await m.db.prepare("DROP TABLE IF EXISTS " + t).run();   // barn före förälder
  assert.deepEqual(await tabeller(), []);
  await korMigreringar(m.db);
  await korMigreringar(m.db);
  assert.deepEqual(await tabeller(), TABELLER);
  assert.deepEqual((await m.db.prepare("SELECT name FROM d1_migrations").all()).results.map((r) => r.name), ["0001_start.sql"]);
  await m.nollstall();
});

test("server/schema.js stämmer med migrations/ (skapas av npm run bygg)", () => {
  assert.equal(fs.readFileSync(path.join(ROT, "server", "schema.js"), "utf8"), schemaText(), "kör npm run bygg");
});

/* ---------- 4. Var personuppgifter finns ---------- */
test("uppgifter om personer finns bara i bestallning (barn, mobil) och klubb_admin, inloggningslank, session (e-post): aldrig i loggen, räknarna eller lagen", async () => {
  const PERSONUPPGIFTER = ["Hemligt Barn", "Hemliga Syskon", "0709998877", "070 999 88 77", "0709998866", "+46709998866", "tyst@hemlig.example", ADMIN_EPOST, "testklubben.example"];
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const H = m.somAdmin(li.kaka);
  const a = await m.admin(KL, "*", "", "lagNy", { data: lagData({ namn: "Lag A" }) }, H);
  await m.post({ klubb: KL, lag: "lag-a", barn: "Hemligt Barn", mobil: "070 999 88 77", antal: 2, samtycke: true, website: "", t: 5000, kod: "kod-0123456789" });
  await m.post({ klubb: KL, lag: "lag-a", barn: "Hemliga Syskon", mobil: "+46 70 999 88 66", antal: 1, samtycke: true, website: "", t: 5000 });
  await m.admin(KL, "lag-a", a.key, "lista"); await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: "JA" });
  await m.admin(KL, "lag-a", a.key, "hamtad", { id: "0001", varde: "JA" }); await m.admin(KL, "lag-a", a.key, "satt", { id: "0002", varde: "AVBRUTEN" });
  await m.admin(KL, "lag-a", a.key, "satt", { id: "0002", varde: "" }); await m.admin(KL, "lag-a", a.key, "hamtad", { id: "0001", varde: "" }); await m.admin(KL, "lag-a", a.key, "taBort", { id: "0002" });
  await m.post({ action: "starta", klubb: KL, namn: "Lag B", t: 5000, website: "" });
  await m.post({ action: "login", op: "begar", klubb: KL, epost: "tyst@hemlig.example" });
  for (let i = 0; i < 12; i++) await m.admin(KL, "lag-a", "f".repeat(32), "lista");
  await m.admin(KL, "*", "", "lagUppdatera", { slug: "lag-a", falt: { intro: "text" } }, H); await m.admin(KL, "*", "", "nyNyckel", { slug: "lag-a" }, H);
  const epost = [ADMIN_EPOST, "testklubben.example"];   // adressen och dess domän
  const inneHar = { bestallning: ["Hemligt Barn", "Hemliga Syskon", "0709998877", "0709998866"], klubb_admin: epost, inloggningslank: epost, session: epost };
  for (const t of ["klubb", "lag", "logg", "sparr", "bestallning", "klubb_admin", "inloggningslank", "session"]) {
    const rader = JSON.stringify(await m.rader(t));
    const tillatna = new Set(inneHar[t] || []);
    for (const p of PERSONUPPGIFTER) if (!tillatna.has(p)) assert.ok(!rader.includes(p), "'" + p + "' finns i tabellen " + t);
  }
  // och det som finns i beställningarna är det som ska finnas där: den borttagna beställningen (0002) är helt borta, mobilnumret är normaliserat
  const best = JSON.stringify(await m.rader("bestallning"));
  assert.ok(best.includes("Hemligt Barn") && best.includes("0709998877"), "mobilnumret sparas normaliserat");
  assert.ok(!best.includes("Hemliga Syskon") && !best.includes("0709998866"), "en borttagen beställning försvinner helt");
});

/* ---------- 5. Kontrollskriptet ---------- */
test("kontrollskriptet godkänner bara jurisdiktion eu, och säger ifrån när den är en annan eller inte går att avgöra", () => {
  assert.equal(bedom({ result: { name: "skramlat", jurisdiction: "eu" } }).kod, 0);
  assert.equal(bedom({ result: { jurisdiction: "EU" } }).kod, 0);
  assert.equal(bedom({ result: { jurisdiction: "fedramp" } }).kod, 1);
  for (const svar of [{ result: { name: "skramlat" } }, { result: { jurisdiction: null } }, { result: { jurisdiction: "" } }, { result: null }, null, {}, "text"])
    assert.equal(bedom(svar).kod, 2, JSON.stringify(svar));
  assert.equal(databasId('name = "x"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "skramlat"\ndatabase_id = "abc-123"\n'), "abc-123");
  assert.match(databasId(toml()), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "wrangler.toml ska ha databasens id");
});
