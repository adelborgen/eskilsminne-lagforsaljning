/* ==========================================================================
   Adminvy för klubbens lagförsäljning.
   Lagföräldern loggar in med lagets adminnyckel och ser bara sitt eget lag: först försäljningen
   (utkast som skickas till klubben för godkännande), sedan översikt, beställningar, betalningar och utlämning. Klubbens administratör loggar in
   med e-post (en länk som gäller i 15 minuter och kan användas en gång), ser alla lag och godkänner försäljningarna.
   All behörighet kontrolleras av servern (server/). Den här filen visar bara.
   Utan KLUBB.endpoint körs demoläge med exempeldata och inget sparas.
   ========================================================================== */
(function () {
  "use strict";

  var U = window.U, h = U.h, kr = U.kr, nf = U.nf, merge = U.merge;
  var K = window.KLUBB, DEMO = !K.endpoint;
  var app = document.getElementById("app");
  var S = { lag: null, key: null, roll: null, valt: null };   // inloggning: vilket lag, nyckel (tom för klubbens administratör, som har en session), roll, valt lag

  /* ---------- Topbar och sidfot ---------- */
  var topPill = document.getElementById("pill");
  function setTopbar(pill, title) {
    topPill.hidden = !pill; topPill.textContent = pill || "";
    document.getElementById("club").textContent = K.namn;
    document.getElementById("apptitle").textContent = title;
  }
  if (K.logo) { var lg = document.getElementById("logo"); lg.src = K.logo; lg.hidden = false; }
  document.getElementById("foot").appendChild(h("strong", { text: K.namn }));
  document.getElementById("foot").appendChild(h("div", { style: "margin-top:8px" }, h("a", { href: "./", text: "Till lagsidan" })));

  /* ---------- Inloggningen sparas bara i fliken (försvinner när fliken stängs) ---------- */
  // Klubbens administratörs inloggning ligger i en cookie hos servern. Här sparas bara att det är en sådan inloggning, så att sidan kan fråga servern efter en omladdning.
  function sparaSession() { try { sessionStorage.setItem("admin", JSON.stringify({ lag: S.lag, key: S.key, klubbadmin: S.roll === "super" && !DEMO })); } catch (e) {} }
  function lasSession() { try { return JSON.parse(sessionStorage.getItem("admin") || "null"); } catch (e) { return null; } }
  function raderaSession() { try { sessionStorage.removeItem("admin"); } catch (e) {} }

  /* ---------- Anrop till servern ---------- */
  function api(payload) {
    if (DEMO) return Promise.resolve(demoApi(payload));
    return fetch(K.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "admin", klubb: K.slug }, payload)) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, fel: "Det gick inte att nå servern. Kontrollera uppkopplingen och försök igen." }; });
  }
  function anrop(op, extra, lag) {
    return api(Object.assign({ lag: lag || S.lag, key: S.key, op: op }, extra || {}));
  }
  // Som anrop, men om nyckeln inte gäller längre (till exempel bytt) skickas användaren till inloggningen.
  function anropa(op, extra, lag) {
    return anrop(op, extra, lag).then(function (r) {
      if (!r.ok && /^Fel lag eller nyckel/.test(r.fel || "")) { visaLogin(S.roll === "super" ? "Inloggningen har gått ut. Logga in igen." : "Nyckeln gäller inte längre. Logga in igen."); return new Promise(function () {}); }
      return r;
    });
  }

  // Ändringar skickas en i taget, så att svaren kommer i samma ordning som klicken och sista svaret alltid är det nyaste.
  var ko = Promise.resolve();
  function iKo(fn) { ko = ko.then(fn).catch(function () {}); return ko; }

  /* ---------- Små hjälpare ---------- */
  function kopiera(text, btn) {
    var old = btn.textContent;
    function klart() { btn.textContent = "Kopierat ✓"; setTimeout(function () { btn.textContent = old; }, 1600); }
    function reserv() {
      var t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); klart(); } catch (e) {} document.body.removeChild(t);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(klart, reserv); else reserv();
  }
  function kv(k, v, cls, forst) {
    return h("div", { class: "kv" + (forst ? " first" : "") }, h("span", { class: "k", text: k }), h("span", { class: "v num " + (cls || ""), text: v }));
  }
  function stat(l, n, s, alert) {
    return h("div", { class: "stat" + (alert ? " alert" : "") }, h("div", { class: "l", text: l }), h("div", { class: "n num", text: n }), h("div", { class: "s", text: s }));
  }
  // Lagets egen produkt (laget skriver in den själv). Reservvärden så att vyerna fungerar även om något saknas.
  function produktAv(l) { var p = l.produkt || {}; return { namn: p.namn || "", detalj: p.detalj || "", enhet: p.enhet || "st", enhetEn: p.enhetEn || "st" }; }
  // Värdena som fylls i formulären. Priser och mål som ännu inte är ifyllda (0) visas som tomma rutor.
  function fyllVarden(l) {
    var p = l.produkt || {}, harPris = l.pris > 0;
    return { produkt: p.namn, detalj: p.detalj, enhetEn: p.enhetEn, enhet: p.enhet, intro: l.intro, belonning: l.belonning, utlamningsText: l.utlamningsText, kampanj: l.kampanj,
      swishNummer: l.swish.nummer, mottagare: l.swish.namnPaKonto, meddelande: l.swish.meddelande,
      pris: harPris ? l.pris : "", inkopspris: harPris ? l.inkopspris : "", minimum: l.minimum > 0 ? l.minimum : "", mal: l.mal > 0 ? l.mal : "", lager: l.lager > 0 ? l.lager : "",
      maxAntal: l.maxAntal, kartong: l.kartong };
  }
  function bestallningsLank(slug) { return new URL("./?lag=" + encodeURIComponent(slug), location.href).href; }
  function visaMobil(m) { return String(m).replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4"); }
  function datum(iso) {
    var t = new Date(iso);
    return isNaN(t) ? String(iso) : t.toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  var STATUS_TEXT = { utkast: "Utkast", granskas: "Väntar på godkännande", snart: "Godkänd, öppnar snart", pagar: "Pågår", avslutad: "Avslutad" };

  // Försäljningens uppgifter som en läsbar ruta. Används där lagföräldern väntar på klubben och där klubben granskar.
  function villkorKort(l, rubrik) {
    var produkt = produktAv(l), marginal = l.pris - l.inkopspris;
    return h("div", { class: "card", style: "margin-top:16px" }, rubrik ? h("h3", { style: "margin:0 0 8px", text: rubrik }) : null,
      kv("Produkt", produkt.namn ? produkt.namn + (produkt.detalj ? ", " + produkt.detalj : "") : "saknas", "", true),
      kv("Swish", (l.swish.nummer || "saknas") + (l.swish.namnPaKonto ? " (" + l.swish.namnPaKonto + ")" : "")),
      kv("Pris / inköpspris", kr(l.pris) + " / " + kr(l.inkopspris)),
      kv("Till lagkassan per " + produkt.enhetEn, kr(marginal)),
      kv(l.minimum > 0 ? "Minimum / mål" : "Mål", l.minimum > 0 ? nf.format(l.minimum) + " / " + nf.format(l.mal) : nf.format(l.mal)),
      l.lager > 0 ? kv("Antal i lager", nf.format(l.lager)) : null,
      kv("Max per beställning", nf.format(l.maxAntal)),
      l.kartong > 0 ? kv("Antal per kartong", nf.format(l.kartong)) : null);
  }

  function visaFelSida(meddelande) {
    setTopbar("", "Admin");
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Något gick fel" }));
    app.appendChild(h("p", { class: "lead", text: meddelande || "Försök igen om en stund." }));
    app.appendChild(h("button", { type: "button", class: "primary", style: "margin-top:16px", text: "Till början", onclick: renderAdmin }));
  }

  /* ---------- Inloggning ---------- */
  function apiLogin(payload) {
    if (DEMO) return Promise.resolve({ ok: true, meddelande: "Demoläge: ingen e-post skickas." });
    return fetch(K.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "login", klubb: K.slug }, payload)) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, fel: "Det gick inte att nå servern. Kontrollera uppkopplingen och försök igen." }; });
  }

  function visaLogin(meddelande, forifyllt) {
    S = { lag: null, key: null, roll: null, valt: null }; raderaSession();
    setTopbar("", "Admin"); document.title = K.namn + " – Admin";
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Logga in" }));
    app.appendChild(h("p", { class: "lead", text: "Är du lagförälder räcker det att öppna din länk. Annars väljer du ditt lag och skriver in nyckeln. Klubbens administratör loggar in med e-post, längre ned." }));
    if (DEMO) app.appendChild(h("p", { class: "notice", style: "margin-top:12px", text: "Demoläge med exempeldata, inget sparas. Prova nyckeln demo (lagets admin). Klubbadministratör: skriv valfri e-postadress längre ned." }));
    var fel = h("p", { class: "formerror", role: "alert", hidden: "" });
    var sel = h("select", { id: "lag" }, h("option", { value: "", text: "Hämtar lag…" }));
    var key = h("input", { type: "password", id: "key", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "xxxx-xxxx-xxxx-…" });
    var go = h("button", { type: "submit", class: "primary", style: "margin-top:16px", text: "Logga in" });
    var form = h("form", { class: "card", style: "margin-top:16px", novalidate: "" }, fel,
      h("div", { class: "field" }, h("label", { for: "lag", text: "Lag" }), sel),
      h("div", { class: "field" }, h("label", { for: "key", text: "Adminnyckel" }), key), go);
    app.appendChild(form);
    app.appendChild(klubbadminKort());
    app.appendChild(h("div", { class: "card", style: "margin-top:16px" },
      h("h3", { style: "margin:0 0 6px", text: "Ny försäljning?" }),
      h("p", { style: "margin:0", text: "Är du lagförälder och vill sälja något med laget? Starta här. Klubben godkänner försäljningen innan något säljs." }),
      h("button", { type: "button", class: "ghost", style: "margin-top:12px", text: "Starta en försäljning", onclick: visaStart })));
    function visaFel(t) { fel.textContent = t; fel.hidden = false; }
    if (meddelande) visaFel(meddelande);
    U.hamtaLag(function (err, lista) {
      sel.textContent = "";
      if (err) { sel.appendChild(h("option", { value: "", text: "Kunde inte hämta lagen" })); return; }
      sel.appendChild(h("option", { value: "", text: "Välj lag…" }));
      lista.forEach(function (l) { sel.appendChild(h("option", { value: l.slug, text: l.namn + (l.kampanj ? " – " + l.kampanj : "") })); });
      if (forifyllt) sel.value = forifyllt;
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      fel.hidden = true;
      if (!sel.value) return visaFel("Välj ditt lag.");
      if (!key.value.trim()) return visaFel("Skriv adminnyckeln.");
      go.disabled = true; go.textContent = "Loggar in…";
      loggaIn(sel.value, key.value.trim(), function (t) { go.disabled = false; go.textContent = "Logga in"; visaFel(t); });
    });
  }

  // Klubbens administratör: servern skickar en länk till e-postadressen. Länken gäller i 15 minuter och kan användas en gång.
  function klubbadminKort() {
    var fel = h("p", { class: "formerror", role: "alert", hidden: "" });
    var ok = h("p", { class: "notice", role: "status", hidden: "" });
    var epost = h("input", { type: "email", id: "epost", autocomplete: "email", autocapitalize: "none", spellcheck: "false", placeholder: "namn@klubben.se" });
    var hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    var go = h("button", { type: "submit", class: "primary", style: "margin-top:12px", text: "Skicka inloggningslänk" });
    var demoKnapp = h("button", { type: "button", class: "ghost", style: "margin-top:12px", text: "Logga in direkt (demo)", hidden: "",
      onclick: function () { loggaIn("*", "super", function (t) { fel.textContent = t; fel.hidden = false; }); } });
    var form = h("form", { novalidate: "" }, fel, ok,
      h("div", { class: "field" }, h("label", { for: "epost", text: "E-postadress" }), epost),
      h("div", { class: "hp", "aria-hidden": "true" }, h("label", { text: "Lämna tomt" }), hp), go, demoKnapp);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); fel.hidden = true; ok.hidden = true;
      var e = epost.value.trim();
      if (!e) { fel.textContent = "Skriv din e-postadress."; fel.hidden = false; return; }
      go.disabled = true; go.textContent = "Skickar…";
      apiLogin({ op: "begar", epost: e, website: hp.value }).then(function (r) {
        go.disabled = false; go.textContent = "Skicka inloggningslänk";
        if (!r.ok) { fel.textContent = r.fel || "Det gick inte att skicka."; fel.hidden = false; return; }
        ok.textContent = r.meddelande || "Vi har skickat en länk om adressen är registrerad."; ok.hidden = false;
        if (DEMO) demoKnapp.hidden = false;
      });
    });
    return h("div", { class: "card", style: "margin-top:16px" },
      h("h3", { style: "margin:0 0 6px", text: "Klubbens administratör" }),
      h("p", { style: "margin:0 0 12px", text: "Vi skickar en länk till din e-post. Den gäller i 15 minuter och kan användas en gång." }), form);
  }

  // Länken i e-posten öppnar den här sidan. Först knappen loggar in, så att en länk som bara hämtas av en e-postskanner inte förbrukas.
  function visaBekrafta(token) {
    S = { lag: null, key: null, roll: null, valt: null }; raderaSession();
    setTopbar("", "Admin"); document.title = K.namn + " – Logga in";
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Logga in som klubbens administratör" }));
    app.appendChild(h("p", { class: "lead", text: "Bekräfta att det är du som loggar in på " + K.namn + "." }));
    var fel = h("p", { class: "formerror", role: "alert", hidden: "", style: "margin-top:12px" });
    var go = h("button", { type: "button", class: "primary", style: "margin-top:16px", text: "Logga in" });
    go.addEventListener("click", function () {
      fel.hidden = true; go.disabled = true; go.textContent = "Loggar in…";
      function igen(t) { go.disabled = false; go.textContent = "Logga in"; fel.textContent = t; fel.hidden = false; }
      apiLogin({ op: "anvand", token: token }).then(function (r) {
        if (!r.ok) return igen(r.fel || "Det gick inte att logga in.");
        loggaIn("*", DEMO ? "super" : "", igen);
      });
    });
    app.appendChild(fel); app.appendChild(go);
    app.appendChild(h("div", null, h("button", { type: "button", class: "linkbtn", style: "margin-top:12px", text: "Till inloggningen", onclick: function () { visaLogin(); } })));
  }

  function loggaIn(lag, key, vidFel) {
    S.lag = lag; S.key = key;
    return anrop(lag === "*" ? "lagLista" : "oversikt").then(function (r) {
      if (!r.ok) { S = { lag: null, key: null, roll: null, valt: null }; vidFel(r.fel || "Det gick inte att logga in."); return; }
      S.roll = r.roll; S.valt = lag === "*" ? null : lag;
      sparaSession(); renderAdmin();
    });
  }

  function loggaUt() {
    // Klubbens administratörs inloggning ligger hos servern: logga ut där också, så att cookien slutar gälla
    if (!DEMO && S.roll === "super") { apiLogin({ op: "utlogga" }).then(function () { visaLogin(); }); return; }
    visaLogin();
  }

  /* ---------- Lagföräldern startar en försäljning själv. Klubben godkänner den innan något säljs. ---------- */
  function apiStart(payload) {
    if (DEMO) return Promise.resolve(demoStart(payload));
    return fetch(K.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "starta", klubb: K.slug }, payload)) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, fel: "Det gick inte att nå servern. Kontrollera uppkopplingen och försök igen." }; });
  }

  function visaStart() {
    S = { lag: null, key: null, roll: null, valt: null }; raderaSession();
    setTopbar("", "Ny försäljning"); document.title = K.namn + " – Ny försäljning";
    var visadVid = Date.now();
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Starta en försäljning" }));
    app.appendChild(h("p", { class: "lead", text: "Skriv lagets namn. Sedan fyller du i vad ni säljer, pris och Swish-nummer och skickar försäljningen till klubben. Inget syns för föräldrarna förrän klubben har godkänt den." }));
    var fel = h("p", { class: "formerror", role: "alert", hidden: "" });
    var namn = h("input", { type: "text", id: "startnamn", maxlength: "20", autocomplete: "off", placeholder: "Till exempel P2019" });
    var hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    var go = h("button", { type: "submit", class: "primary", style: "margin-top:16px", text: "Starta" });
    var form = h("form", { class: "card", style: "margin-top:16px", novalidate: "" }, fel,
      h("div", { class: "field" }, h("label", { for: "startnamn" }, "Lagets namn",
        h("span", { class: "hint", text: "Till exempel P2019. Säljer laget något nytt efter en tidigare försäljning, skriv till exempel P2019 Lotter." })), namn),
      h("div", { class: "hp", "aria-hidden": "true" }, h("label", { text: "Lämna tomt" }), hp), go);
    app.appendChild(form);
    app.appendChild(h("button", { type: "button", class: "linkbtn", style: "margin-top:12px", text: "Tillbaka till inloggningen", onclick: function () { visaLogin(); } }));
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); fel.hidden = true;
      var n = namn.value.trim();
      if (n.length < 2) { fel.textContent = "Skriv lagets namn."; fel.hidden = false; return; }
      go.disabled = true; go.textContent = "Startar…";
      // Servern nekar försök som kommer snabbare än 3 sekunder efter att sidan visades, så sidan väntar själv in dem
      setTimeout(function () {
        apiStart({ namn: n, website: hp.value, t: Date.now() - visadVid }).then(function (r) {
          go.disabled = false; go.textContent = "Starta";
          if (!r.ok) { fel.textContent = r.fel || "Det gick inte att starta."; fel.hidden = false; return; }
          visaStartad(r);
        });
      }, Math.max(0, 3500 - (Date.now() - visadVid)));
    });
    namn.focus();
  }

  // Länken med nyckeln visas en enda gång. Den är lagförälderns inloggning.
  function visaStartad(r) {
    var lank = DEMO ? "[sidans adress]/admin.html#lag=" + r.slug + "&k=" + r.key
      : new URL("admin.html", location.href).href + "#lag=" + encodeURIComponent(r.slug) + "&k=" + encodeURIComponent(r.key);
    var kb = h("button", { type: "button", class: "mini", text: "Kopiera" });
    kb.addEventListener("click", function () { kopiera(lank, kb); });
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Försäljningen är startad" }));
    app.appendChild(h("div", { class: "card", style: "margin-top:16px; border: 2px solid var(--yellow)" },
      h("h3", { style: "margin:0 0 6px", text: "Spara din länk" }),
      h("p", { style: "margin:0", text: "Länken är din inloggning till " + r.lag.namn + ", och den innehåller ditt lösenord: den långa koden efter k=. Den som har länken kommer in, så spara den som bokmärke eller i en lösenordshanterare. Den visas bara nu." }),
      h("div", { class: "keybox" }, h("code", { text: lank }), kb),
      h("p", { class: "small", style: "margin:10px 0 0", text: "Dela den aldrig i en gruppchatt. Hjälper någon dig med betalningar eller utlämning, skicka länken direkt till hen. Tappar du länken, eller tror att den hamnat fel, kan klubben ge dig en ny. Då slutar den gamla fungera. Föräldrarnas namn och mobilnummer som du ser i adminvyn är bara till för den här försäljningen." }),
      h("button", { type: "button", class: "primary", style: "margin-top:12px", text: "Fortsätt och fyll i försäljningen", onclick: function () {
        S = { lag: r.slug, key: r.key, roll: "lag", valt: r.slug }; sparaSession(); renderAdmin();
      } })));
  }

  function renderAdmin() {
    if (!S.roll) return visaLogin();
    if (S.roll === "super" && !S.valt) renderSuper(); else renderLag(S.valt);
  }

  /* ---------- Lagets vy: översikt och beställningar ---------- */
  function renderLag(slug) {
    app.textContent = ""; app.appendChild(h("p", { class: "loading", text: "Hämtar…" }));
    Promise.all([anropa("oversikt", null, slug), anropa("lista", null, slug)]).then(function (rs) {
      if (!rs[0].ok || !rs[1].ok) return visaFelSida(rs[0].fel || rs[1].fel);
      byggLagVy({ lag: rs[0].lag, oversikt: rs[0].oversikt, ordrar: rs[1].ordrar });
    });
  }

  function orderStatus(o) { return o.betald === "JA" ? "betald" : o.betald === "AVBRUTEN" ? "avbruten" : "obetald"; }

  function byggLagVy(d) {
    if ((d.lag.status === "utkast" || d.lag.status === "granskas") && !d.visaOrdrar) return byggUppsattning(d);
    var slug = d.lag.slug, produkt = produktAv(d.lag);
    var filter = "alla", sok = "";
    setTopbar(d.lag.namn, "Admin");
    document.title = K.namn + " – Admin " + d.lag.namn;

    var oPanel = h("section", { role: "tabpanel", "aria-labelledby": "tab-o" });
    var bPanel = h("section", { role: "tabpanel", "aria-labelledby": "tab-b", hidden: "" });
    var tabO = h("button", { role: "tab", id: "tab-o", "aria-selected": "true", text: "Översikt", onclick: function () { visaFlik("o"); } });
    var tabB = h("button", { role: "tab", id: "tab-b", "aria-selected": "false", text: "Beställningar", onclick: function () { visaFlik("b"); } });
    var uPanel = h("section", { role: "tabpanel", "aria-labelledby": "tab-u", hidden: "" });
    var tabU = h("button", { role: "tab", id: "tab-u", "aria-selected": "false", text: "Utlämning", onclick: function () { visaFlik("u"); } });
    function visaFlik(w) {
      [[tabO, oPanel, "o"], [tabB, bPanel, "b"], [tabU, uPanel, "u"]].forEach(function (t) {
        t[0].setAttribute("aria-selected", String(t[2] === w)); t[1].hidden = t[2] !== w;
      });
      window.scrollTo(0, 0);
    }

    var top = h("div", { class: "topactions" },
      S.roll === "super" ? h("button", { type: "button", class: "linkbtn", text: "← Alla lag", onclick: function () { S.valt = null; renderAdmin(); } })
        : d.visaOrdrar ? h("button", { type: "button", class: "linkbtn", text: "← Försäljningens uppgifter", onclick: function () { d.visaOrdrar = false; byggUppsattning(d); } }) : h("span"),
      h("button", { type: "button", class: "linkbtn", text: "Logga ut", onclick: loggaUt }));
    app.textContent = "";
    app.appendChild(top);
    app.appendChild(h("div", { class: "tabs", role: "tablist", "aria-label": "Admin", style: "margin-top:4px" }, tabO, tabB, tabU));
    app.appendChild(h("div", { style: "margin-top:16px" }, oPanel, bPanel, uPanel));

    /* Översikt */
    function ritaOversikt() {
      var o = d.oversikt, l = d.lag, marginal = l.pris - l.inkopspris, E = produkt.enhet;
      oPanel.textContent = "";
      oPanel.appendChild(h("h2", { class: "title", text: "Översikt" }));
      oPanel.appendChild(h("div", { class: "stats", style: "margin-top:16px" },
        stat("Beställt", nf.format(o.bestallt), "av " + nf.format(l.mal) + " " + E),
        l.lager > 0 ? stat("Kvar i lager", nf.format(o.kvarILager), "av " + nf.format(l.lager) + " " + E, o.kvarILager === 0) : null,
        stat("Betalt", nf.format(o.betalt), kr(o.betaltKr)),
        stat("Obetalt", nf.format(o.obetalt), kr(o.obetaltKr), o.obetalt > 0),
        stat("Avbrutet", nf.format(o.avbrutna), E),
        stat("Hämtat", nf.format(o.hamtat), o.hamtatObetalt > 0 ? "varav " + nf.format(o.hamtatObetalt) + " obetalt" : E, o.hamtatObetalt > 0),
        stat("Kvar att dela ut", nf.format(o.attHamta), "betalt, ej hämtat")));

      // Länken som föräldrarna använder. Dela den där du brukar prata med föräldrarna. I demoläget är sidans riktiga adress en intern adress, så där visas bara slutet.
      var lank = DEMO ? "[sidans adress]/?lag=" + slug : bestallningsLank(slug);
      var kopBtn = h("button", { type: "button", class: "mini", text: "Kopiera" });
      kopBtn.addEventListener("click", function () { kopiera(lank, kopBtn); });
      oPanel.appendChild(h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 6px", text: "Länk till beställningssidan" }),
        h("p", { style: "margin:0", text: "Dela den här länken där du brukar prata med föräldrarna, till exempel i gruppchatten eller i ett sms, så kommer de direkt till " + l.namn + " utan att leta bland alla lag." }),
        h("div", { class: "keybox" }, h("code", { text: lank }), kopBtn),
        DEMO ? h("p", { class: "small", style: "margin:10px 0 0", text: "I demoläget visas bara slutet av adressen. När sidan ligger på en riktig adress blir det en länk som går att dela." }) : null));

      var lev = h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 8px", text: "Beställning hos leverantören" }),
        l.minimum > 0 ? kv("Minimum " + nf.format(l.minimum), o.minimumNatt ? "Nått ✓" : nf.format(o.minimumKvar) + " kvar", o.minimumNatt ? "pos" : "", true) : null);
      if (l.kartong > 0) {
        lev.appendChild(kv("Kartonger att beställa (à " + l.kartong + ")", nf.format(o.kartonger)));
        lev.appendChild(kv(E.charAt(0).toUpperCase() + E.slice(1) + " i kartongerna", nf.format(o.levereras)));
      }
      lev.appendChild(kv("Beräknad faktura", kr(o.faktura)));
      lev.appendChild(kv("Betalt hittills minus faktura", kr(o.betaltMinusFaktura), o.betaltMinusFaktura >= 0 ? "pos" : "neg"));
      oPanel.appendChild(lev);

      oPanel.appendChild(h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 8px", text: "Lagets uppgifter" }),
        kv("Status", STATUS_TEXT[l.status] || l.status, "", true),
        kv("Swish", (l.swish.nummer || "saknas") + (l.swish.namnPaKonto ? " (" + l.swish.namnPaKonto + ")" : "")),
        kv("Pris / inköpspris", kr(l.pris) + " / " + kr(l.inkopspris)),
        kv("Till lagkassan per " + (produkt.enhetEn || "styck"), kr(marginal)),
        S.roll === "super" ? h("p", { class: "small", style: "margin:10px 0 0", text: "Lagföräldern öppnar, avslutar och ändrar försäljningen. Behöver den stoppas gör du det under Alla lag." }) : statusKontroll(d)));
    }

    /* Beställningar */
    var chips = h("div", { class: "chips", role: "group", "aria-label": "Visa" });
    var sokInp = h("input", { type: "search", placeholder: "Sök namn, mobilnummer eller ordernummer", "aria-label": "Sök", autocomplete: "off", style: "margin-top:12px" });
    var listEl = h("div", { role: "list", style: "margin-top:12px" });
    var chipBtns = {};
    [["alla", "Alla"], ["obetald", "Obetalda"], ["betald", "Betalda"], ["avbruten", "Avbrutna"]].forEach(function (c) {
      var b = h("button", { type: "button", class: "chip", "aria-pressed": String(c[0] === "alla"), onclick: function () { filter = c[0]; ritaLista(); } });
      chipBtns[c[0]] = { b: b, namn: c[1] }; chips.appendChild(b);
    });
    sokInp.addEventListener("input", function () { sok = sokInp.value.trim().toLowerCase(); ritaLista(); });
    var exportBtn = h("button", { type: "button", class: "ghost", style: "margin-top:16px", text: "Exportera till CSV", onclick: function () { exporteraCsv(d); } });
    bPanel.appendChild(h("h2", { class: "title", text: "Beställningar" }));
    bPanel.appendChild(h("div", { style: "margin-top:16px" }, chips, sokInp, listEl, exportBtn));

    function smsLank(o) {
      var nr = d.lag.swish.nummer, msg = (d.lag.swish.meddelande || d.lag.namn + " försäljning") + " " + o.id;
      var txt = "Hej! Din beställning " + o.id + " (" + kr(o.belopp) + ") hos " + d.lag.namn + " är inte betald än." +
        (nr ? " Swisha till " + nr + " och skriv \"" + msg + "\" som meddelande." : "") + " Tack!";
      return "sms:" + o.mobil + "?&body=" + encodeURIComponent(txt);
    }

    function kort(o) {
      var s = orderStatus(o), hamtad = o.hamtad === "JA";
      var row = h("div", { class: "btnrow" }), err = h("p", { class: "error", role: "alert" });
      function knapp(text, varde, cls) {
        var b = h("button", { type: "button", class: "mini " + (cls || ""), text: text });
        b.addEventListener("click", function () { satt(o, varde, row, err); });
        return b;
      }
      function hamtaKnapp(text, varde, cls) {
        var b = h("button", { type: "button", class: "mini " + (cls || ""), text: text });
        b.addEventListener("click", function () { hamtadSatt(o, varde, row, err); });
        return b;
      }
      if (s === "obetald") {
        row.appendChild(knapp("✅ Betald", "JA", "go")); row.appendChild(knapp("Avbruten", "AVBRUTEN"));
        if (hamtad) row.appendChild(hamtaKnapp("Ångra hämtad", ""));
      } else if (s === "betald") {
        row.appendChild(hamtad ? hamtaKnapp("Ångra hämtad", "") : hamtaKnapp("📦 Hämtad", "JA", "go"));
        row.appendChild(knapp("Ångra betald", ""));
      } else row.appendChild(knapp("Ångra", ""));
      row.appendChild(h("a", { class: "mini", href: "tel:" + o.mobil, text: "Ring" }));
      if (s === "obetald") row.appendChild(h("a", { class: "mini", href: smsLank(o), text: "SMS-påminnelse" }));
      // Betalda och hämtade beställningar kan inte tas bort (servern kontrollerar det också). Kräver ett andra tryck.
      if (s !== "betald" && !hamtad) {
        var tb = h("button", { type: "button", class: "mini", text: "Ta bort" }), redo = false, timer = null;
        tb.addEventListener("click", function () {
          if (!redo) {
            redo = true; tb.textContent = "Säker? Ta bort"; tb.classList.add("danger");
            timer = setTimeout(function () { redo = false; tb.textContent = "Ta bort"; tb.classList.remove("danger"); }, 4000);
            return;
          }
          clearTimeout(timer); taBort(o, row, err);
        });
        row.appendChild(tb);
      }
      return h("div", { class: "ordercard", role: "listitem" },
        h("div", { class: "o-head" }, h("span", { class: "o-name", text: "#" + o.id + " " + o.barn }),
          h("span", { class: "o-sum num", text: o.antal + " st · " + kr(o.belopp) })),
        h("div", { class: "o-sub num", text: visaMobil(o.mobil) + " · " + datum(o.tid) }),
        h("div", { class: "badges", style: "margin-top:8px" }, h("span", { class: "badge " + (s === "betald" ? "live" : s === "obetald" ? "unpaid" : ""),
          text: s === "betald" ? "Betald" : s === "obetald" ? "Obetald" : "Avbruten" }),
          hamtad ? h("span", { class: "badge picked", text: "Hämtad" }) : null),
        row, err);
    }

    function ritaLista() {
      var n = { alla: d.ordrar.length, obetald: 0, betald: 0, avbruten: 0 };
      d.ordrar.forEach(function (o) { n[orderStatus(o)]++; });
      Object.keys(chipBtns).forEach(function (k) {
        chipBtns[k].b.textContent = chipBtns[k].namn + " (" + n[k] + ")";
        chipBtns[k].b.setAttribute("aria-pressed", String(k === filter));
      });
      var vis = d.ordrar.filter(function (o) {
        if (filter !== "alla" && orderStatus(o) !== filter) return false;
        return !sok || (o.barn + " " + o.id + " " + o.mobil).toLowerCase().indexOf(sok) >= 0;
      });
      listEl.textContent = "";
      if (!vis.length) listEl.appendChild(h("p", { class: "small", text: d.ordrar.length ? "Inga beställningar matchar." : "Inga beställningar än." }));
      vis.forEach(function (o) { listEl.appendChild(kort(o)); });
    }

    function satt(o, varde, row, err) {
      var knappar = row.querySelectorAll("button");
      knappar.forEach(function (b) { b.disabled = true; });
      err.textContent = "";
      iKo(function () { return anropa("satt", { id: o.id, varde: varde }, slug).then(function (r) {
        if (!r.ok) { knappar.forEach(function (b) { b.disabled = false; }); err.textContent = r.fel || "Det gick inte att spara."; return; }
        d.ordrar = d.ordrar.map(function (x) { return x.id === r.order.id ? r.order : x; });
        d.oversikt = r.oversikt;
        ritaOversikt(); ritaLista(); ritaUtlamning();
      }); });
    }

    // Tar bort en beställning som inte är betald eller hämtad. Raden försvinner helt, även barnets namn och mobilnummer.
    function taBort(o, row, err) {
      var knappar = row.querySelectorAll("button");
      knappar.forEach(function (b) { b.disabled = true; });
      err.textContent = "";
      iKo(function () { return anropa("taBort", { id: o.id }, slug).then(function (r) {
        if (!r.ok) { knappar.forEach(function (b) { b.disabled = false; }); err.textContent = r.fel || "Det gick inte att ta bort."; return; }
        d.ordrar = d.ordrar.filter(function (x) { return x.id !== r.borttagen; });
        d.oversikt = r.oversikt;
        ritaOversikt(); ritaLista(); ritaUtlamning();
      }); });
    }

    // Hämtad från en beställning i listan: väntar på servern innan något ritas om.
    function hamtadSatt(o, varde, row, err) {
      var knappar = row.querySelectorAll("button");
      knappar.forEach(function (b) { b.disabled = true; });
      err.textContent = "";
      iKo(function () { return anropa("hamtad", { id: o.id, varde: varde }, slug).then(function (r) {
        if (!r.ok) { knappar.forEach(function (b) { b.disabled = false; }); err.textContent = r.fel || "Det gick inte att spara."; return; }
        d.ordrar = d.ordrar.map(function (x) { return x.id === r.order.id ? r.order : x; });
        d.oversikt = r.oversikt;
        ritaOversikt(); ritaLista(); ritaUtlamning();
      }); });
    }

    /* Utlämning: lista att bocka av när någon hämtar. Kryssrutan slår om direkt och sparas i bakgrunden. */
    var uFilter = "kvar", uSok = "";
    var uStats = h("div", { class: "stats noprint", style: "margin-top:16px" });
    var uVarning = h("p", { class: "notice noprint", hidden: "", style: "margin-top:12px" });
    var uChips = h("div", { class: "chips noprint", role: "group", "aria-label": "Visa", style: "margin-top:16px" }), uChipBtns = {};
    [["kvar", "Kvar att hämta"], ["hamtade", "Hämtade"], ["alla", "Alla"]].forEach(function (c) {
      var b = h("button", { type: "button", class: "chip", "aria-pressed": String(c[0] === uFilter), onclick: function () { uFilter = c[0]; ritaUtlamning(); } });
      uChipBtns[c[0]] = { b: b, namn: c[1] }; uChips.appendChild(b);
    });
    var uSokInp = h("input", { type: "search", class: "noprint", placeholder: "Sök namn eller ordernummer", "aria-label": "Sök i utlämningen", autocomplete: "off", style: "margin-top:12px" });
    uSokInp.addEventListener("input", function () { uSok = uSokInp.value.trim().toLowerCase(); ritaUtlamning(); });
    var uList = h("div", { role: "list", style: "margin-top:12px" });
    var uTomt = h("p", { class: "small noprint", hidden: "" });
    var uInfo = h("p", { class: "okline noprint", role: "status", style: "margin-top:12px" });
    var uFel = h("p", { class: "error noprint", role: "alert" });
    var uBekrafta = h("div", { class: "notice noprint", hidden: "", style: "margin-top:12px" });
    var allBtn = h("button", { type: "button", class: "primary noprint", style: "margin-top:16px", text: "Markera alla betalda som hämtade" });
    var skrivBtn = h("button", { type: "button", class: "ghost noprint", style: "margin-top:12px", text: "Skriv ut listan", onclick: function () { window.print(); } });
    uPanel.appendChild(h("h2", { class: "title", text: "Utlämning" }));
    uPanel.appendChild(h("p", { class: "printonly", text: d.lag.namn + " · Utlämningslista " + new Date().toLocaleDateString("sv-SE") }));
    uPanel.appendChild(h("p", { class: "lead noprint", text: "Bocka av när någon hämtat sin beställning. Det sparas direkt." }));
    [uStats, uVarning, uChips, uSokInp, uList, uTomt, uInfo, uFel, uBekrafta, allBtn, skrivBtn].forEach(function (e) { uPanel.appendChild(e); });

    function ritaUtStats() {
      var hamtat = 0, kvar = 0, obetHamtat = 0, obetKvar = 0, nKvar = 0, nHamt = 0, nAlla = 0;
      d.ordrar.forEach(function (o) {
        if (o.betald === "AVBRUTEN") return;
        nAlla++;
        if (o.hamtad === "JA") { hamtat += o.antal; nHamt++; if (o.betald !== "JA") obetHamtat += o.antal; }
        else { nKvar++; if (o.betald === "JA") kvar += o.antal; else obetKvar += o.antal; }
      });
      uStats.textContent = "";
      uStats.appendChild(stat("Hämtat", nf.format(hamtat), produkt.enhet));
      uStats.appendChild(stat("Kvar att dela ut", nf.format(kvar), "betalt, ej hämtat"));
      var delar = [];
      if (obetHamtat) delar.push(nf.format(obetHamtat) + " " + produkt.enhet + " är hämtade men inte betalda.");
      if (obetKvar) delar.push(nf.format(obetKvar) + " " + produkt.enhet + " är obetalda och markeras inte av \"Markera alla\".");
      uVarning.textContent = delar.join(" "); uVarning.hidden = !delar.length;
      var n = { kvar: nKvar, hamtade: nHamt, alla: nAlla };
      Object.keys(uChipBtns).forEach(function (k) {
        uChipBtns[k].b.textContent = uChipBtns[k].namn + " (" + n[k] + ")";
        uChipBtns[k].b.setAttribute("aria-pressed", String(k === uFilter));
      });
    }

    function pickRad(o) {
      var id = "p" + o.id, betald = o.betald === "JA";
      var cb = h("input", { type: "checkbox", id: id });
      cb.checked = o.hamtad === "JA";
      cb.addEventListener("change", function () { hamtaDirekt(o, cb.checked ? "JA" : "", cb); });
      return h("label", { class: "pick", role: "listitem", for: id }, cb,
        h("span", { class: "p-main" }, h("span", { class: "p-name", text: "#" + o.id + " " + o.barn }), h("span", { class: "p-sub num", text: o.antal + " st · " + kr(o.belopp) })),
        h("span", { class: "badge " + (betald ? "live" : "unpaid"), text: betald ? "Betald" : "Obetald" }));
    }

    // Slår om direkt och sparar sedan. Går något fel ställs rutan tillbaka och felet visas.
    function hamtaDirekt(o, varde, cb) {
      var gammal = o.hamtad;
      o.hamtad = varde; uFel.textContent = ""; uInfo.textContent = "";
      ritaUtStats();
      iKo(function () { return anropa("hamtad", { id: o.id, varde: varde }, slug).then(function (r) {
        if (!r.ok) { o.hamtad = gammal; cb.checked = gammal === "JA"; ritaUtStats(); uFel.textContent = "#" + o.id + " " + o.barn + ": " + (r.fel || "Det gick inte att spara."); return; }
        Object.assign(o, r.order);
        d.oversikt = r.oversikt;
        ritaOversikt(); ritaLista(); ritaUtStats();
      }); });
    }

    function ritaUtlamning() {
      ritaUtStats();
      var akt = d.ordrar.filter(function (o) { return o.betald !== "AVBRUTEN"; })
        .sort(function (a, b) { return a.barn.localeCompare(b.barn, "sv") || a.id.localeCompare(b.id); });
      uList.textContent = ""; var synliga = 0;
      akt.forEach(function (o) {
        var rad = pickRad(o);
        var passar = (uFilter === "alla" || (uFilter === "kvar" ? o.hamtad !== "JA" : o.hamtad === "JA")) && (!uSok || (o.barn + " " + o.id).toLowerCase().indexOf(uSok) >= 0);
        if (passar) synliga++; else rad.hidden = true;   // dolda rader finns kvar så att hela listan kan skrivas ut
        uList.appendChild(rad);
      });
      uTomt.hidden = synliga > 0;
      uTomt.textContent = !akt.length ? "Inga beställningar än." : uSok ? "Inga beställningar matchar." : uFilter === "kvar" ? "Alla är hämtade. Bra jobbat!" : "Inget är hämtat än.";
    }

    allBtn.addEventListener("click", function () {
      uInfo.textContent = ""; uFel.textContent = "";
      var n = d.ordrar.filter(function (o) { return o.betald === "JA" && o.hamtad !== "JA"; }).length;
      var ob = d.ordrar.filter(function (o) { return o.betald !== "JA" && o.betald !== "AVBRUTEN" && o.hamtad !== "JA"; }).length;
      if (!n) { uFel.textContent = "Det finns inga betalda beställningar som väntar på att hämtas."; return; }
      var ja = h("button", { type: "button", class: "mini go", text: "Ja, markera alla" });
      var nej = h("button", { type: "button", class: "mini", text: "Avbryt", onclick: function () { uBekrafta.hidden = true; } });
      ja.addEventListener("click", function () {
        ja.disabled = true; nej.disabled = true;
        iKo(function () { return anropa("hamtadAlla", null, slug).then(function (r) {
          uBekrafta.hidden = true;
          if (!r.ok) { uFel.textContent = r.fel || "Det gick inte att spara."; return; }
          d.ordrar = r.ordrar; d.oversikt = r.oversikt;
          uInfo.textContent = (r.markerade === 1 ? "1 beställning markerades som hämtad." : r.markerade + " beställningar markerades som hämtade.") +
            (r.obetaldaKvar ? " " + (r.obetaldaKvar === 1 ? "1 obetald lämnades som den var." : r.obetaldaKvar + " obetalda lämnades som de var.") : "");
          ritaOversikt(); ritaLista(); ritaUtlamning();
        }); });
      });
      uBekrafta.textContent = "";
      uBekrafta.appendChild(h("p", { style: "margin:0", text: (n === 1 ? "Markera 1 betald beställning som hämtad?" : "Markera " + n + " betalda beställningar som hämtade?") +
        (ob ? " " + (ob === 1 ? "1 obetald lämnas som den är." : ob + " obetalda lämnas som de är.") : "") }));
      uBekrafta.appendChild(h("div", { class: "btnrow" }, ja, nej));
      uBekrafta.hidden = false;
    });

    ritaOversikt(); ritaLista(); ritaUtlamning();
  }

  // Lagföräldern öppnar, avslutar och ändrar sin godkända försäljning. Ändra gör den till ett utkast som klubben granskar igen.
  function statusKontroll(d) {
    var l = d.lag, fel = h("p", { class: "error", role: "alert" }), rad = h("div", { class: "btnrow" });
    if (l.status === "utkast" || l.status === "granskas")
      return h("p", { class: "small", style: "margin:10px 0 0", text: "Försäljningen är stängd medan uppgifterna ändras och granskas. Föräldrarna kan inte beställa just nu." });
    function gor(op, knapp) {
      knapp.disabled = true; fel.textContent = "";
      anropa(op, null, l.slug).then(function (r) { knapp.disabled = false; if (!r.ok) { fel.textContent = r.fel || "Det gick inte."; return; } renderLag(l.slug); });
    }
    function tvaTryck(text, fraga, op) {   // två tryck, så att inget händer av misstag
      var b = h("button", { type: "button", class: "mini", text: text }), redo = false, timer = null;
      b.addEventListener("click", function () {
        if (!redo) {
          redo = true; b.textContent = fraga; b.classList.add("danger");
          timer = setTimeout(function () { redo = false; b.textContent = text; b.classList.remove("danger"); }, 5000);
          return;
        }
        clearTimeout(timer); gor(op, b);
      });
      return b;
    }
    if (l.status === "pagar") rad.appendChild(tvaTryck("Avsluta försäljningen", "Säker? Inga fler kan beställa", "avsluta"));
    if (l.status === "snart" || l.status === "avslutad") {
      var oppna = h("button", { type: "button", class: "mini go", text: l.status === "avslutad" ? "Öppna igen" : "Öppna försäljningen" });
      oppna.addEventListener("click", function () { gor("oppna", oppna); });
      rad.appendChild(oppna);
    }
    rad.appendChild(tvaTryck("Ändra uppgifter", "Säker? Stängs tills klubben godkänt", "andra"));
    return h("div", null,
      h("p", { class: "small", style: "margin:10px 0 0", text: "Vill du ändra pris, Swish-nummer eller något annat? Välj Ändra uppgifter. Då stängs försäljningen tills klubben har godkänt den igen. Beställningarna finns kvar." }),
      rad, fel);
  }

  /* ---------- Uppsättning: lagföräldern fyller i försäljningen och skickar den till klubben ---------- */
  function byggUppsattning(d) {
    var l = d.lag, slug = l.slug, granskas = l.status === "granskas", arSuper = S.roll === "super";
    setTopbar(l.namn, "Admin");
    document.title = K.namn + " – Admin " + l.namn;
    app.textContent = "";
    app.appendChild(h("div", { class: "topactions" },
      arSuper ? h("button", { type: "button", class: "linkbtn", text: "← Alla lag", onclick: function () { S.valt = null; renderAdmin(); } }) : h("span"),
      h("button", { type: "button", class: "linkbtn", text: "Logga ut", onclick: loggaUt })));
    app.appendChild(h("h2", { class: "title", text: "Din försäljning" }));
    app.appendChild(h("div", { class: "badges", style: "margin-top:8px" }, h("span", { class: "badge " + (granskas ? "unpaid" : ""), text: STATUS_TEXT[l.status] })));
    app.appendChild(h("ol", { class: "steps small" },
      h("li", { text: "Fyll i uppgifterna om försäljningen." }),
      h("li", { text: "Skicka dem till klubben för godkännande." }),
      h("li", { text: "Klubben godkänner. Då öppnar försäljningen och föräldrarna kan beställa." })));
    if (d.ordrar && d.ordrar.length) app.appendChild(h("button", { type: "button", class: "ghost", style: "margin-top:12px",
      text: "Visa beställningarna (" + d.ordrar.length + ")", onclick: function () { d.visaOrdrar = true; byggLagVy(d); window.scrollTo(0, 0); } }));

    var fel = h("p", { class: "formerror", role: "alert", hidden: "" });
    var ok = h("p", { class: "okline", role: "status" });
    function visaFel(t) { ok.textContent = ""; fel.textContent = t; fel.hidden = false; fel.scrollIntoView({ block: "center", behavior: "smooth" }); }

    if (granskas) {
      app.appendChild(h("p", { class: "notice", style: "margin-top:12px", text: "Skickad till klubben. Säg till klubbens administratör att den väntar. De godkänner den eller skickar tillbaka den med en kommentar." }));
      app.appendChild(villkorKort(l, "Uppgifterna som skickades"));
      var tillbaka = h("button", { type: "button", class: "ghost", style: "margin-top:16px", text: "Dra tillbaka och ändra" });
      tillbaka.addEventListener("click", function () {
        tillbaka.disabled = true; fel.hidden = true;
        anropa("dragTillbaka", null, slug).then(function (r) {
          if (!r.ok) { tillbaka.disabled = false; return visaFel(r.fel || "Det gick inte att dra tillbaka."); }
          d.lag = r.lag; byggUppsattning(d); window.scrollTo(0, 0);
        });
      });
      app.appendChild(fel); app.appendChild(tillbaka);
      return;
    }

    if (l.kommentar) app.appendChild(h("div", { class: "notice", style: "margin-top:12px" },
      h("strong", { text: "Kommentar från klubben:" }), h("p", { style: "margin:4px 0 0", text: l.kommentar })));
    if (arSuper) {
      app.appendChild(h("p", { class: "notice", style: "margin-top:12px", text: "Du ser utkastet som klubbadministratör. Lagföräldern fyller i det och skickar det till dig för godkännande." }));
      app.appendChild(villkorKort(l));
      return;
    }

    var fb = faltBlock(fyllVarden(l), false);
    var kryss = ["Den som äger Swish-numret vet om att numret används för försäljningen.", "Vi säljer bara sådant som klubben har godkänt att laget får sälja."];
    var kryssEl = [], lista = h("ul", { class: "checklist" });
    kryss.forEach(function (t) {
      var id = "u" + (++uid), cb = h("input", { type: "checkbox", id: id });
      cb.addEventListener("change", function () { skicka.disabled = !kryssEl.every(function (c) { return c.checked; }); });
      kryssEl.push(cb);
      lista.appendChild(h("li", null, h("label", { class: "check", for: id }, cb, h("span", { text: t }))));
    });
    var spara = h("button", { type: "button", class: "ghost", style: "margin-top:16px", text: "Spara utkast" });
    var skicka = h("button", { type: "button", class: "primary", style: "margin-top:12px", text: "Skicka för godkännande", disabled: "" });
    function sparaUtkast() { return anropa("lagSpara", { falt: fb.hamta() }, slug); }
    spara.addEventListener("click", function () {
      spara.disabled = true; fel.hidden = true; ok.textContent = "";
      sparaUtkast().then(function (r) {
        spara.disabled = false;
        if (!r.ok) return visaFel(r.fel || "Det gick inte att spara.");
        d.lag = r.lag; ok.textContent = "Utkastet är sparat.";
      });
    });
    skicka.addEventListener("click", function () {
      skicka.disabled = true; spara.disabled = true; fel.hidden = true; ok.textContent = "";
      function igen() { spara.disabled = false; skicka.disabled = !kryssEl.every(function (c) { return c.checked; }); }
      sparaUtkast().then(function (r) {
        if (!r.ok) { igen(); return visaFel(r.fel || "Det gick inte att spara."); }
        d.lag = r.lag;
        return anropa("skickaGodkannande", { bekraftat: true }, slug).then(function (r2) {
          if (!r2.ok) { igen(); return visaFel(r2.fel || "Det gick inte att skicka."); }
          d.lag = r2.lag; byggUppsattning(d); window.scrollTo(0, 0);
        });
      });
    });
    app.appendChild(h("div", { class: "card", style: "margin-top:16px" }, fel, fb.el,
      h("p", { class: "small", style: "margin:16px 0 0", text: "Bekräfta innan du skickar:" }), lista, ok, spara, skicka));
  }

  function csvCell(v) {
    var s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;   // så att kalkylprogram inte tolkar innehållet som formel
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exporteraCsv(d) {
    var rader = [["Order-ID", "Tid", "Barn", "Mobil", "Antal", "Belopp", "Betald", "Hämtad"]].concat(d.ordrar.slice().reverse().map(function (o) {
      return [o.id, o.tid, o.barn, o.mobil, o.antal, o.belopp, o.betald === "JA" ? "JA" : o.betald === "AVBRUTEN" ? "AVBRUTEN" : "NEJ", o.hamtad === "JA" ? "JA" : "NEJ"];
    }));
    var csv = "﻿" + rader.map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n");
    var a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: d.lag.slug + "-bestallningar.csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- Klubbadministratörens vy: alla lag, godkännande ---------- */
  var uid = 0;
  var FALT = [   // [nyckel, etikett, hjälptext, typ, grupp]
    ["produkt", "Vad säljer ni?", "Produktens namn, till exempel Kanelbullar. Visas när föräldern beställer.", "text"],
    ["detalj", "Kort beskrivning (valfritt)", "Till exempel: Påse med sex bullar.", "text"],
    ["enhetEn", "En heter", "Till exempel kaka eller påse.", "text", 4], ["enhet", "Flera heter", "Till exempel kakor eller påsar.", "text", 4],
    ["intro", "Text överst på beställningssidan (valfritt)", "Några meningar om vad pengarna går till.", "textarea"],
    ["belonning", "Belöning om målet nås (valfritt)", "Till exempel: Når vi {mal} åker laget på fika.", "text"],
    ["utlamningsText", "Utlämning (valfritt)", "När och var delas det ut? Kan fyllas i senare.", "text"],
    ["kampanj", "Rubrik i listan (valfritt)", "Lämna tomt så används produktens namn.", "text"],
    ["swishNummer", "Swish-nummer", "Numret som pengarna ska till. Lagets eget, privat eller Swish Handel, tio siffror.", "tel"],
    ["mottagare", "Mottagarens namn i Swish", "Så att föräldern känner igen namnet i Swish.", "text"],
    ["meddelande", "Meddelande i Swish", "Förifylls för föräldern, följt av ordernumret. Tomt = lagets namn + försäljning.", "text"],
    ["pris", "Pris (kr)", "Det föräldern swishar per styck.", "number", 1], ["inkopspris", "Inköpspris (kr)", "Det laget betalar per styck. 0 om ni får det gratis.", "number", 1],
    ["minimum", "Minimum", "Minst så många krävs för att beställa. Skriv 0 om ni har ett lager.", "number", 2], ["mal", "Mål", "För lotter: samma som antal i lager.", "number", 2],
    ["lager", "Antal i lager (valfritt)", "Har laget fått ett bestämt antal, till exempel bingolotter? Skriv antalet. Då kan inte fler beställas än så. Tomt = ingen gräns.", "number", 5],
    ["maxAntal", "Max per beställning", "", "number", 3], ["kartong", "Antal per kartong", "0 om det inte säljs i kartonger.", "number", 3]
  ];

  // Fälten för ett lag. Används både när ett lag läggs till och när uppgifterna ändras.
  function faltBlock(v, nytt) {
    var inputs = {}, el = h("div"), grupper = {};
    function falt(label, hjalp, inp) {
      var id = "f" + (++uid); inp.id = id;
      return h("div", { class: "field" }, h("label", { for: id }, label, hjalp ? h("span", { class: "hint", text: hjalp }) : null), inp);
    }
    if (nytt) {
      inputs.namn = h("input", { type: "text", maxlength: "20", placeholder: "F2017", autocomplete: "off" });
      el.appendChild(falt("Lagets namn", "Till exempel F2017. Adressen till lagets sida skapas av namnet.", inputs.namn));
    }
    FALT.forEach(function (f) {
      // Siffror skrivs i vanliga textfält med sifferknappsats: type=number är olika i olika webbläsare och språk
      // (komma eller punkt), och servern accepterar båda.
      var inp = f[3] === "textarea" ? h("textarea", { rows: "3", maxlength: "400" }) : h("input", { type: f[3] === "tel" ? "tel" : "text", autocomplete: "off" });
      if (f[3] === "number") inp.setAttribute("inputmode", "decimal");
      if (f[3] === "tel") { inp.setAttribute("inputmode", "tel"); inp.setAttribute("placeholder", "123 456 78 90"); }
      inp.value = v[f[0]] === undefined || v[f[0]] === null ? "" : String(v[f[0]]);
      inputs[f[0]] = inp;
      var fb = falt(f[1], f[2], inp);
      if (f[4]) {
        if (!grupper[f[4]]) { grupper[f[4]] = h("div", { class: "grid2" }); el.appendChild(grupper[f[4]]); }
        fb.style.marginTop = "16px"; grupper[f[4]].appendChild(fb);
      } else el.appendChild(fb);
    });
    if (nytt) {   // mottagarens namn följer lagets namn tills någon ändrar det för hand
      var redigerad = false;
      inputs.mottagare.addEventListener("input", function () { redigerad = true; });
      inputs.namn.addEventListener("input", function () { if (!redigerad) inputs.mottagare.value = inputs.namn.value.trim() ? K.namn + " " + inputs.namn.value.trim() : ""; });
    }
    return { el: el, inputs: inputs, hamta: function () { var o = {}; Object.keys(inputs).forEach(function (k) { o[k] = inputs[k].value.trim(); }); return o; } };
  }

  function renderSuper() {
    S.valt = null; setTopbar("", "Admin"); document.title = K.namn + " – Admin";
    app.textContent = ""; app.appendChild(h("p", { class: "loading", text: "Hämtar lag…" }));
    anropa("lagLista").then(function (r) { if (!r.ok) return visaFelSida(r.fel); byggSuper(r.lag); });
  }

  function byggSuper(lista) {
    var nyckelPlats = h("div"), kogEl = h("div", { style: "margin-bottom:24px" }), listEl = h("div"), fel = h("p", { class: "error", role: "alert" });
    // Många lag: sökruta och filter på status. Visas först när det finns fler än så att korten ryms på en skärm.
    var MANGA = 6, sokTxt = "", statusFilter = "alla";
    var sokInp = h("input", { type: "search", id: "lagsok-admin", placeholder: "Sök lag", "aria-label": "Sök lag", autocomplete: "off" });
    var chipsEl = h("div", { class: "chips", role: "group", "aria-label": "Visa", style: "margin-top:12px" });
    var verktyg = h("div", { hidden: "", style: "margin-bottom:16px" }, sokInp, chipsEl);
    sokInp.addEventListener("input", function () { sokTxt = sokInp.value.trim().toLowerCase().replace(/\s+/g, ""); ritaLag(); });
    app.textContent = "";
    app.appendChild(h("div", { class: "topactions" }, h("h2", { class: "title", text: "Alla lag" }),
      h("button", { type: "button", class: "linkbtn", text: "Logga ut", onclick: loggaUt })));
    app.appendChild(nyckelPlats);
    app.appendChild(h("div", { style: "margin-top:16px" }, fel, kogEl, verktyg, listEl));
    if (DEMO) app.insertBefore(h("p", { class: "notice", text: "Demoläge med exempeldata. Inget sparas." }), nyckelPlats);

    function ladda() { anropa("lagLista").then(function (r) { if (r.ok) { lista = r.lag; ritaLag(); } else fel.textContent = r.fel; }); }

    function visaNyckel(rubrik, slug, key) {
      var lank = DEMO ? "[sidans adress]/admin.html#lag=" + slug + "&k=" + key
        : new URL("admin.html", location.href).href + "#lag=" + encodeURIComponent(slug) + "&k=" + encodeURIComponent(key);
      var b = h("button", { type: "button", class: "mini", text: "Kopiera" });
      b.addEventListener("click", function () { kopiera(lank, b); });
      nyckelPlats.textContent = "";
      nyckelPlats.appendChild(h("div", { class: "card", style: "margin-top:16px; border: 2px solid var(--yellow)" },
        h("h3", { style: "margin:0 0 6px", text: rubrik }),
        h("p", { style: "margin:0", text: "Länken är lagförälderns nya inloggning och innehåller lagets lösenord, koden efter k=. Den visas bara nu. Skicka den direkt till lagföräldern, aldrig i en grupp. Den gamla länken fungerar inte längre." }),
        h("div", { class: "keybox" }, h("code", { text: lank }), b),
        h("button", { type: "button", class: "ghost", style: "margin-top:12px", text: "Stäng", onclick: function () { nyckelPlats.textContent = ""; } })));
      nyckelPlats.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    // Ta bort ett lag som aldrig har öppnat, till exempel ett felaktigt eller dubbelt utkast. Två tryck, så att inget tas bort av misstag.
    function taBortKnapp(l) {
      var b = h("button", { type: "button", class: "mini", text: "Ta bort" }), redo = false, timer = null;
      b.addEventListener("click", function () {
        if (!redo) {
          redo = true; b.textContent = "Säker? Tas bort helt"; b.classList.add("danger");
          timer = setTimeout(function () { redo = false; b.textContent = "Ta bort"; b.classList.remove("danger"); }, 4000);
          return;
        }
        clearTimeout(timer); fel.textContent = "";
        anropa("lagTaBort", { slug: l.slug }).then(function (r) { if (!r.ok) fel.textContent = r.fel || "Det gick inte att ta bort."; ladda(); });
      });
      return b;
    }

    function lagKort(l, oppen) {
      var ov = l.oversikt, godkand = ["snart", "pagar", "avslutad"].indexOf(l.status) >= 0;
      var bekrafta = h("div", { class: "notice", hidden: "", style: "margin-top:12px" },
        h("p", { style: "margin:0", text: "Den gamla länken för " + l.namn + " slutar fungera direkt." }),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Ja, byt nyckel", onclick: function () {
            bekrafta.hidden = true; fel.textContent = "";
            anropa("nyNyckel", { slug: l.slug }).then(function (r) { if (r.ok) visaNyckel("Ny länk för " + l.namn, l.slug, r.key); else fel.textContent = r.fel; });
          } }),
          h("button", { type: "button", class: "mini", text: "Avbryt", onclick: function () { bekrafta.hidden = true; } })));
      // Stoppa i nödfall, till exempel om Swish-numret är fel: försäljningen går tillbaka till lagföräldern med kommentaren
      var stoppKom = h("textarea", { rows: "2", maxlength: "300", placeholder: "Varför stoppas försäljningen? Lagföräldern ser texten.", "aria-label": "Varför " + l.namn + " stoppas" });
      var stoppBox = h("div", { class: "notice", hidden: "", style: "margin-top:12px" },
        h("p", { style: "margin:0 0 8px", text: "Försäljningen stängs direkt och syns inte för föräldrarna. Lagföräldern rättar den och skickar den till dig igen. Beställningarna finns kvar." }),
        stoppKom,
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini danger", text: "Stoppa försäljningen", onclick: function () {
            fel.textContent = "";
            anropa("stoppa", { slug: l.slug, kommentar: stoppKom.value }).then(function (r) { if (!r.ok) fel.textContent = r.fel || "Det gick inte att stoppa."; else ladda(); });
          } }),
          h("button", { type: "button", class: "mini", text: "Avbryt", onclick: function () { stoppBox.hidden = true; } })));
      var kort = h("details", { class: "card teamadmin" },
        h("summary", null, h("span", { class: "o-name", text: l.namn + (l.kampanj ? " · " + l.kampanj : "") }), h("span", { class: "badge", text: STATUS_TEXT[l.status] || l.status })),
        h("div", { class: "o-sub num", text: l.status === "utkast" ? "Laget fyller i uppgifterna." + (l.kommentar ? " " + l.kommentar : "")
          : "Beställt " + nf.format(ov.bestallt) + " av " + nf.format(l.mal) + " · Betalt " + nf.format(ov.betalt) + " · Obetalt " + nf.format(ov.obetalt) + " · Hämtat " + nf.format(ov.hamtat || 0) }),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Öppna admin", onclick: function () { S.valt = l.slug; renderAdmin(); } }),
          h("button", { type: "button", class: "mini", text: "Ny länk", onclick: function () { bekrafta.hidden = false; } }),
          godkand ? h("button", { type: "button", class: "mini", text: "Stoppa…", onclick: function () { stoppBox.hidden = false; stoppKom.focus(); } }) : null,
          l.status === "utkast" ? taBortKnapp(l) : null),
        bekrafta, stoppBox);
      if (oppen) kort.open = true;
      return kort;
    }

    // En försäljning som väntar på klubbens godkännande: granska uppgifterna, godkänn eller skicka tillbaka med en kommentar.
    function kogKort(l) {
      var kFel = h("p", { class: "error", role: "alert" });
      var kom = h("textarea", { id: "kom-" + l.slug, rows: "3", maxlength: "300", placeholder: "Vad behöver ändras?", "aria-label": "Kommentar till " + l.namn });
      var skickaBtn = h("button", { type: "button", class: "mini go", text: "Skicka tillbaka" });
      var tillbakaBox = h("div", { hidden: "", style: "margin-top:12px" }, kom, h("div", { class: "btnrow" }, skickaBtn));
      function klar(r) { if (!r.ok) { kFel.textContent = r.fel || "Det gick inte att spara."; return; } ladda(); }
      function godkann() { kFel.textContent = ""; anropa("godkann", { slug: l.slug }).then(klar); }
      skickaBtn.addEventListener("click", function () {
        kFel.textContent = "";
        anropa("skickaTillbaka", { slug: l.slug, kommentar: kom.value }).then(klar);
      });
      return h("div", { class: "card teamadmin", style: "border: 2px solid var(--yellow)" },
        h("div", { class: "o-head" }, h("span", { class: "o-name", text: l.namn }), h("span", { class: "badge unpaid", text: STATUS_TEXT.granskas })),
        villkorKort(l),
        h("p", { class: "small", style: "margin:12px 0 0", text: "Kontrollera att Swish-numret ägs av någon som vet om det, att priserna stämmer och att laget bara säljer sådant som klubben har godkänt att laget får sälja." }),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Godkänn och öppna", onclick: godkann }),
          h("button", { type: "button", class: "mini", text: "Skicka tillbaka…", onclick: function () { tillbakaBox.hidden = !tillbakaBox.hidden; if (!tillbakaBox.hidden) kom.focus(); } }),
          taBortKnapp(l)),
        tillbakaBox, kFel);
    }

    function ritaLag() {
      listEl.textContent = ""; kogEl.textContent = "";
      var vantar = lista.filter(function (l) { return l.status === "granskas"; });
      if (vantar.length) {
        kogEl.appendChild(h("h3", { style: "margin:0 0 12px", text: "Väntar på godkännande (" + vantar.length + ")" }));
        vantar.forEach(function (l) { kogEl.appendChild(kogKort(l)); });
      }
      var ovriga = lista.filter(function (l) { return l.status !== "granskas"; });
      var manga = ovriga.length > MANGA;
      verktyg.hidden = !manga;
      if (manga) {
        chipsEl.textContent = "";
        [["alla", "Alla"], ["pagar", "Pågår"], ["snart", "Snart"], ["utkast", "Utkast"], ["avslutad", "Avslutade"]].forEach(function (c) {
          var n = c[0] === "alla" ? ovriga.length : ovriga.filter(function (l) { return l.status === c[0]; }).length;
          chipsEl.appendChild(h("button", { type: "button", class: "chip", "aria-pressed": String(c[0] === statusFilter), text: c[1] + " (" + n + ")",
            onclick: function () { statusFilter = c[0]; ritaLag(); } }));
        });
      }
      var vis = ovriga.filter(function (l) {
        return (!manga || statusFilter === "alla" || l.status === statusFilter) && (!sokTxt || (l.namn + (l.kampanj || "")).toLowerCase().replace(/\s+/g, "").indexOf(sokTxt) >= 0);
      });
      if (!lista.length) listEl.appendChild(h("p", { class: "notice", text: "Inga försäljningar ännu. Lagföräldrarna startar dem själva, med länken längre ned." }));
      else if (!vis.length && ovriga.length) listEl.appendChild(h("p", { class: "notice", text: "Inget lag matchar." }));
      vis.forEach(function (l) { listEl.appendChild(lagKort(l, !manga)); });
    }

    // Lagföräldrar startar sina försäljningar själva. Klubben delar den här länken med dem: den innehåller inget lösenord.
    var startLank = DEMO ? "[sidans adress]/admin.html#starta" : new URL("admin.html#starta", location.href).href;
    var startKnapp = h("button", { type: "button", class: "mini", text: "Kopiera" });
    startKnapp.addEventListener("click", function () { kopiera(startLank, startKnapp); });
    app.appendChild(h("div", { class: "card", style: "margin-top:16px" },
      h("h3", { style: "margin:0 0 6px", text: "Länk för lagföräldrar som vill starta en försäljning" }),
      h("p", { style: "margin:0", text: "Lagföräldrarna startar sina försäljningar själva och skickar dem till dig för godkännande. Dela länken med lagens ansvariga, till exempel i ett utskick. Den innehåller inget lösenord." }),
      h("div", { class: "keybox" }, h("code", { text: startLank }), startKnapp)));
    ritaLag();
  }

  /* ==========================================================================
     Demoläge: exempeldata i webbläsaren, samma form som servern svarar med.
     Nycklar: "demo" för ett lags admin, "super" för klubbadministratören.
     ========================================================================== */
  var demo = null;
  // En påhittad nyckel i samma form som de riktiga (32 tecken), så att demon visar hur en länk ser ut. Nyckeln demo fungerar också.
  function demoNyckel() {
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    var hex = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return hex.match(/.{4}/g).join("-");
  }
  function demoState() {
    if (demo) return demo;
    var lag = {}, ordrar = {};
    var namn = ["Alva", "Bo", "Cleo", "Dante", "Elsa", "Folke", "Greta", "Hugo"];
    (window.DEMO_LAG || []).forEach(function (l, li) {
      // Exempellagen är redan ifyllda i lag.js så som servern skulle svara. Pågående, kommande och avslutade lag får ett exempelnummer
      // (utkast saknar det med flit, för att visa kontrollen).
      var egen = JSON.parse(JSON.stringify(l));
      if (!egen.swish.nummer && ["pagar", "snart", "avslutad"].indexOf(egen.status) >= 0) egen.swish.nummer = K.standard.demoSwish;
      lag[l.slug] = egen;
      ordrar[l.slug] = l.status === "pagar" ? namn.slice(0, 6 + li).map(function (n, i) {
        return { id: String(i + 1).padStart(4, "0"), tid: new Date(Date.now() - (9 - i) * 3600e3 * (li + 1)).toISOString(), barn: n,
          mobil: "07000000" + String(10 + i), antal: 5 + ((i * 3) % 11), belopp: 0, betald: i % 3 === 0 ? "JA" : i % 5 === 4 ? "AVBRUTEN" : "",
          hamtad: i === 3 ? "JA" : "" };
      }) : [];
      ordrar[l.slug].forEach(function (o) { o.belopp = o.antal * lag[l.slug].pris; });
    });
    demo = { lag: lag, ordrar: ordrar, nycklar: {} };
    return demo;
  }
  function demoOversikt(l, ordrar) {
    var o = { bestallt: 0, betalt: 0, betaltKr: 0, obetalt: 0, obetaltKr: 0, avbrutna: 0, hamtat: 0, hamtatObetalt: 0, attHamta: 0 };
    ordrar.forEach(function (x) {
      if (x.betald === "AVBRUTEN") { o.avbrutna += x.antal; return; }
      o.bestallt += x.antal;
      if (x.betald === "JA") { o.betalt += x.antal; o.betaltKr += x.belopp; } else { o.obetalt += x.antal; o.obetaltKr += x.belopp; }
      if (x.hamtad === "JA") { o.hamtat += x.antal; if (x.betald !== "JA") o.hamtatObetalt += x.antal; } else if (x.betald === "JA") o.attHamta += x.antal;
    });
    o.minimumNatt = o.bestallt >= l.minimum; o.minimumKvar = Math.max(0, l.minimum - o.bestallt);
    o.lager = l.lager || 0; o.kvarILager = l.lager > 0 ? Math.max(0, l.lager - o.bestallt) : 0;
    o.kartonger = l.kartong > 0 ? Math.ceil(o.bestallt / l.kartong) : 0;
    o.levereras = l.kartong > 0 ? o.kartonger * l.kartong : o.bestallt;
    o.faktura = Math.round(o.levereras * l.inkopspris * 100) / 100;
    o.betaltMinusFaktura = Math.round((o.betaltKr - o.faktura) * 100) / 100;
    return o;
  }
  // Samma kontroll som servern gör innan en försäljning kan godkännas.
  function demoSaknas(l) {
    var m = [];
    if (!l.produkt || !l.produkt.namn) m.push("Produkt");
    if (!l.produkt || !l.produkt.enhetEn || !l.produkt.enhet) m.push("Enhet (ental och flertal)");
    if (!l.swish.nummer) m.push("Swish-nummer");
    if (!l.swish.namnPaKonto) m.push("Mottagarens namn i Swish");
    if (!(l.pris > 0)) m.push("Pris");
    if (l.lager > 0) { if (!(l.mal > 0)) m.push("Mål"); }
    else if (!(l.minimum > 0) || !(l.mal > 0)) m.push("Minimum och mål");
    if (m.length) return "Fyll i först: " + m.join(", ") + ".";
    if (l.inkopspris > l.pris) return "Inköpspriset kan inte vara högre än priset.";
    if (l.mal < l.minimum) return "Målet kan inte vara lägre än minimum.";
    return null;
  }
  // Lägger in ändrade fält i ett exempellag, på samma sätt som servern gör det
  function demoApplicera(l, f) {
    ["kampanj", "intro", "belonning", "utlamningsText"].forEach(function (k) { if (f[k] !== undefined) l[k] = String(f[k]).trim(); });
    l.produkt = l.produkt || { namn: "", detalj: "", enhetEn: "", enhet: "" };
    ["detalj", "enhetEn", "enhet"].forEach(function (k) { if (f[k] !== undefined) l.produkt[k] = String(f[k]).trim(); });
    if (f.produkt !== undefined) l.produkt.namn = String(f.produkt).trim();
    if (f.swishNummer !== undefined) l.swish.nummer = String(f.swishNummer).trim();
    if (f.mottagare !== undefined) l.swish.namnPaKonto = String(f.mottagare).trim();
    if (f.meddelande !== undefined) l.swish.meddelande = String(f.meddelande).trim();
    if (f.status !== undefined) l.status = f.status;
    ["pris", "inkopspris", "minimum", "mal", "lager", "maxAntal", "kartong"].forEach(function (k) { if (f[k] !== undefined && f[k] !== "") l[k] = Number(String(f[k]).replace(",", ".")); });
    l.titel = l.kampanj || l.produkt.namn;
  }
  function demoApi(p) {
    var s = demoState(), lag = p.lag !== "*" ? s.lag[p.lag] : null;
    var arSuper = p.key === "super";
    var lagNyckel = lag && (p.key === "demo" || (s.nycklar[lag.slug] && p.key === s.nycklar[lag.slug]));
    if (!(arSuper || lagNyckel)) return { ok: false, fel: "Fel lag eller nyckel." };
    var roll = arSuper ? "super" : "lag";
    var klon = function (x) { return JSON.parse(JSON.stringify(x)); };
    var svar;
    switch (p.op) {
      case "lagSpara": case "skickaGodkannande": case "dragTillbaka": case "oppna": case "avsluta": case "andra":
        if (arSuper) { svar = { ok: false, fel: "Det här gör lagföräldern. Klubben ändrar inte försäljningens uppgifter." }; break; }
        svar = demoLagOp(s, lag, p, klon); break;
      default:
        svar = demoKlubbOp(s, p, arSuper, klon);
    }
    svar.roll = roll;
    return svar;
  }

  // Lagförälderns egna åtgärder i demoläget, på samma sätt som servern
  function demoLagOp(s, lag, p, klon) {
    if (!lag) return { ok: false, fel: "Okänt lag." };
    switch (p.op) {
      case "lagSpara":
        if (lag.status !== "utkast") return { ok: false, fel: "Försäljningen är låst medan klubben granskar eller efter godkännandet. Välj Ändra uppgifter för att ändra den." };
        var fs = klon(p.falt || {});
        delete fs.status; delete fs.namn;   // laget kan inte ändra status eller namn
        demoApplicera(lag, fs);
        return { ok: true, lag: klon(lag) };
      case "skickaGodkannande":
        if (lag.status === "granskas") return { ok: false, fel: "Försäljningen väntar redan på godkännande." };
        if (lag.status !== "utkast") return { ok: false, fel: "Försäljningen är redan godkänd." };
        if (p.bekraftat !== true) return { ok: false, fel: "Bekräfta de två punkterna först." };
        var sak = demoSaknas(lag);
        if (sak) return { ok: false, fel: sak };
        lag.status = "granskas"; lag.kommentar = "";
        return { ok: true, lag: klon(lag) };
      case "dragTillbaka":
        if (lag.status !== "granskas") return { ok: false, fel: "Försäljningen väntar inte på godkännande." };
        lag.status = "utkast";
        return { ok: true, lag: klon(lag) };
      case "oppna":
        if (lag.status !== "snart" && lag.status !== "avslutad") return { ok: false, fel: lag.status === "pagar" ? "Försäljningen är redan öppen." : "Försäljningen måste godkännas av klubben innan den kan öppnas." };
        lag.status = "pagar"; return { ok: true, lag: klon(lag) };
      case "avsluta":
        if (lag.status !== "pagar" && lag.status !== "snart") return { ok: false, fel: "Försäljningen är inte öppen." };
        lag.status = "avslutad"; return { ok: true, lag: klon(lag) };
      case "andra":
        if (["snart", "pagar", "avslutad"].indexOf(lag.status) < 0) return { ok: false, fel: "Försäljningen går redan att ändra." };
        lag.status = "utkast"; lag.kommentar = ""; return { ok: true, lag: klon(lag) };
    }
    return { ok: false, fel: "Okänd åtgärd." };
  }

  // Det som både lagföräldern och klubben kan göra med beställningarna, och klubbens egna åtgärder, i demoläget
  function demoKlubbOp(s, p, arSuper, klon) {
    var lag = p.lag !== "*" ? s.lag[p.lag] : null, svar;
    switch (p.op) {
      case "oversikt": svar = lag ? { ok: true, lag: klon(lag), oversikt: demoOversikt(lag, s.ordrar[lag.slug]) } : { ok: false, fel: "Okänt lag." }; break;
      case "lista": svar = lag ? { ok: true, lag: klon(lag), ordrar: klon(s.ordrar[lag.slug]).reverse() } : { ok: false, fel: "Okänt lag." }; break;
      case "taBort":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        var li = -1;
        s.ordrar[lag.slug].forEach(function (x, ix) { if (parseInt(x.id, 10) === parseInt(p.id, 10)) li = ix; });
        if (li < 0) { svar = { ok: false, fel: "Hittar ingen order " + p.id + "." }; break; }
        if (s.ordrar[lag.slug][li].betald === "JA") { svar = { ok: false, fel: "En betald beställning kan inte tas bort. Ångra betalningen först om den är fel." }; break; }
        if (s.ordrar[lag.slug][li].hamtad === "JA") { svar = { ok: false, fel: "En hämtad beställning kan inte tas bort. Ångra hämtningen först." }; break; }
        var borttagen = s.ordrar[lag.slug].splice(li, 1)[0].id;
        svar = { ok: true, borttagen: borttagen, oversikt: demoOversikt(lag, s.ordrar[lag.slug]) }; break;
      case "hamtad":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        var oh = s.ordrar[lag.slug].filter(function (x) { return parseInt(x.id, 10) === parseInt(p.id, 10); })[0];
        var vh = String(p.varde || "").toUpperCase();
        if (!oh) { svar = { ok: false, fel: "Hittar ingen order " + p.id + "." }; break; }
        if (["JA", ""].indexOf(vh) < 0) { svar = { ok: false, fel: "Felaktigt värde." }; break; }
        if (vh === "JA" && oh.betald === "AVBRUTEN") { svar = { ok: false, fel: "Beställningen är avbruten och kan inte hämtas." }; break; }
        oh.hamtad = vh;
        svar = { ok: true, order: klon(oh), oversikt: demoOversikt(lag, s.ordrar[lag.slug]) }; break;
      case "hamtadAlla":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        var mark = 0, kvarOb = 0;
        s.ordrar[lag.slug].forEach(function (x) {
          if (x.hamtad === "JA" || x.betald === "AVBRUTEN") return;
          if (x.betald !== "JA") { kvarOb++; return; }
          x.hamtad = "JA"; mark++;
        });
        svar = { ok: true, markerade: mark, obetaldaKvar: kvarOb, ordrar: klon(s.ordrar[lag.slug]).reverse(), oversikt: demoOversikt(lag, s.ordrar[lag.slug]) }; break;
      case "satt":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        var o = s.ordrar[lag.slug].filter(function (x) { return parseInt(x.id, 10) === parseInt(p.id, 10); })[0];
        if (!o) { svar = { ok: false, fel: "Hittar ingen order " + p.id + "." }; break; }
        o.betald = String(p.varde || "").toUpperCase();
        svar = { ok: true, order: klon(o), oversikt: demoOversikt(lag, s.ordrar[lag.slug]) }; break;
      default:
        if (!arSuper) return { ok: false, fel: "Bara klubbens administratör får göra det här." };
        if (p.op === "lagLista") svar = { ok: true, lag: Object.keys(s.lag).map(function (k) {
          var ov = demoOversikt(s.lag[k], s.ordrar[k]), ut = klon(s.lag[k]);
          ut.oversikt = { bestallt: ov.bestallt, betalt: ov.betalt, betaltKr: ov.betaltKr, obetalt: ov.obetalt, hamtat: ov.hamtat, attHamta: ov.attHamta }; return ut; }) };
        else if (p.op === "godkann" || p.op === "skickaTillbaka") {
          var gl = s.lag[p.slug];
          if (!gl) { svar = { ok: false, fel: "Okänt lag." }; break; }
          var kom = String(p.kommentar || "").trim();
          if (p.op === "skickaTillbaka" && !kom) { svar = { ok: false, fel: "Skriv vad som behöver ändras." }; break; }
          if (gl.status !== "granskas") { svar = { ok: false, fel: "Försäljningen väntar inte på godkännande." }; break; }
          if (p.op === "godkann") { var gs = demoSaknas(gl); if (gs) { svar = { ok: false, fel: gs }; break; } gl.status = "pagar"; gl.kommentar = ""; }
          else { gl.status = "utkast"; gl.kommentar = kom.slice(0, 300); }
          svar = { ok: true, lag: klon(gl) };
        } else if (p.op === "stoppa") {
          var sl = s.lag[p.slug], sk = String(p.kommentar || "").trim();
          if (!sl) svar = { ok: false, fel: "Okänt lag." };
          else if (!sk) svar = { ok: false, fel: "Skriv varför försäljningen stoppas. Lagföräldern ser det." };
          else if (["snart", "pagar", "avslutad"].indexOf(sl.status) < 0) svar = { ok: false, fel: "Försäljningen är inte godkänd, så det finns inget att stoppa." };
          else { sl.status = "utkast"; sl.kommentar = "Klubben stoppade försäljningen: " + sk.slice(0, 300); svar = { ok: true, lag: klon(sl) }; }
        } else if (p.op === "nyNyckel") {
          if (s.lag[p.slug]) { s.nycklar[p.slug] = demoNyckel(); svar = { ok: true, slug: p.slug, key: s.nycklar[p.slug] }; }
          else svar = { ok: false, fel: "Okänt lag." };
        }
        else if (p.op === "lagTaBort") {
          var tl = s.lag[p.slug];
          if (!tl) svar = { ok: false, fel: "Okänt lag." };
          else if (tl.status !== "utkast" && tl.status !== "granskas") svar = { ok: false, fel: "Bara utkast och försäljningar som väntar på godkännande kan tas bort. Avsluta försäljningen i stället." };
          else if ((s.ordrar[p.slug] || []).length) svar = { ok: false, fel: "Laget har beställningar och kan inte tas bort." };
          else { delete s.lag[p.slug]; delete s.ordrar[p.slug]; svar = { ok: true, borttaget: p.slug }; }
        }
        else svar = { ok: false, fel: "Okänd åtgärd." };
    }
    return svar;
  }

  // Samma som servern: lagföräldern startar ett tomt utkast med lagets namn och får en egen nyckel.
  function demoStart(p) {
    var s = demoState(), namn = String(p.namn || "").trim();
    if (p.website) return { ok: false, fel: "Det gick inte att starta just nu. Försök igen om en stund." };
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .\-]{1,19}$/u.test(namn)) return { ok: false, fel: "Skriv lagets namn (2–20 tecken)." };
    var slug = namn.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (s.lag[slug]) return { ok: false, fel: "Det finns redan en försäljning för " + namn + ". Hör av dig till den som startade den eller till klubben. Säljer laget något nytt kan du skriva till exempel " + namn + " Lotter." };
    var nytt = { slug: slug, namn: namn, status: "utkast", kommentar: "", kampanj: "", titel: "", intro: "", belonning: "", utlamningsText: "",
      produkt: { namn: "", detalj: "", enhetEn: "", enhet: "" }, swish: { nummer: "", namnPaKonto: "", meddelande: namn + " försäljning" },
      pris: 0, inkopspris: 0, minimum: 0, mal: 0, lager: 0, maxAntal: 50, kartong: 0 };
    s.lag[slug] = nytt; s.ordrar[slug] = []; s.nycklar[slug] = demoNyckel();
    return { ok: true, slug: slug, key: s.nycklar[slug], lag: JSON.parse(JSON.stringify(nytt)) };
  }

  /* ---------- Start ---------- */
  function start() {
    // Adminlänken har formen admin.html#lag=<slug>&k=<nyckel>. Nyckeln ligger efter # så att den inte skickas till webbservern.
    if (location.hash === "#starta") return visaStart();   // länk direkt till Starta en försäljning
    var hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("lank")) {   // länk från e-posten till klubbens administratör
      var token = hash.get("lank");
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      return visaBekrafta(token);
    }
    if (hash.get("lag") && hash.get("k")) {
      var lag = hash.get("lag"), key = hash.get("k");
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      app.appendChild(h("p", { class: "loading", text: "Loggar in…" }));
      return loggaIn(lag, key, function (t) { visaLogin(t, lag); });
    }
    var sess = lasSession();
    if (sess && (sess.key || sess.klubbadmin)) {
      app.appendChild(h("p", { class: "loading", text: "Hämtar…" }));
      return loggaIn(sess.lag, sess.key || "", function () { visaLogin(); });
    }
    // Klubbens administratör kan vara inloggad (en cookie hos servern, 30 dagar) fast fliken har stängts: fråga servern innan inloggningen visas
    if (!DEMO) {
      app.appendChild(h("p", { class: "loading", text: "Hämtar…" }));
      return apiLogin({ op: "vem" }).then(function (r) {
        var inloggad = r && r.ok && r.inloggad && (r.klubbar || []).some(function (k) { return k.slug === K.slug; });
        if (inloggad) return loggaIn("*", "", function () { visaLogin(); });
        visaLogin();
      });
    }
    visaLogin();
  }
  start();
})();
