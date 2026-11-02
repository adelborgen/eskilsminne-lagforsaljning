/* ==========================================================================
   Klubbsidan: laglista + beställningssida per lag.
   Lagen och deras uppgifter hämtas från Skramlats server (server/), eller från
   exempeldata i demoläge. Inget här behöver ändras när ett lag läggs till.
   Beställningssidan bygger på P2019-sidan (adelborgen/eskilsminne-p2019), men allt kommer från lagets inställningar.
   ========================================================================== */
(function () {
  "use strict";

  var U = window.U, h = U.h, kr = U.kr, nf = U.nf, merge = U.merge, hamtaLag = U.hamtaLag;
  var K = window.KLUBB;

  // Standardvärden, lagets texter (LAG_EXTRA) och lagets egna uppgifter från servern, i den ordningen.
  function bygg(lag) {
    // Tomma texter från laget ska inte skriva över reservtexterna. Lagets text om utlämning heter utlamning på sidan.
    var egna = {};
    Object.keys(lag).forEach(function (k) { egna[k] = lag[k]; });
    ["intro", "belonning"].forEach(function (k) { if (!egna[k]) delete egna[k]; });
    if (egna.utlamningsText) egna.utlamning = egna.utlamningsText;
    var c = merge(merge(K.standard, (window.LAG_EXTRA || {})[lag.slug] || {}), egna);
    c.titel = lag.titel || lag.kampanj || c.produkt.namn || K.titel;
    // Knapparna under antalet: efter största antal, om laget inte har egna
    if (!c.snabbval) c.snabbval = c.maxAntal >= 20 ? [5, 10, 15, 20] : [1, 2, 3, 5].filter(function (n) { return n <= c.maxAntal; });
    c.endpoint = K.endpoint;   // tom i demoläge
    if (!c.swish.meddelande) c.swish.meddelande = lag.namn + " försäljning";
    return c;
  }

  /* ---------- Topbar och sidfot ---------- */
  var topPill = document.getElementById("pill");
  function setTopbar(pill, title) {
    topPill.hidden = !pill; topPill.textContent = pill || "";
    document.getElementById("club").textContent = K.namn;
    document.getElementById("apptitle").textContent = title;
  }
  if (K.logo) { var lg = document.getElementById("logo"); lg.src = K.logo; lg.hidden = false; }
  var foot = document.getElementById("foot");
  foot.appendChild(h("strong", { text: K.namn }));
  if (K.motto) foot.appendChild(h("div", { text: K.motto }));
  if (!K.visning) foot.appendChild(h("div", { style: "margin-top:8px" }, h("a", { href: "admin.html", text: "Admin" })));   // demosidan visar adminvyn bredvid

  var app = document.getElementById("app");

  /* ---------- Navigering ----------
     Länkarna mellan laglistan och ett lag byter vy utan att ladda om sidan. Adressen (?lag=<slug>) uppdateras
     så att den går att dela, och en vanlig länk (ny flik, Cmd/Ctrl-klick) fungerar som vanligt. */
  function slugFranUrl() { return (new URLSearchParams(location.search).get("lag") || "").toLowerCase(); }
  var valt = slugFranUrl();
  function gaTill(slug) {
    valt = slug || "";
    try { history.pushState(null, "", slug ? "?lag=" + encodeURIComponent(slug) : location.pathname); } catch (e) {}
    visa();
    window.scrollTo(0, 0);
  }
  function navLank(slug, attrs, text) {
    var a = h("a", Object.assign({ href: slug ? "?lag=" + encodeURIComponent(slug) : "./" }, attrs));
    if (text) a.textContent = text;
    a.addEventListener("click", function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault(); gaTill(slug);
    });
    return a;
  }

  /* ---------- Laglistan: framsida med lagbrickor ---------- */
  var IK_PIL = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false"><path d="M4 11h13M12 5l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var IK_PRICK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="6" fill="currentColor"/></svg>';
  var IK_RING = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
  var IK_STRECK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M2 7h10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  var IK_CIRKEL = '<svg class="cirkel" viewBox="0 0 220 220" aria-hidden="true" focusable="false"><circle cx="110" cy="110" r="100"/><circle cx="110" cy="110" r="5" class="spot"/></svg>';

  // Lagets namn på brickan: "F2017" blir F över 2017. Andra namn visas som de är.
  // "P2019", "F2014" och "P2019 Tulpaner" blir bokstav över årtal; resten av namnet står redan i rubriken.
  function platta(namn) {
    var m = /^([A-Za-zÅÄÖåäö])[A-Za-zÅÄÖåäö]*\s*(\d{4})(?!\d)/.exec(String(namn).trim());
    if (m) return h("span", { class: "plate" }, h("b", { text: m[1].toUpperCase() }), h("i", { text: m[2] }));
    return h("span", { class: "plate lang" }, h("b", { text: namn }));
  }

  // Antal beställda enligt laglistan (i demoläget exempelsiffran). Har laget ett lager och det är beställt är försäljningen slutsåld.
  function bestalltEnligtLista(l) { return typeof l.bestallt === "number" ? l.bestallt : l.demoBestallt; }
  function arSlutsald(l) { var n = bestalltEnligtLista(l); return l.lager > 0 && typeof n === "number" && n >= l.lager; }

  function teamCard(l) {
    var c = bygg(l), open = l.status === "pagar", slut = l.status === "avslutad";
    var titel = c.titel;
    var sub = c.pris > 0 ? kr(c.pris) + " per " + (c.produkt.enhetEn || "styck") : "";
    var tillstand = open ? (arSlutsald(l) ? ["Slutsåld", IK_STRECK] : ["Pågår", IK_PRICK]) : slut ? ["Avslutad", IK_STRECK] : ["Startar snart", IK_RING];
    var state = h("span", { class: "t-state" }, U.ikon(tillstand[1]), tillstand[0]);
    var badges = h("span", { class: "badges", style: "margin-top:10px" }, state);
    var body = h("span", { class: "t-body" }, h("span", { class: "t-title", text: titel }), sub ? h("span", { class: "t-sub", text: sub }) : null, badges);
    var card = open
      ? navLank(l.slug, { class: "tile teamcard", "aria-label": l.namn + ", " + titel + (sub ? ", " + sub : "") + (arSlutsald(l) ? ", slutsåld" : ", pågår") })
      : h("div", { class: "tile teamcard off " + (slut ? "slut" : "snart") });
    card.appendChild(platta(l.namn));
    card.appendChild(body);
    card.appendChild(open ? h("span", { class: "t-go", "aria-hidden": "true" }, U.ikon(IK_PIL)) : h("span"));
    return card;
  }

  function tileList(lista, start, kompakt) {
    var ul = h("ul", { class: "teams" + (kompakt ? " kompakt" : ""), "aria-label": "Lag" });
    lista.forEach(function (l, i) { ul.appendChild(h("li", { style: "--i:" + (start + i) }, teamCard(l))); });
    return ul;
  }

  var MANGA_LAG = 6;   // fler lag än så: sökruta och kompakta rader, så att listan går att överblicka

  function artal(namn) { var m = /(\d{4})/.exec(namn); return m ? Number(m[1]) : 0; }
  // Pågående först, sedan kommande, sedan avslutade. Inom varje grupp yngst först (högst födelseår), sedan på namn.
  function sorteraLag(lista) {
    var rang = { pagar: 0, snart: 1, avslutad: 2 };
    var r = function (l) { return rang[l.status] !== undefined ? rang[l.status] : 1; };
    return lista.slice().sort(function (x, y) {
      return (r(x) - r(y)) || (artal(y.namn) - artal(x.namn)) || x.namn.localeCompare(y.namn, "sv", { numeric: true });
    });
  }

  function renderList(LAG) {
    setTopbar("", K.titel);
    document.title = K.namn + " – " + K.titel;
    // Utkast och försäljningar som väntar på klubbens godkännande visas inte för föräldrar.
    LAG = sorteraLag(LAG.filter(function (l) { return l.status !== "utkast" && l.status !== "granskas"; }));
    var manga = LAG.length > MANGA_LAG;
    app.textContent = "";
    app.appendChild(h("header", { class: "hero" },
      h("div", { class: "deco", "aria-hidden": "true" }, U.ikon(IK_CIRKEL)),
      h("h1", null, "Välj ditt ", h("span", { class: "mark", text: "lag" })),
      h("p", { class: "lead", text: K.valjLagText })));
    if (!K.endpoint) app.appendChild(h("p", { class: "notice", style: "margin-top:22px", text: "Demoläge: lagen och siffrorna är exempel. Inget skickas eller sparas." }));
    app.appendChild(h("div", { class: "mittlinje", "aria-hidden": "true" }, h("i")));

    var sok = null, info = null;
    if (manga) {
      sok = h("input", { type: "search", id: "lagsok", placeholder: "Sök ditt lag, till exempel 2017", "aria-label": "Sök lag", autocomplete: "off", autocapitalize: "none", spellcheck: "false" });
      info = h("p", { class: "small", role: "status", style: "margin:10px 0 0" });
      app.appendChild(h("div", { class: "lagsok" }, sok, info));
    }
    var host = h("div");
    app.appendChild(host);

    function rita() {
      var q = sok ? sok.value.toLowerCase().replace(/\s+/g, "") : "";
      var vis = LAG.filter(function (l) { return !q || (l.namn + (l.titel || l.kampanj || "")).toLowerCase().replace(/\s+/g, "").indexOf(q) >= 0; });
      var pagande = vis.filter(function (l) { return l.status !== "avslutad"; }), avslutade = vis.filter(function (l) { return l.status === "avslutad"; });
      host.textContent = "";
      if (pagande.length) host.appendChild(tileList(pagande, 0, manga));
      if (avslutade.length) {
        var det = h("details", { class: "avslutade" }, h("summary", { text: "Avslutade (" + avslutade.length + ")" }), tileList(avslutade, 0, manga));
        if (q) det.open = true;   // en sökträff på ett avslutat lag ska synas direkt
        host.appendChild(det);
      }
      if (info) info.textContent = q ? (vis.length ? vis.length + (vis.length === 1 ? " lag" : " lag") + " matchar" : "") : "";
      if (!vis.length) host.appendChild(h("p", { class: "notice", style: "margin-top:22px", text: LAG.length
        ? "Inget lag matchar. Kolla stavningen, eller be om länken där du brukar prata med laget." : "Inga lag är tillagda ännu." }));
    }
    if (sok) sok.addEventListener("input", rita);
    rita();
  }

  function renderIngetLag() {
    setTopbar("", K.titel);
    document.title = K.namn + " – " + K.titel;
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Vi hittar inte laget" }));
    app.appendChild(h("p", { class: "lead", text: "Länken verkar vara fel. Välj ditt lag i listan." }));
    app.appendChild(navLank(null, { class: "primary", style: "margin-top:16px" }, "Till alla lag"));
  }

  /* ---------- Delat för beställningen ---------- */
  var MIN_VANTA_MS = 3500;   // servern nekar beställningar som kommer snabbare än 3 sekunder efter att sidan visades. Sidan väntar själv.
  var KVITTO_DAGAR = 14;     // så länge kvittot finns kvar i webbläsaren
  var BARN_RE = /^[\p{L}][\p{L}\p{M} '’\-.&\/,()]{1,39}$/u;   // samma regel som på servern

  // En kod per beställning. Försöker föräldern igen med samma uppgifter efter ett svar som uteblev får hen samma beställning, inte en ny.
  function slumpKod() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }
  function litenHash(s) { var x = 5381; for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }

  /* ---------- Ett lag: beställning, översikt, vanliga frågor ---------- */
  function renderTeam(cfg) {
    var loadedAt = Date.now();
    var state = { bestallt: null, antal: 0, barn: "", mobil: "" };
    var demo = !cfg.endpoint;
    var kodBas = slumpKod();

    // Har laget ett lager: hur många som finns kvar att beställa (null om det inte finns något lager). Servern kontrollerar alltid på nytt.
    function kvarNu() {
      if (!(cfg.lager > 0)) return null;
      var n = typeof state.bestallt === "number" ? state.bestallt : bestalltEnligtLista(cfg);
      return typeof n === "number" ? Math.max(0, cfg.lager - n) : null;
    }
    function maxNu() { var kv = kvarNu(); return kv === null ? cfg.maxAntal : Math.min(cfg.maxAntal, kv); }

    // Kvittot (ordernummer, belopp, antal) sparas i webbläsaren så att det finns kvar om sidan laddas om medan föräldern är i Swish.
    // Varken barnets namn eller mobilnummer sparas.
    function sparaKvitto(p, id, belopp) {
      if (demo) return;
      try { localStorage.setItem("kvitto:" + cfg.slug, JSON.stringify({ id: id, belopp: belopp, antal: p.antal, t: Date.now() })); } catch (e) {}
    }
    function hamtaKvitto() {
      if (demo) return null;
      try {
        var s = JSON.parse(localStorage.getItem("kvitto:" + cfg.slug) || "null");
        if (s && /^\d{4,}$/.test(String(s.id)) && typeof s.belopp === "number" && typeof s.antal === "number" && Date.now() - s.t < KVITTO_DAGAR * 864e5) return s;
      } catch (e) {}
      return null;
    }
    function rensaKvitto() { try { localStorage.removeItem("kvitto:" + cfg.slug); } catch (e) {} }
    var marginal = cfg.pris - cfg.inkopspris;
    var E = cfg.produkt.enhet || "st", En = cfg.produkt.enhetEn || "st";

    setTopbar(cfg.namn, cfg.titel);
    document.title = cfg.titel + " – " + cfg.namn;

    function fill(s) {
      return String(s).replace(/\{belonning\}/g, fill2(cfg.belonning)).replace(/\{lag\}/g, cfg.namn)
        .replace(/\{mal\}/g, nf.format(cfg.mal)).replace(/\{minimum\}/g, nf.format(cfg.minimum))
        .replace(/\{pris\}/g, cfg.pris + " kr").replace(/\{produkt\}/g, cfg.produkt.namn)
        .replace(/\{enhetEn\}/g, En).replace(/\{enhet\}/g, E);
    }
    function fill2(s) { // utan {belonning}, så att texten inte kan referera till sig själv
      return String(s).replace(/\{lag\}/g, cfg.namn).replace(/\{mal\}/g, nf.format(cfg.mal))
        .replace(/\{minimum\}/g, nf.format(cfg.minimum)).replace(/\{pris\}/g, cfg.pris + " kr")
        .replace(/\{produkt\}/g, cfg.produkt.namn).replace(/\{enhetEn\}/g, En).replace(/\{enhet\}/g, E);
    }

    // En enda sida, uppifrån och ned: lagets egen text, hur långt laget har kommit, beställningen och vanliga frågor.
    var intro = h("div");
    if (demo) intro.appendChild(h("p", { class: "notice", text: "Förhandsvisning med exempeldata. Inget skickas eller sparas." }));
    if (cfg.intro) intro.appendChild(h("p", { class: "lead", style: "margin-top:16px", text: fill(cfg.intro) }));
    var metersBox = h("div", { class: "card meters", style: "margin-top:16px", hidden: "" });
    var content = h("section");
    var viewF = h("section", { id: "fragor", style: "margin-top:32px" });

    app.textContent = "";
    app.appendChild(navLank(null, { class: "back" }, "← Alla lag"));
    app.appendChild(intro); app.appendChild(metersBox); app.appendChild(content); app.appendChild(viewF);
    function visaOvanfor(ja) { intro.hidden = !ja; metersBox.hidden = !ja || state.bestallt == null; }
    function tillFragor(e) { if (e) e.preventDefault(); viewF.scrollIntoView({ behavior: "smooth", block: "start" }); }

    /* ---------- Mätare ---------- */
    function pct(v, max) { return max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0; }

    function meter(o) {
      var bar = h("span"); bar.style.width = pct(o.value, o.max) + "%";
      var track = h("div", { class: "track", role: "progressbar", "aria-label": o.aria, "aria-valuemin": "0",
        "aria-valuemax": String(o.max), "aria-valuenow": String(Math.min(o.value, o.max)) }, bar);
      var wrap = h("div", { class: "track-wrap" }, track);
      var cap = h("p", { class: "m-cap" });
      o.cap.forEach(function (part) { cap.appendChild(typeof part === "string" ? document.createTextNode(part) : h("strong", { text: part.b })); });
      return h("div", null,
        h("div", { class: "m-head" }, o.label ? h("span", { class: "m-label", text: o.label }) : null,
          h("span", { class: "m-value num" }, o.big, h("small", { text: " " + o.small }))),
        wrap, cap);
    }

    function renderMeters() {
      metersBox.textContent = "";
      var n = state.bestallt, mal = cfg.mal;
      if (n == null) { metersBox.hidden = true; return; }
      var cap = [{ b: "Ungefär " + kr(n * marginal) + " till lagkassan. " }];
      if (n < mal) { if (cfg.belonning) cap.push(fill(cfg.belonning)); }
      else cap.push([n >= mal ? "Målet är nått!" : "", fill(cfg.belonningNatt)].filter(Boolean).join(" "));
      metersBox.appendChild(meter({ label: "", big: nf.format(n), small: "av " + nf.format(mal) + " " + E, value: n, max: mal,
        aria: "Beställda " + E, cap: cap }));
      metersBox.hidden = intro.hidden;
    }

    function loadStatus() {
      if (demo) { state.bestallt = cfg.demoBestallt + U.demoOrdrar(cfg.slug).reduce(function (n, o) { return n + o.antal; }, 0); renderMeters(); return; }
      if (typeof cfg.bestallt === "number") { state.bestallt = cfg.bestallt; renderMeters(); return; }   // följer med laglistan
      fetch(cfg.endpoint + "?action=status&klubb=" + encodeURIComponent(K.slug) + "&lag=" + encodeURIComponent(cfg.slug))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok && typeof d.bestallt === "number") state.bestallt = d.bestallt;
          renderMeters();
        })
        .catch(function () { renderMeters(); });
    }

    /* ---------- Formulär ---------- */
    function renderForm() {
      kodBas = slumpKod();
      content.textContent = "";
      visaOvanfor(true);
      if (kvarNu() === 0) {
        content.appendChild(h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0", text: "Slutsåld" }),
          h("p", { style: "margin:6px 0 0", text: "Alla " + nf.format(cfg.lager) + " " + E + " är beställda." })));
        return;
      }

      var errBox = h("p", { class: "formerror", role: "alert", hidden: "" });
      var form = h("form", { class: "card", novalidate: "", autocomplete: "off", style: "margin-top:16px" }, errBox);

      var P = cfg.produkt;
      var antalInp = h("input", { type: "number", inputmode: "numeric", id: "antal", min: "0", max: String(maxNu()), value: String(state.antal), "aria-label": "Antal " + E });
      // Raden har alltid sin plats, så att inget hoppar när antalet ändras (annars kan ett tryck på knappen missa)
      var summa = h("p", { class: "small", style: "margin:10px 0 0; min-height:1.45em", "aria-live": "polite" });
      var submit = h("button", { type: "submit", class: "primary", style: "margin-top:20px" });
      var presetBtns = [];
      function knappText() { return state.antal ? "Beställ för " + kr(state.antal * cfg.pris) : "Beställ"; }
      function setAntal(v) {
        state.antal = Math.max(0, Math.min(maxNu(), v | 0));
        antalInp.value = String(state.antal);
        presetBtns.forEach(function (b) { b.btn.setAttribute("aria-pressed", String(b.n === state.antal)); });
        summa.textContent = state.antal ? kr(state.antal * marginal) + " går till lagkassan." : "";
        submit.textContent = knappText();
      }
      antalInp.addEventListener("change", function () { setAntal(parseInt(antalInp.value, 10) || 0); });
      // Medan föräldern skriver: summan och knappen följer med direkt, utan att fältet skrivs om
      antalInp.addEventListener("input", function () {
        var v = Math.max(0, Math.min(maxNu(), parseInt(antalInp.value, 10) || 0));
        state.antal = v; summa.textContent = v ? kr(v * marginal) + " går till lagkassan." : ""; submit.textContent = knappText();
        presetBtns.forEach(function (b) { b.btn.setAttribute("aria-pressed", String(b.n === v)); });
      });

      var presets = h("div", { class: "presets", role: "group", "aria-label": "Snabbval" });
      cfg.snabbval.forEach(function (n) {
        if (n > maxNu()) return;   // fler än det som finns kvar kan inte väljas
        var btn = h("button", { type: "button", class: "preset num", text: String(n), "aria-pressed": "false", onclick: function () { setAntal(n); } });
        presetBtns.push({ n: n, btn: btn }); presets.appendChild(btn);
      });

      var meta = [P.detalj, kr(cfg.pris) + " per " + En, kvarNu() !== null ? nf.format(kvarNu()) + " kvar" : ""].filter(Boolean).join(" · ");
      // Produktens namn står redan i sidhuvudet: här bara beskrivningen och priset
      form.appendChild(h("div", { class: "field" },
        h("p", { style: "margin:0 0 12px; font-weight:700", text: meta }),
        h("div", { class: "stepper" },
          h("button", { type: "button", "aria-label": "Minska antal", text: "−", onclick: function () { setAntal(state.antal - 1); } }), antalInp,
          h("button", { type: "button", "aria-label": "Öka antal", text: "+", onclick: function () { setAntal(state.antal + 1); } })),
        presets, summa,
        h("p", { class: "error", id: "err-antal" })));

      var barn = h("input", { type: "text", id: "barn", name: "barn", maxlength: "40", autocomplete: "off", autocapitalize: "words", value: state.barn });
      barn.addEventListener("input", function () { state.barn = barn.value; });
      form.appendChild(h("div", { class: "field" }, h("label", { for: "barn", text: "Barnets förnamn" }), barn, h("p", { class: "error", id: "err-barn" })));

      var mobil = h("input", { type: "tel", id: "mobil", name: "mobil", inputmode: "tel", autocomplete: "tel", placeholder: "07x xxx xx xx", maxlength: "20", value: state.mobil });
      mobil.addEventListener("input", function () { state.mobil = mobil.value; });
      form.appendChild(h("div", { class: "field" }, h("label", { for: "mobil", text: "Ditt mobilnummer" }), mobil, h("p", { class: "error", id: "err-mobil" })));

      var hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
      form.appendChild(h("div", { class: "hp", "aria-hidden": "true" }, h("label", { text: "Lämna tomt" }), hp));

      form.appendChild(submit);
      setAntal(state.antal);
      // Ingen ruta att kryssa i: uppgifterna behövs för att hantera beställningen, så föräldern får bara veta vad som sparas
      form.appendChild(h("p", { class: "small", style: "margin:12px 0 0" },
        "Laget sparar barnets förnamn och ditt mobilnummer för att hantera beställningen. ",
        h("a", { href: "#fragor", onclick: tillFragor }, "Vanliga frågor")));
      content.appendChild(form);

      function setErr(id, msg) { var e = document.getElementById(id); if (e) e.textContent = msg || ""; }
      function normalizeMobil(s) {
        s = String(s || "").replace(/\(0\)/g, "").replace(/[\s\-().]/g, "");
        if (s.indexOf("+46") === 0) s = "0" + s.slice(3); else if (s.indexOf("0046") === 0) s = "0" + s.slice(4);
        return s;
      }

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        ["barn", "mobil", "antal"].forEach(function (k) { setErr("err-" + k); });
        errBox.hidden = true;
        var ok = true;
        var namn = barn.value.trim();
        if (!BARN_RE.test(namn)) { setErr("err-barn", "Skriv barnets namn med bokstäver (2–40 tecken). Mellanslag, bindestreck och & går bra."); ok = false; }
        var tel = normalizeMobil(mobil.value);
        if (!/^07\d{8}$/.test(tel)) { setErr("err-mobil", "Skriv ett svenskt mobilnummer, till exempel 070 123 45 67."); ok = false; }
        if (state.antal < 1) { setErr("err-antal", "Välj hur många " + E + " du vill beställa."); ok = false; }
        else if (kvarNu() !== null && state.antal > kvarNu()) { setErr("err-antal", "Det finns bara " + nf.format(kvarNu()) + " kvar."); ok = false; }
        if (!ok) { var f = form.querySelector(".error:not(:empty)"); if (f) f.scrollIntoView({ block: "center", behavior: "smooth" }); return; }

        var payload = { klubb: K.slug, lag: cfg.slug, barn: namn, mobil: tel, antal: state.antal, website: hp.value,
          kod: kodBas + "-" + litenHash(namn + "|" + tel + "|" + state.antal) };
        submit.disabled = true; submit.textContent = "Skickar…";
        function fail(msg) {
          submit.disabled = false; submit.textContent = knappText();
          errBox.textContent = msg; errBox.hidden = false; errBox.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        if (demo) {
          // Demo: beställningen sparas bara i fliken, så att lagförälderns vy kan visa den. Numret fortsätter efter lagets exempelbeställningar.
          var nr = (cfg.demoOrdrar ? cfg.demoOrdrar.length : 100) + U.demoOrdrar(cfg.slug).length + 1;
          var demoId = String(nr).padStart(4, "0"), demoBelopp = Math.round(payload.antal * cfg.pris * 100) / 100;
          U.sparaDemoOrder(cfg.slug, { id: demoId, tid: new Date().toISOString(), barn: namn, mobil: String(tel).replace(/\D/g, ""), antal: payload.antal,
            belopp: demoBelopp, betald: "", hamtad: "" });
          setTimeout(function () { success(payload, demoId, demoBelopp); }, 400); return;
        }
        // Går föräldern fort fram väntar sidan själv de sekunder som saknas, så att hen aldrig ser ett fel för det.
        setTimeout(function () {
          payload.t = Date.now() - loadedAt;
          fetch(cfg.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.ok) success(payload, d.id, typeof d.belopp === "number" ? d.belopp : Math.round(payload.antal * cfg.pris * 100) / 100);
              else if (d && typeof d.kvar === "number" && cfg.lager > 0) {
                // Någon annan hann före: visa hur många som verkligen finns kvar, och behåll det föräldern skrivit
                state.bestallt = Math.max(0, cfg.lager - d.kvar); state.antal = Math.min(state.antal, d.kvar);
                renderMeters(); renderForm();
                var eb = content.querySelector(".formerror");
                if (eb) { eb.textContent = d.fel; eb.hidden = false; eb.scrollIntoView({ block: "center", behavior: "smooth" }); }
              } else fail((d && d.fel) || "Något gick fel. Försök igen.");
            })
            .catch(function () { fail("Det gick inte att skicka just nu. Kolla uppkopplingen och försök igen, eller hör av dig där du brukar prata med laget."); });
        }, Math.max(0, MIN_VANTA_MS - (Date.now() - loadedAt)));
      });
    }

    function success(p, orderId, belopp) {
      if (typeof state.bestallt === "number") state.bestallt += p.antal;
      sparaKvitto(p, orderId, belopp);
      renderMeters();
      renderDone(p, orderId, belopp);
    }

    /* ---------- Bekräftelse med Swish-instruktioner ---------- */
    function copyText(text, btn) {
      function flash() { var old = btn.textContent; btn.textContent = "Kopierat ✓"; btn.classList.add("ok"); setTimeout(function () { btn.textContent = old; btn.classList.remove("ok"); }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(flash, fallback); } else fallback();
      function fallback() {
        var t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = text; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); flash(); } catch (e) {} document.body.removeChild(t);
      }
    }

    function renderDone(p, orderId, belopp, aterstalld) {
      content.textContent = "";
      visaOvanfor(false);
      var nummer = cfg.swish.nummer || (demo ? cfg.demoSwish : "");
      var meddelande = (cfg.swish.meddelande + " " + orderId).slice(0, 50);

      var swish = h("div", { class: "swish" }, h("h3", { text: "Swisha " + kr(belopp) }));
      if (nummer) {
        var row = function (k, v, raw) {
          var b = h("button", { type: "button", class: "copy", text: "Kopiera", "aria-label": "Kopiera " + k.toLowerCase() });
          b.addEventListener("click", function () { copyText(raw || v, b); });
          return h("div", { class: "copyrow" }, h("div", null, h("div", { class: "k", text: k }), h("div", { class: "v num", text: v })), b);
        };
        swish.appendChild(row(cfg.swish.namnPaKonto || "Swish-nummer", nummer, String(nummer).replace(/\s/g, "")));
        swish.appendChild(row("Belopp", kr(belopp), String(belopp)));
        swish.appendChild(row("Meddelande", meddelande, meddelande));
        swish.appendChild(h("p", { class: "small", style: "margin:10px 0 0", text: "Behåll meddelandet, så hittar laget din betalning." }));
      } else {
        swish.appendChild(h("p", { text: "Swish-uppgifterna kommer snart. Vi hör av oss där du brukar prata med laget." }));
      }

      content.appendChild(h("div", { class: "card done", style: "margin-top:16px" },
        demo ? h("p", { class: "okline", text: K.visning ? "Demo: beställningen syns nu hos lagföräldern" : "Förhandsvisning (inget skickades)" }) : null,
        h("h2", { text: p.barn ? "Tack, " + p.barn + "!" : "Din beställning" }),
        h("div", { class: "sumrow" }, h("span", { class: "num", text: p.antal + " × " + cfg.produkt.namn }), h("span", { class: "num", text: "Order " + orderId })),
        aterstalld ? h("p", { class: "notice", text: "Det här är din senaste beställning. Har du redan swishat är du klar." }) : null,
        swish,
        cfg.utlamning ? h("p", { style: "margin:14px 0 0", text: fill(cfg.utlamning) }) : null,
        h("button", { type: "button", class: "ghost", style: "margin-top:16px", text: "Ny beställning",
          onclick: function () { rensaKvitto(); state.antal = 0; state.barn = ""; renderForm(); window.scrollTo(0, 0); } })));
      window.scrollTo(0, 0);
    }

    /* ---------- Vanliga frågor ---------- */
    function renderFaq() {
      viewF.textContent = "";
      viewF.appendChild(h("h3", { style: "margin:0 0 10px", text: "Vanliga frågor" }));
      var c = h("div", { class: "card" });
      cfg.faq.forEach(function (it) {
        if (it.kraver && !cfg[it.kraver]) return;
        if (it.kraverInte && cfg[it.kraverInte]) return;   // frågor som bara gäller utan lager
        c.appendChild(h("details", null, h("summary", { text: fill(it.f) }), h("p", { text: fill(it.s) })));
      });
      viewF.appendChild(c);
      viewF.appendChild(h("p", { class: "small", style: "margin-top:12px", text: K.kontakt }));
    }

    renderFaq();
    renderForm();
    var kvitto = hamtaKvitto();
    if (kvitto) renderDone({ barn: "", antal: kvitto.antal }, kvitto.id, kvitto.belopp, true);
    loadStatus();
    if (location.hash === "#fragor") setTimeout(tillFragor, 0);   // äldre länkar till fliken Vanliga frågor
  }

  function renderInteOppen(cfg) {
    setTopbar(cfg.namn, cfg.titel || K.titel);
    document.title = (cfg.titel || K.titel) + " – " + cfg.namn;
    app.textContent = "";
    app.appendChild(navLank(null, { class: "back" }, "← Alla lag"));
    app.appendChild(h("h2", { class: "title", text: cfg.status === "avslutad" ? "Försäljningen är avslutad" : "Försäljningen har inte startat än" }));
    app.appendChild(h("p", { class: "lead", text: cfg.status === "avslutad"
      ? "Tack till alla som har beställt! Det går inte att beställa längre för " + cfg.namn + "."
      : "Försäljningen för " + cfg.namn + " öppnar snart. Vi säger till där du brukar få besked från laget när den öppnar." }));
    app.appendChild(h("p", { class: "small", text: K.kontakt }));
  }

  function renderFel() {
    setTopbar("", K.titel);
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Det gick inte att hämta lagen" }));
    app.appendChild(h("p", { class: "lead", text: "Kontrollera uppkopplingen och försök igen om en stund." }));
    app.appendChild(h("button", { type: "button", class: "primary", style: "margin-top:16px", text: "Försök igen", onclick: visa }));
  }

  /* ---------- Router: ?lag=<slug> visar ett lag, annars listan ---------- */
  function visa() {
    var slug = valt;
    setTopbar("", K.titel);
    app.textContent = "";
    app.appendChild(h("p", { class: "loading", text: "Hämtar lag…" }));
    hamtaLag(function (err, lista) {
      if (slug !== valt) return;   // användaren hann byta vy
      if (err) return renderFel();
      if (!slug) return renderList(lista);
      var hit = lista.filter(function (l) { return l.slug === slug; })[0];
      if (!hit) return renderIngetLag();
      if (hit.status === "utkast" || hit.status === "granskas") return renderInteOppen({ namn: hit.namn, status: "snart" });
      var cfg = bygg(hit);
      if (cfg.status !== "pagar") return renderInteOppen(cfg);
      renderTeam(cfg);
    });
  }
  window.addEventListener("popstate", function () { valt = slugFranUrl(); visa(); });
  visa();
})();
