/* ==========================================================================
   KLUBBENS INSTÄLLNINGAR (se README.md i den här mappen)

   Lagen och deras uppgifter (Swish-nummer, pris, mål, status) ligger inte här.
   De läggs till och ändras i adminvyn (admin.html) och sparas i klubbens
   kalkylark via Server.gs. Den här filen innehåller bara det som är gemensamt
   för klubben och texter som skiljer för ett visst lag.

   Texterna visas som ren text (ingen HTML). {mal}, {minimum}, {pris} och {lag}
   fylls i automatiskt.

   Pengarna går alltid direkt till lagets eget Swish-nummer. Sidan tar aldrig emot
   några betalningar.
   ========================================================================== */

var KLUBB = {
  namn: "Eskilsminne IF",
  titel: "Lagförsäljning",              // platshållare, se README
  motto: "Respekt – Kamratskap – Jämlikhet",
  logo: "assets/klubbmarke.png",         // klubbmärket. Klubben har gett tillåtelse att använda det.
  valjLagText: "Du swishar direkt till laget, och pengarna går till lagets kassa.",
  kontakt: "Hittar du inte svaret? Skriv i lagets WhatsApp-grupp.",

  // Adressen till klubbens Apps Script (webbappens URL, slutar på /exec). Se README, steg "Sätt upp servern".
  // Tom = demoläge: sidorna visar exempellag och exempeldata, och inget sparas eller skickas.
  endpoint: "",

  // Standardvärden för alla lag. Produkten, priserna, målet och texterna om försäljningen skriver laget själv i adminvyn
  // (Din försäljning), så ingen produkt finns färdig här. Det som står här är bara reservtexter.
  standard: {
    produkt: { namn: "", detalj: "", enhet: "st", enhetEn: "st" },
    pris: 0, inkopspris: 0, minimum: 0, mal: 0,   // kommer från lagets uppgifter
    maxAntal: 50,        // största antal per beställning
    snabbval: null,      // knapparna under antalet. Tom = väljs efter största antal.
    swish: { nummer: "", namnPaKonto: "", meddelande: "" },   // meddelande tom = "<lag> försäljning"

    intro: "Stötta {lag} genom att beställa. Pengarna går till lagets kassa.",
    aterbetalning: "Kan vi av något skäl inte genomföra beställningen betalar vi tillbaka din Swish. Läs mer under Vanliga frågor.",
    belonning: "",       // text under mätaren innan målet är nått. Laget skriver den själv, till exempel en belöning vid {mal}.
    belonningNatt: "",   // text när målet är nått
    utlamning: "Information om när och var du hämtar kommer i lagets WhatsApp-grupp.",

    // Vanliga frågor som passar vilken produkt som helst. {lag}, {pris}, {mal}, {minimum}, {enhet} (flera), {enhetEn} (en),
    // {produkt} och {belonning} fylls i. kraver: "belonning" = frågan visas bara om laget har skrivit en belöning.
    faq: [
      { f: "Vad går pengarna till?",
        s: "Pengarna går till lagets kassa, till exempel cuper, aktiviteter och annat som förgyller barnens vardag i {lag}." },
      { f: "Vad kostar det och hur betalar jag?",
        s: "{pris} per {enhetEn}. Du swishar direkt när du har beställt. Efter beställningen visas Swish-nummer, belopp och ett meddelande att skriva, så att din betalning hittas." },
      { f: "Vad händer om vi når {mal} {enhet}?", kraver: "belonning",
        s: "{belonning} Allt över {mal} är bonus till lagkassan." },
      { f: "Vad händer om det inte blir tillräckligt många beställningar?",
        s: "Vi lägger beställningen hos leverantören först när minst {minimum} {enhet} är beställda. Om vi inte når dit betalar vi tillbaka din Swish." },
      { f: "När och var hämtar jag min beställning?",
        s: "Utlämning meddelas i lagets WhatsApp-grupp när allt är på plats." },
      { f: "Kan jag ändra eller komplettera min beställning?",
        s: "Ja, gör en ny beställning eller hör av dig i lagets WhatsApp-grupp." },
      { f: "Vad sparar ni om mig?",
        s: "Vi sparar barnets förnamn och ditt mobilnummer, enbart för att hantera beställningen, utlämningen och betalningen. Uppgifterna delas inte vidare. Kontakta laget om du vill ha dem raderade." }
    ],

    demoBestallt: 187,   // exempeldata i demoläge
    demoSwish: "123 456 78 90"
  }
};

/* --------------------------------------------------------------------------
   Texter och produkt som skiljer för ett visst lag, med lagets slug som nyckel.
   Lagets siffror (pris, mål, Swish) hanteras i adminvyn, inte här.
   -------------------------------------------------------------------------- */
var LAG_EXTRA = {};   // används bara i undantagsfall, till exempel egna vanliga frågor för ett visst lag: LAG_EXTRA.<slug> = { faq: [...] }

/* --------------------------------------------------------------------------
   Exempellag som visas i demoläge (när endpoint ovan är tom). Samma form som
   servern svarar med. Används bara för att visa hur sidorna ser ut.
   -------------------------------------------------------------------------- */
var DEMO_LAG = [
  { slug: "f2017", namn: "F2017", status: "pagar", demoBestallt: 94 },
  { slug: "p2018", namn: "P2018", status: "pagar", demoBestallt: 61,
    produkt: { namn: "Kanelbullar", detalj: "Påse med sex hembakade bullar", enhetEn: "påse", enhet: "påsar" },
    intro: "Köp en påse kanelbullar och stötta laget. Bullarna bakas av lagets föräldrar.",
    utlamningsText: "Bullarna delas ut på träningen.", belonning: "Når vi {mal} påsar åker hela laget på en gemensam fika.",
    pris: 60, inkopspris: 25, minimum: 50, mal: 120, maxAntal: 10, kartong: 0 },
  { slug: "f2016", namn: "F2016", status: "snart" },
  // Exempel på försäljningar som ännu inte är godkända. De syns inte för föräldrarna, bara i adminvyn.
  { slug: "f2015", namn: "F2015", status: "utkast" },   // helt tomt, som när klubben just har lagt till laget
  { slug: "p2016", namn: "P2016", status: "granskas",
    produkt: { namn: "Våfflor", detalj: "Färska våfflor med sylt", enhetEn: "våffla", enhet: "våfflor" },
    pris: 40, inkopspris: 18, minimum: 100, mal: 200, maxAntal: 20, kartong: 0, swish: { nummer: "123 456 78 90" } }
];

/* Fler exempellag, så att demon visar hur det ser ut när många lag säljer samtidigt: 23 som föräldrar kan välja bland. */
(function () {
  var finns = {}, i = 0;
  DEMO_LAG.forEach(function (x) { finns[x.slug] = 1; });
  [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018].forEach(function (ar) {
    ["P", "F"].forEach(function (k) {
      var slug = (k + ar).toLowerCase();
      if (finns[slug] || slug === "f2007") return;
      DEMO_LAG.push({ slug: slug, namn: k + ar, status: i % 7 === 6 ? "avslutad" : i % 5 === 4 ? "snart" : "pagar", demoBestallt: 30 + (i * 37) % 190 });
      i++;
    });
  });
})();

/* Alla exempellag fylls i så som servern skulle svara. De som inte anger något annat säljer klubbkakor, och utkastet är tomt med flit.
   Det här är bara exempeldata i demoläget: i det riktiga läget skriver laget själv in produkten. */
(function () {
  DEMO_LAG.forEach(function (l) {
    var tomt = l.status === "utkast";
    l.swish = l.swish || {};
    l.swish.nummer = l.swish.nummer || "";
    l.swish.namnPaKonto = l.swish.namnPaKonto || (tomt ? "" : "Eskilsminne IF " + l.namn);
    l.swish.meddelande = l.swish.meddelande || "";
    l.kommentar = ""; l.harUtlamningslank = false;
    if (tomt) {
      l.kampanj = ""; l.produkt = { namn: "", detalj: "", enhetEn: "", enhet: "" }; l.intro = ""; l.utlamningsText = ""; l.belonning = "";
      l.pris = 0; l.inkopspris = 0; l.minimum = 0; l.mal = 0; l.maxAntal = 50; l.kartong = 0; l.titel = "";
      return;
    }
    if (!l.produkt) { l.kampanj = "Chokladförsäljning"; l.produkt = { namn: "Klubbkaka", detalj: "Mjölkchoklad 90 g med klubbens logga", enhetEn: "kaka", enhet: "kakor" }; }
    l.kampanj = l.kampanj || "";
    if (l.pris === undefined) { l.pris = 30; l.inkopspris = 14.5; l.minimum = 240; l.mal = 300; l.maxAntal = 50; l.kartong = 24; }
    if (l.produkt.enhet === "kakor") {
      l.intro = l.intro || "Beställ klubbens chokladkaka med logga. Pengarna går till cuper och aktiviteter för laget.";
      l.belonning = l.belonning || "Når vi {mal} kakor blir det en överraskning för barnen på sista träningen.";
      l.utlamningsText = l.utlamningsText || "Information om utlämning kommer i lagets WhatsApp-grupp.";
    }
    l.intro = l.intro || ""; l.belonning = l.belonning || ""; l.utlamningsText = l.utlamningsText || "";
    l.titel = l.kampanj || l.produkt.namn;
  });
})();
