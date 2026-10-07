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
  logo: "",                             // lägg filen i den här mappen, till exempel "logga.png". Fråga klubben först.
  valjLagText: "Välj ditt lag för att beställa. Pengarna går direkt till lagets egen lagkassa.",
  kontakt: "Hittar du inte svaret? Skriv i lagets WhatsApp-grupp.",

  // Adressen till klubbens Apps Script (webbappens URL, slutar på /exec). Se README, steg "Sätt upp servern".
  // Tom = demoläge: sidorna visar exempellag och exempeldata, och inget sparas eller skickas.
  endpoint: "",

  // Standardvärden för alla lag. Pris, mål med mera kommer från lagets uppgifter i adminvyn och skriver över dessa.
  standard: {
    produkt: { namn: "Marabou Klubbkaka", detalj: "Mjölkchoklad 90 g med klubbens logga", emoji: "🍫", enhet: "kakor", enhetEn: "kaka" },
    pris: 30,            // kr per styck som föräldern swishar
    inkopspris: 14.5,    // kr per styck som laget betalar leverantören
    minimum: 240,        // minst så många behövs för att beställningen ska kunna läggas
    mal: 300,            // mätarens slut. Allt över är bonus.
    maxAntal: 50,        // största antal per beställning
    snabbval: [5, 10, 15, 20],
    swish: { nummer: "", namnPaKonto: "", meddelande: "" },   // meddelande tom = "<lag> försäljning"

    intro: "Beställ klubbens chokladkaka med logga. Pengarna går till cuper, aktiviteter och annat som förgyller barnens vardag i laget. " +
           "Målet är minst 10 kakor per barn.",
    aterbetalning: "Kan vi av något skäl inte genomföra beställningen betalar vi tillbaka din Swish. Läs mer under Vanliga frågor.",
    belonning: "",       // text under mätaren innan målet är nått, till exempel en belöning vid {mal}
    belonningNatt: "",   // text när målet är nått
    utlamning: "Information om när och var kakorna delas ut kommer inom kort.",

    // Vanliga frågor. Ett lag som säljer något annat skriver över hela listan (se LAG_EXTRA).
    // kraver: "belonning" = frågan visas bara om laget har en belöning.
    faq: [
      { f: "Vad går pengarna till?",
        s: "Pengarna ska vara en grund för cuper, aktiviteter och annat som kan förgylla barnens vardag i {lag}-laget." },
      { f: "Varför just de här kakorna?",
        s: "En stor andel av priset går tillbaka till laget. Eftersom kakan har klubbens logga sprider den dessutom föreningens namn." },
      { f: "Vad kostar det och hur betalar jag?",
        s: "{pris} per kaka. Du swishar direkt när du har beställt. Efter beställningen visas Swish-nummer, belopp och ett meddelande att skriva, så att vi hittar din betalning." },
      { f: "Hur många ska vi sälja?",
        s: "Målet är minst 10 kakor per barn. Några säljer fler och några färre, men tillsammans blir det ett bra tillskott till laget. Beställ det du tror att du kan sälja, eftersom leverantören inte tar tillbaka osålda kakor. Börja gärna med familj, släkt och grannar." },
      { f: "Vad händer om vi når {mal} kakor?", kraver: "belonning",
        s: "{belonning} Allt över {mal} är bonus till lagkassan." },
      { f: "Vad händer om det inte blir tillräckligt många beställningar?",
        s: "Vi beställer från leverantören först när vi har minst {minimum} kakor beställda. Om vi inte når dit kan vi inte lägga beställningen, och då betalar vi tillbaka din Swish." },
      { f: "När och var får jag kakorna?",
        s: "Utlämning meddelas i lagets WhatsApp-grupp när kakorna är på plats." },
      { f: "Hur länge håller chokladen?",
        s: "Bäst före-datumet står på förpackningen. Sälj kakorna i god tid före det." },
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
var LAG_EXTRA = {
  p2019: {
    belonning: "Beställs {mal} kakor eller fler blir det en överraskning för barnen på sista träningen före jul.",
    belonningNatt: "Det blir en överraskning för barnen på sista träningen före jul."
  },
  // Exempel på ett lag som säljer något annat än kakor: egen produkt, egna frågor.
  p2018: {
    produkt: { namn: "Bingolott", detalj: "Vinster i lagets bingo", emoji: "🎟️", enhet: "lotter", enhetEn: "lott" },
    snabbval: [2, 5, 10],
    intro: "Köp en bingolott och stötta laget. Lottdragningen är på lagets vårfest.",
    utlamning: "Lotterna delas ut på träningen.",
    belonning: "Når vi {mal} lotter blir det extra stora vinster.",
    belonningNatt: "Det blir extra stora vinster på bingot.",
    faq: [
      { f: "Vad kostar en lott?", s: "{pris} per lott. Du swishar direkt när du har beställt." },
      { f: "När är dragningen?", s: "På lagets vårfest. Datum meddelas i lagets WhatsApp-grupp." },
      { f: "Vad händer om vi når {mal} lotter?", kraver: "belonning", s: "{belonning}" },
      { f: "Vad händer om det inte blir tillräckligt många lotter?", s: "Säljer vi färre än {minimum} lotter ställer vi in bingot och betalar tillbaka din Swish." }
    ]
  }
};

/* --------------------------------------------------------------------------
   Exempellag som visas i demoläge (när endpoint ovan är tom). Samma form som
   servern svarar med. Används bara för att visa hur sidorna ser ut.
   -------------------------------------------------------------------------- */
var DEMO_LAG = [
  { slug: "f2017", namn: "F2017", kampanj: "Chokladförsäljning", status: "pagar",
    swish: { nummer: "", namnPaKonto: "Eskilsminne IF F2017", meddelande: "" }, demoBestallt: 94 },
  { slug: "p2018", namn: "P2018", kampanj: "Bingolotter", status: "pagar",
    pris: 50, inkopspris: 20, minimum: 100, mal: 200, maxAntal: 20, kartong: 0,
    swish: { nummer: "", namnPaKonto: "Eskilsminne IF P2018", meddelande: "" }, demoBestallt: 61 },
  { slug: "f2016", namn: "F2016", kampanj: "Chokladförsäljning", status: "snart",
    swish: { nummer: "", namnPaKonto: "Eskilsminne IF F2016", meddelande: "" } }
];
