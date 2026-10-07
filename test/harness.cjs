/* Kör Server.gs i Node med låtsas-versioner av Googles tjänster (kalkylark, lås, cache, egenskaper).
   Används av server.test.cjs. Inget här körs i produktion. */
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  _cell(v) { return typeof v === "string" && v.startsWith("'") ? v.slice(1) : v; }   // inledande ' = text, som i Google Kalkylark
  getValue() { return this.getValues()[0][0]; }
  getValues() {
    const ut = [];
    for (let i = 0; i < this.nr; i++) {
      const rad = this.sheet.data[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) { const v = rad[this.c - 1 + j]; o.push(v === undefined ? "" : v); }
      ut.push(o);
    }
    return ut;
  }
  setValue(v) { return this.setValues([[v]]); }
  setValues(m) {
    m.forEach((rad, i) => {
      const r = this.sheet.data[this.r - 1 + i] || (this.sheet.data[this.r - 1 + i] = []);
      rad.forEach((v, j) => { r[this.c - 1 + j] = this._cell(v); });
    });
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { let n = this.data.length; while (n > 0 && !(this.data[n - 1] || []).some((v) => v !== "" && v !== undefined)) n--; return n; }
  getRange(r, c, nr = 1, nc = 1) { return typeof r === "string" ? new Range(this, 1, 1, 0, 0) : new Range(this, r, c, nr, nc); }
  appendRow(arr) { this.data.push(arr.map((v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v))); }
  insertRowBefore(i) { this.data.splice(i - 1, 0, []); }
  setFrozenRows() {}
}

function skapaMiljo() {
  const blad = {}, cache = new Map(), props = new Map(), loggar = [];
  const ss = {
    getSheetByName: (n) => blad[n] || null,
    insertSheet: (n) => (blad[n] = new Sheet(n)),
  };
  const sandbox = {
    console: { log: (...a) => loggar.push(a.join(" ")), error: (...a) => loggar.push("ERROR " + a.join(" ")) },
    Date, // samma Date som testet, så att instanceof och toISOString fungerar likadant
    SpreadsheetApp: { getActive: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => { cache.set(k, String(v)); },
      remove: (k) => { cache.delete(k); },
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, String(v)); },
    }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s) => ({ getContent: () => s, setMimeType() { return this; } }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      getUuid: () => crypto.randomUUID(),
      // Google returnerar bytes som tal mellan −128 och 127
      computeDigest: (alg, text) => Array.from(crypto.createHash("sha256").update(text, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(process.env.SERVER_GS || path.join(__dirname, "..", "Server.gs"), "utf8"), ctx, { filename: "Server.gs" });

  const parse = (o) => JSON.parse(o.getContent());
  return {
    ctx, blad, cache, props, loggar,
    setup: () => ctx.setup(),
    post: (obj) => parse(ctx.doPost({ postData: { contents: JSON.stringify(obj) } })),
    postRaw: (txt) => parse(ctx.doPost({ postData: { contents: txt } })),
    get: (parameter) => parse(ctx.doGet({ parameter })),
    superNyckel: () => (loggar.map((l) => l.match(/SUPERADMIN-NYCKEL[^:]*: ([0-9a-f-]+)/)).filter(Boolean).pop() || [])[1],
    // hjälpare för admin-anrop
    admin(lag, key, op, extra = {}) { return parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: "admin", lag, key, op, ...extra }) } })); },
  };
}
module.exports = { skapaMiljo };
