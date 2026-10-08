/* ==========================================================================
   Adminvy för klubbens lagförsäljning.
   Lagföräldern loggar in med lagets adminnyckel och ser bara sitt eget lag: först försäljningen
   (utkast som skickas till klubben för godkännande), sedan översikt, beställningar, betalningar och utlämning. Klubbens administratör loggar in med
   superadmin-nyckeln, ser alla lag och lägger till nya.
   All behörighet kontrolleras av servern (Server.gs). Den här filen visar bara.
   Utan KLUBB.endpoint körs demoläge med exempeldata och inget sparas.
   ========================================================================== */
(function () {
  "use strict";

  var U = window.U, h = U.h, kr = U.kr, nf = U.nf, merge = U.merge;
  var K = window.KLUBB, DEMO = !K.endpoint;
  var app = document.getElementById("app");
  var S = { lag: null, key: null, roll: null, valt: null };   // inloggning: vilket lag, nyckel, roll, valt lag

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
  function sparaSession() { try { sessionStorage.setItem("admin", JSON.stringify({ lag: S.lag, key: S.key })); } catch (e) {} }
  function lasSession() { try { return JSON.parse(sessionStorage.getItem("admin") || "null"); } catch (e) { return null; } }
  function raderaSession() { try { sessionStorage.removeItem("admin"); } catch (e) {} }

  /* ---------- Anrop till servern ---------- */
  function api(payload) {
    if (DEMO) return Promise.resolve(demoApi(payload));
    return fetch(K.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "admin" }, payload)) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, fel: "Det gick inte att nå servern. Kontrollera uppkopplingen och försök igen." }; });
  }
  function anrop(op, extra, lag) {
    return api(Object.assign({ lag: lag || S.lag, key: S.key, op: op }, extra || {}));
  }
  // Som anrop, men om nyckeln inte gäller längre (till exempel bytt) skickas användaren till inloggningen.
  function anropa(op, extra, lag) {
    return anrop(op, extra, lag).then(function (r) {
      if (!r.ok && /^Fel lag eller nyckel/.test(r.fel || "")) { visaLogin("Nyckeln gäller inte längre. Logga in igen."); return new Promise(function () {}); }
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
      pris: harPris ? l.pris : "", inkopspris: harPris ? l.inkopspris : "", minimum: l.minimum > 0 ? l.minimum : "", mal: l.mal > 0 ? l.mal : "",
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
      kv("Minimum / mål", nf.format(l.minimum) + " / " + nf.format(l.mal)),
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
  function visaLogin(meddelande, forifyllt) {
    S = { lag: null, key: null, roll: null, valt: null }; raderaSession();
    setTopbar("", "Admin"); document.title = K.namn + " – Admin";
    app.textContent = "";
    app.appendChild(h("h2", { class: "title", text: "Logga in" }));
    app.appendChild(h("p", { class: "lead", text: "Välj ditt lag och skriv in lagets adminnyckel. Klubbens administratör väljer \"Klubbadministratör\"." }));
    if (DEMO) app.appendChild(h("p", { class: "notice", style: "margin-top:12px", text: "Demoläge med exempeldata, inget sparas. Prova nyckeln demo (lagets admin), super (klubbadministratör) eller utlamning (den som delar ut, bara för F2017)." }));
    var fel = h("p", { class: "formerror", role: "alert", hidden: "" });
    var sel = h("select", { id: "lag" }, h("option", { value: "", text: "Hämtar lag…" }));
    var key = h("input", { type: "password", id: "key", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "xxxx-xxxx-xxxx-…" });
    var go = h("button", { type: "submit", class: "primary", style: "margin-top:16px", text: "Logga in" });
    var form = h("form", { class: "card", style: "margin-top:16px", novalidate: "" }, fel,
      h("div", { class: "field" }, h("label", { for: "lag", text: "Lag" }), sel),
      h("div", { class: "field" }, h("label", { for: "key", text: "Adminnyckel" }), key), go);
    app.appendChild(form);
    function visaFel(t) { fel.textContent = t; fel.hidden = false; }
    if (meddelande) visaFel(meddelande);
    U.hamtaLag(function (err, lista) {
      sel.textContent = "";
      if (err) { sel.appendChild(h("option", { value: "", text: "Kunde inte hämta lagen" })); return; }
      sel.appendChild(h("option", { value: "", text: "Välj lag…" }));
      lista.forEach(function (l) { sel.appendChild(h("option", { value: l.slug, text: l.namn + (l.kampanj ? " – " + l.kampanj : "") })); });
      sel.appendChild(h("option", { value: "*", text: "Klubbadministratör (alla lag)" }));
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

  function loggaIn(lag, key, vidFel) {
    S.lag = lag; S.key = key;
    return anrop(lag === "*" ? "lagLista" : "oversikt").then(function (r) {
      if (!r.ok) { S = { lag: null, key: null, roll: null, valt: null }; vidFel(r.fel || "Det gick inte att logga in."); return; }
      S.roll = r.roll; S.valt = lag === "*" ? null : lag;
      sparaSession(); renderAdmin();
    });
  }

  function loggaUt() { visaLogin(); }

  function renderAdmin() {
    if (!S.key) return visaLogin();
    if (S.roll === "utlamning") return renderUtlamning(S.valt);
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
    if (d.lag.status === "utkast" || d.lag.status === "granskas") return byggUppsattning(d);
    var slug = d.lag.slug, produkt = produktAv(d.lag);
    var filter = "alla", sok = "", utlNyckel = null;   // utlNyckel: den nyss skapade utlämningsnyckeln, visas bara nu
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
      S.roll === "super" ? h("button", { type: "button", class: "linkbtn", text: "← Alla lag", onclick: function () { S.valt = null; renderAdmin(); } }) : h("span"),
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

      // Länk till den som delar ut: egen nyckel som bara ger namn och antal. Länken visas bara när den skapas.
      var utlPlats = h("div"), utlFel = h("p", { class: "error", role: "alert" });
      function utlAdress(key) {
        return DEMO ? "[sidans adress]/admin.html#lag=" + slug + "&k=" + key
          : new URL("admin.html", location.href).href + "#lag=" + encodeURIComponent(slug) + "&k=" + encodeURIComponent(key);
      }
      function armad(text, varning, gor) {
        var b = h("button", { type: "button", class: "mini", text: text }), redo = false, timer = null;
        b.addEventListener("click", function () {
          if (!varning || redo) { clearTimeout(timer); gor(); return; }
          redo = true; b.textContent = varning; b.classList.add("danger");
          timer = setTimeout(function () { redo = false; b.textContent = text; b.classList.remove("danger"); }, 4000);
        });
        return b;
      }
      function ritaUtl() {
        utlPlats.textContent = "";
        if (utlNyckel) {
          var adress = utlAdress(utlNyckel), kb = h("button", { type: "button", class: "mini", text: "Kopiera" });
          kb.addEventListener("click", function () { kopiera(adress, kb); });
          utlPlats.appendChild(h("p", { style: "margin:0", text: "Skicka länken till den som delar ut, på ett säkert sätt. Den visas bara nu." }));
          utlPlats.appendChild(h("div", { class: "keybox" }, h("code", { text: adress }), kb));
        } else utlPlats.appendChild(h("p", { style: "margin:0", text: l.harUtlamningslank
          ? "Det finns en utlämningslänk. Av säkerhetsskäl visas den bara när den skapas."
          : "Skapa en länk till den som delar ut. Den ger en lista att bocka av med namn och antal. Mobilnummer, belopp och betalningar syns inte." }));
        var knappar = h("div", { class: "btnrow" });
        knappar.appendChild(armad(l.harUtlamningslank ? "Skapa ny länk" : "Skapa utlämningslänk", l.harUtlamningslank ? "Säker? Den gamla slutar fungera" : null, function () {
          utlFel.textContent = "";
          anropa("nyUtlamningslank", null, slug).then(function (r) {
            if (!r.ok) { utlFel.textContent = r.fel || "Det gick inte att skapa länken."; return; }
            l.harUtlamningslank = true; utlNyckel = r.key; ritaUtl();
          });
        }));
        if (l.harUtlamningslank) knappar.appendChild(armad("Stäng av", "Säker? Länken slutar fungera", function () {
          utlFel.textContent = "";
          anropa("stangUtlamningslank", null, slug).then(function (r) {
            if (!r.ok) { utlFel.textContent = r.fel || "Det gick inte att stänga av."; return; }
            l.harUtlamningslank = false; utlNyckel = null; ritaUtl();
          });
        }));
        utlPlats.appendChild(knappar); utlPlats.appendChild(utlFel);
      }
      ritaUtl();
      oPanel.appendChild(h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 6px", text: "Länk till den som delar ut" }), utlPlats));

      var lev = h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 8px", text: "Beställning hos leverantören" }),
        kv("Minimum " + nf.format(l.minimum), o.minimumNatt ? "Nått ✓" : nf.format(o.minimumKvar) + " kvar", o.minimumNatt ? "pos" : "", true));
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
        h("p", { class: "small", style: "margin:10px 0 0", text: S.roll === "super" ? "Ändra uppgifterna under Alla lag." : "Uppgifterna ändras av klubbens administratör." })));
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

  /* ---------- Utlämningslänken: en vy för den som delar ut. Namn och antal, aldrig mobilnummer eller belopp. ---------- */
  function renderUtlamning(slug) {
    app.textContent = ""; app.appendChild(h("p", { class: "loading", text: "Hämtar…" }));
    Promise.all([anropa("oversikt", null, slug), anropa("lista", null, slug)]).then(function (rs) {
      if (!rs[0].ok || !rs[1].ok) return visaFelSida(rs[0].fel || rs[1].fel);
      byggUtlamningsvy({ lag: rs[0].lag, ordrar: rs[1].ordrar });
    });
  }

  function byggUtlamningsvy(d) {
    var slug = d.lag.slug, P = produktAv(d.lag), filter = "kvar", sok = "";
    setTopbar(d.lag.namn, "Utlämning");
    document.title = K.namn + " – Utlämning " + d.lag.namn;
    var stats = h("div", { class: "stats noprint", style: "margin-top:16px" });
    var chips = h("div", { class: "chips noprint", role: "group", "aria-label": "Visa", style: "margin-top:16px" }), chipBtns = {};
    [["kvar", "Kvar att hämta"], ["hamtade", "Hämtade"], ["alla", "Alla"]].forEach(function (c) {
      var b = h("button", { type: "button", class: "chip", "aria-pressed": String(c[0] === filter), onclick: function () { filter = c[0]; rita(); } });
      chipBtns[c[0]] = { b: b, namn: c[1] }; chips.appendChild(b);
    });
    var sokInp = h("input", { type: "search", class: "noprint", placeholder: "Sök namn eller ordernummer", "aria-label": "Sök", autocomplete: "off", style: "margin-top:12px" });
    sokInp.addEventListener("input", function () { sok = sokInp.value.trim().toLowerCase(); rita(); });
    var list = h("div", { role: "list", style: "margin-top:12px" });
    var tomt = h("p", { class: "small noprint", hidden: "" });
    var fel = h("p", { class: "error noprint", role: "alert" });

    app.textContent = "";
    app.appendChild(h("div", { class: "topactions" }, h("span"), h("button", { type: "button", class: "linkbtn", text: "Logga ut", onclick: loggaUt })));
    app.appendChild(h("h2", { class: "title", text: "Utlämning" }));
    app.appendChild(h("p", { class: "printonly", text: d.lag.namn + " · Utlämningslista " + new Date().toLocaleDateString("sv-SE") }));
    app.appendChild(h("p", { class: "lead noprint", text: "Bocka av när någon hämtat sin beställning. Det sparas direkt. Du ser bara namn och antal." }));
    [stats, chips, sokInp, list, tomt, fel, h("button", { type: "button", class: "ghost noprint", style: "margin-top:16px", text: "Skriv ut listan", onclick: function () { window.print(); } })]
      .forEach(function (e) { app.appendChild(e); });

    function ritaStats() {
      var hamtat = 0, kvar = 0, nH = 0, nK = 0;
      d.ordrar.forEach(function (o) { if (o.hamtad) { hamtat += o.antal; nH++; } else { kvar += o.antal; nK++; } });
      stats.textContent = "";
      stats.appendChild(stat("Hämtat", nf.format(hamtat), P.enhet));
      stats.appendChild(stat("Kvar att dela ut", nf.format(kvar), P.enhet));
      var n = { kvar: nK, hamtade: nH, alla: d.ordrar.length };
      Object.keys(chipBtns).forEach(function (k) { chipBtns[k].b.textContent = chipBtns[k].namn + " (" + n[k] + ")"; chipBtns[k].b.setAttribute("aria-pressed", String(k === filter)); });
    }
    function rad(o) {
      var id = "p" + o.id, cb = h("input", { type: "checkbox", id: id });
      cb.checked = o.hamtad;
      cb.addEventListener("change", function () { sattHamtad(o, cb.checked, cb); });
      return h("label", { class: "pick", role: "listitem", for: id }, cb,
        h("span", { class: "p-main" }, h("span", { class: "p-name", text: "#" + o.id + " " + o.barn }), h("span", { class: "p-sub num", text: o.antal + " " + (o.antal === 1 ? P.enhetEn : P.enhet) })),
        h("span", { class: "badge " + (o.betald ? "live" : "unpaid"), text: o.betald ? "Betald" : "Obetald" }));
    }
    // Slår om direkt och sparar sedan. Går något fel ställs rutan tillbaka och felet visas.
    function sattHamtad(o, varde, cb) {
      var gammal = o.hamtad; o.hamtad = varde; fel.textContent = ""; ritaStats();
      iKo(function () { return anropa("hamtad", { id: o.id, varde: varde ? "JA" : "" }, slug).then(function (r) {
        if (!r.ok) { o.hamtad = gammal; cb.checked = gammal; ritaStats(); fel.textContent = "#" + o.id + " " + o.barn + ": " + (r.fel || "Det gick inte att spara."); return; }
        Object.assign(o, r.order);
      }); });
    }
    function rita() {
      ritaStats();
      var akt = d.ordrar.slice().sort(function (x, y) { return x.barn.localeCompare(y.barn, "sv") || x.id.localeCompare(y.id); });
      list.textContent = ""; var synliga = 0;
      akt.forEach(function (o) {
        var r = rad(o);
        var passar = (filter === "alla" || (filter === "kvar" ? !o.hamtad : o.hamtad)) && (!sok || (o.barn + " " + o.id).toLowerCase().indexOf(sok) >= 0);
        if (passar) synliga++; else r.hidden = true;   // dolda rader finns kvar så att hela listan kan skrivas ut
        list.appendChild(r);
      });
      tomt.hidden = synliga > 0;
      tomt.textContent = !akt.length ? "Inga beställningar än." : sok ? "Inga beställningar matchar." : filter === "kvar" ? "Alla är hämtade. Bra jobbat!" : "Inget är hämtat än.";
    }
    rita();
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
      h("li", { text: "Klubben godkänner och öppnar försäljningen. Då kan föräldrarna beställa." })));

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
      h("strong", { text: "Klubben skickade tillbaka försäljningen:" }), h("p", { style: "margin:4px 0 0", text: l.kommentar })));
    if (arSuper) {
      app.appendChild(h("p", { class: "notice", style: "margin-top:12px", text: "Du ser utkastet som klubbadministratör. Ändra uppgifterna under Alla lag." }));
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

  /* ---------- Klubbadministratörens vy: alla lag, lägg till lag ---------- */
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
    ["minimum", "Minimum", "Minst så många krävs för att beställa.", "number", 2], ["mal", "Mål", "", "number", 2],
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
      var lank = new URL("admin.html", location.href).href + "#lag=" + encodeURIComponent(slug) + "&k=" + encodeURIComponent(key);
      function rad(etikett, text) {
        var b = h("button", { type: "button", class: "mini", text: "Kopiera" });
        b.addEventListener("click", function () { kopiera(text, b); });
        return h("div", null, h("p", { class: "small", style: "margin:12px 0 0", text: etikett }), h("div", { class: "keybox" }, h("code", { text: text }), b));
      }
      nyckelPlats.textContent = "";
      nyckelPlats.appendChild(h("div", { class: "card", style: "margin-top:16px; border: 2px solid var(--yellow)" },
        h("h3", { style: "margin:0 0 6px", text: rubrik }),
        h("p", { style: "margin:0", text: "Nyckeln visas bara nu. Skicka adminlänken till lagföräldern på ett säkert sätt, inte i en öppen grupp." }),
        rad("Adminlänk (loggar in direkt)", lank), rad("Adminnyckel", key), rad("Beställningssida för föräldrar", bestallningsLank(slug)),
        h("ol", { class: "steps small" },
          h("li", { text: "Skicka adminlänken till lagföräldern. Lagföräldern fyller i försäljningen och skickar den till klubben." }),
          h("li", { text: "Granska och godkänn den här under Väntar på godkännande." }),
          h("li", { text: "Gör en testbeställning på beställningssidan och markera den som avbruten." })),
        h("button", { type: "button", class: "ghost", style: "margin-top:12px", text: "Stäng", onclick: function () { nyckelPlats.textContent = ""; } })));
      nyckelPlats.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function lagKort(l, oppen) {
      var sel = h("select", { "aria-label": "Status för " + l.namn });
      Object.keys(STATUS_TEXT).forEach(function (k) { sel.appendChild(h("option", { value: k, text: STATUS_TEXT[k] })); });
      sel.value = l.status;
      sel.addEventListener("change", function () {
        fel.textContent = "";
        anropa("lagUppdatera", { slug: l.slug, falt: { status: sel.value } }).then(function (r) { if (!r.ok) fel.textContent = r.fel; ladda(); });
      });
      var ov = l.oversikt;
      var andra = h("details", { style: "margin-top:12px" }, h("summary", { text: "Ändra uppgifter" }));
      var fb = faltBlock(fyllVarden(l), false);
      var spara = h("button", { type: "button", class: "primary", style: "margin-top:16px", text: "Spara" });
      var sFel = h("p", { class: "error", role: "alert" });
      spara.addEventListener("click", function () {
        spara.disabled = true; sFel.textContent = "";
        anropa("lagUppdatera", { slug: l.slug, falt: fb.hamta() }).then(function (r) {
          spara.disabled = false;
          if (!r.ok) { sFel.textContent = r.fel; return; }
          ladda();
        });
      });
      andra.appendChild(h("div", { style: "padding-top:12px" }, fb.el, spara, sFel));
      var bekrafta = h("div", { class: "notice", hidden: "", style: "margin-top:12px" },
        h("p", { style: "margin:0", text: "Den gamla nyckeln för " + l.namn + " slutar fungera direkt." }),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Ja, byt nyckel", onclick: function () {
            bekrafta.hidden = true; fel.textContent = "";
            anropa("nyNyckel", { slug: l.slug }).then(function (r) { if (r.ok) visaNyckel("Ny nyckel för " + l.namn, l.slug, r.key); else fel.textContent = r.fel; });
          } }),
          h("button", { type: "button", class: "mini", text: "Avbryt", onclick: function () { bekrafta.hidden = true; } })));
      var kort = h("details", { class: "card teamadmin" },
        h("summary", null, h("span", { class: "o-name", text: l.namn + (l.kampanj ? " · " + l.kampanj : "") }), h("span", { class: "badge", text: STATUS_TEXT[l.status] || l.status })),
        h("div", { class: "o-sub num", text: l.status === "utkast" ? "Laget fyller i uppgifterna." + (l.kommentar ? " Tillbakaskickad: " + l.kommentar : "")
          : "Beställt " + nf.format(ov.bestallt) + " av " + nf.format(l.mal) + " · Betalt " + nf.format(ov.betalt) + " · Obetalt " + nf.format(ov.obetalt) + " · Hämtat " + nf.format(ov.hamtat || 0) }),
        h("div", { class: "field", style: "margin-top:12px" }, sel),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Öppna admin", onclick: function () { S.valt = l.slug; renderAdmin(); } }),
          h("button", { type: "button", class: "mini", text: "Ny nyckel", onclick: function () { bekrafta.hidden = false; } })),
        bekrafta,
        andra);
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
      function godkann(till) { kFel.textContent = ""; anropa("godkann", { slug: l.slug, till: till }).then(klar); }
      skickaBtn.addEventListener("click", function () {
        kFel.textContent = "";
        anropa("skickaTillbaka", { slug: l.slug, kommentar: kom.value }).then(klar);
      });
      return h("div", { class: "card teamadmin", style: "border: 2px solid var(--yellow)" },
        h("div", { class: "o-head" }, h("span", { class: "o-name", text: l.namn }), h("span", { class: "badge unpaid", text: STATUS_TEXT.granskas })),
        villkorKort(l),
        h("p", { class: "small", style: "margin:12px 0 0", text: "Kontrollera att Swish-numret ägs av någon som vet om det, att priserna stämmer och att laget bara säljer sådant som klubben har godkänt att laget får sälja." }),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Godkänn och öppna nu", onclick: function () { godkann("pagar"); } }),
          h("button", { type: "button", class: "mini", text: "Godkänn, öppna senare", onclick: function () { godkann("snart"); } }),
          h("button", { type: "button", class: "mini", text: "Skicka tillbaka…", onclick: function () { tillbakaBox.hidden = !tillbakaBox.hidden; if (!tillbakaBox.hidden) kom.focus(); } })),
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
      if (!lista.length) listEl.appendChild(h("p", { class: "notice", text: "Inga lag är tillagda ännu. Lägg till det första nedan." }));
      else if (!vis.length && ovriga.length) listEl.appendChild(h("p", { class: "notice", text: "Inget lag matchar." }));
      vis.forEach(function (l) { listEl.appendChild(lagKort(l, !manga)); });
    }

    /* Lägg till lag */
    var kryss = [
      "Klubben eller lagets ansvariga har bekräftat att laget finns och att den som ber om det får sälja i lagets namn.",
      "Lagföräldern vet att uppgifterna om försäljningen fylls i och skickas till klubben för godkännande innan något säljs.",
      "Lagföräldern har fått veta att adminlänken är personlig och bara ska delas med dem som hanterar betalningarna, och att föräldrars uppgifter ska hanteras enligt klubbens regler."
    ];
    var kryssEl = [], lista2 = h("ul", { class: "checklist" });
    kryss.forEach(function (t) {
      var id = "k" + (++uid), cb = h("input", { type: "checkbox", id: id });
      cb.addEventListener("change", uppdateraKnapp);
      kryssEl.push(cb);
      lista2.appendChild(h("li", null, h("label", { class: "check", for: id }, cb, h("span", { text: t }))));
    });
    var nytt = faltBlock({}, true);   // tomt: lagföräldern fyller i resten
    var statusSel = h("select", { id: "nstatus" });
    Object.keys(STATUS_TEXT).forEach(function (k) { statusSel.appendChild(h("option", { value: k, text: STATUS_TEXT[k] })); });
    statusSel.value = "utkast";
    var laggTillBtn = h("button", { type: "submit", class: "primary", style: "margin-top:16px", text: "Lägg till laget", disabled: "" });
    var nFel = h("p", { class: "formerror", role: "alert", hidden: "" });
    function uppdateraKnapp() { laggTillBtn.disabled = !kryssEl.every(function (c) { return c.checked; }); }
    var form = h("form", { novalidate: "", style: "padding-top:12px" }, h("p", { class: "small", style: "margin:0", text: "Kontrollera innan du lägger till:" }), lista2,
      h("div", { style: "margin-top:16px" }, nFel,
        h("p", { class: "small", style: "margin:0 0 12px", text: "Det räcker med lagets namn. Lagföräldern fyller i produkt, priser och Swish-nummer." }), nytt.el,
        h("div", { class: "field" }, h("label", { for: "nstatus", text: "Status" }), statusSel)), laggTillBtn);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); nFel.hidden = true;
      laggTillBtn.disabled = true;
      var data = nytt.hamta(); data.status = statusSel.value;
      anropa("lagNy", { data: data }).then(function (r) {
        uppdateraKnapp();
        if (!r.ok) { nFel.textContent = r.fel; nFel.hidden = false; nFel.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        visaNyckel("Laget " + r.lag.namn + " är tillagt", r.slug, r.key);
        kryssEl.forEach(function (c) { c.checked = false; });
        ["namn", "swishNummer", "mottagare", "meddelande"].forEach(function (k) { nytt.inputs[k].value = ""; });
        uppdateraKnapp(); ladda();
      });
    });
    app.appendChild(h("div", { class: "card", style: "margin-top:16px" }, h("details", null, h("summary", { text: "Lägg till lag" }), form)));
    ritaLag();
  }

  /* ==========================================================================
     Demoläge: exempeldata i webbläsaren, samma form som servern svarar med.
     Nycklar: "demo" för ett lags admin, "super" för klubbadministratören.
     ========================================================================== */
  var demo = null;
  function demoState() {
    if (demo) return demo;
    var lag = {}, ordrar = {};
    var namn = ["Alva", "Bo", "Cleo", "Dante", "Elsa", "Folke", "Greta", "Hugo"];
    (window.DEMO_LAG || []).forEach(function (l, li) {
      // Exempellagen är redan ifyllda i lag.js så som servern skulle svara. Pågående, kommande och avslutade lag får ett exempelnummer
      // (utkast saknar det med flit, för att visa kontrollen). Utlämningslänken finns färdig för F2017 så att den går att prova.
      var egen = JSON.parse(JSON.stringify(l));
      if (!egen.swish.nummer && ["pagar", "snart", "avslutad"].indexOf(egen.status) >= 0) egen.swish.nummer = K.standard.demoSwish;
      egen.harUtlamningslank = egen.slug === "f2017";
      lag[l.slug] = egen;
      ordrar[l.slug] = l.status === "pagar" ? namn.slice(0, 6 + li).map(function (n, i) {
        return { id: String(i + 1).padStart(4, "0"), tid: new Date(Date.now() - (9 - i) * 3600e3 * (li + 1)).toISOString(), barn: n,
          mobil: "07000000" + String(10 + i), antal: 5 + ((i * 3) % 11), belopp: 0, betald: i % 3 === 0 ? "JA" : i % 5 === 4 ? "AVBRUTEN" : "",
          hamtad: i === 3 ? "JA" : "" };
      }) : [];
      ordrar[l.slug].forEach(function (o) { o.belopp = o.antal * lag[l.slug].pris; });
    });
    demo = { lag: lag, ordrar: ordrar };
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
    if (!(l.minimum > 0) || !(l.mal > 0)) m.push("Minimum och mål");
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
    ["pris", "inkopspris", "minimum", "mal", "maxAntal", "kartong"].forEach(function (k) { if (f[k] !== undefined && f[k] !== "") l[k] = Number(String(f[k]).replace(",", ".")); });
    l.titel = l.kampanj || l.produkt.namn;
  }
  // En försäljning som är godkänd eller öppen måste ha allt föräldrarna behöver
  function demoKanInteOppnas(l, status) {
    if (status !== "snart" && status !== "pagar") return null;
    var m = demoSaknas(l);
    return m ? "Försäljningen kan inte vara " + (status === "pagar" ? "öppen" : "godkänd") + " än. " + m : null;
  }
  // Det den som delar ut ser: namn och antal, aldrig mobilnummer eller belopp
  function demoUtlamning(p, s, lag, klon) {
    var ordrar = s.ordrar[lag.slug];
    var ut = function (o) { return { id: o.id, barn: o.barn, antal: o.antal, betald: o.betald === "JA", hamtad: o.hamtad === "JA" }; };
    var samman = function () {
      var hm = 0, kv = 0;
      ordrar.forEach(function (o) { if (o.betald === "AVBRUTEN") return; if (o.hamtad === "JA") hm += o.antal; else kv += o.antal; });
      return { hamtat: hm, kvar: kv };
    };
    var info = { slug: lag.slug, namn: lag.namn, titel: lag.titel, status: lag.status, produkt: klon(lag.produkt) };
    if (p.op === "oversikt") return { ok: true, lag: info, sammanfattning: samman() };
    if (p.op === "lista") return { ok: true, lag: info, ordrar: ordrar.filter(function (o) { return o.betald !== "AVBRUTEN"; }).map(ut) };
    if (p.op === "hamtad") {
      var o = ordrar.filter(function (x) { return parseInt(x.id, 10) === parseInt(p.id, 10); })[0];
      var v = String(p.varde || "").toUpperCase();
      if (!o) return { ok: false, fel: "Hittar ingen order " + p.id + "." };
      if (["JA", ""].indexOf(v) < 0) return { ok: false, fel: "Felaktigt värde." };
      if (v === "JA" && o.betald === "AVBRUTEN") return { ok: false, fel: "Beställningen är avbruten och kan inte hämtas." };
      o.hamtad = v;
      return { ok: true, order: ut(o), sammanfattning: samman() };
    }
    return { ok: false, fel: "Den här länken får bara bocka av utlämningen." };
  }
  function demoApi(p) {
    var s = demoState(), lag = p.lag !== "*" ? s.lag[p.lag] : null;
    var arSuper = p.key === "super", arUtl = p.key === "utlamning" && !!lag && !!lag.harUtlamningslank;
    if (!(arSuper || (p.key === "demo" && lag) || arUtl)) return { ok: false, fel: "Fel lag eller nyckel." };
    var roll = arSuper ? "super" : arUtl ? "utlamning" : "lag";
    var klon = function (x) { return JSON.parse(JSON.stringify(x)); };
    if (arUtl) { var ur = demoUtlamning(p, s, lag, klon); ur.roll = roll; return ur; }
    var svar;
    switch (p.op) {
      case "oversikt": svar = lag ? { ok: true, lag: klon(lag), oversikt: demoOversikt(lag, s.ordrar[lag.slug]) } : { ok: false, fel: "Okänt lag." }; break;
      case "lista": svar = lag ? { ok: true, lag: klon(lag), ordrar: klon(s.ordrar[lag.slug]).reverse() } : { ok: false, fel: "Okänt lag." }; break;
      case "lagSpara":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        if (!arSuper && lag.status !== "utkast") { svar = { ok: false, fel: "Försäljningen är låst medan klubben granskar eller efter godkännandet. Be klubbens administratör ändra." }; break; }
        var fs = klon(p.falt || {});
        delete fs.status; delete fs.namn;   // laget kan inte ändra status eller namn
        demoApplicera(lag, fs);
        svar = { ok: true, lag: klon(lag) }; break;
      case "nyUtlamningslank":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        lag.harUtlamningslank = true; svar = { ok: true, slug: lag.slug, key: "utlamning" }; break;
      case "stangUtlamningslank":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        lag.harUtlamningslank = false; svar = { ok: true, lag: klon(lag) }; break;
      case "skickaGodkannande":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        if (lag.status === "granskas") { svar = { ok: false, fel: "Försäljningen väntar redan på godkännande." }; break; }
        if (lag.status !== "utkast") { svar = { ok: false, fel: "Försäljningen är redan godkänd." }; break; }
        if (p.bekraftat !== true) { svar = { ok: false, fel: "Bekräfta de två punkterna först." }; break; }
        var sak = demoSaknas(lag);
        if (sak) { svar = { ok: false, fel: sak }; break; }
        lag.status = "granskas"; lag.kommentar = "";
        svar = { ok: true, lag: klon(lag) }; break;
      case "dragTillbaka":
        if (!lag) { svar = { ok: false, fel: "Okänt lag." }; break; }
        if (lag.status !== "granskas") { svar = { ok: false, fel: "Försäljningen väntar inte på godkännande." }; break; }
        lag.status = "utkast";
        svar = { ok: true, lag: klon(lag) }; break;
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
          if (p.op === "godkann" && ["snart", "pagar"].indexOf(p.till) < 0) { svar = { ok: false, fel: "Välj om försäljningen ska öppnas nu eller senare." }; break; }
          if (p.op === "skickaTillbaka" && !kom) { svar = { ok: false, fel: "Skriv vad som behöver ändras." }; break; }
          if (gl.status !== "granskas") { svar = { ok: false, fel: "Försäljningen väntar inte på godkännande." }; break; }
          if (p.op === "godkann") { var gs = demoSaknas(gl); if (gs) { svar = { ok: false, fel: gs }; break; } gl.status = p.till; gl.kommentar = ""; }
          else { gl.status = "utkast"; gl.kommentar = kom.slice(0, 300); }
          svar = { ok: true, lag: klon(gl) };
        } else if (p.op === "lagUppdatera") {
          var l = s.lag[p.slug]; if (!l) { svar = { ok: false, fel: "Okänt lag." }; break; }
          var f = p.falt || {};
          var efter = klon(l); demoApplicera(efter, f);
          var oppnaFel = demoKanInteOppnas(efter, efter.status);
          if (oppnaFel) { svar = { ok: false, fel: oppnaFel }; break; }
          demoApplicera(l, f);
          svar = { ok: true, lag: klon(l) };
        } else if (p.op === "lagNy") {
          var dd = p.data || {};
          if (!dd.namn) { svar = { ok: false, fel: "Skriv lagets namn (2–20 tecken)." }; break; }
          var slug = String(dd.namn).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          if (s.lag[slug]) { svar = { ok: false, fel: "Det finns redan ett lag med adressen " + slug + "." }; break; }
          var nytt = { slug: slug, namn: dd.namn, status: "utkast", kommentar: "", harUtlamningslank: false, kampanj: "", titel: "", intro: "", belonning: "", utlamningsText: "",
            produkt: { namn: "", detalj: "", enhetEn: "", enhet: "" }, swish: { nummer: "", namnPaKonto: "", meddelande: dd.namn + " försäljning" },
            pris: 0, inkopspris: 0, minimum: 0, mal: 0, maxAntal: 50, kartong: 0 };
          demoApplicera(nytt, dd);
          var nyFel = demoKanInteOppnas(nytt, nytt.status);
          if (nyFel) { svar = { ok: false, fel: nyFel }; break; }
          s.lag[slug] = nytt; s.ordrar[slug] = [];
          svar = { ok: true, slug: slug, key: "demo", lag: klon(nytt) };
        } else if (p.op === "nyNyckel") svar = s.lag[p.slug] ? { ok: true, slug: p.slug, key: "demo" } : { ok: false, fel: "Okänt lag." };
        else svar = { ok: false, fel: "Okänd åtgärd." };
    }
    svar.roll = roll;
    return svar;
  }

  /* ---------- Start ---------- */
  function start() {
    // Adminlänken har formen admin.html#lag=<slug>&k=<nyckel>. Nyckeln ligger efter # så att den inte skickas till webbservern.
    var hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("lag") && hash.get("k")) {
      var lag = hash.get("lag"), key = hash.get("k");
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      app.appendChild(h("p", { class: "loading", text: "Loggar in…" }));
      return loggaIn(lag, key, function (t) { visaLogin(t, lag); });
    }
    var sess = lasSession();
    if (sess && sess.key) {
      app.appendChild(h("p", { class: "loading", text: "Hämtar…" }));
      return loggaIn(sess.lag, sess.key, function () { visaLogin(); });
    }
    visaLogin();
  }
  start();
})();
