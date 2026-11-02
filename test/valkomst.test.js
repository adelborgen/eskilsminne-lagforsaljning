/* Tester av välkomstmejlet till nya administratörer, klubbens administratörer och guiden Kom igång. */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { skapaMiljo, lagData, ADMIN_EPOST, CFG, ORIGIN } from "./miljo.js";

const KL = "testklubben";
const NY = "ny@testklubben.example";
let m;

before(async () => { m = await skapaMiljo(); });
after(async () => { await m.stang(); });
beforeEach(async () => { await m.nollstall(); });

const version = async () => { const s = await m.anrop("GET", "/api?action=version"); await m.vanta(); return s; };
const valkomstToken = (till) => {
  const b = m.brev.filter((x) => x.to === till).pop();
  const t = b && b.text.match(/#valkommen=([a-f0-9]{64})/);
  return t ? t[1] : null;
};
const anvand = (token) => m.anrop("POST", "/api", { action: "login", op: "anvand", token }, { Origin: ORIGIN });
const kakaFran = (s) => (s.rubriker.get("Set-Cookie") || "").split(";")[0];
const klubbAnrop = async (kaka, op, extra) => { const r = await m.admin(KL, "*", "", op, extra, m.somAdmin(kaka)); await m.vanta(); return r; };

test("en ny administratör får ett välkomstmejl vid nästa anrop, bara en gång, även när flera anrop kommer samtidigt", async () => {
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST], nyaAdmins: [NY] });
  await Promise.all([version(), version(), version()]);
  await version();
  const brev = m.brev.filter((b) => b.to === NY);
  assert.equal(brev.length, 1);
  assert.equal(m.brev.filter((b) => b.to === ADMIN_EPOST).length, 0, "den som redan fanns får inget välkomstmejl");
  assert.match(brev[0].subject, /Välkommen till Skramlat, Testklubben/);
  assert.match(brev[0].text, /https:\/\/skramlat\.test\/testklubben\/admin\.html#valkommen=[a-f0-9]{64}/);
  assert.match(brev[0].text, /7 dagar/);
});

test("välkomstlänken loggar in, gäller i sju dagar och kan användas en gång", async () => {
  await m.skapaKlubb(KL, "Testklubben", { nyaAdmins: [NY] });
  await version();
  const token = valkomstToken(NY);
  m.tid(CFG.VALKOMST_DAGAR * 86400000 - 60000);
  const s = await anvand(token);
  assert.equal(s.json.ok, true); assert.deepEqual(s.json.klubbar.map((k) => k.slug), [KL]);
  const lista = await klubbAnrop(kakaFran(s), "lagLista");
  assert.equal(lista.ok, true); assert.equal(lista.roll, "super");
  assert.equal((await anvand(token)).json.ok, false, "andra gången");

  await m.nollstall();
  await m.skapaKlubb(KL, "Testklubben", { nyaAdmins: [NY] });
  await version();
  const t2 = valkomstToken(NY);
  m.tid(CFG.VALKOMST_DAGAR * 86400000 + 60000);
  assert.equal((await anvand(t2)).json.ok, false, "efter sju dagar");
});

test("en avstängd klubbs nya administratörer får inget välkomstmejl", async () => {
  await m.skapaKlubb(KL, "Testklubben", { status: "avstangd", nyaAdmins: [NY] });
  await version();
  assert.equal(m.brev.length, 0);
});

test("klubbens administratör bjuder in en till, som får ett välkomstmejl, och adressen loggas aldrig", async () => {
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] });
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const r = await klubbAnrop(li.kaka, "adminBjudIn", { epost: "  Ny@Testklubben.Example " });
  assert.equal(r.ok, true);
  assert.deepEqual(r.admin, [{ epost: ADMIN_EPOST, du: true }, { epost: NY, du: false }]);
  assert.equal(r.klubb.antalAdmin, 2);
  assert.ok(valkomstToken(NY), "välkomstmejlet kom");
  const igen = await klubbAnrop(li.kaka, "adminBjudIn", { epost: NY });
  assert.equal(igen.ok, false); assert.match(igen.fel, /redan administratör/);
  assert.equal((await klubbAnrop(li.kaka, "adminBjudIn", { epost: "inte-en-adress" })).ok, false);
  const logg = JSON.stringify(await m.rader("logg")).toLowerCase();
  assert.ok(!logg.includes("@"), "ingen e-postadress i loggen");
  // Den inbjudna kommer in med sin länk
  assert.equal((await anvand(valkomstToken(NY))).json.ok, true);
});

test("högst fem administratörer per klubb", async () => {
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST, "a2@x.example", "a3@x.example", "a4@x.example", "a5@x.example"] });
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const r = await klubbAnrop(li.kaka, "adminBjudIn", { epost: "a6@x.example" });
  assert.equal(r.ok, false); assert.match(r.fel, /högst 5/);
});

test("en administratör kan ta bort en annan men inte sig själv, och den borttagna kommer inte in längre", async () => {
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST, NY] });
  const a = await m.loggaIn(KL, ADMIN_EPOST), b = await m.loggaIn(KL, NY);
  const sjalv = await klubbAnrop(a.kaka, "adminTaBort", { epost: ADMIN_EPOST });
  assert.equal(sjalv.ok, false); assert.match(sjalv.fel, /inte ta bort dig själv/);
  const r = await klubbAnrop(a.kaka, "adminTaBort", { epost: NY });
  assert.equal(r.ok, true); assert.deepEqual(r.admin.map((x) => x.epost), [ADMIN_EPOST]);
  assert.equal((await klubbAnrop(b.kaka, "lagLista")).ok, false, "den borttagnas inloggning gäller inte längre");
});

test("bara klubbens administratör kan hantera administratörer och guiden, inte en lagförälder", async () => {
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] });
  const lag = await m.nyttLag(KL, lagData({ status: "pagar" }));
  for (const [op, extra] of [["adminLista"], ["adminBjudIn", { epost: "x@y.example" }], ["adminTaBort", { epost: ADMIN_EPOST }], ["guideKlar"]]) {
    const r = await m.admin(KL, lag.slug, lag.key, op, extra, { Origin: ORIGIN });
    assert.equal(r.ok, false, op); assert.match(r.fel, /Bara klubbens administratör/, op);
  }
  const ov = await m.admin(KL, lag.slug, lag.key, "oversikt", {}, { Origin: ORIGIN });
  assert.equal(ov.klubb.guideKlar, undefined, "lagföräldern ser inte guiden");
  assert.equal(ov.klubb.antalAdmin, undefined);
  assert.equal((await m.rader("klubb_admin")).length, 1);
});

test("guiden Kom igång: visas tills administratören stänger den", async () => {
  await m.skapaKlubb(KL, "Testklubben", { admins: [ADMIN_EPOST] });
  const li = await m.loggaIn(KL, ADMIN_EPOST);
  const fore = await klubbAnrop(li.kaka, "lagLista");
  assert.equal(fore.klubb.guideKlar, false); assert.equal(fore.klubb.antalAdmin, 1);
  assert.equal((await klubbAnrop(li.kaka, "guideKlar")).ok, true);
  assert.equal((await klubbAnrop(li.kaka, "lagLista")).klubb.guideKlar, true);
});
