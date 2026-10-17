/* Attacktester mot servern. Kör: node --test test/attack.test.js
   Varje attack försöker göra något som inte ska gå: läsa ett annat lags eller en annan klubbs uppgifter, ge sig själv mer behörighet,
   gå förbi knapparna på sidan, skicka konstiga värden, ta sig in som klubbadministratör eller skicka in kod i fälten.
   Testet går igenom när attacken stoppas. Att attacken verkligen stoppades visas av effekten (databasen, svaren), inte bara av ett felsvar.

   Allt körs mot den riktiga servern och en riktig D1 lokalt (se miljo.js). Det som bara går att bevisa mot riktiga Cloudflare står i
   PLAN-gemensam-server.md (lasttest mot en riktig D1 innan skarp drift).

   Tabell över resultatet: ATTACK_RAPPORT=attackrapport.md node --test test/attack.test.js
   Bevis för att testerna biter: kör dem mot en kopia av servern där ett skydd är bortkopplat (SERVER_DIR=sökväg). Se test/mutera.js. */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { skapaMiljo, lagData, ADMIN_EPOST, CFG, ORIGIN } from "./miljo.js";

const KL = "testklubben";
let m;
before(async () => { m = await skapaMiljo(); });
after(async () => { await m.stang(); });

// En klubb med två lag som säljer, med varsin beställning. Klubbens administratör är inloggad.
async function klubb() {
  await m.nollstall();
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] });
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const H = m.somAdmin(li.kaka);
  const sk = (op, extra, slug = "*", kl = KL) => m.admin(kl, slug, "", op, extra, H);
  const a = await m.nyttLag(KL, lagData({ namn: "Lag A" }));
  const b = await m.nyttLag(KL, lagData({ namn: "Lag B" }));
  assert.ok(a.ok && b.ok, "uppsättningen misslyckades");
  const bestall = (lag, o = {}, kl = KL) => m.post({ klubb: kl, lag, barn: "Emil", mobil: "070 123 45 67", antal: 2, samtycke: true, website: "", t: 5000, ...o });
  const oa = await bestall("lag-a", { barn: "Alva", mobil: "070 111 11 11" });
  // Ordernumren räknas per lag. Lag B får två beställningar, så att lag B:s 0002 inte finns hos lag A.
  await bestall("lag-b", { barn: "Berit", mobil: "070 222 22 21" });
  const ob = await bestall("lag-b", { barn: "Bertil", mobil: "070 222 22 22" });
  assert.ok(oa.ok && ob.ok, "beställningarna misslyckades");
  const order = async (slug, id) => (await m.admin(KL, slug, slug === "lag-a" ? a.key : b.key, "lista")).ordrar.find((o) => o.id === id);
  return { H, sk, a, b, bestall, oa, ob, order, kaka: li.kaka };
}

const kort = (v) => { const s = JSON.stringify(v); return s.length > 160 ? s.slice(0, 157) + "…" : s; };
const resultat = [];
const antal = async (tabell) => (await m.rader(tabell)).length;
const SQLINJ = ["'; DROP TABLE lag; --", "\" OR 1=1 --", "x' OR '1'='1", "1; DELETE FROM bestallning", "') UNION SELECT nyckel_hash FROM lag --", "Robert'); DROP TABLE klubb;--"];

// Varje attack returnerar { anrop, svar, stoppad, bevis }. stoppad = det som inte skulle gå gick inte.
const ATTACKER = [
  // ---------- Utan nyckel ----------
  { grupp: "Utan nyckel", namn: "Läsa laglistan och leta efter personuppgifter",
    hur: "Hämtar den publika laglistan och statusen, som vem som helst kan göra, och letar efter barnnamn, mobilnummer, nycklar och interna fält.",
    async kor() {
      const { a } = await klubb();
      const svar = { lag: await m.get({ action: "lag", klubb: KL }), status: await m.get({ action: "status", klubb: KL, lag: "lag-a" }) };
      const txt = JSON.stringify(svar);
      const lacker = ["Alva", "Bertil", "0701111111", "070 111 11 11", "0702222222", a.key, a.key.replace(/-/g, ""), "hash", "mobil", "barn", "klubb_id", "lag_id", "nasta_order"].filter((s) => txt.includes(s));
      return { anrop: "GET ?action=lag&klubb=… och ?action=status&klubb=…&lag=lag-a", svar: kort(svar.status), stoppad: lacker.length === 0, bevis: lacker.length ? "läcker: " + lacker.join(", ") : "inga personuppgifter eller nycklar" };
    } },
  { grupp: "Utan nyckel", namn: "Läsa ett lags beställningar utan nyckel",
    hur: "Anropar adminvyns lista med tom nyckel och med en påhittad nyckel i rätt format.",
    async kor() {
      await klubb();
      const s1 = await m.admin(KL, "lag-a", "", "lista");
      const s2 = await m.admin(KL, "lag-a", "0123-4567-89ab-cdef-0123-4567-89ab-cdef", "lista");
      return { anrop: "POST {action:admin, klubb, lag:lag-a, key:'' / påhittad, op:lista}", svar: kort(s2), stoppad: !s1.ok && !s2.ok && !s1.ordrar && !s2.ordrar, bevis: s1.fel + " / " + s2.fel };
    } },
  { grupp: "Utan nyckel", namn: "Anropa serverns interna funktioner",
    hur: "Skickar namn på interna funktioner och på objektets inbyggda egenskaper som åtgärd, och som GET-förfrågan.",
    async kor() {
      const { a, kaka } = await klubb();
      const ops = ["hittaLag", "lasOrdrar", "setup", "toString", "constructor", "__proto__", "hasOwnProperty", "valueOf", "prototype"];
      const svar = [];
      for (const op of ops) svar.push(await m.admin(KL, "lag-a", a.key, op));
      for (const op of ops) svar.push(await m.admin(KL, "*", "", op, {}, m.somAdmin(kaka)));
      const get = await m.get({ action: "setup" });
      // Varje svar ska vara exakt felet "Okänd åtgärd.". Något annat kan betyda att en intern funktion faktiskt kördes.
      const ok = svar.every((s) => s && s.ok === false && s.fel === "Okänd åtgärd.") && get.ok === false;
      return { anrop: "POST {op:'hittaLag' | 'setup' | 'constructor' | '__proto__' | …} med giltig lagnyckel och som klubbadministratör", svar: kort(svar[3]), stoppad: ok, bevis: [...new Set(svar.map((s) => s.fel))].join(" / ") };
    } },

  // ---------- Någon annans lag ----------
  { grupp: "Någon annans lag", namn: "Lag A:s nyckel för att läsa lag B",
    hur: "Loggar in med lag A:s nyckel men byter lagets namn i anropet till lag B.",
    async kor() {
      const { a } = await klubb();
      const svar = await m.admin(KL, "lag-b", a.key, "lista");
      return { anrop: "POST {lag:'lag-b', key:<lag A:s nyckel>, op:'lista'}", svar: kort(svar), stoppad: !svar.ok && !JSON.stringify(svar).includes("Bertil"), bevis: svar.fel };
    } },
  { grupp: "Någon annans lag", namn: "Markera lag B:s beställning som betald med lag A:s nyckel",
    hur: "Inloggad som lag A, med lag B:s ordernummer.",
    async kor() {
      const { a, ob, order } = await klubb();
      const svar = await m.admin(KL, "lag-a", a.key, "satt", { id: ob.id, varde: "JA" });
      const efter = await order("lag-b", ob.id);
      return { anrop: `POST {lag:'lag-a', op:'satt', id:'${ob.id}' (lag B:s), varde:'JA'}`, svar: kort(svar), stoppad: !svar.ok && efter.betald === "", bevis: "lag B:s order är fortfarande obetald" };
    } },
  { grupp: "Någon annans lag", namn: "Markera lag B:s beställning som hämtad, eller ta bort den, med lag A:s nyckel",
    hur: "Inloggad som lag A, med lag B:s ordernummer, först hämtad och sedan borttagen.",
    async kor() {
      const { a, ob, order } = await klubb();
      const s1 = await m.admin(KL, "lag-a", a.key, "hamtad", { id: ob.id, varde: "JA" });
      const s2 = await m.admin(KL, "lag-a", a.key, "taBort", { id: ob.id });
      const efter = await order("lag-b", ob.id);
      return { anrop: `POST {lag:'lag-a', op:'hamtad' / 'taBort', id:'${ob.id}'}`, svar: kort(s2), stoppad: !s1.ok && !s2.ok && efter && efter.hamtad === "", bevis: "lag B:s order finns kvar och är inte hämtad" };
    } },
  { grupp: "Någon annans lag", namn: "Samma ordernummer i två lag: ändringen i det egna laget rör inte det andra",
    hur: "Lag A och lag B har båda en order 0001. Lag A markerar sin 0001 som betald och hämtad, och tar sedan bort den. Lag B:s 0001 ska inte röras.",
    async kor() {
      const { a, b, order } = await klubb();
      await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: "JA" });
      await m.admin(KL, "lag-a", a.key, "hamtad", { id: "0001", varde: "JA" });
      const bEfterMarkering = await order("lag-b", "0001");
      await m.admin(KL, "lag-a", a.key, "hamtad", { id: "0001", varde: "" });
      await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: "" });
      await m.admin(KL, "lag-a", a.key, "taBort", { id: "0001" });
      const bEfterBorttagning = await order("lag-b", "0001");
      const ok = bEfterMarkering.betald === "" && bEfterMarkering.hamtad === "" && !!bEfterBorttagning;
      return { anrop: "POST {lag:'lag-a', op:'satt' / 'hamtad' / 'taBort', id:'0001'}", svar: kort({ lagB: bEfterMarkering }), stoppad: ok, bevis: "lag B:s order 0001 är orörd och finns kvar" };
    } },
  { grupp: "Någon annans lag", namn: "En annan klubb med samma lagnamn",
    hur: "Klubb 2 har också ett lag-a, med egen nyckel och egna beställningar. Lag A:s nyckel och klubb 1:s administratör försöker nå klubb 2:s lag-a, och tvärtom.",
    async kor() {
      const { a, kaka } = await klubb();
      await m.skapaKlubb("klubb2", "Klubb 2", { admins: ["annan@klubb2.example"] });
      const a2 = await m.nyttLag("klubb2", lagData({ namn: "Lag A" }));
      await m.post({ klubb: "klubb2", lag: "lag-a", barn: "Karin", mobil: "070 333 33 33", antal: 1, samtycke: true, website: "", t: 5000 });
      const s1 = await m.admin("klubb2", "lag-a", a.key, "lista");                    // klubb 1:s lagnyckel mot klubb 2
      const s2 = await m.admin("klubb2", "lag-a", "", "lista", {}, m.somAdmin(kaka));    // klubb 1:s administratör mot klubb 2
      const s3 = await m.admin(KL, "lag-a", a2.key, "lista");                         // klubb 2:s lagnyckel mot klubb 1
      const lista1 = JSON.stringify(await m.get({ action: "lag", klubb: KL })), lista2 = JSON.stringify(await m.get({ action: "lag", klubb: "klubb2" }));
      const ok = !s1.ok && !s2.ok && !s3.ok && !JSON.stringify([s1, s2, s3]).includes("Karin") && !JSON.stringify([s1, s2, s3]).includes("Alva")
        && !lista2.includes("lag-b");
      return { anrop: "POST {klubb:'klubb2', lag:'lag-a', key:<klubb 1:s nyckel>} och tvärtom, och som klubb 1:s administratör", svar: kort(s1), stoppad: ok, bevis: "inga uppgifter lämnar sin klubb" };
    } },

  // ---------- Mer behörighet ----------
  { grupp: "Mer behörighet", namn: "Lagföräldern gör klubbens jobb",
    hur: "Lagförälderns nyckel anropar klubbadministratörens åtgärder: godkänna, stoppa, skicka tillbaka, ny nyckel, ta bort lag, se alla lag, kvittera pengarna och byta klubbens bankgiro.",
    async kor() {
      const { a } = await klubb();
      const u = await m.nyttLag(KL, lagData({ namn: "Lag U", status: "utkast" }));
      await m.db.prepare("UPDATE lag SET status = 'granskas' WHERE slug = 'lag-u'").run();
      const ops = [["godkann", { slug: "lag-u" }], ["stoppa", { slug: "lag-b", kommentar: "x" }], ["nyNyckel", { slug: "lag-b" }],
        ["lagTaBort", { slug: "lag-u" }], ["lagLista", {}], ["skickaTillbaka", { slug: "lag-u", kommentar: "x" }],
        ["pengarMottagna", { slug: "lag-a", ja: true }], ["klubbSpara", { bankgiro: "9999-9999" }]];
      const svar = [];
      for (const [op, x] of ops) svar.push(await m.admin(KL, "lag-a", a.key, op, x));
      const rader = await m.rader("lag"), st = (slug) => rader.find((r) => r.slug === slug).status;
      const ok = svar.every((s) => !s.ok) && rader.length === 3 && st("lag-u") === "granskas" && st("lag-b") === "pagar"
        && (await m.admin(KL, "lag-u", u.key, "oversikt")).ok && (await m.rader("klubb"))[0].bankgiro === "";
      return { anrop: "POST {lag:'lag-a', key:<lagnyckel>, op:'godkann' | 'stoppa' | 'nyNyckel' | 'lagTaBort' | 'lagLista' | 'skickaTillbaka'}", svar: kort(svar[0]), stoppad: ok, bevis: svar[0].fel };
    } },
  { grupp: "Mer behörighet", namn: "Klubbens administratör ändrar försäljningens uppgifter",
    hur: "Inloggad som klubbens administratör: byter Swish-nummer och pris i ett lags utkast, öppnar, avslutar och öppnar för ändring i stället för lagföräldern, bockar av och tar bort beställningar, och markerar lagets pengar som skickade.",
    async kor() {
      const { sk } = await klubb();
      await m.nyttLag(KL, lagData({ namn: "Lag U", status: "utkast" }));
      const fore = [await m.rader("lag"), await m.rader("bestallning")];
      const svar = [await sk("lagSpara", { falt: { swishNummer: "070 999 99 99", pris: 1 } }, "lag-u"), await sk("lagSpara", { slug: "lag-a", falt: { swishNummer: "070 999 99 99" } }, "lag-a"),
        await sk("avsluta", {}, "lag-a"), await sk("andra", {}, "lag-b"), await sk("oppna", {}, "lag-u"),
        await sk("satt", { id: "0001", varde: "JA" }, "lag-a"), await sk("hamtadAlla", {}, "lag-a"), await sk("taBort", { id: "0001" }, "lag-b"), await sk("pengarSkickade", { ja: true }, "lag-a")];
      const efter = [await m.rader("lag"), await m.rader("bestallning")];
      const orort = JSON.stringify(efter) === JSON.stringify(fore);
      return { anrop: "POST {op:'lagSpara' | 'avsluta' | 'andra' | 'oppna' | 'satt' | 'taBort' | 'pengarSkickade'} med klubbadministratörens cookie", svar: kort(svar[0]), stoppad: svar.every((s) => !s.ok) && orort, bevis: svar[0].fel };
    } },
  { grupp: "Mer behörighet", namn: "Öppna en försäljning som klubben inte har godkänt",
    hur: "Lagföräldern väljer Öppna på ett utkast, på en försäljning som väntar på granskning och på en som klubben har stoppat, och på en som hen själv öppnat för ändring och bytt Swish-nummer i.",
    async kor() {
      const { sk, a, b, bestall } = await klubb();
      const u = await m.nyttLag(KL, lagData({ namn: "Lag U", status: "utkast" }));
      const g = await m.nyttLag(KL, lagData({ namn: "Lag G", status: "utkast" }));
      await m.db.prepare("UPDATE lag SET status = 'granskas' WHERE slug = 'lag-g'").run();
      await sk("stoppa", { slug: "lag-a", kommentar: "Fel Swish-nummer" });
      await m.admin(KL, "lag-b", b.key, "andra");
      await m.admin(KL, "lag-b", b.key, "lagSpara", { falt: { swishNummer: "070 999 99 99" } });
      const svar = [await m.admin(KL, "lag-u", u.key, "oppna"), await m.admin(KL, "lag-g", g.key, "oppna"), await m.admin(KL, "lag-a", a.key, "oppna"), await m.admin(KL, "lag-b", b.key, "oppna")];
      const rader = await m.rader("lag"), st = (slug) => rader.find((r) => r.slug === slug).status;
      const lista = JSON.stringify(await m.get({ action: "lag", klubb: KL }));
      const nya = [await bestall("lag-a", { mobil: "070 310 00 01" }), await bestall("lag-b", { mobil: "070 310 00 02" })];
      const ok = svar.every((s) => !s.ok) && st("lag-u") === "utkast" && st("lag-g") === "granskas" && st("lag-a") === "utkast" && st("lag-b") === "utkast"
        && !lista.includes("999 99 99") && nya.every((s) => !s.ok) && (await antal("bestallning")) === 3;
      return { anrop: "POST {op:'oppna'} för utkast, granskas, stoppad och ändrad försäljning", svar: kort(svar[2]), stoppad: ok, bevis: svar[0].fel };
    } },
  { grupp: "Mer behörighet", namn: "Smyga in status, nyckel, adress och räknare när försäljningen sparas",
    hur: "Lagföräldern sparar sitt utkast och lägger till status, slug, nyckelns hash, id, klubb och ordernummer i datan, även som kolumnnamn i en SQL-liknande text.",
    async kor() {
      const { sk } = await klubb();
      const u = await m.nyttLag(KL, lagData({ namn: "Lag U", status: "utkast" }));
      const fore = (await m.rader("lag")).find((r) => r.slug === "lag-u");
      const svar = await m.admin(KL, "lag-u", u.key, "lagSpara", { falt: { status: "pagar", slug: "lag-a", nyckel_hash: "0".repeat(64), id: 1, klubb_id: 2, nasta_order: 900, namn: "Lag A", pris: 30,
        "pris = 0, nyckel_hash": "x", "__proto__": { status: "pagar" }, constructor: { prototype: { status: "pagar" } } } });
      const efter = (await m.rader("lag")).find((r) => r.id === fore.id);
      const orort = ["status", "slug", "nyckel_hash", "id", "klubb_id", "nasta_order", "namn"].every((f) => efter[f] === fore[f]);
      return { anrop: "POST {op:'lagSpara', falt:{status:'pagar', slug:'lag-a', nyckel_hash:'000…', id:1, klubb_id:2, nasta_order:900}}", svar: kort({ ok: svar.ok, status: efter.status }), stoppad: orort, bevis: "status, adress, nyckel, id, klubb och ordernummer är oförändrade" };
    } },
  { grupp: "Mer behörighet", namn: "Byta Swish-nummer efter att klubben har godkänt",
    hur: "Lagföräldern försöker ändra Swish-nummer och mottagare på en försäljning som pågår, till exempel till sitt eget nummer.",
    async kor() {
      const { a } = await klubb();
      const svar = await m.admin(KL, "lag-a", a.key, "lagSpara", { falt: { swishNummer: "070 999 99 99", mottagare: "Någon annan" } });
      const lag = (await m.get({ action: "lag", klubb: KL })).lag.find((l) => l.slug === "lag-a");
      return { anrop: "POST {lag:'lag-a', op:'lagSpara', falt:{swishNummer:'070 999 99 99'}} när status är pagar", svar: kort(svar), stoppad: !svar.ok && JSON.stringify(lag).includes("123 456 78 90") && !JSON.stringify(lag).includes("999 99 99"), bevis: svar.fel };
    } },
  { grupp: "Mer behörighet", namn: "Använda den gamla nyckeln efter att klubben har gett laget en ny",
    hur: "Klubben skapar en ny nyckel för lag A (till exempel för att den gamla spridits). Den gamla prövas igen.",
    async kor() {
      const { sk, a } = await klubb();
      const ny = await sk("nyNyckel", { slug: "lag-a" });
      const gammal = await m.admin(KL, "lag-a", a.key, "lista");
      const nyFunkar = (await m.admin(KL, "lag-a", ny.key, "lista")).ok;
      return { anrop: "POST {lag:'lag-a', key:<gamla nyckeln>, op:'lista'}", svar: kort(gammal), stoppad: !gammal.ok && nyFunkar, bevis: "gamla nyckeln: " + gammal.fel + ", nya nyckeln fungerar" };
    } },
  { grupp: "Mer behörighet", namn: "Använda ett lags nyckel när klubben har stängts av",
    hur: "Skramlat stänger av klubben. Lagets nyckel och beställningssidan prövas igen.",
    async kor() {
      const { a, bestall } = await klubb();
      await m.db.prepare("UPDATE klubb SET status = 'avstangd'").run();
      const s1 = await m.admin(KL, "lag-a", a.key, "lista");
      const s2 = await bestall("lag-a", { mobil: "070 444 44 44" });
      const s3 = await m.get({ action: "lag", klubb: KL });
      return { anrop: "POST {lag:'lag-a', key:<lagnyckel>} och beställning efter avstängning", svar: kort(s1), stoppad: !s1.ok && !s2.ok && !s3.ok && (await antal("bestallning")) === 3, bevis: "inget går att göra i en avstängd klubb" };
    } },

  // ---------- Förbi knapparna ----------
  { grupp: "Förbi knapparna", namn: "Beställa från en försäljning som inte är öppen",
    hur: "Skickar en beställning direkt till lag som är utkast, väntar på granskning, startar snart eller är avslutade.",
    async kor() {
      const { sk, bestall } = await klubb();
      const st = ["utkast", "granskas", "snart", "avslutad"];
      for (const [i, s] of st.entries()) {
        const ny = await m.nyttLag(KL, lagData({ namn: "Lag S" + i, status: s === "granskas" ? "utkast" : s }));
        if (s === "granskas") await m.db.prepare("UPDATE lag SET status = 'granskas' WHERE slug = ?1").bind(ny.slug).run();
      }
      const svar = [];
      for (const [i] of st.entries()) svar.push(await bestall("lag-s" + i, { mobil: "070 300 00 0" + i }));
      return { anrop: "POST {lag:'lag-s0'…'lag-s3', barn, mobil, antal:2}", svar: kort(svar[3]), stoppad: svar.every((s) => !s.ok) && (await antal("bestallning")) === 3, bevis: "inga nya rader i beställningar" };
    } },
  { grupp: "Förbi knapparna", namn: "Beställa i en klubb som väntar på godkännande eller är avstängd",
    hur: "En klubb som väntar har ett lag som administratören satt som öppet. Beställningar skickas direkt till servern.",
    async kor() {
      await klubb();
      await m.skapaKlubb("vantar", "Väntar", { status: "vantar" });
      await m.db.prepare(`INSERT INTO lag (klubb_id, slug, namn, status, swish_nummer, mottagare, pris, minimum, mal, nyckel_hash, produkt, enhet_en, enhet)
        SELECT id, 'lag-v', 'Lag V', 'pagar', '070 123 45 67', 'x', 30, 10, 50, 'h', 'Kakor', 'kaka', 'kakor' FROM klubb WHERE slug = 'vantar'`).run();
      const svar = await m.post({ klubb: "vantar", lag: "lag-v", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 });
      const lista = await m.get({ action: "lag", klubb: "vantar" });
      return { anrop: "POST {klubb:'vantar', lag:'lag-v', antal:1}", svar: kort(svar), stoppad: !svar.ok && !lista.ok && (await antal("bestallning")) === 3, bevis: "inga nya rader, och klubben syns inte" };
    } },
  { grupp: "Förbi knapparna", namn: "Ogiltiga antal",
    hur: "Antal 0, −5, 2,5, fler än max (21), 1e9, text och tomt.",
    async kor() {
      const { bestall } = await klubb();
      const varden = [0, -5, 2.5, 21, 1e9, "fem", "", null, "2; DROP TABLE lag", [1], { a: 1 }, true];
      const svar = [];
      for (const [i, v] of varden.entries()) svar.push(await bestall("lag-a", { antal: v, mobil: "070 400 00 " + String(i).padStart(2, "0") }));
      return { anrop: "POST {lag:'lag-a', antal: 0 | -5 | 2.5 | 21 | 1e9 | 'fem' | '' | null}", svar: kort(svar[1]), stoppad: svar.every((s) => !s.ok) && (await antal("bestallning")) === 3, bevis: svar[1].fel };
    } },
  { grupp: "Förbi knapparna", namn: "Skicka ett eget, lägre belopp",
    hur: "Lägger till belopp:1, pris:1, lag_id och klubb_id i beställningen, i hopp om att servern använder det.",
    async kor() {
      const { bestall } = await klubb();
      const svar = await bestall("lag-a", { antal: 3, belopp: 1, pris: 1, lag_id: 2, klubb_id: 2, nr: 99, betald: "JA", mobil: "070 500 00 00" });
      const rad = (await m.rader("bestallning")).pop();
      return { anrop: "POST {lag:'lag-a', antal:3, belopp:1, pris:1, nr:99, betald:'JA'}", svar: kort(svar), stoppad: svar.ok && svar.belopp === 90 && rad.belopp === 90 && rad.nr === 2 && rad.betald === "", bevis: "servern räknade själv: 3 × 30 = " + svar.belopp + " kr, och ordernumret och betalningen sattes av servern" };
    } },
  { grupp: "Förbi knapparna", namn: "Beställa utan att godkänna villkoren, för snabbt, eller som robot",
    hur: "Utan samtycke, utan tidsstämpel, med t:100 (för snabbt) och med det dolda robotfältet ifyllt.",
    async kor() {
      const { bestall } = await klubb();
      const s1 = await bestall("lag-a", { samtycke: false, mobil: "070 600 00 01" });
      const s2 = await bestall("lag-a", { t: undefined, mobil: "070 600 00 02" });
      const s3 = await bestall("lag-a", { t: 100, mobil: "070 600 00 03" });
      const s4 = await bestall("lag-a", { website: "http://spam.example", mobil: "070 600 00 04" });
      return { anrop: "POST utan samtycke / utan t / t:100 / website:'http://…'", svar: kort(s4), stoppad: !s1.ok && !s2.ok && !s3.ok && (await antal("bestallning")) === 3, bevis: "robotens beställning fick ett låtsas-svar och sparades inte" };
    } },
  { grupp: "Förbi knapparna", namn: "Många beställningar från samma mobilnummer",
    hur: "Skickar tio beställningar i rad med samma nummer.",
    async kor() {
      const { bestall } = await klubb();
      const svar = [];
      for (let i = 0; i < 10; i++) svar.push(await bestall("lag-a", { mobil: "070 700 00 00" }));
      const gick = svar.filter((s) => s.ok).length;
      return { anrop: "10 × POST {lag:'lag-a', mobil:'070 700 00 00'}", svar: kort(svar[9]), stoppad: gick === CFG.MAX_PER_MOBIL, bevis: gick + " av 10 gick igenom, gränsen är " + CFG.MAX_PER_MOBIL };
    } },
  { grupp: "Förbi knapparna", namn: "20 beställningar samtidigt på den sista lotten",
    hur: "Laget har 1 lott kvar. 20 föräldrar beställer exakt samtidigt (alla anrop skickas på en gång mot en riktig D1 lokalt). Lasttest mot riktiga Cloudflare återstår innan skarp drift.",
    async kor() {
      const { sk, bestall } = await klubb();
      await m.nyttLag(KL, lagData({ namn: "Lag L", lager: 3, minimum: 0 }));
      await bestall("lag-l", { antal: 2, mobil: "070 800 00 99" });   // 1 kvar
      const svar = await Promise.all(Array.from({ length: 20 }, (_, i) => bestall("lag-l", { antal: 1, mobil: "070" + String(8100000 + i) })));
      const gick = svar.filter((s) => s.ok).length;
      return { anrop: "20 × POST {lag:'lag-l', antal:1} samtidigt när 1 finns kvar", svar: kort(svar.find((s) => !s.ok)), stoppad: gick === 1, bevis: gick + " av 20 gick igenom" };
    } },
  { grupp: "Förbi knapparna", namn: "Markera en obetald beställning som hämtad",
    hur: "Lagföräldern skickar hämtad direkt till servern för en obetald beställning, och ångrar betalningen för en som redan är hämtad.",
    async kor() {
      const { a, order } = await klubb();
      const s1 = await m.admin(KL, "lag-a", a.key, "hamtad", { id: "0001", varde: "JA" });
      const forsta = await order("lag-a", "0001");
      await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: "JA" }); await m.admin(KL, "lag-a", a.key, "hamtad", { id: "0001", varde: "JA" });
      const s2 = await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: "" });
      const andra = await order("lag-a", "0001");
      return { anrop: "POST {op:'hamtad', id:'0001', varde:'JA'} när den är obetald, och {op:'satt', varde:''} när den är hämtad", svar: kort(s1),
        stoppad: !s1.ok && forsta.hamtad === "" && !s2.ok && andra.betald === "JA" && andra.hamtad === "JA", bevis: s1.fel + " / " + s2.fel };
    } },
  { grupp: "Förbi knapparna", namn: "Beställa från en annan webbplats",
    hur: "En annan webbplats skickar beställningar i en besökares webbläsare (Origin pekar på en annan adress).",
    async kor() {
      const { bestall } = await klubb();
      const s = await m.anrop("POST", "/api", { klubb: KL, lag: "lag-a", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 }, { Origin: "https://ond.example" });
      return { anrop: "POST med Origin: https://ond.example", svar: kort(s.json), stoppad: !s.json.ok && (await antal("bestallning")) === 3, bevis: s.json.fel };
    } },

  // ---------- Konstiga värden ----------
  { grupp: "Konstiga värden", namn: "HTML och skript i barnets namn",
    hur: "Barnets namn är <img src=x onerror=alert(1)>, <script>alert(1)</script> och javascript:alert(1).",
    async kor() {
      const { bestall } = await klubb();
      const svar = [];
      for (const [i, barn] of ["<img src=x onerror=alert(1)>", "<script>alert(1)</script>", "javascript:alert(1)", "Emil\"><svg onload=alert(1)>"].entries()) svar.push(await bestall("lag-a", { barn, mobil: "070 900 00 0" + i }));
      return { anrop: "POST {barn:'<img src=x onerror=alert(1)>'}", svar: kort(svar[0]), stoppad: svar.every((s) => !s.ok) && (await antal("bestallning")) === 3, bevis: svar[0].fel };
    } },
  { grupp: "Konstiga värden", namn: "SQL-injektion i alla fält",
    hur: "Fält och parametrar får SQL-text, till exempel '; DROP TABLE lag; --: klubb, lag, barn, mobil, nyckel, e-post, kommentar och namn på fält. Inget ska tolkas som SQL, och alla tabeller och rader ska finnas kvar.",
    async kor() {
      const { sk, a } = await klubb();
      const u = await m.nyttLag(KL, lagData({ namn: "Lag Q", status: "utkast" }));
      const radFore = { lag: await antal("lag"), best: await antal("bestallning"), klubb: await antal("klubb"), admin: await antal("klubb_admin") };
      let fel = [];
      let kodOrdrar = 0;   // en ogiltig kod ignoreras, och beställningen är i övrigt giltig: den ska sparas, med kod tom
      for (const [i, s] of SQLINJ.entries()) {
        const svar = [
          await m.get({ action: "lag", klubb: s }), await m.get({ action: "status", klubb: KL, lag: s }),
          await m.post({ klubb: s, lag: "lag-a", barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 }),
          await m.post({ klubb: KL, lag: s, barn: "Emil", mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 }),
          await m.post({ klubb: KL, lag: "lag-a", barn: s, mobil: "070 123 45 67", antal: 1, samtycke: true, website: "", t: 5000 }),
          await m.post({ klubb: KL, lag: "lag-a", barn: "Emil", mobil: s, antal: 1, samtycke: true, website: "", t: 5000 }),
          await m.post({ klubb: KL, lag: "lag-a", barn: "Emil", mobil: "070 66" + String(i).padStart(2, "0") + " 00 00", antal: 1, samtycke: true, website: "", t: 5000, kod: s }),
          await m.admin(s, "lag-a", a.key, "lista"), await m.admin(KL, s, a.key, "lista"), await m.admin(KL, "lag-a", s, "lista"),
          await m.admin(KL, "lag-q", u.key, "lagSpara", { falt: { kampanj: s, produkt: s, intro: s, swishNummer: s, [s]: "x" } }),
          await m.admin(KL, "lag-a", a.key, "satt", { id: s, varde: "JA" }), await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: s }),
          await m.post({ action: "starta", klubb: KL, namn: s, t: 5000, website: "" }),
          await m.post({ action: "login", op: "begar", klubb: s, epost: s }), await m.post({ action: "login", op: "begar", klubb: KL, epost: s + "@x.com" }),
          await m.post({ action: "login", op: "anvand", token: s })
        ];
        if (svar.some((x) => !x || typeof x !== "object")) fel.push("svar saknas för " + s);
        // Allt där själva SQL-texten stod i klubb, lag, barn, mobil, nyckel, ordernummer eller värde ska avvisas. Ett lyckat svar betyder att texten
        // tolkades (till exempel OR 1=1 som väljer en rad). Undantag: kod ignoreras om den är ogiltig, och en begäran om länk ger alltid samma svar.
        for (const idx of [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16]) if (svar[idx].ok) fel.push("avvisades inte (" + idx + "): " + s);
        if (svar[6].ok) kodOrdrar++;
      }
      if ((await m.rader("bestallning")).some((o) => o.kod !== null && !/^[A-Za-z0-9:_-]{8,80}$/.test(o.kod))) fel.push("en ogiltig kod sparades");
      // Text som får sparas (fri text) ska komma tillbaka oförändrad som ren text, inte tolkas
      const fri = "x'); DROP TABLE lag; --";
      const sparat = await m.admin(KL, "lag-q", u.key, "lagSpara", { falt: { intro: fri } });
      const tillbaka = sparat.ok && sparat.lag.intro === fri.replace(/^[=+\-@\s]+/, "");
      const radEfter = { lag: await antal("lag"), best: await antal("bestallning"), klubb: await antal("klubb"), admin: await antal("klubb_admin") };
      const ok = radEfter.lag === radFore.lag && radEfter.best === radFore.best + kodOrdrar && radEfter.klubb === radFore.klubb && radEfter.admin === radFore.admin && tillbaka && fel.length === 0;
      return { anrop: "SQL-text i klubb, lag, barn, mobil, kod, nyckel, e-post, kommentar och fältnamn", svar: kort({ rader: radEfter }), stoppad: ok, bevis: "alla tabeller och rader finns kvar, och SQL-texten sparades som vanlig text" + (fel.length ? " | PROBLEM: " + fel.join("; ") : "") + (tillbaka ? "" : " | texten kom inte tillbaka oförändrad") };
    } },
  { grupp: "Konstiga värden", namn: "Formler i texter som exporteras",
    hur: "Barnets namn och lagförälderns texter börjar med =, +, - eller @, till exempel =HYPERLINK(\"http://ond.example\"). Exporteras de till ett kalkylprogram ska inget tolkas som formel.",
    async kor() {
      const { sk, bestall } = await klubb();
      const s1 = await bestall("lag-a", { barn: "=HYPERLINK(\"http://ond.example\";\"Klicka\")", mobil: "070 910 00 00" });
      const u = await m.nyttLag(KL, lagData({ namn: "Lag F", status: "utkast" }));
      await m.admin(KL, "lag-f", u.key, "lagSpara", { falt: { produkt: "=IMPORTXML(\"http://ond.example\")", detalj: "+cmd|' /C calc'!A0", intro: "@SUM(1+1)", belonning: "-1+1", mottagare: "=1+1" } });
      const rad = (await m.rader("lag")).find((r) => r.slug === "lag-f");
      const formler = ["produkt", "detalj", "intro", "belonning", "mottagare"].filter((f) => /^[=+\-@]/.test(rad[f]));
      return { anrop: "POST {barn:'=HYPERLINK(…)'} och lagSpara {produkt:'=IMPORTXML(…)'}", svar: kort({ order: s1.fel, sparat: [rad.produkt, rad.detalj] }), stoppad: !s1.ok && formler.length === 0, bevis: "inget sparat värde börjar med = + - @" };
    } },
  { grupp: "Konstiga värden", namn: "Mycket lång text och tomma värden",
    hur: "Barnets namn på 100 000 tecken, tomt namn, tomt mobilnummer och mobilnummer med bokstäver.",
    async kor() {
      const { bestall } = await klubb();
      const svar = [await bestall("lag-a", { barn: "A".repeat(100000), mobil: "070 920 00 01" }), await bestall("lag-a", { barn: "", mobil: "070 920 00 02" }),
        await bestall("lag-a", { mobil: "" }), await bestall("lag-a", { mobil: "070 abc de fg" }), await bestall("lag-a", { barn: "   ", mobil: "070 920 00 03" })];
      return { anrop: "POST {barn:'AAAA…' (100 000 tecken)} m.fl.", svar: kort(svar[0]), stoppad: svar.every((s) => !s.ok) && (await antal("bestallning")) === 3, bevis: "inga nya rader" };
    } },
  { grupp: "Konstiga värden", namn: "Trasig förfrågan",
    hur: "Skickar text som inte är JSON, en tom förfrågan, JSON som är en lista, och ett objekt som försöker ändra objektens egenskaper.",
    async kor() {
      await klubb();
      const svar = [];
      for (const t of ["{inte json", "", "[1,2,3]", "null", "{\"__proto__\":{\"status\":\"pagar\",\"admin\":true}}", "{\"constructor\":{\"prototype\":{\"admin\":true}}}"]) svar.push(await m.postRaw(t));
      const efter = await m.admin(KL, "lag-a", "", "lista");   // objektens egenskaper får inte ha ändrats av anropen
      return { anrop: "POST '{inte json' / '' / '[1,2,3]' / 'null' / '{\"__proto__\":…}'", svar: kort(svar[0]), stoppad: svar.every((s) => s && s.ok === false && typeof s.fel === "string") && ({}).admin === undefined && efter.ok === false, bevis: "kontrollerat felsvar, ingen krasch, inga ändrade egenskaper" };
    } },
  { grupp: "Konstiga värden", namn: "Pris med ören ger ett exakt belopp",
    hur: "Laget sätter priset 19,90 kr. En förälder beställer 3. Beloppet ska bli 59,70, inte 59,699999999999996, eftersom det kopieras in i Swish.",
    async kor() {
      const { sk, bestall } = await klubb();
      await m.nyttLag(KL, lagData({ namn: "Lag P", pris: 19.9 }));
      const svar = await bestall("lag-p", { antal: 3, mobil: "070 930 00 00" });
      const rad = (await m.rader("bestallning")).pop();
      return { anrop: "POST {lag:'lag-p', antal:3} med pris 19,90", svar: kort(svar), stoppad: svar.belopp === 59.7 && rad.belopp === 59.7, bevis: "belopp: " + svar.belopp };
    } },

  // ---------- Spår av personuppgifter ----------
  { grupp: "Spår av personuppgifter", namn: "Personuppgifter i loggen och i spärrarnas räknare",
    hur: "Efter beställningar, adminanrop och inloggningar: letar efter barnnamn, mobilnummer och e-postadresser i loggen och i räknarna för spärrar.",
    async kor() {
      const { a } = await klubb();
      await m.admin(KL, "lag-a", a.key, "lista"); await m.admin(KL, "lag-a", a.key, "satt", { id: "0001", varde: "JA" }); await m.admin(KL, "lag-a", a.key, "taBort", { id: "0001" });
      await m.post({ klubb: KL, lag: "lag-a", barn: "Cecilia", mobil: "070 940 00 00", antal: 1, samtycke: true, website: "", t: 5000, kod: "kod-0123456789" });
      const allt = JSON.stringify([await m.rader("logg"), await m.rader("sparr")]);
      const lacker = ["Alva", "Bertil", "Cecilia", "0701111111", "0709400000", "070 111 11 11", "testklubben.example", a.key.replace(/-/g, ""), a.key].filter((s) => allt.includes(s));
      return { anrop: "POST lista, satt, taBort, beställning; sedan läses loggen och räknarna", svar: kort((await m.rader("sparr")).map((r) => r.nyckel.slice(0, 12))), stoppad: lacker.length === 0, bevis: lacker.length ? "läcker: " + lacker.join(", ") : "bara ordernummer, antal, belopp och hashar" };
    } },
  { grupp: "Spår av personuppgifter", namn: "Gissa nycklar utan att låsa ute den rätta",
    hur: "Hundra felaktiga nycklar mot lag A. Därefter ska den rätta nyckeln fortfarande fungera, och felaktiga ska stoppas.",
    async kor() {
      const { a } = await klubb();
      for (let i = 0; i < 100; i++) await m.admin(KL, "lag-a", i.toString(16).padStart(32, "0"), "lista");
      const fel = await m.admin(KL, "lag-a", "f".repeat(32), "lista");
      const ratt = await m.admin(KL, "lag-a", a.key, "lista");
      return { anrop: "100 × POST {lag:'lag-a', key:<fel nyckel>}", svar: kort(fel), stoppad: !fel.ok && /många/i.test(fel.fel) && ratt.ok, bevis: "spärren slog till, och rätt nyckel kom ändå in" };
    } },

  // ---------- Inloggning som klubbens administratör ----------
  { grupp: "Inloggning", namn: "Använda en inloggningslänk två gånger",
    hur: "Administratören loggar in med sin länk. Någon som fått tag i länken efteråt (till exempel ur e-postens historik) försöker använda den igen.",
    async kor() {
      await klubb();
      await m.post({ action: "login", op: "begar", klubb: KL, epost: ADMIN_EPOST }); await m.vanta();
      const token = m.brev.filter((b) => b.to === ADMIN_EPOST).pop().text.match(/#lank=([a-f0-9]{64})/)[1];
      const forsta = await m.anrop("POST", "/api", { action: "login", op: "anvand", token }, { Origin: ORIGIN });
      const andra = await m.anrop("POST", "/api", { action: "login", op: "anvand", token }, { Origin: ORIGIN });
      return { anrop: "POST {action:login, op:anvand, token} två gånger", svar: kort(andra.json), stoppad: forsta.json.ok && !andra.json.ok && !andra.rubriker.get("Set-Cookie"), bevis: andra.json.fel };
    } },
  { grupp: "Inloggning", namn: "Använda en inloggningslänk som har gått ut",
    hur: "Länken används 16 minuter efter att den skickades.",
    async kor() {
      await klubb();
      await m.post({ action: "login", op: "begar", klubb: KL, epost: ADMIN_EPOST }); await m.vanta();
      const token = m.brev.filter((b) => b.to === ADMIN_EPOST).pop().text.match(/#lank=([a-f0-9]{64})/)[1];
      m.tid(16 * 60000);
      const s = await m.anrop("POST", "/api", { action: "login", op: "anvand", token }, { Origin: ORIGIN });
      return { anrop: "POST {op:anvand, token} efter 16 minuter", svar: kort(s.json), stoppad: !s.json.ok && !s.rubriker.get("Set-Cookie"), bevis: s.json.fel };
    } },
  { grupp: "Inloggning", namn: "Gissa länkar och sessioner",
    hur: "Tvåhundra slumpade länkar och tvåhundra slumpade sessions-cookies prövas.",
    async kor() {
      await klubb();
      const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      let inne = 0;
      for (let i = 0; i < 200; i++) {
        const t = await m.anrop("POST", "/api", { action: "login", op: "anvand", token: hex() }, { Origin: ORIGIN });
        const c = await m.admin(KL, "*", "", "lagLista", {}, { Cookie: "__Host-session=" + hex(), Origin: ORIGIN });
        if (t.json.ok || c.ok) inne++;
      }
      return { anrop: "200 × {op:anvand, token:<slumpad>} och 200 × cookie:<slumpad>", svar: "ingen kom in", stoppad: inne === 0, bevis: "0 av 400 kom in" };
    } },
  { grupp: "Inloggning", namn: "Skicka förfrågningar i den inloggades namn från en annan webbplats",
    hur: "Administratören är inloggad. En annan webbplats får hens webbläsare att skicka ett anrop som tar bort ett lag och byter nyckel (Origin pekar på den andra webbplatsen, eller saknas).",
    async kor() {
      const { sk, kaka } = await klubb();
      const u = await m.nyttLag(KL, lagData({ namn: "Lag U", status: "utkast" }));
      const fran = ["https://ond.example", "null", undefined];
      const svar = [];
      for (const o of fran) {
        const rubriker = { Cookie: kaka }; if (o !== undefined) rubriker.Origin = o;
        svar.push(await m.admin(KL, "*", "", "lagTaBort", { slug: "lag-u" }, rubriker));
        svar.push(await m.admin(KL, "*", "", "nyNyckel", { slug: "lag-a" }, rubriker));
      }
      const kvar = (await m.rader("lag")).some((r) => r.slug === "lag-u");
      return { anrop: "POST {op:lagTaBort / nyNyckel} med giltig cookie men Origin: https://ond.example / null / saknas", svar: kort(svar[0]), stoppad: svar.every((s) => !s.ok) && kvar && (await m.admin(KL, "lag-u", u.key, "oversikt")).ok, bevis: "lagen och nycklarna är oförändrade" };
    } },
  { grupp: "Inloggning", namn: "Ta reda på vilka adresser som är administratörer",
    hur: "Begär inloggningslänkar för en adress som är administratör, en som inte är det och en med fel format, och jämför svaren (innehåll, status och rubriker).",
    async kor() {
      await klubb();
      const a = await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: KL, epost: ADMIN_EPOST });
      const b = await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: KL, epost: "okand@example.com" });
      const c = await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: "finns-inte", epost: ADMIN_EPOST });
      const d = await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: KL, epost: "ADMIN@testklubben.EXAMPLE" });
      const lika = [b, c].every((x) => x.text === a.text && x.status === a.status && x.rubriker.get("Content-Type") === a.rubriker.get("Content-Type"));
      return { anrop: "POST {op:begar} för administratör / okänd adress / okänd klubb", svar: kort(a.json), stoppad: lika && d.text === a.text, bevis: "svaren är identiska" };
    } },
  { grupp: "Inloggning", namn: "Fylla en administratörs brevlåda",
    hur: "Hundra begäranden om länk för samma adress, och hundra från samma IP-nummer med olika adresser.",
    async kor() {
      await klubb();
      m.brev.length = 0;
      m.tid(3600000 + 1000);   // uppsättningen loggade själv in en gång: börja på ett nytt fönster
      for (let i = 0; i < 100; i++) await m.anrop("POST", "/api", { action: "login", op: "begar", klubb: KL, epost: ADMIN_EPOST }, { "CF-Connecting-IP": "198.51.100." + (i % 200) });
      await m.vanta();
      const tillAdmin = m.brev.filter((b) => b.to === ADMIN_EPOST).length;
      return { anrop: "100 × {op:begar} för samma adress", svar: tillAdmin + " mejl skickades", stoppad: tillAdmin === CFG.LANK_PER_EPOST_TIMME, bevis: tillAdmin + " av 100 gav ett mejl, gränsen är " + CFG.LANK_PER_EPOST_TIMME };
    } },
  { grupp: "Inloggning", namn: "Smuggla in en andra mottagare i adressen",
    hur: "E-postadressen innehåller radbrytning och en extra mottagare, till exempel \"admin@x.example\\nBcc: ond@example.com\".",
    async kor() {
      await klubb();
      m.brev.length = 0;
      const prov = [ADMIN_EPOST + "\nBcc: ond@example.com", ADMIN_EPOST + "\r\nTo: ond@example.com", ADMIN_EPOST + ",ond@example.com", ADMIN_EPOST + " ond@example.com", "ond@example.com>" + ADMIN_EPOST];
      const svar = [];
      for (const e of prov) { svar.push(await m.post({ action: "login", op: "begar", klubb: KL, epost: e })); await m.vanta(); }
      return { anrop: "POST {op:begar, epost:'admin@…\\nBcc: ond@example.com'}", svar: kort(svar[0]), stoppad: m.brev.length === 0 && m.brev.every((b) => b.to === ADMIN_EPOST), bevis: "inga mejl skickades till påhittade adresser" };
    } },
  { grupp: "Inloggning", namn: "Få länken att peka på en annan webbplats",
    hur: "Begäran skickas till servern med en annan värdadress (Host/URL), i hopp om att länken i mejlet pekar dit.",
    async kor() {
      await klubb();
      m.brev.length = 0;
      await m.anrop("POST", "https://ond.example/api", { action: "login", op: "begar", klubb: KL, epost: ADMIN_EPOST });
      await m.vanta();
      const text = m.brev[0] ? m.brev[0].text : "";
      return { anrop: "POST https://ond.example/api {op:begar}", svar: kort(text.match(/https?:\/\/\S+/)), stoppad: !!text && !text.includes("ond.example") && text.includes(ORIGIN + "/" + KL + "/admin.html#lank="), bevis: "länken pekar på den inställda adressen" };
    } },
];

for (const a of ATTACKER) {
  test(`[${a.grupp}] ${a.namn}`, async () => {
    const r = await a.kor();
    resultat.push({ ...a, ...r });
    assert.ok(r.stoppad, "attacken lyckades: " + r.bevis + " | svar: " + r.svar);
  });
}

test("alla attacker har körts", () => { assert.ok(resultat.length >= 30, "antal attacker: " + resultat.length); });

after(() => {
  const fil = process.env.ATTACK_RAPPORT;
  if (!fil) return;
  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rader = resultat.map((r, i) => `| ${i + 1} | ${cell(r.grupp)} | ${cell(r.namn)} | ${cell(r.hur)} | \`${cell(r.anrop)}\` | \`${cell(r.svar)}\` | ${r.stoppad ? "Stoppad" : "**LYCKADES**"}: ${cell(r.bevis)} |`);
  fs.writeFileSync(fil, `| # | Grupp | Attack | Hur | Anrop | Svar | Resultat |\n|---|---|---|---|---|---|---|\n${rader.join("\n")}\n`);
});
