/* Kontrollerar att databasen har jurisdiktion eu hos Cloudflare. Körs av den som har tillgång till kontot:
     CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/kontrollera-eu.js
   Databasens id läses ur wrangler.toml. API-token behöver bara få läsa D1 (D1 Read).

   Avslutar med 0 när jurisdiktionen är eu, 1 när den är något annat, och 2 när svaret inte säger något om jurisdiktion. Då går det inte att
   avgöra härifrån och det ska kontrolleras för hand i Cloudflares panel (D1, databasen, Inställningar) och skrivas ner. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bedömer svaret från Cloudflares API. Ren funktion, så att den går att pröva utan konto.
export function bedom(svar) {
  const r = svar && svar.result;
  if (!r || typeof r !== "object") return { kod: 2, text: "Svaret saknar uppgifter om databasen. Kontrollera för hand i Cloudflares panel." };
  const j = r.jurisdiction;
  if (j === undefined || j === null || j === "") return { kod: 2, text: "Svaret nämner ingen jurisdiktion. Kontrollera för hand i Cloudflares panel och skriv ner resultatet." };
  if (String(j).toLowerCase() === "eu") return { kod: 0, text: "Databasen har jurisdiktion eu." };
  return { kod: 1, text: "Databasen har jurisdiktion " + j + ", inte eu. Den måste skapas om med --jurisdiction=eu och flyttas." };
}

export function databasId(toml) {
  const m = /\[\[d1_databases\]\][^[]*?database_id\s*=\s*"([^"]+)"/s.exec(toml);
  return m ? m[1] : "";
}

async function main() {
  const rot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const konto = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  const id = databasId(fs.readFileSync(path.join(rot, "wrangler.toml"), "utf8"));
  if (!konto || !token) { console.error("Sätt CLOUDFLARE_ACCOUNT_ID och CLOUDFLARE_API_TOKEN."); process.exit(3); }
  if (!id || id.startsWith("BYT-MOT")) { console.error("wrangler.toml har inget riktigt databas-id än. Skapa databasen först (se överst i wrangler.toml)."); process.exit(3); }
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + konto + "/d1/database/" + id, { headers: { Authorization: "Bearer " + token } });
  const b = await r.json().catch(() => null);
  if (!r.ok) { console.error("Cloudflare svarade " + r.status + ". Kontrollera konto, token och databas-id."); process.exit(3); }
  const d = bedom(b);
  console.log(d.text);
  process.exit(d.kod);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
