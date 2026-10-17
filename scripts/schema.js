/* Gör om migrationerna i migrations/ till server/schema.js, som Workern använder för att lägga in dem själv (server/migrera.js).
   Körs av npm run bygg (och av wrangler före varje publicering). Ändra aldrig server/schema.js för hand: ändra i migrations/. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Uttrycken i en SQL-fil, utan kommentarer. Varje uttryck slutar med ; i slutet av en rad.
export function uttryck(sql) {
  return sql.split("\n").map((r) => r.replace(/--.*$/, "")).join("\n").split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function schemaText() {
  const dir = path.join(rot, "migrations");
  const migreringar = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ namn: f, uttryck: uttryck(fs.readFileSync(path.join(dir, f), "utf8")) }));
  return "/* Skapad av scripts/schema.js från migrations/. Ändra inte här: ändra i migrations/ och kör npm run bygg. */\n" +
    "export const MIGRERINGAR = " + JSON.stringify(migreringar, null, 2) + ";\n";
}

export function skrivSchema() {
  fs.writeFileSync(path.join(rot, "server", "schema.js"), schemaText());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { skrivSchema(); console.log("server/schema.js klar"); }
