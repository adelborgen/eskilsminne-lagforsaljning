/* Testmiljö för servern: en riktig D1 (Miniflare kör samma databasmotor lokalt), en klocka som testerna styr, och en låtsas-brevlåda.
   Inget här rör ett riktigt Cloudflare-konto eller riktiga uppgifter.

   SERVER_DIR=<sökväg> kör testerna mot en annan kopia av server/ (används av mutera.js för att koppla bort ett skydd i taget). */
import { Miniflare } from "miniflare";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HAR = path.dirname(fileURLToPath(import.meta.url));
export const ROT = path.join(HAR, "..");
export const SERVER_DIR = process.env.SERVER_DIR || path.join(ROT, "server");
const { hantera } = await import(pathToFileURL(path.join(SERVER_DIR, "api.js")).href);
const regler = await import(pathToFileURL(path.join(SERVER_DIR, "regler.js")).href);
export const CFG = regler.CFG;

export const ORIGIN = "https://skramlat.test";

// SQL-filen delas upp i uttryck (kommentarer bort), eftersom D1 kör ett uttryck i taget
function uttryck(sql) {
  return sql.split("\n").map((r) => r.replace(/--.*$/, "")).join("\n").split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}
const SCHEMA = fs.readdirSync(path.join(ROT, "migrations")).sort()
  .map((f) => uttryck(fs.readFileSync(path.join(ROT, "migrations", f), "utf8"))).flat();
const TABELLER = ["bestallning", "logg", "sparr", "inloggningslank", "session", "lag", "klubb_admin", "klubb"];   // barn före förälder

export async function skapaMiljo() {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response(''); } }", d1Databases: { DB: "test-db" } });
  const db = await mf.getD1Database("DB");
  const m = { db, mf, klocka: Date.UTC(2026, 9, 17, 12, 0, 0), brev: [], vantande: [], epostFel: false, dbFel: false };
  // Databasen som servern ser. m.dbFel = true får den att fela, för att pröva det oväntade felet.
  const dbVag = { prepare: (...a) => { if (m.dbFel) throw new Error("databasen är nere"); return db.prepare(...a); },
    batch: (...a) => { if (m.dbFel) throw new Error("databasen är nere"); return db.batch(...a); } };
  const env = { DB: dbVag, SIDA_ORIGIN: ORIGIN, EPOST_FRAN: "inloggning@skramlat.test", EMAIL: { send: async (b) => { if (m.epostFel) throw new Error("e-posten gick inte att skicka"); m.brev.push(b); } } };
  const ctx = { nu: () => m.klocka, waitUntil: (p) => { m.vantande.push(p); } };

  m.nollstall = async () => {
    for (const t of TABELLER) await db.prepare("DROP TABLE IF EXISTS " + t).run();
    for (const s of SCHEMA) await db.prepare(s).run();
    m.klocka = Date.UTC(2026, 9, 17, 12, 0, 0); m.brev.length = 0; m.vantande.length = 0; m.epostFel = false; m.dbFel = false;
  };
  m.stang = () => mf.dispose();
  m.vanta = async () => { await Promise.all(m.vantande.splice(0)); };   // väntar på det som skickas efter svaret (e-post)
  m.tid = (ms) => { m.klocka += ms; };

  // Ett anrop till servern. Svaret ger status, json och rubriker.
  m.anrop = async (metod, url, kropp, rubriker) => {
    const h = new Headers(rubriker || {});
    const init = { method: metod, headers: h };
    if (kropp !== undefined) { init.body = typeof kropp === "string" ? kropp : JSON.stringify(kropp); h.set("Content-Type", "text/plain;charset=utf-8"); }
    const svar = await hantera(new Request(url.startsWith("http") ? url : ORIGIN + url, init), env, ctx);
    const text = await svar.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* inte json */ }
    return { status: svar.status, text, json: j, rubriker: svar.headers };
  };
  m.post = async (obj, rubriker) => (await m.anrop("POST", "/api", obj, rubriker)).json;
  m.postRaw = async (text, rubriker) => (await m.anrop("POST", "/api", text, rubriker)).json;
  m.get = async (params) => (await m.anrop("GET", "/api?" + new URLSearchParams(params))).json;
  m.admin = async (klubb, lag, key, op, extra, rubriker) => (await m.anrop("POST", "/api", { action: "admin", klubb, lag, key, op, ...(extra || {}) }, rubriker)).json;

  // Direkt i databasen: det som i verkligheten görs vid uppsättningen
  m.skapaKlubb = async (slug, namn, o = {}) => {
    const r = await db.prepare("INSERT INTO klubb (slug, namn, status, skapad) VALUES (?1, ?2, ?3, ?4) RETURNING id")
      .bind(slug, namn || slug, o.status || "aktiv", new Date(m.klocka).toISOString()).first();
    for (const e of o.admins || []) await db.prepare("INSERT INTO klubb_admin (klubb_id, epost, skapad) VALUES (?1, ?2, ?3)").bind(r.id, e, new Date(m.klocka).toISOString()).run();
    return r.id;
  };
  m.rader = async (tabell) => (await db.prepare("SELECT * FROM " + tabell).all()).results;

  // Hela inloggningen som en klubbadministratör gör den: begär länk, läser den i brevlådan, bekräftar. Ger cookien.
  m.loggaIn = async (klubb, epost) => {
    const beg = await m.post({ action: "login", op: "begar", klubb, epost });
    await m.vanta();
    const brev = m.brev.filter((b) => b.to === epost).pop();
    if (!brev) return { ok: false, beg };
    const token = brev.text.match(/#lank=([a-f0-9]{64})/)[1];
    const svar = await m.anrop("POST", "/api", { action: "login", op: "anvand", token }, { Origin: ORIGIN });
    const kaka = (svar.rubriker.get("Set-Cookie") || "").split(";")[0];
    return { ok: svar.json.ok, kaka, svar: svar.json, token };
  };
  // Rubriker för en inloggad administratör: cookien och ursprunget som webbläsaren skickar
  m.somAdmin = (kaka) => ({ Cookie: kaka, Origin: ORIGIN });

  await m.nollstall();
  return m;
}

export const lagData = (o = {}) => ({ namn: "Lag A", kampanj: "Bingolotter", produkt: "Bingolott", enhetEn: "lott", enhet: "lotter",
  swishNummer: "123 456 78 90", mottagare: "Testklubben", pris: 30, inkopspris: 10, minimum: 10, mal: 100, maxAntal: 20, status: "pagar", ...o });

export const ADMIN_EPOST = "admin@testklubben.example";
