/* ==========================================================================
   Klubbsidan: laglista + beställningssida per lag.
   Lagen och deras uppgifter hämtas från klubbens server (Server.gs), eller från
   exempeldata i demoläge. Inget här behöver ändras när ett lag läggs till.
   Beställningssidan bygger på P2019-sidan (adelborgen/eskilsminne-p2019), men allt kommer från lagets inställningar.
   ========================================================================== */
(function () {
  "use strict";

  var U = window.U, h = U.h, kr = U.kr, nf = U.nf, merge = U.merge, hamtaLag = U.hamtaLag;
  var K = window.KLUBB;

  // Standardvärden, lagets texter (LAG_EXTRA) och lagets egna uppgifter från servern, i den ordningen.
  function bygg(lag) {
    var c = merge(merge(K.standard, (window.LAG_EXTRA || {})[lag.slug] || {}), lag);
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
  foot.appendChild(h("div", { style: "margin-top:8px" }, h("a", { href: "admin.html", text: "Admin" })));

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
  function platta(namn) {
    var m = /^([A-Za-zÅÄÖåäö])[A-Za-zÅÄÖåäö]*\s*(\d{4})$/.exec(String(namn).trim());
    if (m) return h("span", { class: "plate" }, h("b", { text: m[1].toUpperCase() }), h("i", { text: m[2] }));
    return h("span", { class: "plate lang" }, h("b", { text: namn }));
  }

  function teamCard(l) {
    var c = bygg(l), open = l.status === "pagar", slut = l.status === "avslutad";
    var titel = l.kampanj || K.titel;
    var sub = c.pris > 0 ? kr(c.pris) + " per " + (c.produkt.enhetEn || "styck") : "";
    var tillstand = open ? ["Pågår", IK_PRICK] : slut ? ["Avslutad", IK_STRECK] : ["Startar snart", IK_RING];
    var state = h("span", { class: "t-state" }, U.ikon(tillstand[1]), tillstand[0]);
    var badges = h("span", { class: "badges", style: "margin-top:10px" }, state);
    var body = h("span", { class: "t-body" }, h("span", { class: "t-title", text: titel }), sub ? h("span", { class: "t-sub", text: sub }) : null, badges);
    var card = open
      ? navLank(l.slug, { class: "tile teamcard", "aria-label": l.namn + ", " + titel + (sub ? ", " + sub : "") + ", pågår" })
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
      h("p", { class: "lead", text: K.valjLagText }),
      h("ol", { class: "hero-steps" }, h("li", null, h("b", { text: "1" }), "Välj lag"), h("li", null, h("b", { text: "2" }), "Beställ"), h("li", null, h("b", { text: "3" }), "Swisha till laget")),
      h("p", { class: "fast", text: "Klart på under en minut." })));
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
      var vis = LAG.filter(function (l) { return !q || (l.namn + (l.kampanj || "")).toLowerCase().replace(/\s+/g, "").indexOf(q) >= 0; });
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
        ? "Inget lag matchar. Kontrollera stavningen, eller be om länken i lagets WhatsApp-grupp." : "Inga lag är tillagda ännu." }));
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

  /* ---------- Ett lag: beställning, översikt, vanliga frågor ---------- */
  function renderTeam(cfg) {
    var loadedAt = Date.now();
    var state = { bestallt: null, antal: 0, barn: "", mobil: "" };
    var demo = !cfg.endpoint;
    var marginal = cfg.pris - cfg.inkopspris;
    var E = cfg.produkt.enhet, En = cfg.produkt.enhetEn || "styck";

    setTopbar(cfg.namn, cfg.kampanj || K.titel);
    document.title = (cfg.kampanj || K.titel) + " – " + cfg.namn;

    function fill(s) {
      return String(s).replace(/\{belonning\}/g, fill2(cfg.belonning)).replace(/\{lag\}/g, cfg.namn)
        .replace(/\{mal\}/g, nf.format(cfg.mal)).replace(/\{minimum\}/g, nf.format(cfg.minimum))
        .replace(/\{pris\}/g, cfg.pris + " kr");
    }
    function fill2(s) { // utan {belonning}, så att texten inte kan referera till sig själv
      return String(s).replace(/\{lag\}/g, cfg.namn).replace(/\{mal\}/g, nf.format(cfg.mal))
        .replace(/\{minimum\}/g, nf.format(cfg.minimum)).replace(/\{pris\}/g, cfg.pris + " kr");
    }

    var content = h("section");
    var metersBox = h("section", { "aria-label": "Översikt just nu", style: "margin-top:16px" }, h("p", { class: "loading", text: "Hämtar översikten…" }));
    var viewF = h("section", { role: "tabpanel", "aria-labelledby": "tab-fragor", hidden: "" });
    var viewB = h("section", { role: "tabpanel", "aria-labelledby": "tab-bestall" }, content);
    var viewO = h("section", { role: "tabpanel", "aria-labelledby": "tab-oversikt", hidden: "" },
      h("h2", { class: "title", text: "Översikt" }),
      h("p", { class: "lead", text: "Så här många " + E + " har hela laget beställt hittills." }), metersBox);

    var TABS = ["bestall", "oversikt", "fragor"];
    var VIEWS = { bestall: viewB, oversikt: viewO, fragor: viewF };
    var tabsEl = h("div", { class: "tabs", role: "tablist", "aria-label": "Sidor" });
    [["bestall", "Beställ"], ["oversikt", "Översikt"], ["fragor", "Vanliga frågor"]].forEach(function (t) {
      tabsEl.appendChild(h("button", { role: "tab", id: "tab-" + t[0], "aria-selected": t[0] === "bestall" ? "true" : "false",
        text: t[1], onclick: function () { showTab(t[0]); } }));
    });

    app.textContent = "";
    app.appendChild(navLank(null, { class: "back" }, "← Alla lag"));
    app.appendChild(tabsEl);
    app.appendChild(viewB); app.appendChild(viewO); app.appendChild(viewF);

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
        h("div", { class: "m-head" }, h("span", { class: "m-label", text: o.label }),
          h("span", { class: "m-value num" }, o.big, h("small", { text: " " + o.small }))),
        wrap, cap);
    }

    function renderMeters() {
      metersBox.textContent = "";
      var n = state.bestallt;
      if (n == null) { metersBox.appendChild(h("p", { class: "loading", text: state.statusFel ? "Det gick inte att hämta översikten just nu. Försök igen om en stund." : "Hämtar översikten…" })); return; }
      var mal = cfg.mal, cap1;
      if (n < mal) {
        cap1 = [{ b: nf.format(mal - n) + " kvar till " + nf.format(mal) + ". " }];
        if (cfg.belonning) cap1.push(fill(cfg.belonning));
      } else {
        cap1 = [{ b: "Målet nått! " }, [fill(cfg.belonningNatt),
          n > mal ? "Allt över " + nf.format(mal) + " är bonus: +" + nf.format(n - mal) + " " + E + "." : ""].filter(Boolean).join(" ")];
      }
      metersBox.appendChild(h("div", { class: "card meters" }, h("p", { class: "kicker", text: "Hela laget just nu" }),
        meter({ label: "Beställt", big: nf.format(n), small: "av " + nf.format(mal) + " " + E, value: n, max: mal,
          aria: "Beställda " + E, cap: cap1 }),
        meter({ label: "Beräknat till lagkassan", big: kr(n * marginal), small: "av beställningarna hittills", value: n * marginal, max: mal * marginal,
          aria: "Pengar till lagkassan",
          cap: [{ b: kr(marginal) }, " av varje " + En + " går till lagkassan. Vid " + nf.format(mal) + " " + E + " blir det " + kr(mal * marginal) + "."] })));
    }

    function loadStatus() {
      if (demo) { state.bestallt = cfg.demoBestallt; renderMeters(); return; }
      fetch(cfg.endpoint + "?action=status&lag=" + encodeURIComponent(cfg.slug))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok && typeof d.bestallt === "number") { state.bestallt = d.bestallt; state.statusFel = false; }
          else if (state.bestallt == null) state.statusFel = true;
          renderMeters();
        })
        .catch(function () { if (state.bestallt == null) { state.statusFel = true; renderMeters(); } });
    }

    /* ---------- Formulär ---------- */
    function renderForm() {
      content.textContent = "";
      if (demo) content.appendChild(h("p", { class: "notice", text: "Förhandsvisning med exempeldata. Inget skickas eller sparas." }));
      content.appendChild(h("div", { style: "margin-top:16px" }, h("h2", { class: "title", text: "Beställ" }), h("p", { class: "lead", text: fill(cfg.intro) })));

      var errBox = h("p", { class: "formerror", role: "alert", hidden: "" });
      var form = h("form", { class: "card", novalidate: "", autocomplete: "off", style: "margin-top:16px" }, errBox);

      var barn = h("input", { type: "text", id: "barn", name: "barn", maxlength: "40", autocomplete: "off", autocapitalize: "words", placeholder: "Förnamn", value: state.barn });
      barn.addEventListener("input", function () { state.barn = barn.value; });
      form.appendChild(h("div", { class: "field" },
        h("label", { for: "barn" }, "Barnets namn", h("span", { class: "hint", text: "Förnamn räcker. Lägg till efternamnets första bokstav om flera heter likadant." })),
        barn, h("p", { class: "error", id: "err-barn" })));

      var mobil = h("input", { type: "tel", id: "mobil", name: "mobil", inputmode: "tel", autocomplete: "tel", placeholder: "07x xxx xx xx", maxlength: "20", value: state.mobil });
      mobil.addEventListener("input", function () { state.mobil = mobil.value; });
      form.appendChild(h("div", { class: "field" },
        h("label", { for: "mobil" }, "Ditt mobilnummer", h("span", { class: "hint", text: "Så att vi kan nå dig om utlämning och betalning." })),
        mobil, h("p", { class: "error", id: "err-mobil" })));

      var P = cfg.produkt;
      var antalInp = h("input", { type: "number", inputmode: "numeric", id: "antal", min: "0", max: String(cfg.maxAntal), value: String(state.antal), "aria-label": "Antal " + E });
      var payBig = h("p", { class: "big num" }), paySub = h("p", { class: "sub" });
      var presetBtns = [];
      function setAntal(v) {
        state.antal = Math.max(0, Math.min(cfg.maxAntal, v | 0));
        antalInp.value = String(state.antal);
        presetBtns.forEach(function (b) { b.btn.setAttribute("aria-pressed", String(b.n === state.antal)); });
        if (state.antal === 0) { payBig.textContent = "Välj antal " + E; paySub.textContent = ""; }
        else {
          payBig.textContent = "Du swishar " + kr(state.antal * cfg.pris);
          paySub.textContent = "";
          paySub.appendChild(h("strong", { text: kr(state.antal * marginal) })); paySub.appendChild(document.createTextNode(" av det går till lagkassan."));
        }
      }
      antalInp.addEventListener("change", function () { setAntal(parseInt(antalInp.value, 10) || 0); });

      var presets = h("div", { class: "presets", role: "group", "aria-label": "Snabbval" });
      cfg.snabbval.forEach(function (n) {
        var btn = h("button", { type: "button", class: "preset num", text: String(n), "aria-pressed": "false", onclick: function () { setAntal(n); } });
        presetBtns.push({ n: n, btn: btn }); presets.appendChild(btn);
      });

      form.appendChild(h("div", { class: "field" },
        h("span", { class: "label", text: "Hur många " + E + "?" }),
        h("div", { class: "product" }, h("div", { class: "ico", "aria-hidden": "true", text: P.emoji }),
          h("div", null, h("div", { class: "name", text: P.namn }), h("div", { class: "meta", text: P.detalj + " · " + kr(cfg.pris) + "/st" }))),
        h("div", { class: "stepper" },
          h("button", { type: "button", "aria-label": "Minska antal", text: "−", onclick: function () { setAntal(state.antal - 1); } }), antalInp,
          h("button", { type: "button", "aria-label": "Öka antal", text: "+", onclick: function () { setAntal(state.antal + 1); } })),
        presets,
        h("div", { class: "pay", "aria-live": "polite" }, payBig, paySub),
        h("p", { class: "error", id: "err-antal" })));
      setAntal(state.antal);

      var hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
      form.appendChild(h("div", { class: "hp", "aria-hidden": "true" }, h("label", { text: "Lämna tomt" }), hp));

      var samtycke = h("input", { type: "checkbox", id: "samtycke" });
      form.appendChild(h("div", { class: "field" },
        h("label", { class: "check", for: "samtycke" }, samtycke,
          h("span", { text: "Jag godkänner att barnets förnamn och mitt mobilnummer sparas av laget för att hantera beställningen." })),
        h("p", { class: "error", id: "err-samtycke" })));

      var submit = h("button", { type: "submit", class: "primary", text: "Beställ och gå vidare till Swish" });
      form.appendChild(submit);
      form.appendChild(h("p", { class: "small", style: "margin:12px 0 0", text: cfg.aterbetalning }));
      content.appendChild(form);

      function setErr(id, msg) { var e = document.getElementById(id); if (e) e.textContent = msg || ""; }
      function normalizeMobil(s) {
        s = String(s || "").replace(/[\s\-().]/g, "");
        if (s.indexOf("+46") === 0) s = "0" + s.slice(3); else if (s.indexOf("0046") === 0) s = "0" + s.slice(4);
        return s;
      }

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        ["barn", "mobil", "antal", "samtycke"].forEach(function (k) { setErr("err-" + k); });
        errBox.hidden = true;
        var ok = true;
        var namn = barn.value.trim();
        if (!/^[\p{L}][\p{L} '\-.]{1,39}$/u.test(namn)) { setErr("err-barn", "Skriv barnets namn (2–40 tecken)."); ok = false; }
        var tel = normalizeMobil(mobil.value);
        if (!/^07\d{8}$/.test(tel)) { setErr("err-mobil", "Skriv ett svenskt mobilnummer, till exempel 070 123 45 67."); ok = false; }
        if (state.antal < 1) { setErr("err-antal", "Välj hur många " + E + " du vill beställa."); ok = false; }
        if (!samtycke.checked) { setErr("err-samtycke", "Du behöver godkänna för att kunna beställa."); ok = false; }
        if (!ok) { var f = form.querySelector(".error:not(:empty)"); if (f) f.scrollIntoView({ block: "center", behavior: "smooth" }); return; }

        var payload = { lag: cfg.slug, barn: namn, mobil: tel, antal: state.antal, samtycke: true, website: hp.value, t: Date.now() - loadedAt };
        submit.disabled = true; submit.textContent = "Skickar…";
        function fail(msg) {
          submit.disabled = false; submit.textContent = "Beställ och gå vidare till Swish";
          errBox.textContent = msg; errBox.hidden = false; errBox.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        if (demo) { setTimeout(function () { success(payload, "DEMO0001", payload.antal * cfg.pris); }, 400); return; }
        fetch(cfg.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok) success(payload, d.id, typeof d.belopp === "number" ? d.belopp : payload.antal * cfg.pris);
            else fail((d && d.fel) || "Något gick fel. Försök igen.");
          })
          .catch(function () { fail("Det gick inte att skicka just nu. Kontrollera uppkopplingen och försök igen, eller hör av dig i WhatsApp-gruppen."); });
      });
    }

    function success(p, orderId, belopp) {
      if (typeof state.bestallt === "number") state.bestallt += p.antal;
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

    function renderDone(p, orderId, belopp) {
      content.textContent = "";
      var nummer = cfg.swish.nummer || (demo ? cfg.demoSwish : "");
      var meddelande = (cfg.swish.meddelande + " " + orderId).slice(0, 50);

      var swish = h("div", { class: "swish" }, h("h3", { text: "Swisha " + kr(belopp) + " nu" }));
      if (nummer) {
        var row = function (k, v, raw) {
          var b = h("button", { type: "button", class: "copy", text: "Kopiera", "aria-label": "Kopiera " + k.toLowerCase() });
          b.addEventListener("click", function () { copyText(raw || v, b); });
          return h("div", { class: "copyrow" }, h("div", null, h("div", { class: "k", text: k }), h("div", { class: "v num", text: v })), b);
        };
        swish.appendChild(row("Swish-nummer", nummer, String(nummer).replace(/\s/g, "")));
        if (cfg.swish.namnPaKonto) swish.appendChild(h("p", { class: "small", style: "margin:0 0 6px", text: "Mottagare: " + cfg.swish.namnPaKonto }));
        swish.appendChild(row("Belopp", kr(belopp), String(belopp)));
        swish.appendChild(row("Meddelande", meddelande, meddelande));
        swish.appendChild(h("ol", { class: "steps small" },
          h("li", { text: "Öppna Swish och fyll i numret, beloppet och meddelandet ovan. Tryck Kopiera för att slippa skriva." }),
          h("li", { text: "Behåll meddelandet. Det är så vi hittar din betalning." }),
          h("li", { text: "Klart! Du behöver inte göra något mer." })));
      } else {
        swish.appendChild(h("p", { text: "Swish-uppgifter kommer inom kort. Vi hör av oss i lagets WhatsApp-grupp." }));
      }

      content.appendChild(h("div", { class: "card done", style: "margin-top:16px" },
        h("p", { class: "okline", text: demo ? "Förhandsvisning (inget skickades)" : "Beställningen är mottagen" }),
        h("h2", { text: "Tack, " + p.barn + "!" }),
        h("div", { class: "sumrow" }, h("span", { class: "num", text: p.antal + " × " + cfg.produkt.namn }), h("span", { class: "num", text: kr(belopp) })),
        swish,
        h("p", { class: "small", style: "margin:14px 0 0", text: "Ordernummer: " + orderId + ". Ta gärna en skärmdump." }),
        h("p", { class: "small", text: "Din beställning räknas som klar när betalningen har kommit in." }),
        h("p", { text: fill(cfg.utlamning) }),
        h("p", { class: "small", text: cfg.aterbetalning }),
        h("p", { class: "small", text: K.kontakt }),
        h("button", { type: "button", class: "ghost", text: "Gör en ny beställning",
          onclick: function () { state.antal = 0; state.barn = ""; renderForm(); window.scrollTo(0, 0); } })));
      window.scrollTo(0, 0);
    }

    /* ---------- Flikar och vanliga frågor ---------- */
    // Översikten hämtas direkt när sidan laddas (i bakgrunden) och på nytt varje gång fliken öppnas.
    function showTab(which) {
      if (TABS.indexOf(which) < 0) which = "bestall";
      TABS.forEach(function (t) {
        document.getElementById("tab-" + t).setAttribute("aria-selected", String(t === which));
        VIEWS[t].hidden = t !== which;
      });
      try { history.replaceState(null, "", location.search + (which === "bestall" ? "" : "#" + which)); } catch (e) {}
      if (which === "oversikt" && !demo) loadStatus();
      window.scrollTo(0, 0);
    }

    function renderFaq() {
      viewF.textContent = "";
      viewF.appendChild(h("h2", { class: "title", text: "Vanliga frågor" }));
      var c = h("div", { class: "card", style: "margin-top:16px" });
      cfg.faq.forEach(function (it) {
        if (it.kraver && !cfg[it.kraver]) return;
        c.appendChild(h("details", null, h("summary", { text: fill(it.f) }), h("p", { text: fill(it.s) })));
      });
      viewF.appendChild(c);
      viewF.appendChild(h("p", { class: "small", style: "margin-top:12px", text: K.kontakt }));
    }

    renderFaq();
    renderForm();
    loadStatus();
    if (location.hash) showTab(location.hash.slice(1));
  }

  function renderInteOppen(cfg) {
    setTopbar(cfg.namn, cfg.kampanj || K.titel);
    document.title = (cfg.kampanj || K.titel) + " – " + cfg.namn;
    app.textContent = "";
    app.appendChild(navLank(null, { class: "back" }, "← Alla lag"));
    app.appendChild(h("h2", { class: "title", text: cfg.status === "avslutad" ? "Försäljningen är avslutad" : "Försäljningen har inte startat än" }));
    app.appendChild(h("p", { class: "lead", text: cfg.status === "avslutad"
      ? "Tack till alla som har beställt! Det går inte att beställa längre för " + cfg.namn + "."
      : "Försäljningen för " + cfg.namn + " öppnar snart. Vi meddelar i lagets WhatsApp-grupp." }));
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
