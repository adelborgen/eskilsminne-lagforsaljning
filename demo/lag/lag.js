/* ==========================================================================
   DEMOKLUBBEN: inställningarna för demosidan (skramlat.se/demo/).

   Samma sidor som en riktig klubb (app.js och admin.js i eskilsminne/), i Skramlats
   färger (tema.css) och alltid i demoläge: ett påhittat lag med påhittade beställningar.
   Ingen inloggning, inget skickas och inget sparas. En beställning som görs på förälderns
   sida syns i lagförälderns vy i samma flik, och försvinner när fliken stängs.
   ========================================================================== */

var KLUBB = {
  slug: "demo",
  namn: "Demoklubben",
  titel: "Lagförsäljning",
  motto: "Ett påhittat lag. Inget skickas och inget sparas.",
  logo: "../../logga/skramlat-ikon-mork.svg",
  visning: true,   // demosidan: lagförälderns vy öppnas utan inloggning, och ingen länk till inloggningen visas
  valjLagText: "Du swishar direkt till laget, och pengarna går till lagets kassa.",
  kontakt: "Det här är en demo. Har du frågor om Skramlat? Skriv till hej@skramlat.se.",
  endpoint: "",    // alltid demoläge

  standard: {
    produkt: { namn: "", detalj: "", enhet: "st", enhetEn: "st" },
    pris: 0, inkopspris: 0, minimum: 0, mal: 0,
    maxAntal: 50,
    snabbval: null,
    swish: { nummer: "", namnPaKonto: "", meddelande: "" },

    intro: "Stötta {lag} genom att beställa. Pengarna går till lagets kassa.",
    aterbetalning: "Kan vi av något skäl inte genomföra beställningen betalar vi tillbaka din Swish.",
    belonning: "",
    belonningNatt: "",
    utlamning: "Vi säger till där du brukar få besked från laget när det är dags att hämta, och var.",

    faq: [
      { f: "Vad går pengarna till?",
        s: "Pengarna går till lagets kassa, till exempel cuper och aktiviteter för {lag}." },
      { f: "Vad kostar det och hur betalar jag?",
        s: "{pris} per {enhetEn}. Du swishar direkt när du har beställt. Efter beställningen visas Swish-nummer, belopp och ett meddelande att skriva, så att din betalning hittas." },
      { f: "Vad händer om vi når {mal} {enhet}?", kraver: "belonning",
        s: "{belonning} Allt över {mal} är bonus till lagkassan." },
      { f: "Vad händer om det inte blir tillräckligt många beställningar?", kraverInte: "lager",
        s: "Laget beställer från leverantören först när minst {minimum} {enhet} är beställda. Annars betalar laget tillbaka din Swish." },
      { f: "När och var hämtar jag min beställning?",
        s: "Laget säger till där du brukar få besked, så fort allt är på plats." },
      { f: "Vad sparar ni om mig?",
        s: "Barnets förnamn och ditt mobilnummer, bara för att hantera beställningen, betalningen och utlämningen. I den här demon sparas ingenting." }
    ],

    demoBestallt: 0,
    demoSwish: "123 456 78 90"
  }
};

var LAG_EXTRA = {};

/* --------------------------------------------------------------------------
   Exempellaget, i samma form som servern svarar med. demoOrdrar är lagets påhittade beställningar
   som lagföräldern ser: några betalda, några hämtade, en avbruten och några som väntar på betalning.
   -------------------------------------------------------------------------- */
var DEMO_LAG = [
  { slug: "p2015", namn: "P2015", status: "pagar", kampanj: "", kommentar: "",
    produkt: { namn: "Kanelbullar", detalj: "Påse med sex hembakade bullar", enhetEn: "påse", enhet: "påsar" },
    intro: "Köp en påse kanelbullar och stötta laget. Bullarna bakas av lagets föräldrar, och pengarna går till vårens cup.",
    utlamningsText: "Bullarna delas ut i klubbstugan efter träningen.",
    belonning: "Når vi {mal} påsar bjuder laget på fika efter sista träningen.",
    pris: 60, inkopspris: 20, minimum: 40, mal: 60, lager: 0, maxAntal: 10, kartong: 0,
    swish: { nummer: "123 456 78 90", namnPaKonto: "Demoklubben P2015", meddelande: "" },
    demoOrdrar: [
      ["Alva", 3, "JA", "JA"], ["Bo", 2, "JA", ""], ["Cleo", 4, "JA", ""], ["Dante", 2, "", ""], ["Elsa", 1, "AVBRUTEN", ""],
      ["Folke", 5, "JA", "JA"], ["Greta", 3, "", ""], ["Hugo", 2, "JA", ""], ["Ines", 4, "", ""], ["Jonte", 6, "JA", ""]
    ].map(function (r, i) {
      return { id: String(i + 1).padStart(4, "0"), tid: new Date(Date.now() - (10 - i) * 5 * 3600e3).toISOString(), barn: r[0],
        mobil: "07000000" + String(10 + i), antal: r[1], belopp: 0, betald: r[2], hamtad: r[3] };
    })
  }
];

(function () {
  DEMO_LAG.forEach(function (l) {
    l.titel = l.kampanj || l.produkt.namn;
    // Antal beställda i mätaren på förälderns sida: samma som lagförälderns exempelbeställningar (avbrutna räknas inte)
    l.demoBestallt = l.demoOrdrar.reduce(function (n, o) { return n + (o.betald === "AVBRUTEN" ? 0 : o.antal); }, 0);
  });
})();
