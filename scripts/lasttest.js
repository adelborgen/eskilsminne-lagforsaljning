/* Lasttest mot en RIKTIG Cloudflare-installation. Körs av den som har tillgång till kontot, innan skarp drift, och bara mot en testdatabas.
   De lokala testerna (npm test) kör en riktig D1 på den här datorn. Det här visar hur riktiga Cloudflare beter sig när många beställer exakt samtidigt.

   Förberedelse (en separat testdatabas och en testklubb, aldrig den riktiga):
     1. Skapa en testdatabas med EU-jurisdiktion och en Worker som pekar på den (se wrangler.toml, ett eget namn, till exempel skramlat-test).
     2. Lägg in en klubb med status aktiv och ett lag som är öppet (status pagar) med ett litet lager, till exempel 25, i testdatabasen.
   Kör sedan:
     BAS_URL=https://skramlat-test.<ditt-konto>.workers.dev KLUBB=testklubb LAG=lag-a ANTAL=200 node scripts/lasttest.js
   ANTAL = hur många beställningar som skickas samtidigt (standard 100). Alla uppgifter är påhittade. Radera testdatabasen efteråt.

   Godkänt när: aldrig fler beställda än lagret, varje lyckad beställning har ett eget löpande ordernummer, och inga fel som inte är "slutsålt". */
const BAS = process.env.BAS_URL, KLUBB = process.env.KLUBB, LAG = process.env.LAG;
const ANTAL = Number(process.env.ANTAL || 100);
if (!BAS || !KLUBB || !LAG) { console.error("Sätt BAS_URL, KLUBB och LAG (se överst i filen)."); process.exit(3); }

const lista = async () => (await (await fetch(BAS + "/api?action=lag&klubb=" + encodeURIComponent(KLUBB))).json());
const fore = (await lista()).lag.find((l) => l.slug === LAG);
if (!fore || fore.status !== "pagar") { console.error("Laget finns inte eller är inte öppet (status pagar)."); process.exit(3); }
const lager = fore.lager || 0;
console.log(`Före: ${fore.bestallt} beställda, lager ${lager || "ingen gräns"}. Skickar ${ANTAL} beställningar samtidigt…`);

const skicka = async (i) => {
  const t0 = Date.now();
  const r = await fetch(BAS + "/api", { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({
    klubb: KLUBB, lag: LAG, barn: "Testbarn", mobil: "070" + String(7000000 + i), antal: 1, samtycke: true, website: "", t: 5000 }) });
  const j = await r.json().catch(() => ({ ok: false, fel: "inget JSON-svar, status " + r.status }));
  return { ok: j.ok === true, id: j.id, fel: j.fel, ms: Date.now() - t0, status: r.status };
};
const svar = await Promise.all(Array.from({ length: ANTAL }, (_, i) => skicka(i)));

const lyckade = svar.filter((s) => s.ok), nej = svar.filter((s) => !s.ok);
const okanda = nej.filter((s) => !/slutsålt|bara \d+ kvar|Många beställningar/.test(s.fel || ""));
const id = lyckade.map((s) => s.id), unika = new Set(id).size === id.length;
const efter = (await lista()).lag.find((l) => l.slug === LAG);
const nytt = efter.bestallt - fore.bestallt;
const ms = svar.map((s) => s.ms).sort((a, b) => a - b);
const fel = [];
if (lager > 0 && efter.bestallt > lager) fel.push(`SÅLDE MER ÄN LAGRET: ${efter.bestallt} av ${lager}`);
if (nytt !== lyckade.length) fel.push(`antalet i listan (${nytt}) stämmer inte med lyckade beställningar (${lyckade.length})`);
if (!unika) fel.push("ordernummer användes två gånger");
if (okanda.length) fel.push(`${okanda.length} oväntade fel, till exempel: ${okanda[0].fel} (status ${okanda[0].status})`);
console.log(`Lyckade: ${lyckade.length}, avvisade: ${nej.length}. Efter: ${efter.bestallt} beställda. Svarstid (ms): median ${ms[Math.floor(ms.length / 2)]}, 95:e percentilen ${ms[Math.floor(ms.length * 0.95)]}, längsta ${ms[ms.length - 1]}.`);
console.log(fel.length ? "FEL:\n - " + fel.join("\n - ") : "Godkänt: lagret höll, ordernumren är unika och inga oväntade fel.");
process.exit(fel.length ? 1 : 0);
