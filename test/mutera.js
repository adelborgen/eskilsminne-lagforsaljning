/* Bevis för att testerna biter. Kör: node test/mutera.js
   För varje skydd i servern görs en kopia av server/ där just det skyddet är bortkopplat. Testet som hör till skyddet körs mot kopian och
   ska då misslyckas (attacken lyckas). Därefter körs alla tester mot den riktiga servern och ska gå igenom. Ett test som går igenom även
   utan sitt skydd bevisar ingenting. Ingenting i den riktiga servern ändras.

   Där två skydd täcker samma sak (till exempel en kontroll i koden och samma kontroll i databasfrågan) kopplas båda bort i samma mutation,
   annars skulle det andra skyddet stoppa attacken och mutationen verka sakna effekt. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KALLA = path.join(ROT, "server");

// test: vilken testfil. monster: början på namnet på testet som ska fallera utan skyddet. edits: vad som ändras (fil, fran, till).
const M = (skydd, test, monster, ...edits) => ({ skydd, test, monster, edits: edits.map(([fil, fran, till]) => ({ fil, fran, till })) });
const MUTATIONER = [
  // ----- Lagets nyckel och klubbens status -----
  M("Nyckeln måste höra till just det laget", "attack", "Läsa ett lags beställningar utan nyckel",
    ["auth.js", 'if (hk && lag && lag.hash && klubb.status === "aktiv" && likaHash(hk, lag.hash)) return', "if (hk && lag) return"]),
  M("Nyckeln måste höra till just det laget (lag A mot lag B)", "attack", "Lag A:s nyckel för att läsa lag B",
    ["auth.js", 'if (hk && lag && lag.hash && klubb.status === "aktiv" && likaHash(hk, lag.hash)) return', "if (hk && lag && lag.hash) return"]),
  M("Lagets nyckel gäller bara i en godkänd klubb", "attack", "Använda ett lags nyckel när klubben har stängts av",
    ["auth.js", 'lag.hash && klubb.status === "aktiv" && likaHash', "lag.hash && likaHash"]),
  M("Spärr mot gissade nycklar", "attack", "Gissa nycklar utan att låsa ute den rätta",
    ["auth.js", "if ((await lasRakning(k, kLag)) >= CFG.FEL_MAX || (await lasRakning(k, kAlla)) >= CFG.FEL_MAX_ALLA)", "if (false)"]),
  M("Ny nyckel ersätter den gamla", "attack", "Använda den gamla nyckeln",
    ["ops.js", 'k.db.prepare("UPDATE lag SET nyckel_hash = ?2 WHERE id = ?1").bind(', 'k.db.prepare("UPDATE lag SET nyckel_hash = nyckel_hash WHERE id = ?1 AND ?2 <> \'\'").bind(']),

  // ----- Bara tillåtna åtgärder, bara rätt roll -----
  M("Bara uttryckligen tillåtna åtgärder kan anropas", "attack", "Anropa serverns interna funktioner",
    ["ops.js", "if (har(delade, op)) {", "if (delade[op]) {"], ["ops.js", "} else if (har(lagOps, op)) {", "} else if (lagOps[op]) {"],
    ["ops.js", "} else if (har(superOps, op)) {", "} else if (superOps[op]) {"]),
  M("Bara klubbens administratör får godkänna, stoppa och ta bort", "attack", "Lagföräldern gör klubbens jobb",
    ["ops.js", 'if (a.roll !== "super") return { ok: false, fel: "Bara klubbens administratör får göra det här." };', ""]),
  M("Bara lagföräldern ändrar, öppnar och avslutar försäljningen", "attack", "Klubbens administratör ändrar försäljningens uppgifter",
    ["ops.js", 'if (a.roll !== "lag") return { ok: false, fel: "Det här gör lagföräldern. Klubben ser försäljningen och beställningarna men ändrar dem inte." };',
      'if (!a.lag) return { ok: false, fel: "Okänt lag." };']),
  M("Godkänd försäljning är låst för lagföräldern", "attack", "Byta Swish-nummer efter att klubben har godkänt",
    ["ops.js", 'if (l.status !== "utkast") return last;', ""],
    ["ops.js", "WHERE id = ?1 AND status = 'utkast'\").bind(lag.id, ...varden)", "WHERE id = ?1\").bind(lag.id, ...varden)"]),
  M("Bara det klubben har godkänt kan öppnas", "attack", "Öppna en försäljning som klubben inte har godkänt",
    ["ops.js", 'if (l.status !== "snart" && l.status !== "avslutad") return { ok: false, fel: l.status === "pagar"', 'if (l.status === "pagar") return { ok: false, fel: l.status === "pagar"']),
  M("Bara en betald beställning kan hämtas, och en hämtad blir inte obetald", "attack", "Markera en obetald beställning som hämtad",
    ["ops.js", 'if (varde === "JA" && o.betald !== "JA") return { ok: false, fel: "Markera beställningen som betald först." };', ""],
    ["ops.js", "AND NOT (?3 = 'JA' AND betald != 'JA')", "AND NOT (?3 = 'JA' AND betald = 'AVBRUTEN')"],
    ["ops.js", 'if (varde !== "JA" && o.hamtad === "JA") return { ok: false, fel: "Beställningen är hämtad. Ångra hämtningen först." };', ""],
    ["ops.js", "AND (?3 = 'JA' OR hamtad != 'JA')", ""]),
  M("Beloppet för pengarna räknas av servern", "api", "pengarna: lagföräldern markerar",
    ["ops.js", "const belopp = oversikt(l, await lasOrdrar(k, l.id)).betaltKr;", "const belopp = Number(d.belopp) || oversikt(l, await lasOrdrar(k, l.id)).betaltKr;"]),
  M("Det klubben godkände sparas, så att ändringar syns", "api", "mejl till klubben när en försäljning väntar",
    ["ops.js", '"UPDATE lag SET status = \'pagar\', kommentar = \'\', godkant = " + OGONBLICK + `,', '"UPDATE lag SET status = \'pagar\', kommentar = \'\'" + `,']),
  M("Notisen nämner vilka fält som ändrats, inte värdena", "api", "mejl till klubben när en försäljning väntar",
    ["ops.js", 'andr.length ? "Ändrat sedan klubben godkände den senast: " + andr.join(", ") + "."', 'andr.length ? "Ändrat sedan klubben godkände den senast: " + ny.andringar.map((a) => a.namn + " " + a.nu).join(", ") + "."']),
  M("Förfrågan tas bara emot från skramlat.se och sidornas egen adress", "api", "förfrågan: fel och tomma fält",
    ["forfragan.js", 'if (!fran) return { ok: false, fel: "Felaktig förfrågan." };', ""]),
  M("Spärr på förfrågningar", "api", "förfrågan: spärr per IP-nummer",
    ["forfragan.js", "if (ip > CFG.FORFRAGAN_PER_IP_TIMME || alla > CFG.FORFRAGAN_PER_TIMME)", "if (false)"]),
  M("Bara försäljningens egna fält kan sparas av lagföräldern", "attack", "Smuggla in status, nyckel, adress och räknare",
    ["ops.js", "LAG_EGNA_FALT.forEach((f) => { if (inn[f] !== undefined) falt[f] = inn[f]; });", "Object.assign(falt, inn);"]),

  // ----- Ordern måste tillhöra laget -----
  M("Betalning gäller bara det egna lagets order", "attack", "Samma ordernummer i två lag",
    ["ops.js", "UPDATE bestallning SET betald = ?3 WHERE lag_id = ?1 AND nr = ?2", "UPDATE bestallning SET betald = ?3 WHERE ?1 > 0 AND nr = ?2"]),
  M("Hämtning gäller bara det egna lagets order", "attack", "Samma ordernummer i två lag",
    ["ops.js", "UPDATE bestallning SET hamtad = ?3 WHERE lag_id = ?1 AND nr = ?2", "UPDATE bestallning SET hamtad = ?3 WHERE ?1 > 0 AND nr = ?2"]),
  M("Borttagning gäller bara det egna lagets order", "attack", "Samma ordernummer i två lag",
    ["ops.js", "DELETE FROM bestallning WHERE lag_id = ?1 AND nr = ?2", "DELETE FROM bestallning WHERE ?1 > 0 AND nr = ?2"]),

  // ----- Klubb mot klubb -----
  M("Administratören måste höra till just den klubben", "attack", "En annan klubb med samma lagnamn",
    ["auth.js", "if (s && await arAdmin(k, klubb.id, s.epost)) {", "if (s) {"]),

  // ----- Beställningen -----
  M("Bara öppna försäljningar tar emot beställningar", "attack", "Beställa från en försäljning som inte är öppen",
    ["bestall.js", 'if (lag.status !== "pagar") return { ok: false, fel: "Försäljningen är inte öppen just nu." };', ""],
    ["bestall.js", "WHERE l.id = ?1 AND kl.id = ?2 AND kl.status = 'aktiv' AND l.status = 'pagar'", "WHERE l.id = ?1 AND kl.id = ?2 AND kl.status = 'aktiv'"]),
  M("Bara en godkänd klubb tar emot beställningar", "attack", "Beställa i en klubb som väntar på godkännande",
    ["bestall.js", "const klubb = await hittaAktivKlubb(k, d.klubb);\n  const lag", "const klubb = await hittaKlubb(k, d.klubb);\n  const lag"],
    ["bestall.js", "import { hittaAktivKlubb, hittaLag,", "import { hittaAktivKlubb, hittaKlubb, hittaLag,"],
    ["bestall.js", "AND kl.id = ?2 AND kl.status = 'aktiv' AND l.status = 'pagar'", "AND kl.id = ?2 AND l.status = 'pagar'"]),
  M("Antalet kontrolleras på servern", "attack", "Ogiltiga antal",
    ["bestall.js", "if (!(antal >= 1 && antal <= lag.maxAntal && antal % 1 === 0)) return", "if (false) return"]),
  M("Antalet måste vara ett tal", "attack", "Ogiltiga antal",
    ["bestall.js", 'const antal = typeof d.antal === "number" ? d.antal : NaN;', "const antal = Number(d.antal);"]),
  M("Beloppet räknas på servern", "attack", "Skicka ett eget, lägre belopp",
    ["bestall.js", "ROUND(?6 * l.pris, 2), ?7", "COALESCE(?8, ROUND(?6 * l.pris, 2)), ?7"],
    ["bestall.js", ".bind(lag.id, klubb.id, iso(k), barn, mobil, antal, kod || null)", ".bind(lag.id, klubb.id, iso(k), barn, mobil, antal, kod || null, typeof d.belopp === \"number\" ? d.belopp : null)"]),
  M("Beloppet avrundas till ören", "attack", "Pris med ören ger ett exakt belopp",
    ["bestall.js", "ROUND(?6 * l.pris, 2), ?7", "(?6 * l.pris), ?7"]),
  M("Robotfältet", "attack", "Beställa för snabbt eller som robot",
    ["bestall.js", 'if (d.website) return { ok: true, id: "0000", belopp: 0 };', ""]),
  M("Gräns per mobilnummer", "attack", "Många beställningar från samma mobilnummer",
    ["bestall.js", "if ((await lasRakning(k, sparrNyckel)) >= CFG.MAX_PER_MOBIL)", "if (false)"]),
  M("Lagret räknas i samma uttryck som sparar beställningen", "attack", "20 beställningar samtidigt på den sista lotten",
    ["bestall.js", "AND (l.lager = 0 OR l.lager - (SELECT COALESCE(SUM(b.antal), 0) FROM bestallning b WHERE b.lag_id = l.id AND b.betald != 'AVBRUTEN') >= ?6)", ""]),
  M("Barnets namn får bara innehålla bokstäver", "attack", "HTML och skript i barnets namn",
    ["bestall.js", "if (!BARN_RE.test(barn))", "if (!barn)"]),
  M("Längd på barnets namn", "attack", "Mycket lång text och tomma värden",
    ["bestall.js", "if (!BARN_RE.test(barn))", "if (!barn.trim())"]),
  M("Beställningskoden sparas, så att en omförsök inte ger dubblett", "api", "försöker föräldern igen med samma kod",
    ["bestall.js", ".bind(lag.id, klubb.id, iso(k), barn, mobil, antal, kod || null)", ".bind(lag.id, klubb.id, iso(k), barn, mobil, antal, null)"]),
  M("Högst tio försäljningar i timmen kan startas", "api", "starta en försäljning",
    ["bestall.js", "if ((await lasRakning(k, nyckel)) >= CFG.MAX_STARTER_PER_TIMME)", "if (false)"]),
  M("Anrop från en annan webbplats avvisas", "attack", "Beställa från en annan webbplats",
    ["api.js", 'if (!sammaUrsprung) return { ok: false, fel: "Felaktig förfrågan." };', ""]),

  // ----- Text och SQL -----
  M("Inledande = + - @ tas bort ur lagförälderns texter", "attack", "Formler i texter som exporteras",
    ["regler.js", 'ut[k] = String(d[k]).trim().replace(/^[=+\\-@\\s]+/, "").slice(0, max);', "ut[k] = String(d[k]).trim().slice(0, max);"]),
  M("Alla frågor använder parametrar (ingen text från en användare i SQL)", "attack", "SQL-injektion i alla fält",
    ["data.js", '"SELECT id, slug, namn, motto, status, bankgiro FROM klubb WHERE slug = ?1").bind(slug)', "\"SELECT id, slug, namn, motto, status, bankgiro FROM klubb WHERE slug = '\" + slug + \"'\")"]),

  // ----- Personuppgifter -----
  M("Laglistan innehåller aldrig nyckelns hash", "attack", "Läsa laglistan och leta efter personuppgifter",
    ["data.js", "status: l.status, swish: l.swish,\n    produkt: l.produkt,", "status: l.status, swish: l.swish, hash: l.hash,\n    produkt: l.produkt,"]),
  M("Loggen innehåller inga personuppgifter", "attack", "Personuppgifter i loggen och i spärrarnas räknare",
    ["ops.js", 'o.antal + " st, " + o.belopp + " kr")', 'o.antal + " st, " + o.belopp + " kr, " + o.barn)']),
  M("Mobilnumret sparas inte i klartext i spärrens räknare", "attack", "Personuppgifter i loggen och i spärrarnas räknare",
    ["bestall.js", '(await sha256(mobil)).slice(0, 24)', "mobil"]),
  M("Inget svar får cachas", "eu", "inget svar från servern får cachas",
    ["api.js", '"Cache-Control": "no-store",', '"Cache-Control": "public, max-age=60",']),

  // ----- Inloggning -----
  M("En inloggningslänk kan användas en gång", "attack", "Använda en inloggningslänk två gånger",
    ["auth.js", "WHERE hash = ?1 AND anvand = 0 AND giltig_till > ?2 RETURNING epost", "WHERE hash = ?1 AND giltig_till > ?2 RETURNING epost"]),
  M("En inloggningslänk gäller i 15 minuter", "attack", "Använda en inloggningslänk som har gått ut",
    ["auth.js", "AND giltig_till > ?2 RETURNING epost", "AND ?2 > 0 RETURNING epost"]),
  M("Sessionen gäller i 30 dagar", "inloggning", "sessionen gäller i 30 dagar",
    ["auth.js", 'SELECT epost FROM session WHERE hash = ?1 AND giltig_till > ?2', 'SELECT epost FROM session WHERE hash = ?1 AND ?2 > 0']),
  M("Förfrågan från en annan webbplats gäller inte med cookie", "attack", "Skicka förfrågningar i den inloggades namn",
    ["auth.js", 'if (!ursprungOk(k, true)) return { fel: "Felaktig förfrågan." };', ""]),
  M("Svaret avslöjar inte vilka adresser som är administratörer", "attack", "Ta reda på vilka adresser som är administratörer",
    ["auth.js", "if (!admin) return GRANSKA;", 'if (!admin) return { ok: false, fel: "Okänd adress." };']),
  M("Spärr på inloggningslänkar", "attack", "Fylla en administratörs brevlåda",
    ["auth.js", "if (!ipOk || !epostOk) return GRANSKA;", ""]),
  M("Robotfält vid begäran om länk", "inloggning", "honungsfälla",
    ["auth.js", "if (d.website) return GRANSKA;", ""]),
  M("Länken pekar på den inställda adressen, inte på värdadressen", "attack", "Få länken att peka på en annan webbplats",
    ["auth.js", "(k.env.SIDA_ORIGIN || new URL(k.request.url).origin)", "(new URL(k.request.url).origin)"]),
  M("Länken ligger efter # och skickas inte till någon server", "inloggning", "mejlet: länken ligger efter #",
    ["auth.js", '"/admin.html#lank="', '"/admin.html?lank="']),
  M("Cookien är inte läsbar för skript", "inloggning", "cookien: bara https",
    ["auth.js", "Secure; HttpOnly; SameSite=Lax", "Secure; SameSite=Lax"])
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function kor(serverDir, testfiler, monster) {
  const args = ["--test", "--test-reporter=tap"];
  if (monster) args.push("--test-name-pattern=" + esc(monster));
  args.push(...testfiler.map((f) => path.join(ROT, "test", f + ".test.js")));
  const r = spawnSync(process.execPath, args, { env: { ...process.env, SERVER_DIR: serverDir, ATTACK_RAPPORT: "" }, encoding: "utf8", timeout: 600000 });
  const fail = Number((r.stdout.match(/^# fail (\d+)/m) || [])[1] || 0), pass = Number((r.stdout.match(/^# pass (\d+)/m) || [])[1] || 0);
  return { fail, pass };
}

// node test/mutera.js --kontrollera: kontrollerar bara att varje ändring träffar exakt en rad i koden, utan att köra några tester (några sekunder)
const BARA_KONTROLL = process.argv.includes("--kontrollera");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mutera-"));
const rader = [];
let fel = 0;
for (const [i, mu] of MUTATIONER.entries()) {
  const rot = path.join(tmp, "m" + i), dir = path.join(rot, "server");
  fs.cpSync(KALLA, dir, { recursive: true });
  fs.writeFileSync(path.join(rot, "package.json"), '{"type":"module"}');
  let ok = true;
  for (const e of mu.edits) {
    const fil = path.join(dir, e.fil), text = fs.readFileSync(fil, "utf8");
    const n = text.split(e.fran).length - 1;
    if (n !== 1) { console.error("FEL  texten för '" + mu.skydd + "' finns " + n + " gånger i " + e.fil + ": " + e.fran.slice(0, 70)); ok = false; break; }
    fs.writeFileSync(fil, text.replace(e.fran, () => e.till));
  }
  if (!ok) { fel++; continue; }
  if (BARA_KONTROLL) { console.log("träffar  " + mu.skydd); continue; }
  const r = kor(dir, [mu.test], mu.monster);
  const biter = r.fail > 0, traffade = r.fail + r.pass > 0;
  if (!traffade) { console.error("FEL  mönstret matchade inget test: " + mu.monster); fel++; continue; }
  if (!biter) fel++;
  rader.push(`| ${mu.skydd} | ${mu.monster} | ${biter ? "Testet fallerade utan skyddet" : "**Testet gick igenom ändå, det biter inte**"} |`);
  console.log((biter ? "ok   " : "FEL  ") + mu.skydd);
}
if (BARA_KONTROLL) { console.log(`\n${MUTATIONER.length} skydd kontrollerade, ${fel} problem.`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fel ? 1 : 0); }
const riktig = kor(KALLA, ["api", "inloggning", "attack", "eu"]);
console.log(`\nMed alla skydd på: ${riktig.pass} tester gick igenom, ${riktig.fail} fallerade.`);
if (riktig.fail > 0) fel++;
console.log(`${MUTATIONER.length - fel > 0 ? "" : ""}${MUTATIONER.length} skydd prövade, ${fel} problem.`);
const tabell = `| Skydd som kopplades bort | Test | Resultat |\n|---|---|---|\n${rader.join("\n")}\n`;
if (process.env.MUTERA_RAPPORT) fs.writeFileSync(process.env.MUTERA_RAPPORT, tabell);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fel ? 1 : 0);
