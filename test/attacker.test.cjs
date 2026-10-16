/* Attacktester mot Server.gs. Kör: node --test test/attacker.test.cjs
   Varje attack försöker göra något som inte ska gå: läsa ett annat lags uppgifter, ge sig själv mer behörighet, gå förbi
   knapparna på sidan eller skicka konstiga värden. Testet går igenom när attacken stoppas.

   Allt körs mot den riktiga Server.gs men med låtsas-Google (se harness.cjs). Det som bara går att bevisa i riktiga Google,
   till exempel många beställningar exakt samtidigt, står som "simulerat" i tabellen.

   Tabell över resultatet: ATTACK_RAPPORT=attackrapport.md node --test test/attacker.test.cjs
   Bevis för att testerna biter: kör dem mot en kopia av Server.gs där ett skydd är bortkopplat (SERVER_GS=sökväg),
   så ska motsvarande attack lyckas. Se test/mutera.cjs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { skapaMiljo } = require("./harness.cjs");

const lagData = (o = {}) => ({ namn: "Lag A", kampanj: "Bingolotter", produkt: "Bingolott", enhetEn: "lott", enhet: "lotter",
  swishNummer: "123 456 78 90", mottagare: "Eskilsminne IF", pris: 30, inkopspris: 10, minimum: 10, mal: 100, maxAntal: 20, status: "pagar", ...o });

// En klubb med två lag som säljer, med varsin beställning.
function klubb() {
  const m = skapaMiljo(); m.setup();
  const sk = m.superNyckel();
  const a = m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag A" }) });
  const b = m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag B" }) });
  assert.ok(a.ok && b.ok, "uppsättningen misslyckades");
  const bestall = (lag, o = {}) => m.post({ lag, barn: "Emil", mobil: "070 123 45 67", antal: 2, samtycke: true, website: "", t: 5000, ...o });
  const oa = bestall("lag-a", { barn: "Alva", mobil: "070 111 11 11" });
  // Ordernumren räknas per lag. Lag B får två beställningar, så att lag B:s 0002 inte finns hos lag A.
  bestall("lag-b", { barn: "Berit", mobil: "070 222 22 21" });
  const ob = bestall("lag-b", { barn: "Bertil", mobil: "070 222 22 22" });
  assert.ok(oa.ok && ob.ok, "beställningarna misslyckades");
  const order = (slug, id) => m.admin(slug, slug === "lag-a" ? a.key : b.key, "lista").ordrar.find((o) => o.id === id);
  return { m, sk, a, b, bestall, oa, ob, order };
}

const kort = (v) => { const s = JSON.stringify(v); return s.length > 160 ? s.slice(0, 157) + "…" : s; };
const resultat = [];

// Varje attack returnerar { anrop, svar, stoppad, bevis }. stoppad = det som inte skulle gå gick inte.
const ATTACKER = [
  // ---------- Utan nyckel ----------
  { grupp: "Utan nyckel", namn: "Läsa laglistan och leta efter personuppgifter",
    hur: "Hämtar den publika laglistan och statusen, som vem som helst kan göra, och letar efter barnnamn, mobilnummer och nycklar.",
    kor() {
      const { m, a } = klubb();
      const svar = { lag: m.get({ action: "lag" }), status: m.get({ action: "status", lag: "lag-a" }) };
      const txt = JSON.stringify(svar);
      const lacker = ["Alva", "Bertil", "0701111111", "070 111 11 11", "0702222222", a.key, a.key.replace(/-/g, ""), "hash", "mobil", "barn"].filter((s) => txt.includes(s));
      return { anrop: "GET ?action=lag och ?action=status&lag=lag-a", svar: kort(svar.status), stoppad: lacker.length === 0, bevis: lacker.length ? "läcker: " + lacker.join(", ") : "inga personuppgifter eller nycklar" };
    } },
  { grupp: "Utan nyckel", namn: "Läsa ett lags beställningar utan nyckel",
    hur: "Anropar adminvyns lista med tom nyckel och med en påhittad nyckel i rätt format.",
    kor() {
      const { m } = klubb();
      const s1 = m.admin("lag-a", "", "lista");
      const s2 = m.admin("lag-a", "0123-4567-89ab-cdef-0123-4567-89ab-cdef", "lista");
      return { anrop: "POST {action:admin, lag:lag-a, key:'' / påhittad, op:lista}", svar: kort(s2), stoppad: !s1.ok && !s2.ok && !s1.ordrar && !s2.ordrar, bevis: s1.fel + " / " + s2.fel };
    } },
  { grupp: "Utan nyckel", namn: "Anropa serverns interna funktioner",
    hur: "Skickar namn på interna funktioner som åtgärd (lasOrdrar, setup, hittaLag) och som GET-förfrågan.",
    kor(ctx) {
      const { m, a } = klubb();
      const svar = ["lasOrdrar", "setup", "hittaLag", "toString", "constructor", "__proto__"].map((op) => m.admin("lag-a", a.key, op));
      const get = m.get({ action: "setup" });
      // Varje svar ska vara ett vanligt felsvar. Ett svar utan ok:false kan betyda att en intern funktion faktiskt kördes.
      const ok = svar.every((s) => s && s.ok === false && typeof s.fel === "string" && !/[0-9a-f]{64}/.test(JSON.stringify(s))) && get.ok === false;
      return { anrop: "POST {op:'lasOrdrar' | 'setup' | 'constructor' | …} med giltig lagnyckel", svar: kort(svar[4]), stoppad: ok, bevis: svar.map((s) => s.fel).filter((v, i, x) => x.indexOf(v) === i).join(" / ") };
    } },

  // ---------- Någon annans lag ----------
  { grupp: "Någon annans lag", namn: "Lag A:s nyckel för att läsa lag B",
    hur: "Loggar in med lag A:s nyckel men byter lagets namn i anropet till lag B.",
    kor() {
      const { m, a } = klubb();
      const svar = m.admin("lag-b", a.key, "lista");
      return { anrop: "POST {lag:'lag-b', key:<lag A:s nyckel>, op:'lista'}", svar: kort(svar), stoppad: !svar.ok && !JSON.stringify(svar).includes("Bertil"), bevis: svar.fel };
    } },
  { grupp: "Någon annans lag", namn: "Markera lag B:s beställning som betald med lag A:s nyckel",
    hur: "Inloggad som lag A, med lag B:s ordernummer.",
    kor() {
      const { m, a, ob, order } = klubb();
      const svar = m.admin("lag-a", a.key, "satt", { id: ob.id, varde: "JA" });
      const efter = order("lag-b", ob.id);
      return { anrop: `POST {lag:'lag-a', op:'satt', id:'${ob.id}' (lag B:s), varde:'JA'}`, svar: kort(svar), stoppad: !svar.ok && efter.betald === "", bevis: "lag B:s order är fortfarande obetald" };
    } },
  { grupp: "Någon annans lag", namn: "Markera lag B:s beställning som hämtad, eller ta bort den, med lag A:s nyckel",
    hur: "Inloggad som lag A, med lag B:s ordernummer, först hämtad och sedan borttagen.",
    kor() {
      const { m, a, ob, order } = klubb();
      const s1 = m.admin("lag-a", a.key, "hamtad", { id: ob.id, varde: "JA" });
      const s2 = m.admin("lag-a", a.key, "taBort", { id: ob.id });
      const efter = order("lag-b", ob.id);
      return { anrop: `POST {lag:'lag-a', op:'hamtad' / 'taBort', id:'${ob.id}'}`, svar: kort(s2), stoppad: !s1.ok && !s2.ok && efter && efter.hamtad === "", bevis: "lag B:s order finns kvar och är inte hämtad" };
    } },

  // ---------- Mer behörighet ----------
  { grupp: "Mer behörighet", namn: "Lagföräldern godkänner sin egen försäljning",
    hur: "Lagförälderns nyckel anropar klubbadministratörens åtgärder: godkänna, skapa lag, ny nyckel, ta bort lag, ändra lag och se alla lag.",
    kor() {
      const { m, a } = klubb();
      const ops = [["godkann", { slug: "lag-a", till: "pagar" }], ["lagNy", { data: lagData({ namn: "Lag X" }) }], ["nyNyckel", { slug: "lag-b" }],
        ["lagTaBort", { slug: "lag-b" }], ["lagUppdatera", { slug: "lag-b", data: { status: "avslutad" } }], ["lagLista", {}]];
      const svar = ops.map(([op, x]) => m.admin("lag-a", a.key, op, x));
      const ok = svar.every((s) => !s.ok) && m.get({ action: "lag" }).lag.length === 2;
      return { anrop: "POST {lag:'lag-a', key:<lagnyckel>, op:'godkann' | 'lagNy' | 'nyNyckel' | 'lagTaBort' | 'lagUppdatera' | 'lagLista'}", svar: kort(svar[0]), stoppad: ok, bevis: svar[0].fel };
    } },
  { grupp: "Mer behörighet", namn: "Smyga in status, nyckel och radnummer när försäljningen sparas",
    hur: "Lagföräldern sparar sitt utkast och lägger till status:'pagar', slug, _hash och _rad i datan.",
    kor() {
      const { m, sk } = klubb();
      const u = m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag U", status: "utkast" }) });
      const hashFore = m.blad["Lag"].data.find((r) => r[0] === "lag-u").join("|");
      const svar = m.admin("lag-u", u.key, "lagSpara", { falt: { status: "pagar", slug: "lag-a", _hash: "0".repeat(64), _rad: 2, namn: "Lag A", pris: 30 } });
      const lag = m.get({ action: "lag" }).lag.find((l) => l.slug === "lag-u");
      const efter = m.blad["Lag"].data.find((r) => r[0] === "lag-u").join("|");
      const hashSamma = efter.split("|").filter((v) => /^[0-9a-f]{64}$/.test(v)).join() === hashFore.split("|").filter((v) => /^[0-9a-f]{64}$/.test(v)).join();
      return { anrop: "POST {op:'lagSpara', falt:{status:'pagar', slug:'lag-a', _hash:'000…', namn:'Lag A'}}", svar: kort({ ok: svar.ok, status: lag.status, namn: lag.namn }), stoppad: lag.status === "utkast" && lag.namn === "Lag U" && hashSamma, bevis: "status fortfarande utkast, namn och nyckel oförändrade" };
    } },
  { grupp: "Mer behörighet", namn: "Byta Swish-nummer efter att klubben har godkänt",
    hur: "Lagföräldern försöker ändra Swish-nummer och mottagare på en försäljning som pågår, till exempel till sitt eget nummer.",
    kor() {
      const { m, a } = klubb();
      const svar = m.admin("lag-a", a.key, "lagSpara", { falt: { swishNummer: "070 999 99 99", mottagare: "Någon annan" } });
      const lag = m.get({ action: "lag" }).lag.find((l) => l.slug === "lag-a");
      return { anrop: "POST {lag:'lag-a', op:'lagSpara', falt:{swishNummer:'070 999 99 99'}} när status är pagar", svar: kort(svar), stoppad: !svar.ok && JSON.stringify(lag).includes("123 456 78 90"), bevis: svar.fel };
    } },
  { grupp: "Mer behörighet", namn: "Använda den gamla nyckeln efter att klubben har gett laget en ny",
    hur: "Klubben skapar en ny nyckel för lag A (till exempel för att den gamla spridits). Den gamla prövas igen.",
    kor() {
      const { m, sk, a } = klubb();
      const ny = m.admin("*", sk, "nyNyckel", { slug: "lag-a" });
      const gammal = m.admin("lag-a", a.key, "lista");
      const nyFunkar = m.admin("lag-a", ny.key, "lista").ok;
      return { anrop: "POST {lag:'lag-a', key:<gamla nyckeln>, op:'lista'}", svar: kort(gammal), stoppad: !gammal.ok && nyFunkar, bevis: "gamla nyckeln: " + gammal.fel + ", nya nyckeln fungerar" };
    } },

  // ---------- Förbi knapparna ----------
  { grupp: "Förbi knapparna", namn: "Beställa från en försäljning som inte är öppen",
    hur: "Skickar en beställning direkt till lag som är utkast, väntar på granskning, startar snart eller är avslutade.",
    kor() {
      const { m, sk, bestall } = klubb();
      const st = ["utkast", "granskas", "snart", "avslutad"];
      st.forEach((s, i) => m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag S" + i, status: s, kommentar: "x" }) }));
      const svar = st.map((s, i) => bestall("lag-s" + i, { mobil: "070 300 00 0" + i }));
      const rader = m.blad["Beställningar"].getLastRow() - 1;
      return { anrop: "POST {lag:'lag-s0'…'lag-s3', barn, mobil, antal:2}", svar: kort(svar[3]), stoppad: svar.every((s) => !s.ok) && rader === 3, bevis: "inga nya rader i Beställningar" };
    } },
  { grupp: "Förbi knapparna", namn: "Ogiltiga antal",
    hur: "Antal 0, −5, 2,5, fler än max (21), 1e9, text och tomt.",
    kor() {
      const { m, bestall } = klubb();
      const varden = [0, -5, 2.5, 21, 1e9, "fem", "", null, "2; DROP TABLE"];
      const svar = varden.map((v, i) => bestall("lag-a", { antal: v, mobil: "070 400 00 0" + i }));
      const rader = m.blad["Beställningar"].getLastRow() - 1;
      return { anrop: "POST {lag:'lag-a', antal: 0 | -5 | 2.5 | 21 | 1e9 | 'fem' | '' | null}", svar: kort(svar[1]), stoppad: svar.every((s) => !s.ok) && rader === 3, bevis: svar[1].fel };
    } },
  { grupp: "Förbi knapparna", namn: "Skicka ett eget, lägre belopp",
    hur: "Lägger till belopp:1 och pris:1 i beställningen, i hopp om att servern använder det.",
    kor() {
      const { bestall } = klubb();
      const svar = bestall("lag-a", { antal: 3, belopp: 1, pris: 1, mobil: "070 500 00 00" });
      return { anrop: "POST {lag:'lag-a', antal:3, belopp:1, pris:1}", svar: kort(svar), stoppad: svar.ok && svar.belopp === 90, bevis: "servern räknade själv: 3 × 30 = " + svar.belopp + " kr" };
    } },
  { grupp: "Förbi knapparna", namn: "Beställa utan att godkänna villkoren, för snabbt, eller som robot",
    hur: "Utan samtycke, utan tidsstämpel, med t:100 (för snabbt) och med det dolda robotfältet ifyllt.",
    kor() {
      const { m, bestall } = klubb();
      const s1 = bestall("lag-a", { samtycke: false, mobil: "070 600 00 01" });
      const s2 = bestall("lag-a", { t: undefined, mobil: "070 600 00 02" });
      const s3 = bestall("lag-a", { t: 100, mobil: "070 600 00 03" });
      const s4 = bestall("lag-a", { website: "http://spam.example", mobil: "070 600 00 04" });
      const rader = m.blad["Beställningar"].getLastRow() - 1;
      return { anrop: "POST utan samtycke / utan t / t:100 / website:'http://…'", svar: kort(s4), stoppad: !s1.ok && !s2.ok && !s3.ok && rader === 3, bevis: "robotens beställning fick ett låtsas-svar och sparades inte" };
    } },
  { grupp: "Förbi knapparna", namn: "Många beställningar från samma mobilnummer",
    hur: "Skickar tio beställningar i rad med samma nummer.",
    kor() {
      const { m, bestall } = klubb();
      const svar = Array.from({ length: 10 }, () => bestall("lag-a", { mobil: "070 700 00 00" }));
      const gick = svar.filter((s) => s.ok).length;
      return { anrop: "10 × POST {lag:'lag-a', mobil:'070 700 00 00'}", svar: kort(svar[9]), stoppad: gick === m.ctx.CFG.MAX_PER_MOBIL, bevis: gick + " av 10 gick igenom, gränsen är " + m.ctx.CFG.MAX_PER_MOBIL };
    } },
  { grupp: "Förbi knapparna", namn: "20 beställningar på den sista lotten",
    hur: "Laget har 1 lott kvar. 20 föräldrar beställer, och varje beställning hinner läsas medan nästa väntar på låset. (Simulerat: riktiga Google behövs för att bevisa exakt samtidighet.)",
    kor() {
      const { m, sk, bestall } = klubb();
      m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag L", lager: 3, minimum: 0 }) });
      bestall("lag-l", { antal: 2, mobil: "070 800 00 99" });   // 1 kvar
      let i = 0; const svar = [];
      m.hooks.vidLas = () => { if (i < 19) { i++; svar.push(bestall("lag-l", { antal: 1, mobil: "070 81" + String(i).padStart(5, "0").slice(0, 2) + " " + String(i).padStart(5, "0").slice(2) })); } };
      svar.push(bestall("lag-l", { antal: 1, mobil: "070 899 99 99" }));
      m.hooks.vidLas = null;
      const gick = svar.filter((s) => s.ok).length;
      const sald = m.admin("*", sk, "lagLista").lag.find((l) => l.slug === "lag-l");
      return { anrop: "20 × POST {lag:'lag-l', antal:1} när 1 finns kvar", svar: kort(svar.find((s) => !s.ok)), stoppad: gick === 1, bevis: gick + " av 20 gick igenom (simulerat)" };
    } },

  // ---------- Konstiga värden ----------
  { grupp: "Konstiga värden", namn: "HTML och skript i barnets namn",
    hur: "Barnets namn är <img src=x onerror=alert(1)>, <script>alert(1)</script> och javascript:alert(1).",
    kor() {
      const { m, bestall } = klubb();
      const svar = ["<img src=x onerror=alert(1)>", "<script>alert(1)</script>", "javascript:alert(1)", "Emil\"><svg onload=alert(1)>"].map((barn, i) => bestall("lag-a", { barn, mobil: "070 900 00 0" + i }));
      const rader = m.blad["Beställningar"].getLastRow() - 1;
      return { anrop: "POST {barn:'<img src=x onerror=alert(1)>'}", svar: kort(svar[0]), stoppad: svar.every((s) => !s.ok) && rader === 3, bevis: svar[0].fel };
    } },
  { grupp: "Konstiga värden", namn: "Formler i kalkylarket",
    hur: "Barnets namn och lagförälderns texter börjar med =, +, - eller @, till exempel =HYPERLINK(\"http://ond.example\").",
    kor() {
      const { m, sk, bestall } = klubb();
      const s1 = bestall("lag-a", { barn: "=HYPERLINK(\"http://ond.example\";\"Klicka\")", mobil: "070 910 00 00" });
      const u = m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag F", status: "utkast" }) });
      m.admin("lag-f", u.key, "lagSpara", { falt: { produkt: "=IMPORTXML(\"http://ond.example\")", detalj: "+cmd|' /C calc'!A0", intro: "@SUM(1+1)" } });
      const rad = m.blad["Lag"].data.find((r) => r[0] === "lag-f");
      const formler = rad.filter((v) => typeof v === "string" && /^[=+\-@]/.test(v));
      return { anrop: "POST {barn:'=HYPERLINK(…)'} och lagSpara {produkt:'=IMPORTXML(…)'}", svar: kort({ order: s1.fel, sparat: rad.slice(7, 10) }), stoppad: !s1.ok && formler.length === 0, bevis: "inget värde i kalkylarket börjar med = + - @" };
    } },
  { grupp: "Konstiga värden", namn: "Mycket lång text och tomma värden",
    hur: "Barnets namn på 100 000 tecken, tomt namn, tomt mobilnummer och mobilnummer med bokstäver.",
    kor() {
      const { m, bestall } = klubb();
      const svar = [bestall("lag-a", { barn: "A".repeat(100000), mobil: "070 920 00 01" }), bestall("lag-a", { barn: "", mobil: "070 920 00 02" }),
        bestall("lag-a", { mobil: "" }), bestall("lag-a", { mobil: "070 abc de fg" }), bestall("lag-a", { barn: "   ", mobil: "070 920 00 03" })];
      const rader = m.blad["Beställningar"].getLastRow() - 1;
      return { anrop: "POST {barn:'AAAA…' (100 000 tecken)} m.fl.", svar: kort(svar[0]), stoppad: svar.every((s) => !s.ok) && rader === 3, bevis: "inga nya rader" };
    } },
  { grupp: "Konstiga värden", namn: "Trasig förfrågan",
    hur: "Skickar text som inte är JSON, en tom förfrågan och JSON som är en lista.",
    kor() {
      const { m } = klubb();
      const svar = ["{inte json", "", "[1,2,3]", "null"].map((t) => m.postRaw(t));
      return { anrop: "POST '{inte json' / '' / '[1,2,3]' / 'null'", svar: kort(svar[0]), stoppad: svar.every((s) => s && s.ok === false && typeof s.fel === "string"), bevis: "kontrollerat felsvar, ingen krasch" };
    } },
  { grupp: "Konstiga värden", namn: "Pris med ören ger ett exakt belopp",
    hur: "Laget sätter priset 19,90 kr. En förälder beställer 3. Beloppet ska bli 59,70, inte 59,699999999999996, eftersom det kopieras in i Swish.",
    kor() {
      const { m, sk, bestall } = klubb();
      m.admin("*", sk, "lagNy", { data: lagData({ namn: "Lag P", pris: 19.9 }) });
      const svar = bestall("lag-p", { antal: 3, mobil: "070 930 00 00" });
      const rad = m.blad["Beställningar"].data[m.blad["Beställningar"].getLastRow() - 1];
      return { anrop: "POST {lag:'lag-p', antal:3} med pris 19,90", svar: kort(svar), stoppad: svar.belopp === 59.7 && rad[6] === 59.7, bevis: "belopp: " + svar.belopp };
    } },

  // ---------- Mellanlagring ----------
  { grupp: "Mellanlagring", namn: "Personuppgifter i det som sparas tillfälligt",
    hur: "Efter beställningar och adminanrop: letar efter barnnamn och mobilnummer i allt servern har sparat tillfälligt (cachen), som delas mellan alla besökare.",
    kor() {
      const { m, a } = klubb();
      m.admin("lag-a", a.key, "lista"); m.admin("lag-a", a.key, "oversikt"); m.get({ action: "lag" });
      m.post({ lag: "lag-a", barn: "Cecilia", mobil: "070 940 00 00", antal: 1, samtycke: true, website: "", t: 5000, kod: "kod-0123456789" });
      const allt = JSON.stringify([...m.cache.entries()]);
      const lacker = ["Alva", "Bertil", "Cecilia", "0701111111", "0709400000", "070 111 11 11", a.key.replace(/-/g, "")].filter((s) => allt.includes(s));
      return { anrop: "POST lista, oversikt, beställning; GET lag; sedan läses cachen", svar: kort([...m.cache.keys()]), stoppad: lacker.length === 0, bevis: lacker.length ? "läcker: " + lacker.join(", ") : "bara laglistan, antal, ordernummer och belopp" };
    } },
  { grupp: "Mellanlagring", namn: "Gissa nycklar utan att låsa ute den rätta",
    hur: "Hundra felaktiga nycklar mot lag A. Därefter ska den rätta nyckeln fortfarande fungera, och felaktiga ska stoppas.",
    kor() {
      const { m, a } = klubb();
      for (let i = 0; i < 100; i++) m.admin("lag-a", i.toString(16).padStart(32, "0"), "lista");
      const fel = m.admin("lag-a", "f".repeat(32), "lista");
      const ratt = m.admin("lag-a", a.key, "lista");
      return { anrop: "100 × POST {lag:'lag-a', key:<fel nyckel>}", svar: kort(fel), stoppad: !fel.ok && /många/i.test(fel.fel) && ratt.ok, bevis: "spärren slog till, och rätt nyckel kom ändå in" };
    } },
];

for (const a of ATTACKER) {
  test(`[${a.grupp}] ${a.namn}`, () => {
    const r = a.kor();
    resultat.push({ ...a, ...r });
    assert.ok(r.stoppad, "attacken lyckades: " + r.bevis + " | svar: " + r.svar);
  });
}

test.after(() => {
  const fil = process.env.ATTACK_RAPPORT;
  if (!fil) return;
  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rader = resultat.map((r, i) => `| ${i + 1} | ${cell(r.grupp)} | ${cell(r.namn)} | ${cell(r.hur)} | \`${cell(r.anrop)}\` | \`${cell(r.svar)}\` | ${r.stoppad ? "Stoppad" : "**LYCKADES**"}: ${cell(r.bevis)} |`);
  fs.writeFileSync(fil, `| # | Grupp | Attack | Hur | Anrop | Svar | Resultat |\n|---|---|---|---|---|---|---|\n${rader.join("\n")}\n`);
});
