/* Workern lägger in databasens migreringar själv, en gång per instans, före första anropet. Då behövs ingen konsol och ingen extra
   behörighet för bygget, och en ny version av koden har alltid sina tabeller.
   Bokföringen är densamma som wrangler använder (tabellen d1_migrations), så wrangler d1 migrations apply fungerar också, och
   ser det som Workern redan har lagt in. Migreringarna skrivs så att de tål att köras igen (IF NOT EXISTS). */
import { MIGRERINGAR } from "./schema.js";

let klar = null;

export function migrera(db) {
  if (!klar) klar = korMigreringar(db).catch((e) => { klar = null; throw e; });   // misslyckas det prövas det igen vid nästa anrop
  return klar;
}

export async function korMigreringar(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)").run();
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all();
  const gjorda = new Set(results.map((r) => r.name));
  for (const m of MIGRERINGAR) {
    if (gjorda.has(m.namn)) continue;
    // Migreringen och bokföringen i en och samma körning: antingen läggs allt in, eller inget
    await db.batch([...m.uttryck.map((s) => db.prepare(s)), db.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?1)").bind(m.namn)]);
  }
}
