/* Delade hjälpfunktioner för beställningssidan (app.js) och adminvyn (admin.js). */
(function () {
  "use strict";

  var nf = new Intl.NumberFormat("sv-SE");

  function kr(n) {
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n) + " kr";
  }

  // Skapar element utan innerHTML. All text sätts med textContent.
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return e;
  }

  // Slår ihop standardvärden och egna värden. Objekt slås ihop, listor ersätts.
  function merge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) {
      var o = over[k], b = out[k];
      var plain = function (x) { return x && typeof x === "object" && !Array.isArray(x); };
      out[k] = plain(o) && plain(b) ? merge(b, o) : o;
    });
    return out;
  }

  // Hämtar lagens uppgifter: från klubbens server, eller exempeldata i demoläge (KLUBB.endpoint tom).
  function hamtaLag(cb) {
    var K = window.KLUBB;
    if (!K.endpoint) return cb(null, window.DEMO_LAG || []);
    fetch(K.endpoint + "?action=lag")
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok && Array.isArray(d.lag)) cb(null, d.lag); else cb(new Error("Felaktigt svar")); })
      .catch(function (e) { cb(e); });
  }

  window.U = { nf: nf, kr: kr, h: h, merge: merge, hamtaLag: hamtaLag };
})();
