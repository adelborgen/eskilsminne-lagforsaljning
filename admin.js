/* ==========================================================================
   Adminvy för klubbens lagförsäljning.
   Lagets kassör loggar in med lagets adminnyckel och ser bara sitt eget lag:
   översikt, beställningar och betalningar. Klubbens administratör loggar in med
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
  if (K.logo) { var lg = document.getElementById("logo"); lg.src = K.logo; lg.alt = K.namn; lg.hidden = false; }
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
  function produktFor(slug) { return merge(K.standard, (window.LAG_EXTRA || {})[slug] || {}).produkt; }
  function bestallningsLank(slug) { return new URL("./?lag=" + encodeURIComponent(slug), location.href).href; }
  function visaMobil(m) { return String(m).replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4"); }
  function datum(iso) {
    var t = new Date(iso);
    return isNaN(t) ? String(iso) : t.toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  var STATUS_TEXT = { pagar: "Pågår", snart: "Startar snart", avslutad: "Avslutad" };

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
    if (DEMO) app.appendChild(h("p", { class: "notice", style: "margin-top:12px", text: "Demoläge med exempeldata, inget sparas. Prova nyckeln demo (lagets admin) eller super (klubbadministratör)." }));
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
    var slug = d.lag.slug, produkt = produktFor(slug);
    var filter = "alla", sok = "";
    setTopbar(d.lag.namn, "Admin");
    document.title = K.namn + " – Admin " + d.lag.namn;

    var oPanel = h("section", { role: "tabpanel", "aria-labelledby": "tab-o" });
    var bPanel = h("section", { role: "tabpanel", "aria-labelledby": "tab-b", hidden: "" });
    var tabO = h("button", { role: "tab", id: "tab-o", "aria-selected": "true", text: "Översikt", onclick: function () { visaFlik("o"); } });
    var tabB = h("button", { role: "tab", id: "tab-b", "aria-selected": "false", text: "Beställningar", onclick: function () { visaFlik("b"); } });
    function visaFlik(w) {
      tabO.setAttribute("aria-selected", String(w === "o")); tabB.setAttribute("aria-selected", String(w === "b"));
      oPanel.hidden = w !== "o"; bPanel.hidden = w !== "b"; window.scrollTo(0, 0);
    }

    var top = h("div", { class: "topactions" },
      S.roll === "super" ? h("button", { type: "button", class: "linkbtn", text: "← Alla lag", onclick: function () { S.valt = null; renderAdmin(); } }) : h("span"),
      h("button", { type: "button", class: "linkbtn", text: "Logga ut", onclick: loggaUt }));
    app.textContent = "";
    app.appendChild(top);
    app.appendChild(h("div", { class: "tabs", role: "tablist", "aria-label": "Admin", style: "margin-top:4px" }, tabO, tabB));
    app.appendChild(h("div", { style: "margin-top:16px" }, oPanel, bPanel));

    /* Översikt */
    function ritaOversikt() {
      var o = d.oversikt, l = d.lag, marginal = l.pris - l.inkopspris, E = produkt.enhet;
      oPanel.textContent = "";
      oPanel.appendChild(h("h2", { class: "title", text: "Översikt" }));
      oPanel.appendChild(h("div", { class: "stats", style: "margin-top:16px" },
        stat("Beställt", nf.format(o.bestallt), "av " + nf.format(l.mal) + " " + E),
        stat("Betalt", nf.format(o.betalt), kr(o.betaltKr)),
        stat("Obetalt", nf.format(o.obetalt), kr(o.obetaltKr), o.obetalt > 0),
        stat("Avbrutet", nf.format(o.avbrutna), E)));

      var lev = h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 8px", text: "Beställning hos leverantören" }),
        kv("Minimum " + nf.format(l.minimum), o.minimumNatt ? "Nått ✓" : nf.format(o.minimumKvar) + " kvar", o.minimumNatt ? "pos" : "", true));
      if (l.kartong > 0) {
        lev.appendChild(kv("Kartonger att beställa (à " + l.kartong + ")", nf.format(o.kartonger)));
        lev.appendChild(kv(E.charAt(0).toUpperCase() + E.slice(1) + " i kartongerna", nf.format(o.levereras)));
      }
      lev.appendChild(kv("Beräknad faktura", kr(o.faktura)));
      lev.appendChild(kv("Betalt minus faktura", kr(o.betaltMinusFaktura), o.betaltMinusFaktura >= 0 ? "pos" : "neg"));
      oPanel.appendChild(lev);

      var lank = bestallningsLank(slug);
      var kopBtn = h("button", { type: "button", class: "mini", text: "Kopiera" });
      kopBtn.addEventListener("click", function () { kopiera(lank, kopBtn); });
      oPanel.appendChild(h("div", { class: "card", style: "margin-top:16px" }, h("h3", { style: "margin:0 0 8px", text: "Lagets uppgifter" }),
        kv("Status", STATUS_TEXT[l.status] || l.status, "", true),
        kv("Swish", (l.swish.nummer || "saknas") + (l.swish.namnPaKonto ? " (" + l.swish.namnPaKonto + ")" : "")),
        kv("Pris / inköpspris", kr(l.pris) + " / " + kr(l.inkopspris)),
        kv("Till lagkassan per " + (produkt.enhetEn || "styck"), kr(marginal)),
        h("div", { class: "keybox" }, h("code", { text: lank }), kopBtn),
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
      var s = orderStatus(o);
      var row = h("div", { class: "btnrow" }), err = h("p", { class: "error", role: "alert" });
      function knapp(text, varde, cls) {
        var b = h("button", { type: "button", class: "mini " + (cls || ""), text: text });
        b.addEventListener("click", function () { satt(o, varde, row, err); });
        return b;
      }
      if (s === "obetald") { row.appendChild(knapp("✅ Betald", "JA", "go")); row.appendChild(knapp("Avbruten", "AVBRUTEN")); }
      else row.appendChild(knapp("Ångra", ""));
      row.appendChild(h("a", { class: "mini", href: "tel:" + o.mobil, text: "Ring" }));
      if (s === "obetald") row.appendChild(h("a", { class: "mini", href: smsLank(o), text: "SMS-påminnelse" }));
      return h("div", { class: "ordercard", role: "listitem" },
        h("div", { class: "o-head" }, h("span", { class: "o-name", text: "#" + o.id + " " + o.barn }),
          h("span", { class: "o-sum num", text: o.antal + " st · " + kr(o.belopp) })),
        h("div", { class: "o-sub num", text: visaMobil(o.mobil) + " · " + datum(o.tid) }),
        h("div", { style: "margin-top:8px" }, h("span", { class: "badge " + (s === "betald" ? "live" : s === "obetald" ? "unpaid" : ""),
          text: s === "betald" ? "Betald" : s === "obetald" ? "Obetald" : "Avbruten" })),
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
      anropa("satt", { id: o.id, varde: varde }, slug).then(function (r) {
        if (!r.ok) { knappar.forEach(function (b) { b.disabled = false; }); err.textContent = r.fel || "Det gick inte att spara."; return; }
        d.ordrar = d.ordrar.map(function (x) { return x.id === r.order.id ? r.order : x; });
        d.oversikt = r.oversikt;
        ritaOversikt(); ritaLista();
      });
    }

    ritaOversikt(); ritaLista();
  }

  function csvCell(v) {
    var s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;   // så att kalkylprogram inte tolkar innehållet som formel
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exporteraCsv(d) {
    var rader = [["Order-ID", "Tid", "Barn", "Mobil", "Antal", "Belopp", "Betald"]].concat(d.ordrar.slice().reverse().map(function (o) {
      return [o.id, o.tid, o.barn, o.mobil, o.antal, o.belopp, o.betald === "JA" ? "JA" : o.betald === "AVBRUTEN" ? "AVBRUTEN" : "NEJ"];
    }));
    var csv = "﻿" + rader.map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n");
    var a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: d.lag.slug + "-bestallningar.csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- Klubbadministratörens vy: alla lag, lägg till lag ---------- */
  var uid = 0;
  var FALT = [   // [nyckel, etikett, hjälptext, typ, grupp]
    ["kampanj", "Vad säljer ni?", "Visas på lagets kort i listan.", "text"],
    ["swishNummer", "Swish-nummer", "Numret som pengarna ska till. Lagets eget, privat eller Swish Handel, tio siffror.", "tel"],
    ["mottagare", "Mottagarens namn i Swish", "Så att föräldern känner igen namnet i Swish.", "text"],
    ["meddelande", "Meddelande i Swish", "Förifylls för föräldern, följt av ordernumret. Tomt = lagets namn + försäljning.", "text"],
    ["pris", "Pris (kr)", "", "number", 1], ["inkopspris", "Inköpspris (kr)", "", "number", 1],
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
      var inp = h("input", { type: f[3] === "tel" ? "tel" : "text", autocomplete: "off" });
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
    var nyckelPlats = h("div"), listEl = h("div"), fel = h("p", { class: "error", role: "alert" });
    app.textContent = "";
    app.appendChild(h("div", { class: "topactions" }, h("h2", { class: "title", text: "Alla lag" }),
      h("button", { type: "button", class: "linkbtn", text: "Logga ut", onclick: loggaUt })));
    app.appendChild(nyckelPlats);
    app.appendChild(h("div", { style: "margin-top:16px" }, fel, listEl));
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
        h("p", { style: "margin:0", text: "Nyckeln visas bara nu. Skicka adminlänken till lagets kassör på ett säkert sätt, inte i en öppen grupp." }),
        rad("Adminlänk (loggar in direkt)", lank), rad("Adminnyckel", key), rad("Beställningssida för föräldrar", bestallningsLank(slug)),
        h("ol", { class: "steps small" },
          h("li", { text: "Skicka adminlänken till lagets kassör." }),
          h("li", { text: "Sätt status till Pågår när laget ska öppna." }),
          h("li", { text: "Gör en testbeställning på beställningssidan och markera den som avbruten." })),
        h("button", { type: "button", class: "ghost", style: "margin-top:12px", text: "Stäng", onclick: function () { nyckelPlats.textContent = ""; } })));
      nyckelPlats.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function lagKort(l) {
      var sel = h("select", { "aria-label": "Status för " + l.namn });
      Object.keys(STATUS_TEXT).forEach(function (k) { sel.appendChild(h("option", { value: k, text: STATUS_TEXT[k] })); });
      sel.value = l.status;
      sel.addEventListener("change", function () {
        fel.textContent = "";
        anropa("lagUppdatera", { slug: l.slug, falt: { status: sel.value } }).then(function (r) { if (!r.ok) fel.textContent = r.fel; ladda(); });
      });
      var ov = l.oversikt;
      var andra = h("details", { style: "margin-top:12px" }, h("summary", { text: "Ändra uppgifter" }));
      var fb = faltBlock({ kampanj: l.kampanj, swishNummer: l.swish.nummer, mottagare: l.swish.namnPaKonto, meddelande: l.swish.meddelande, pris: l.pris, inkopspris: l.inkopspris,
        minimum: l.minimum, mal: l.mal, maxAntal: l.maxAntal, kartong: l.kartong }, false);
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
      return h("div", { class: "card teamadmin" },
        h("div", { class: "o-head" }, h("span", { class: "o-name", text: l.namn + " · " + (l.kampanj || "") }), h("span", { class: "badge", text: STATUS_TEXT[l.status] || l.status })),
        h("div", { class: "o-sub num", text: "Beställt " + nf.format(ov.bestallt) + " av " + nf.format(l.mal) + " · Betalt " + nf.format(ov.betalt) + " · Obetalt " + nf.format(ov.obetalt) }),
        h("div", { class: "field", style: "margin-top:12px" }, sel),
        h("div", { class: "btnrow" },
          h("button", { type: "button", class: "mini go", text: "Öppna admin", onclick: function () { S.valt = l.slug; renderAdmin(); } }),
          h("button", { type: "button", class: "mini", text: "Ny nyckel", onclick: function () { bekrafta.hidden = false; } })),
        bekrafta,
        andra);
    }

    function ritaLag() {
      listEl.textContent = "";
      if (!lista.length) listEl.appendChild(h("p", { class: "notice", text: "Inga lag är tillagda ännu. Lägg till det första nedan." }));
      lista.forEach(function (l) { listEl.appendChild(lagKort(l)); });
    }

    /* Lägg till lag */
    var kryss = [
      "Klubben eller lagets ansvariga har bekräftat att laget finns och att den som ber om det får sälja i lagets namn.",
      "Swish-numret är det laget har bestämt ska ta emot pengarna (privat nummer eller Swish Handel), och den som äger numret vet om det.",
      "Lagets kassör har fått veta att adminlänken är personlig och bara ska delas med dem som hanterar betalningarna, och att föräldrars uppgifter ska hanteras enligt klubbens regler."
    ];
    var kryssEl = [], lista2 = h("ul", { class: "checklist" });
    kryss.forEach(function (t) {
      var id = "k" + (++uid), cb = h("input", { type: "checkbox", id: id });
      cb.addEventListener("change", uppdateraKnapp);
      kryssEl.push(cb);
      lista2.appendChild(h("li", null, h("label", { class: "check", for: id }, cb, h("span", { text: t }))));
    });
    var std = K.standard;
    var nytt = faltBlock({ kampanj: "Chokladförsäljning", pris: std.pris, inkopspris: std.inkopspris, minimum: std.minimum, mal: std.mal, maxAntal: std.maxAntal, kartong: 24 }, true);
    var statusSel = h("select", { id: "nstatus" });
    Object.keys(STATUS_TEXT).forEach(function (k) { statusSel.appendChild(h("option", { value: k, text: STATUS_TEXT[k] })); });
    statusSel.value = "snart";
    var laggTillBtn = h("button", { type: "submit", class: "primary", style: "margin-top:16px", text: "Lägg till laget", disabled: "" });
    var nFel = h("p", { class: "formerror", role: "alert", hidden: "" });
    function uppdateraKnapp() { laggTillBtn.disabled = !kryssEl.every(function (c) { return c.checked; }); }
    var form = h("form", { novalidate: "", style: "padding-top:12px" }, h("p", { class: "small", style: "margin:0", text: "Kontrollera innan du lägger till:" }), lista2,
      h("div", { style: "margin-top:16px" }, nFel, nytt.el,
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
      // Bara de värden som exempellaget faktiskt anger skriver över standardvärdena (undefined får inte göra det).
      var egna = { slug: l.slug, namn: l.namn, kampanj: l.kampanj, status: l.status, swish: l.swish };
      ["pris", "inkopspris", "minimum", "mal", "maxAntal", "kartong"].forEach(function (k) { if (l[k] !== undefined) egna[k] = l[k]; });
      lag[l.slug] = merge({ pris: K.standard.pris, inkopspris: K.standard.inkopspris, minimum: K.standard.minimum, mal: K.standard.mal,
        maxAntal: K.standard.maxAntal, kartong: 24 }, egna);
      ordrar[l.slug] = l.status === "pagar" ? namn.slice(0, 6 + li).map(function (n, i) {
        return { id: String(i + 1).padStart(4, "0"), tid: new Date(Date.now() - (9 - i) * 3600e3 * (li + 1)).toISOString(), barn: n,
          mobil: "07000000" + String(10 + i), antal: 5 + ((i * 3) % 11), belopp: 0, betald: i % 3 === 0 ? "JA" : i % 5 === 4 ? "AVBRUTEN" : "" };
      }) : [];
      ordrar[l.slug].forEach(function (o) { o.belopp = o.antal * lag[l.slug].pris; });
    });
    demo = { lag: lag, ordrar: ordrar };
    return demo;
  }
  function demoOversikt(l, ordrar) {
    var o = { bestallt: 0, betalt: 0, betaltKr: 0, obetalt: 0, obetaltKr: 0, avbrutna: 0 };
    ordrar.forEach(function (x) {
      if (x.betald === "AVBRUTEN") { o.avbrutna += x.antal; return; }
      o.bestallt += x.antal;
      if (x.betald === "JA") { o.betalt += x.antal; o.betaltKr += x.belopp; } else { o.obetalt += x.antal; o.obetaltKr += x.belopp; }
    });
    o.minimumNatt = o.bestallt >= l.minimum; o.minimumKvar = Math.max(0, l.minimum - o.bestallt);
    o.kartonger = l.kartong > 0 ? Math.ceil(o.bestallt / l.kartong) : 0;
    o.levereras = l.kartong > 0 ? o.kartonger * l.kartong : o.bestallt;
    o.faktura = Math.round(o.levereras * l.inkopspris * 100) / 100;
    o.betaltMinusFaktura = Math.round((o.betaltKr - o.faktura) * 100) / 100;
    return o;
  }
  function demoApi(p) {
    var s = demoState(), lag = p.lag !== "*" ? s.lag[p.lag] : null;
    var arSuper = p.key === "super";
    if (!(arSuper || (p.key === "demo" && lag))) return { ok: false, fel: "Fel lag eller nyckel." };
    var roll = arSuper ? "super" : "lag";
    var klon = function (x) { return JSON.parse(JSON.stringify(x)); };
    var svar;
    switch (p.op) {
      case "oversikt": svar = lag ? { ok: true, lag: klon(lag), oversikt: demoOversikt(lag, s.ordrar[lag.slug]) } : { ok: false, fel: "Okänt lag." }; break;
      case "lista": svar = lag ? { ok: true, lag: klon(lag), ordrar: klon(s.ordrar[lag.slug]).reverse() } : { ok: false, fel: "Okänt lag." }; break;
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
          ut.oversikt = { bestallt: ov.bestallt, betalt: ov.betalt, betaltKr: ov.betaltKr, obetalt: ov.obetalt }; return ut; }) };
        else if (p.op === "lagUppdatera") {
          var l = s.lag[p.slug]; if (!l) { svar = { ok: false, fel: "Okänt lag." }; break; }
          var f = p.falt || {};
          ["kampanj", "status", "mottagare", "meddelande"].forEach(function (k) { if (f[k] !== undefined) { if (k === "mottagare") l.swish.namnPaKonto = f[k]; else if (k === "meddelande") l.swish.meddelande = f[k]; else l[k] = f[k]; } });
          if (f.swishNummer !== undefined) l.swish.nummer = f.swishNummer;
          ["pris", "inkopspris", "minimum", "mal", "maxAntal", "kartong"].forEach(function (k) { if (f[k] !== undefined && f[k] !== "") l[k] = Number(f[k]); });
          svar = { ok: true, lag: klon(l) };
        } else if (p.op === "lagNy") {
          var dd = p.data || {};
          if (!dd.namn) { svar = { ok: false, fel: "Skriv lagets namn (2–20 tecken)." }; break; }
          var slug = String(dd.namn).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          if (s.lag[slug]) { svar = { ok: false, fel: "Det finns redan ett lag med adressen " + slug + "." }; break; }
          s.lag[slug] = { slug: slug, namn: dd.namn, kampanj: dd.kampanj || "Lagförsäljning", status: dd.status || "snart",
            swish: { nummer: dd.swishNummer || "", namnPaKonto: dd.mottagare || "", meddelande: dd.meddelande || dd.namn + " försäljning" },
            pris: Number(dd.pris), inkopspris: Number(dd.inkopspris), minimum: Number(dd.minimum), mal: Number(dd.mal), maxAntal: Number(dd.maxAntal) || 50, kartong: Number(dd.kartong) || 0 };
          s.ordrar[slug] = [];
          svar = { ok: true, slug: slug, key: "demo", lag: klon(s.lag[slug]) };
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
