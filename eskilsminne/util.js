/* Delade hjälpfunktioner för beställningssidan (app.js) och adminvyn (admin.js). */
(function () {
  "use strict";

  var nf = new Intl.NumberFormat("sv-SE");

  function kr(n) {
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n) + " kr";
  }

  // Ord per kund: en skola säger klass, klassförälder och skolan där en förening säger lag, lagförälder och klubben.
  // Sidorna skrivs med föreningens ord, och KLUBB.ord = "skola" byter dem när texten sätts. Hela fraser först, sedan ord.
  // Ett ord byts bara när det står för sig självt (inte inuti ett annat ord).
  var ORD_SKOLA = [
    ["klubben eller skolan", "skolan"], ["Klubben eller skolan", "Skolan"], ["laget eller skolan", "klassen"], ["Laget eller skolan", "Klassen"],
    ["Alla lag", "Alla klasser"], ["alla lag", "alla klasser"], ["Välj ditt", "Välj din"], ["ditt lag", "din klass"], ["Inget lag", "Ingen klass"],
    ["inget lag", "ingen klass"], ["Okänt lag", "Okänd klass"], ["ett lag", "en klass"], ["Sök lag", "Sök klass"], ["Till lagsidan", "Till startsidan"],
    ["Till exempel P2019", "Till exempel Klass 1A"], ["till exempel P2019 Lotter", "till exempel Klass 1A Lotter"], ["P2019", "Klass 1A"],
    ["Lagföräldrarna", "Klassföräldrarna"], ["lagföräldrarna", "klassföräldrarna"], ["lagföräldrar", "klassföräldrar"],
    ["Lagförälderns", "Klassförälderns"], ["lagförälderns", "klassförälderns"], ["Lagföräldern", "Klassföräldern"], ["lagföräldern", "klassföräldern"],
    ["Lagförälder", "Klassförälder"], ["lagförälder", "klassförälder"], ["lagkassan", "klasskassan"], ["lagkassa", "klasskassa"],
    ["Lagets", "Klassens"], ["lagets", "klassens"], ["Laget", "Klassen"], ["laget", "klassen"], ["Lagens", "Klassernas"], ["lagens", "klassernas"],
    ["Lagen", "Klasserna"], ["lagen", "klasserna"], ["Lag", "Klass"], ["lag", "klass"],
    ["klubbadministratör", "skolans administratör"], ["Klubbadministratör", "Skolans administratör"],
    ["Klubbens", "Skolans"], ["klubbens", "skolans"], ["Klubben", "Skolan"], ["klubben", "skolan"], ["Klubb", "Skola"], ["klubb", "skola"]
  ].map(function (p) { return [new RegExp("(?<![\\p{L}\\p{N}])" + p[0] + "(?![\\p{L}])", "gu"), p[1]]; });
  // Adresser ändras aldrig: en text med en länk i (till exempel …/?lag=p2019 eller admin.html#lag=…) visas som den är
  var ADRESS = /:\/\/|[?#&]lag=|\[sidans adress\]/;
  function ord(t) {
    if (typeof t !== "string" || !window.KLUBB || window.KLUBB.ord !== "skola" || ADRESS.test(t)) return t;
    ORD_SKOLA.forEach(function (p) { t = t.replace(p[0], p[1]); });
    return t;
  }

  // Skapar element utan innerHTML. All text sätts med textContent.
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = ord(attrs[k]);
      else if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, k === "placeholder" || k === "aria-label" ? ord(attrs[k]) : attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      e.appendChild(typeof kid === "string" ? document.createTextNode(ord(kid)) : kid);
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
    fetch(K.endpoint + "?action=lag&klubb=" + encodeURIComponent(K.slug))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok && Array.isArray(d.lag)) cb(null, d.lag); else cb(new Error("Felaktigt svar")); })
      .catch(function (e) { cb(e); });
  }

  // Gör ett element av en fast SVG-sträng i koden. Används aldrig med text från servern eller från användare.
  function ikon(svg) { var t = document.createElement("template"); t.innerHTML = svg.trim(); return t.content.firstChild; }

  // Demoläget: en beställning på förälderns sida sparas bara i fliken (sessionStorage), så att lagförälderns vy i samma flik kan visa den.
  // Inget lämnar webbläsaren, och allt försvinner när fliken stängs.
  var DEMO_ORDRAR = "demo-ordrar:";
  function demoNyckel(slug) { return DEMO_ORDRAR + window.KLUBB.slug + ":" + slug; }
  function demoOrdrar(slug) {
    try { var v = JSON.parse(sessionStorage.getItem(demoNyckel(slug)) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function sparaDemoOrder(slug, o) {
    var a = demoOrdrar(slug); a.push(o);
    try { sessionStorage.setItem(demoNyckel(slug), JSON.stringify(a)); } catch (e) {}
  }

  window.U = { nf: nf, kr: kr, h: h, ord: ord, merge: merge, hamtaLag: hamtaLag, ikon: ikon, demoNyckel: demoNyckel, demoOrdrar: demoOrdrar, sparaDemoOrder: sparaDemoOrder };
})();
