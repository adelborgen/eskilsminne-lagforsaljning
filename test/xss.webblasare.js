/* XSS-attacker i en riktig webbläsare. Kör: node test/xss.webblasare.js
   Kräver Playwright och Chromium. Sidorna pratar med den riktiga servern (server/) och en riktig D1 lokalt, via en låtsasadress.

   Lagföräldern fyller alla texter som visas för föräldrarna med HTML och skript, och klubben skickar tillbaka försäljningen
   med en kommentar som också innehåller skript. Ett lag ändras efter godkännandet, så att klubbens granskning visar skripten som ändringar. Sedan öppnas föräldrasidan, adminvyn och klubbens vy. Inget skript får köras,
   och texten ska synas som vanlig text. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { skapaMiljo, ADMIN_EPOST, ORIGIN, ROT } from "./miljo.js";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

const TYPER = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const KL = "eskilsminne";

// Kort nog för fälten, och var och en sätter en egen markör om den skulle köras.
const LAST = {
  kampanj: "<img src=x onerror=window.__x=1>",
  produkt: "<script>window.__x=2</script>",
  detalj: "\"><svg onload=window.__x=3>",
  intro: "<iframe src=javascript:window.parent.__x=4></iframe> och <b onmouseover=window.__x=5>fet</b>",
  belonning: "<img src=x onerror=alert(6)>",
  utlamningsText: "<a href=\"javascript:window.__x=7\">klicka</a>",
  enhetEn: "<i>lott</i>", enhet: "<u>lotter</u>",
  mottagare: "<img src=x onerror=window.__x=8>",
  meddelande: "<svg onload=window.__x=9>",
};
const KOMMENTAR = "<img src=x onerror=window.__x=10> Ändra priset";

const m = await skapaMiljo();
let br, server;
try {
  await m.skapaKlubb(KL, "Eskilsminne IF", { admins: [ADMIN_EPOST] });
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const H = m.somAdmin(li.kaka);
  const klubb = (op, extra) => m.admin(KL, "*", "", op, extra, H);
  const ny = (namn, status) => m.nyttLag(KL, { namn, status, pris: 30, inkopspris: 10, minimum: 10, mal: 100 });
  const x = await ny("Lag X", "utkast"), y = await ny("Lag Y", "utkast");
  for (const [slug, key] of [["lag-x", x.key], ["lag-y", y.key]]) {
    const r = await m.admin(KL, slug, key, "lagSpara", { falt: { ...LAST, swishNummer: "070 123 45 67" } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await m.admin(KL, slug, key, "skickaGodkannande", { bekraftat: true })).ok, true);
  }
  assert.equal((await klubb("godkann", { slug: "lag-x" })).ok, true);
  assert.equal((await klubb("skickaTillbaka", { slug: "lag-y", kommentar: KOMMENTAR })).ok, true);
  // Lag Z godkänns och ändras sedan med skript i texten: klubbens granskning visar det gamla och det nya värdet
  const z = await ny("Lag Z", "utkast");
  assert.equal((await m.admin(KL, "lag-z", z.key, "lagSpara", { falt: { ...LAST, swishNummer: "070 123 45 67" } })).ok, true);
  assert.equal((await m.admin(KL, "lag-z", z.key, "skickaGodkannande", { bekraftat: true })).ok, true);
  assert.equal((await klubb("godkann", { slug: "lag-z" })).ok, true);
  assert.equal((await m.admin(KL, "lag-z", z.key, "andra")).ok, true);
  assert.equal((await m.admin(KL, "lag-z", z.key, "lagSpara", { falt: { produkt: "<img src=x onerror=window.__x=12>", swishNummer: "070 765 43 21" } })).ok, true);
  assert.equal((await m.admin(KL, "lag-z", z.key, "skickaGodkannande", { bekraftat: true })).ok, true);
  assert.equal((await m.post({ klubb: KL, lag: "lag-x", barn: "Emil", mobil: "070 123 45 67", antal: 2, samtycke: true, website: "", t: 5000 })).ok, true);

  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const fil = path.join(ROT, u.endsWith("/") ? u + "index.html" : u);
    if (!fil.startsWith(ROT) || !fs.existsSync(fil)) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(fil);
    if (fil.endsWith("lag.js")) body = body.toString().replace('endpoint: ""', 'endpoint: "https://fake.example/api"');
    res.writeHead(200, { "content-type": TYPER[path.extname(fil)] || "application/octet-stream" }); res.end(body);
  }).listen(0);
  const BAS = "http://localhost:" + server.address().port;

  br = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const dialoger = [], fel = [];
  p.on("dialog", (d) => { dialoger.push(d.message()); d.dismiss(); });
  p.on("pageerror", (e) => fel.push(e.message));
  // Webbläsarens anrop går till den riktiga servern. Klubbadministratörens inloggning (cookien) läggs på av testet, som webbläsaren skulle göra.
  await p.route("https://fake.example/api**", async (route) => {
    const req = route.request(); const u = new URL(req.url());
    const rubriker = { Cookie: li.kaka, Origin: ORIGIN };
    const s = req.method() === "POST" ? await m.anrop("POST", "/api", req.postData(), rubriker) : await m.anrop("GET", "/api" + u.search, undefined, rubriker);
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: s.text });
  });

  const resultat = [];
  async function kolla(namn, url, vanta, gor) {
    await p.goto("about:blank");   // annars blir en ny adress som bara skiljer sig efter # ingen ny sidladdning
    await p.goto(BAS + url);
    await p.waitForSelector(vanta, { timeout: 10000 });
    if (gor) await gor();
    // Öppna alla utfällbara delar och för musen över allt, så att onmouseover och liknande får en chans.
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    for (const el of await p.locator("#app b, #app a, #app i, #app u").all()) await el.hover({ timeout: 500 }).catch(() => {});
    await p.waitForTimeout(400);
    const markor = await p.evaluate(() => window.__x);
    // Riktiga element som kan köra skript, inte text som bara ser ut så.
    const farliga = await p.evaluate(() => Array.from(document.querySelectorAll(
      "#app script, #app iframe, #app [onerror], #app [onload], #app [onmouseover], #app a[href^='javascript:' i]")).map((e) => e.outerHTML.slice(0, 80)));
    const synligText = await p.evaluate(() => document.getElementById("app").textContent);
    const syns = /onerror=|<script>|onload=/.test(synligText);
    if (farliga.length) console.log("   ", farliga.join(" | "));
    resultat.push({ namn, markor, farliga: farliga.length, syns });
    console.log(`${markor === undefined && farliga.length === 0 ? "ok  " : "FEL "} ${namn}: skript kördes: ${markor === undefined ? "nej" : "JA (" + markor + ")"}, farliga element: ${farliga.length}, visas som text: ${syns ? "ja" : "nej"}`);
  }

  await kolla("Laglistan", "/eskilsminne/", ".teamcard");
  await kolla("Försäljningssidan", "/eskilsminne/?lag=lag-x", "#barn");
  await kolla("Beställningen och Swish-uppgifterna", "/eskilsminne/?lag=lag-x", "#barn", async () => {
    await p.fill("#barn", "Emil"); await p.fill("#mobil", "070 765 43 21"); await p.fill("#antal", "2");
    await p.click("button[type=submit]");
    await p.waitForSelector(".swish", { timeout: 15000 });
  });
  await kolla("Lagförälderns vy", `/eskilsminne/admin.html#lag=lag-x&k=${x.key}`, ".tabs");
  await kolla("Lagförälderns vy med klubbens kommentar", `/eskilsminne/admin.html#lag=lag-y&k=${y.key}`, "#app h2, #app h1");
  // Klubbens administratör: sidan har en session och frågar servern, som svarar för cookien
  await kolla("Klubbadministratörens vy", "/eskilsminne/admin.html", "#app h2", async () => {
    await p.evaluate(() => sessionStorage.setItem("admin", JSON.stringify({ lag: "*", key: "", klubbadmin: true })));
    await p.reload(); await p.waitForSelector("text=Logga ut", { timeout: 10000 });
  });
  // Länken från e-posten med skräp i stället för en nyckel: inget av det får visas som kod
  await kolla("Länk från e-posten med skript i adressen", "/eskilsminne/admin.html#lank=%3Cimg%20src%3Dx%20onerror%3Dwindow.__x%3D11%3E", "text=Bekräfta");

  const ok = resultat.every((r) => r.markor === undefined && r.farliga === 0) && dialoger.length === 0;
  console.log(`\n${resultat.length} sidor, ${dialoger.length} dialogrutor, sidfel: ${fel.length ? fel.join(" | ") : "inga"}`);
  console.log(ok ? "Inget skript kördes." : "XSS: minst ett skript kördes eller ett farligt element fanns på sidan.");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error(e); process.exitCode = 1;
} finally {
  if (br) await br.close();
  if (server) server.close();
  await m.stang();
}
