/* Bevis för att attacktesterna biter. Kör: node test/mutera.cjs
   För varje skydd i Server.gs görs en kopia där just det skyddet är bortkopplat. Attacktestet som hör till skyddet körs mot
   kopian och ska då misslyckas (attacken lyckas). Därefter körs alla attacktester mot den riktiga Server.gs och ska gå igenom.
   Ingenting i den riktiga Server.gs ändras. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROT = path.join(__dirname, "..");
const KALLA = fs.readFileSync(path.join(ROT, "Server.gs"), "utf8");
const TEST = path.join(__dirname, "attacker.test.cjs");

// skydd: vad som kopplas bort. attack: början på attacktestets namn som ska lyckas utan skyddet.
const MUTATIONER = [
  { skydd: "Nyckeln måste höra till just det laget", attack: "Läsa ett lags beställningar utan nyckel",
    fran: "if (hk && lag && lag._hash && hk === lag._hash)", till: "if (hk && lag)" },
  { skydd: "Nyckeln måste höra till just det laget (lag A mot lag B)", attack: "Lag A:s nyckel för att läsa lag B",
    fran: "if (hk && lag && lag._hash && hk === lag._hash)", till: "if (hk && lag && lag._hash)" },
  { skydd: "Bara uttryckligen tillåtna åtgärder kan anropas", attack: "Anropa serverns interna funktioner",
    fran: "if (har(lagOps, op)) {", till: "if (lagOps[op]) {" },
  { skydd: "Ordern måste tillhöra laget (betald)", attack: "Markera lag B:s beställning som betald",
    fran: "var o = ordrar.filter(function (x) { return x.lag === lag.slug && parseInt(x.id, 10) === nr; })[0];\n    if (!o) return { ok: false, fel: \"Hittar ingen order \" + d.id + \".\" };\n    flik(ORDER_FLIK).getRange(o.rad, OCOL.BETALD)",
    till: "var o = ordrar.filter(function (x) { return parseInt(x.id, 10) === nr; }).pop();\n    if (!o) return { ok: false, fel: \"Hittar ingen order \" + d.id + \".\" };\n    flik(ORDER_FLIK).getRange(o.rad, OCOL.BETALD)" },
  { skydd: "Bara klubbens administratör får godkänna och skapa lag", attack: "Lagföräldern godkänner sin egen försäljning",
    fran: "if (a.roll !== \"super\") return json(", till: "if (false) return json(" },
  { skydd: "Godkänd försäljning är låst för lagföräldern", attack: "Byta Swish-nummer efter att klubben har godkänt",
    fran: "if (roll !== \"super\" && l.status !== \"utkast\")", till: "if (false)" },
  { skydd: "Bara öppna försäljningar tar emot beställningar", attack: "Beställa från en försäljning som inte är öppen",
    fran: "if (lag.status !== \"pagar\") return json(", till: "if (false) return json(" },
  { skydd: "Antalet kontrolleras på servern", attack: "Ogiltiga antal",
    fran: "if (!(antal >= 1 && antal <= lag.maxAntal && antal % 1 === 0))", till: "if (false)" },
  { skydd: "Beloppet räknas på servern", attack: "Skicka ett eget, lägre belopp",
    fran: "var belopp = avrunda(antal * lag.pris);", till: "var belopp = Number(d.belopp) || avrunda(antal * lag.pris);" },
  { skydd: "Robotfältet", attack: "Beställa utan att godkänna villkoren",
    fran: "if (d.website) return json({ ok: true, id: \"0000\", belopp: 0 });", till: "" },
  { skydd: "Gräns per mobilnummer", attack: "Många beställningar från samma mobilnummer",
    fran: "if (tidigare >= CFG.MAX_PER_MOBIL)", till: "if (false)" },
  { skydd: "Lagret räknas inne i låset", attack: "20 beställningar på den sista lotten",
    fran: "if (l.lager > 0) {\n      var kvar", till: "if (false) {\n      var kvar" },
  { skydd: "Barnets namn får bara innehålla bokstäver", attack: "HTML och skript i barnets namn",
    fran: "if (!BARN_RE.test(barn))", till: "if (!barn)" },
  { skydd: "Inledande = + - @ tas bort ur lagförälderns texter", attack: "Formler i kalkylarket",
    fran: "ut[k] = String(d[k]).trim().replace(/^[=+\\-@\\s]+/, \"\").slice(0, max);", till: "ut[k] = String(d[k]).trim().slice(0, max);" },
  { skydd: "Längd på barnets namn", attack: "Mycket lång text och tomma värden",
    fran: "if (!BARN_RE.test(barn))", till: "if (!barn.trim())" },
  { skydd: "Beloppet avrundas till ören", attack: "Pris med ören ger ett exakt belopp",
    fran: "var belopp = avrunda(antal * lag.pris);", till: "var belopp = antal * lag.pris;" },
  { skydd: "Mobilnumret sparas inte i klartext i det tillfälliga", attack: "Personuppgifter i det som sparas tillfälligt",
    fran: "var nyckel = \"m\" + hash(mobil).slice(0, 24);", till: "var nyckel = \"m\" + mobil;" },
  { skydd: "Spärr mot gissade nycklar", attack: "Gissa nycklar utan att låsa ute den rätta",
    fran: "if (Number(cache.get(kLag) || 0) >= CFG.FEL_MAX || Number(cache.get(kAlla) || 0) >= CFG.FEL_MAX_ALLA)", till: "if (false)" },
  { skydd: "Ny nyckel ersätter den gamla", attack: "Använda den gamla nyckeln",
    fran: "flik(LAG_FLIK).getRange(lag._rad, LAG_COL.HASH).setValue(hash(key));", till: "" },
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function kor(serverGs, monster) {
  const args = ["--test", "--test-reporter=tap"];
  if (monster) args.push("--test-name-pattern=" + esc(monster));
  args.push(TEST);
  const r = spawnSync(process.execPath, args, { env: { ...process.env, SERVER_GS: serverGs, ATTACK_RAPPORT: "" }, encoding: "utf8" });
  const m = (r.stdout.match(/^# fail (\d+)/m) || [])[1], p = (r.stdout.match(/^# pass (\d+)/m) || [])[1];
  return { fail: Number(m || 0), pass: Number(p || 0) };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mutera-"));
const rader = [];
let fel = 0;
for (const [i, mu] of MUTATIONER.entries()) {
  if (!KALLA.includes(mu.fran)) { console.error("Hittar inte texten för: " + mu.skydd); fel++; continue; }
  const fil = path.join(tmp, `server-${i}.gs`);
  fs.writeFileSync(fil, KALLA.replace(mu.fran, mu.till));
  const r = kor(fil, mu.attack);
  const biter = r.fail > 0;
  if (!biter) fel++;
  rader.push(`| ${mu.skydd} | ${mu.attack} | ${biter ? "Attacken lyckades utan skyddet" : "**Attacken stoppades ändå, testet biter inte**"} |`);
  console.log((biter ? "ok   " : "FEL  ") + mu.skydd);
}
const riktig = kor(path.join(ROT, "Server.gs"));
console.log(`\nMed alla skydd på: ${riktig.pass} attacker stoppade, ${riktig.fail} lyckades.`);
if (riktig.fail > 0) fel++;
const tabell = `| Skydd som kopplades bort | Attack | Resultat |\n|---|---|---|\n${rader.join("\n")}\n`;
if (process.env.MUTERA_RAPPORT) fs.writeFileSync(process.env.MUTERA_RAPPORT, tabell);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fel ? 1 : 0);
