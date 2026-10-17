/* Delat för Skramlats egna sidor: menyn i mobilen och räknaren. Sidorna fungerar utan det här: då syns menyn som vanligt
   och räknaren visar siffran direkt. */
(function () {
  "use strict";

  // Menyn: knappen Meny visar och döljer länkarna i mobilen
  var knapp = document.querySelector(".meny-knapp"), meny = document.getElementById("meny");
  if (knapp && meny) {
    document.documentElement.classList.add("js-meny");
    var satt = function (oppen) {
      knapp.setAttribute("aria-expanded", String(oppen));
      if (oppen) meny.setAttribute("data-oppen", ""); else meny.removeAttribute("data-oppen");
    };
    knapp.addEventListener("click", function () { satt(knapp.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && knapp.getAttribute("aria-expanded") === "true") { satt(false); knapp.focus(); } });
  }

  // Räknaren: siffran står i sidan (data-varde) och räknas upp från noll första gången den syns
  var nf = new Intl.NumberFormat("sv-SE");
  var stilla = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  Array.prototype.forEach.call(document.querySelectorAll("[data-varde]"), function (el) {
    var slut = Number(el.getAttribute("data-varde")) || 0, tal = el.querySelector(".siffra") || el;
    if (stilla || !("IntersectionObserver" in window)) return;
    tal.textContent = nf.format(0);
    var obs = new IntersectionObserver(function (poster) {
      if (!poster[0].isIntersecting) return;
      obs.disconnect();
      var start = null, tid = 1400;
      function steg(t) {
        if (start === null) start = t;
        var x = Math.min(1, (t - start) / tid), mjuk = 1 - Math.pow(1 - x, 3);
        tal.textContent = nf.format(Math.round(slut * mjuk));
        if (x < 1) requestAnimationFrame(steg);
      }
      requestAnimationFrame(steg);
    }, { threshold: 0.5 });
    obs.observe(el);
  });
})();
