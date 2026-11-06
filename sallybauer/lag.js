/* ==========================================================================
   SALLY BAUERSKOLORNA: skolans inställningar (skramlat.se/sallybauer/).

   Samma sidor som klubbarna (app.js, admin.js och util.js i eskilsminne/), i skolans färger (tema.css)
   och med skolans ord: ord: "skola" byter lag mot klass, lagförälder mot klassförälder och klubben mot skolan
   i allt som visas (se ord() i eskilsminne/util.js).

   Klasserna och deras uppgifter (Swish-nummer, pris, mål, status) ligger inte här. Klassföräldrarna lägger in
   dem i adminvyn, och skolans administratör godkänner. Texterna nedan är bara reservtexter.
   ========================================================================== */

var KLUBB = {
  slug: "sallybauer",                    // skolans adress hos Skramlat. Följer med i varje anrop till servern.
  namn: "Sally Bauerskolorna",
  titel: "Klassförsäljning",
  motto: "",
  logo: "",                              // skolans logga läggs här när den finns (till exempel assets/logga.png)
  ord: "skola",                          // klass, klassförälder och skolan i stället för lag, lagförälder och klubben
  valjLagText: "Du swishar direkt till klassen, och pengarna går till klassens kassa.",
  kontakt: "Hittar du inte svaret? Hör av dig där du brukar få besked från klassen.",

  endpoint: "/api",                      // skarpt läge: sidorna pratar med Skramlats server

  standard: {
    produkt: { namn: "", detalj: "", enhet: "st", enhetEn: "st" },
    pris: 0, inkopspris: 0, minimum: 0, mal: 0,
    maxAntal: 50,
    snabbval: null,
    swish: { nummer: "", namnPaKonto: "", meddelande: "" },

    intro: "Stötta {lag} genom att beställa. Pengarna går till klassens kassa.",
    aterbetalning: "Kan vi av något skäl inte genomföra beställningen betalar vi tillbaka din Swish.",
    belonning: "",
    belonningNatt: "",
    utlamning: "Vi säger till där du brukar få besked från klassen när det är dags att hämta, och var.",

    faq: [
      { f: "Vad går pengarna till?",
        s: "Pengarna går till klassens kassa, till exempel utflykter och aktiviteter för {lag}." },
      { f: "Vad kostar det och hur betalar jag?",
        s: "{pris} per {enhetEn}. Du swishar direkt när du har beställt. Efter beställningen visas Swish-nummer, belopp och ett meddelande att skriva, så att din betalning hittas." },
      { f: "Vad händer om vi når {mal} {enhet}?", kraver: "belonning",
        s: "{belonning} Allt över {mal} är bonus till klasskassan." },
      { f: "Vad händer om det inte blir tillräckligt många beställningar?", kraverInte: "lager",
        s: "Vi lägger beställningen hos leverantören först när minst {minimum} {enhet} är beställda. Om vi inte når dit betalar vi tillbaka din Swish." },
      { f: "När och var hämtar jag min beställning?",
        s: "Vi säger till där du brukar få besked från klassen, så fort allt är på plats." },
      { f: "Kan jag ändra eller komplettera min beställning?",
        s: "Ja, gör en ny beställning eller hör av dig där du brukar få besked från klassen." },
      { f: "Vad sparar ni om mig?",
        s: "Vi sparar barnets förnamn och ditt mobilnummer, enbart för att hantera beställningen, utlämningen och betalningen. Uppgifterna delas inte vidare och raderas senast 60 dagar efter att försäljningen är avslutad. Kontakta klassen om du vill ha dem raderade tidigare." }
    ]
  }
};

var LAG_EXTRA = {};
var DEMO_LAG = [];   // skolan har inget demoläge
