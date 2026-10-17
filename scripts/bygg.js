/* Samlar de publika filerna i dist/, som Cloudflare serverar som statiska sidor, och skriver server/schema.js.
   Körs av: npm run bygg, och av wrangler före varje publicering ([build] i wrangler.toml).
   Bara det som ska vara publikt tas med: inte tester, material, server eller anteckningar. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skrivSchema } from "./schema.js";

skrivSchema();   // migrationerna som Workern lägger in själv (server/schema.js)
const rot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ut = path.join(rot, "dist");
const MED = ["index.html", "eskilsminne", "demo", "guider", "kom-igang", "pris", "logga", "fonts"];
const BORT = new Set([".DS_Store", "README.md"]);   // fonts/README.md är en anteckning, licensfilerna ska följa med

fs.rmSync(ut, { recursive: true, force: true });
fs.mkdirSync(ut, { recursive: true });
let antal = 0;
for (const namn of MED) {
  const fran = path.join(rot, namn);
  if (!fs.existsSync(fran)) { console.error("Saknas: " + namn); process.exit(1); }
  fs.cpSync(fran, path.join(ut, namn), { recursive: true, filter: (f) => { const ok = !BORT.has(path.basename(f)); if (ok && fs.statSync(f).isFile()) antal++; return ok; } });
}
console.log("dist/ klar: " + antal + " filer");
