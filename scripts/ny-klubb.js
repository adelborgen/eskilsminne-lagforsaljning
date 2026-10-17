/* Skriver SQL som lägger in en klubb och dess första administratör. Används tills ansökan på skramlat.se/kom-igang finns (Fas 2).
     node scripts/ny-klubb.js --slug eskilsminne --namn "Eskilsminne IF" --epost kassor@klubben.se [--motto "…"] [--status aktiv] > ny-klubb.sql
     npx wrangler d1 execute skramlat --remote --file ny-klubb.sql
   E-postadressen läggs in i databasen och ska inte skrivas in i någon fil i repot. Radera ny-klubb.sql efteråt. */
import { SLUG_RE, EPOST_RE } from "../server/regler.js";

const a = process.argv.slice(2), v = {};
for (let i = 0; i < a.length; i += 2) v[a[i].replace(/^--/, "")] = a[i + 1];
const slug = String(v.slug || ""), namn = String(v.namn || "").trim(), epost = String(v.epost || "").trim().toLowerCase();
const motto = String(v.motto || ""), status = v.status || "aktiv";
const fel = [];
if (!SLUG_RE.test(slug)) fel.push("--slug: små bokstäver, siffror och bindestreck, 2–30 tecken");
if (!namn || namn.length > 60) fel.push("--namn: 1–60 tecken");
if (!EPOST_RE.test(epost) || epost.length > 254) fel.push("--epost: en riktig e-postadress");
if (!["vantar", "aktiv", "avstangd"].includes(status)) fel.push("--status: vantar, aktiv eller avstangd");
if (fel.length) { console.error("Fel:\n - " + fel.join("\n - ")); process.exit(1); }

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const nu = new Date().toISOString();
console.log(`INSERT INTO klubb (slug, namn, motto, status, skapad) VALUES (${q(slug)}, ${q(namn)}, ${q(motto)}, ${q(status)}, ${q(nu)});
INSERT INTO klubb_admin (klubb_id, epost, skapad) SELECT id, ${q(epost)}, ${q(nu)} FROM klubb WHERE slug = ${q(slug)};`);
