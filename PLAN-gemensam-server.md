# Plan: gemensam server för Skramlat (utan Apps Script)

Status 17 oktober 2026: tekniken (Cloudflare) och besluten längst ned är tagna. **Fas 1 är byggd och testad lokalt** på grenen `fas1-cloudflare-server` (se *Läge efter Fas 1* längst ned). **Inget är uppsatt hos Cloudflare, och ingenting är köpt.**

## Mål

En klubb går till skramlat.se, loggar in med sin e-post, skriver klubbens namn, väljer två färger, laddar upp märket och skickar in sin ansökan. När du har godkänt den är klubben igång. Inget Google-konto, inget kalkylark, ingen kod. Lagföräldrar och föräldrar märker ingen skillnad mot idag.

Pengarna går fortfarande aldrig via Skramlat.

## Vad som ändras och vad som är kvar

| Del | Idag | Efter |
|---|---|---|
| Sidorna (förälder, lagförälder, admin) | Statiska filer, en mapp per klubb | Samma sidor, **en gemensam uppsättning** för alla klubbar |
| Servern | `Server.gs` i Apps Script, ett kalkylark per klubb | En gemensam server med en databas för alla klubbar |
| Klubbens inloggning | Superadmin-nyckel | E-post med inloggningslänk (inget lösenord) |
| Lagförälderns inloggning | Personlig länk med nyckel | **Oförändrat** |
| Förälderns inloggning | Ingen | **Oförändrat** |
| Utseende | Redigera `style.css` för hand | Två färger och ett märke i adminvyn |
| Klubbens uppgifter | `lag.js` | Klubbens inställningar i adminvyn |

## Teknikval: Cloudflare

Allt hos en leverantör. DNS och e-postvidarebefordran ligger redan där.

- **En Worker med statiska filer** (Workers static assets) för både sidorna och API:t. Statiska filer är gratis och obegränsade. Bara `/api` går via koden (`run_worker_first`), allt annat serveras som filer. Sidor och API får samma adress, så ingen CORS behövs och inloggningen kan använda säkra cookies. Det valdes i stället för Pages med Pages Functions (som planen först sa) av två skäl: Workers har Cron Triggers, som behövs för raderingen efter 60 dagar (Fas 3) och som Pages Functions saknar enligt Cloudflares migreringsguide, och Cloudflare lägger sin utveckling på Workers. Priset är detsamma (Workers Paid, 5 $).
- **D1** (SQLite) som databas. **Den skapas med EU-jurisdiktion från början**, eftersom det inte går att lägga till efteråt.
- **Email Service** för inloggningslänkar. Den är i beta. Visar den sig ostabil byts den mot en annan leverantör, som då läggs till på underbiträdeslistan.
- **Turnstile** mot robotar vid ansökan om ny klubb.

Varför Cloudflare och inte Supabase: Supabase kräver Pro-nivån (25 $ i månaden) för skarp drift, eftersom gratisprojekt pausas efter en vecka utan aktivitet, och dessutom en egen e-postleverantör. Med Cloudflare blir det en leverantör, en faktura och en post på underbiträdeslistan.

### Kostnad (kontrollerad 17 oktober 2026, dollar, exkl. moms)

| Del | Gratis | Betald |
|---|---|---|
| Workers | 100 000 anrop per dag | **5 $ per månad**: 20 miljoner anrop per månad ingår, sedan 0,60 $ per miljon |
| D1 | 5 miljoner lästa och 100 000 skrivna rader per dag, 5 GB. När taket nås felar anropen tills midnatt UTC. | 25 miljarder lästa och 50 miljoner skrivna rader per månad ingår, 5 GB, sedan 0,001 $ per miljon lästa, 1 $ per miljon skrivna och 0,75 $ per GB och månad. Ingen avgift för utgående trafik. |
| Statiska filer (i Workern) | Gratis och obegränsat. | Gratis och obegränsat. |
| E-post (utgående) | – | 3 000 per månad ingår (kräver Workers Paid), sedan 0,35 $ per 1 000 |
| Turnstile | Gratis enligt vad jag vet, inte kontrollerat | – |

Skarp drift kräver betalnivån: gratisnivåns dagstak gör att anropen felar en dag med många föräldrar, och utgående e-post kräver den. Räkna med **ungefär 5 $ i månaden**. Användningen kostar nästan ingenting (min uppskattning: några hundra beställningar per klubb och säsong ryms med god marginal i allt som ingår).

## Det vi bygger själva

### Inloggning med e-postlänk (klubbens administratör)

- **Begäran:** servern svarar alltid likadant, oavsett om adressen finns, så att ingen kan ta reda på vem som är administratör.
- **Länken:** 32 slumpade byte. Bara hashen sparas. Gäller i 15 minuter och kan användas en gång. Högst 5 begäranden per timme per adress och per IP-nummer.
- **Mejlskannrar:** länken i mejlet öppnar en sida med en knapp, och först knappen (POST) använder länken. Då förbrukas den inte av en skanner som bara hämtar adressen.
- **Sessionen:** slumpad nyckel där bara hashen sparas, 30 dagar, i en cookie som är `HttpOnly`, `Secure` och `SameSite=Lax`. Utloggning raderar den i databasen.
- Alla administratörsåtgärder kontrollerar sessionen, vilken klubb personen hör till och rollen. Det är samma tankesätt som i `Server.gs`, där servern kontrollerar behörigheten och aldrig sidan.

### Beställning och lager

Idag skyddas lagret och ordernumret av ett skriptlås. D1 har enligt vad jag vet inga interaktiva transaktioner, så det blir ett villkorat SQL-anrop i en atomär körning: ordernumret räknas upp bara om lagret räcker, annars sparas ingenting.

Det ska bevisas, inte antas:
1. Tester med många parallella anrop mot lokal D1 (Miniflare).
2. Ett lasttest mot en riktig D1 (en separat testdatabas på ditt Cloudflare-konto) **innan skarp drift**. Den lokala versionen visar inte hur riktiga Cloudflare beter sig under last.

Första steget i Fas 1: kontrollera att `wrangler` och Miniflare går att köra i den här miljön.

## Datamodell

- **klubb**: adress (till exempel `eskilsminne`), namn, motto, mörk färg, ljus färg, märke, status (*väntar*, *aktiv*, *avstängd*), organisationsnummer, webbadress, tidpunkt och version för godkänt biträdesavtal, och **hur och när du verifierade klubben**.
- **klubb_admin**: koppling mellan e-postadress och klubb. Flera per klubb, så att "andra administratören" finns från start.
- **inloggningslank** och **session**: bara hashar, med giltighetstid.
- **lag**: som dagens flik *Lag*, plus klubb och nyckelns hash. Fortfarande en försäljning med en produkt per post.
- **bestallning**: som dagens flik *Beställningar*, plus beställningskoden. Unikt per lag, så att dubbletter stoppas bestående och inte bara i 15 minuter.
- **logg**: som dagens flik *Logg*.
- **sparr**: räknare för spärr på felaktiga nyckelförsök, beställningar per mobilnummer (hashat), startade försäljningar och inloggningsbegäranden.

## API: så lite som möjligt ändras

Samma åtgärder och samma svar som idag, med två tillägg:
- **klubb** (adressen) följer med i varje anrop.
- Klubbens administratörsåtgärder (`lagLista`, `godkann`, `skickaTillbaka`, `stoppa` med flera) kräver inloggning som administratör för just den klubben, i stället för superadmin-nyckeln.

Därför blir ändringarna i `app.js`, `admin.js` och `util.js` små: adressen till servern (`/api/`), klubbens adress från sökvägen, och inloggningen för klubbens administratör.

## Vem får skapa en klubb?

**Vem som helst kan ansöka. Ingen kan använda en klubb förrän du har godkänt den.** Det går inte att bevisa tekniskt att någon företräder föreningen: en inloggning med e-post visar bara att personen når en e-postadress. Beviset är din kontroll, och den ska vara en rutin.

**Varför det spelar roll.** Pengarna går till det Swish-nummer lagföräldern skriver in, och klubbens administratör godkänner försäljningen. En falsk klubbadministratör kan godkänna sin egen försäljning med sitt eget nummer, och föräldrarna betalar till en bedragare. Klubbens administratör är det som allt annat bygger på.

**Ansökan** (på `skramlat.se/kom-igang`, bakom Turnstile):
- klubbens namn, organisationsnummer och webbadress
- den sökandes namn, roll i klubben och telefonnummer
- en kryssruta: *Jag får företräda klubben och godkänna biträdesavtalet för klubbens räkning.*

**Automatiska varningar** (de flaggar, de avgör inte):
- e-postadressens domän matchar inte klubbens webbadress
- namnet liknar en befintlig klubb
- reserverade namn (`skramlat`, `admin`, `api`, `eskilsminne` före godkännande med flera) går inte att välja

**Din kontroll innan godkännande:**
1. Kontakta klubben via en uppgift från **klubbens egen webbplats eller ett offentligt register**, aldrig via uppgifterna i ansökan.
2. Be styrelsen, ordföranden eller kassören bekräfta att klubben vill använda Skramlat och vem som är administratör.
3. Spara hur och när du kontrollerade (`verifierad_hur`, `verifierad_tid`).

En godkänd klubb kan stängas av direkt: försäljningarna döljs och inga beställningar tas emot.

**Medan klubben väntar** kan klubbens administratör göra allt som bara syns för klubben själv: ändra namn, motto, färger och märke och bjuda in en andra administratör. Det enda som är låst tills du har godkänt är det som når föräldrar:
- klubben syns inte i någon offentlig lista och sidan `skramlat.se/<klubb>/` visar ingenting
- lagföräldrar kan inte starta försäljningar
- ingen kan beställa
- det uppladdade märket visas bara för klubbens administratörer

Det ger en klubb som känns som att den onboardar sig själv, och spärren finns kvar där bedrägeriet skulle ske: när något blir synligt och när pengar kan flyttas.

### Eskilsminne IF

Du har klubbens tillåtelse att använda märket (det står i `lag.js`), men att köra klubbens försäljning på Skramlat kräver mer:
- **Skriftligt ok från styrelsen** (ett mejl räcker) att Eskilsminne använder Skramlat, och vem som är klubbens administratör.
- **Klubbens administratör ska vara en person i klubben**, helst med en klubbadress, inte du. Annars godkänner du själv P2019:s försäljningar. Du är plattformens ägare, inte klubbens administratör.
- En andra administratör i klubben bjuds in från start.

## Kom igång-flödet för en klubb

1. Klubben fyller i ansökan (se ovan), godkänner **biträdesavtalet** (tidpunkt och version sparas) och bekräftar sin e-post med inloggningslänken.
2. Klubben får status *väntar* och kan **sätta upp allt direkt**: namn, motto, färger, märke och inbjudan av en andra administratör. Klubbens administratör ser sin egen sida i en förhandsvisning med en tydlig banderoll: *Väntar på godkännande*.
3. Du kontrollerar och godkänner (se *Vem får skapa en klubb?*). Klubben blir *aktiv* och får besked med e-post.
4. Lagföräldrar startar sina försäljningar som idag. Klubben godkänner som idag.

Kräver att Skramlat skickar e-post från `skramlat.se`. `hej@skramlat.se` tar idag bara emot.

## Utseende

`style.css` bygger redan på färgvariabler (`--blue`, `--yellow`, `--cream`, `--sky`, `--hard` med flera, och mörkt läge längre ned). Klubben väljer en mörk och en ljus färg. Sidan sätter variablerna när den laddas och räknar ut övriga nyanser.

- Kontrollen som redan är beslutad: en ljus färg som inte syns mot svart text (under 4,5 : 1) byts mot krämvitt. Samma kontroll görs för den mörka färgen mot krämvit text.
- Märket laddas upp som PNG, JPEG eller WebP, högst 1 MB. Inte SVG, eftersom en uppladdad SVG kan innehålla skript.
- Det blir **två färger och ett märke**, ingen temaeditor.

## Adresser

`skramlat.se/<klubb>/` ska peka på samma sidor för alla klubbar. Det löser Workern själv i Fas 2 (en adress som `/<klubb>/` serveras med den gemensamma klubbsidan, och klubbens uppgifter hämtas ur databasen), så ingen omskrivningsregel hos någon annan behövs. Eskilsminnes adress `skramlat.se/eskilsminne/` och gamla `?lag=`-länkar fortsätter fungera. I Fas 1 ligger Eskilsminnes sidor kvar i sin mapp. Sidorna och domänen flyttas från GitHub Pages i Fas 2.

## Lagring bara i EU

Kravet är att personuppgifterna (barnets förnamn, mobilnummer, administratörernas e-postadresser) **bara lagras i EU**. Så här ser det ut med Cloudflare, utifrån det jag kunde kontrollera 17 oktober 2026.

**Vad vi kan garantera**
- **Lagring i databasen.** D1 skapas med jurisdiktion `eu`. Då körs och lagras databasen bara inom EU, och läsrepliker skapas bara inom EU. En platstips är svagare och räcker inte: det ska vara jurisdiktion.

**Vad vi inte kan garantera på den här nivån**
- **Att koden körs i EU.** Workers och Pages Functions körs i något av Cloudflares datacenter runt om i världen. Det finns ingen inställning för "bara EU" för Workers. Det som är gjort för det är Regional Services och Customer Metadata Boundary, som enligt de källor jag hittade ingår i Enterprise-paketet Data Localization Suite. Uppgifterna kan vara föråldrade, och pris får Cloudflare svara på.
- **Cloudflares egna loggar.** De lagras som standard i datacenter i både USA och Europa och innehåller bland annat IP-nummer. De kan inte flyttas utan Enterprise.
- **Att inga regler om tredjeland gäller.** Cloudflare är ett amerikanskt bolag. Lagring i EU ändrar inte att behandling och åtkomst kan omfattas av reglerna om överföring till tredjeland. Det är en juridisk fråga för biträdesavtalet, inte något tekniken löser.

**Därför lovar vi bara det vi kan hålla:** *Uppgifterna lagras i EU.* Inte *Uppgifterna lämnar aldrig EU.*

**Regler som gör det sant**
1. D1 skapas med `--jurisdiction=eu`. Det kontrolleras i panelen eller via API:t innan första raden skrivs, eftersom en felskapad databas måste göras om och flyttas.
2. **Allt som sparas går till D1**: beställningar, sessioner, inloggningslänkar, spärrräknare och märken. Inget KV (som enligt vad jag vet replikeras globalt), inget cache-API för persondata, inga köer och inga Durable Objects.
3. **Inget cachas.** Alla svar från `/api/` med persondata skickas med `Cache-Control: no-store`, så att inget hamnar i Cloudflares cache runt om i världen.
4. **Inga loggar med persondata.** Workers Logs och Logpush är avstängda. Servern loggar aldrig barnets namn, mobilnummer eller e-postadresser, bara ordernummer och felkoder.
5. **E-post** innehåller bara administratörens adress och en länk, aldrig barnens uppgifter. Var Email Service lagrar meddelanden hittade jag ingen uppgift om. Det frågas Cloudflare om innan skarp drift, och kan de inte svara byts den mot en leverantör i EU.
6. **Säkerhetskopior.** Jag hittade ingen uppgift om att D1:s Time Travel stannar inom jurisdiktionen. Det frågas Cloudflare om, och policyn påstår inget förrän det är bekräftat.
7. **Riktiga uppgifter lämnar aldrig D1 till utvecklingsmiljöer.** Test, lasttest och demo använder påhittade uppgifter.
8. **Turnstile** används bara på ansökningssidan för klubbar, inte där föräldrar beställer.

**Vaktprov** (så att reglerna inte bara är en önskan)
- Ett test som kontrollerar att varje svar från `/api/` med persondata har `Cache-Control: no-store`.
- Ett test som läser serverns källkod och fallerar om den använder KV, `caches`, R2, Durable Objects eller `console.log`.
- Ett skript som frågar Cloudflares API efter databasens jurisdiktion och fallerar om den inte är `eu`. Finns inte fältet i svaret kontrolleras det för hand och dokumenteras.

**Strängare spår, om en kund kräver att även behandlingen sker i EU** (till exempel en kommun eller skola): API:t körs på en server i EU, med trafiken direkt dit och utan att passera Cloudflares nätverk. De statiska sidorna ligger kvar på Cloudflare Pages, eftersom de inte innehåller persondata. Det kostar några euro i månaden men innebär att du driftar en server (uppdateringar och säkerhetskopior). Det byggs inte nu, men eftersom API:t har ett fast format går servern att byta ut senare.

## Personuppgifter: det som flyttar till dig

Idag ligger barnets förnamn och förälderns mobilnummer i klubbens eget Google-konto. Efter bytet håller Skramlat dem åt alla klubbar. Då är klubben personuppgiftsansvarig och Skramlat personuppgiftsbiträde.

Det här måste vara klart **innan en riktig klubb använder tjänsten**:
- **Biträdesavtal** som klubben godkänner när den skapar kontot. Texten bör granskas av någon som kan, jag är inte jurist.
- **Data i EU:** se *Lagring bara i EU* ovan. Policyn ska säga exakt det vi kan hålla: lagring i EU, och att anropen går genom Cloudflares globala nätverk.
- **Underbiträden:** Cloudflare och, om Email Service byts ut, den leverantören.
- **Automatisk radering 60 dagar efter att försäljningen avslutats.** Loggen behåller bara ordernummer, antal och belopp, som idag. Försäljningar som glöms öppna ska klubbens administratör påminnas om (bestäms i Fas 3).
- **Integritetspolicy** (står redan på att-göra-listan).
- **Rutin för incidenter:** som biträde måste du kunna säga till klubbarna om något händer.
- **Säkerhetskopior** och hur länge de finns kvar (policyn ska säga det).
- **Minst två personer** med åtkomst till servern, databasen och domänen.

### Utan bolag i början

Jag är inte jurist. Det här är underlag för ett samtal med någon som är det.

- **Det går att börja som privatperson.** Ingen lag kräver ett bolag för att vara personuppgiftsbiträde. Du är då själv avtalspart och ansvarig, **utan ansvarsskydd**: ett skadeståndskrav eller en sanktionsavgift kan riktas mot dig personligen.
- **Skatt.** Så länge tjänsten är gratis och du inte tar betalt är det enkelt. När du tar betalt (Bas och Plus) är det näringsverksamhet, och då behövs minst en enskild firma (registreras hos Skatteverket, inget krav på aktiekapital, men inget ansvarsskydd). Ett aktiebolag kräver 25 000 kr i aktiekapital och begränsar i de flesta fall ansvaret.
- **Praktiskt.** Skolor och större föreningar kräver ofta ett organisationsnummer för att få godkänna en leverantör. Det gäller troligen Sally Bauerskolorna.
- **Förslag:**
  1. Pilot som privatperson, med Eskilsminne och högst en klubb till, gratis, med skriftligt biträdesavtal, så få uppgifter som möjligt (förnamn och mobilnummer, som idag) och radering efter 60 dagar.
  2. Registrera enskild firma **innan första betalande kund**, eller innan klubb nummer tre.
  3. Aktiebolag när det växer eller när en kund kräver det.
  4. Se till att Cloudflare-kontot och domänen går att flytta till ett bolag senare, och att en andra person har åtkomst.
  5. Fråga någon som kan om en ansvarsförsäkring.

## Vad som återanvänds

- **Sidorna.** `app.js` (563 rader), `admin.js` (1 115), `util.js`, `style.css` och alla texter. Demoläget behålls.
- **Reglerna.** Pris räknas på servern, namn och mobilnummer kontrolleras, spärrar, honeypot och tidsspärr, lager, dubbletter, rensning av text. All logik i `Server.gs` flyttas över.
- **Testerna.** Testerna anropar servern via `post`, `get` och `admin` i `test/harness.cjs`. Behåller den nya servern samma anrop går scenarierna att köra om mot den, med klubbens adress och administratörsinloggning som tillägg. `test/xss.webblasare.cjs` går att behålla nästan som den är. `test/mutera.cjs` ändrar texten i `Server.gs` och måste skrivas om, men idén (koppla bort ett skydd i taget) behålls. Nya tester behövs för inloggningen: länk som används två gånger, utgången länk, fel adress, spärr, och en klubbadministratör som försöker nå en annan klubb. Och för väntande klubbar: en klubb som väntar syns inte i listan, kan inte starta eller öppna en försäljning, kan inte ta emot beställningar och visar inte sitt märke offentligt, även om anropen skickas direkt till API:t.
- **Det som inte går att bevisa lokalt.** Riktig samtidighet mot en riktig D1 kräver lasttestet i Fas 1 (se ovan). Det är samma ärlighet som README har idag om riktiga Google.

## Faser

Storleken är relativ (S, M, L). Jag vill inte gissa antal dagar innan vi har provat Fas 1.

| Fas | Innehåll | Storlek |
|---|---|---|
| **1. Servern** | D1 med EU-jurisdiktion, beställning med atomärt lager, lagförälderns och klubbens åtgärder, inloggning med e-postlänk för klubbens administratör, testerna flyttade och körda, vaktproven för EU-reglerna, lasttest mot riktiga D1. Eskilsminne som första klubb. Sidorna pekar på nya servern. | L |
| **2. Kom igång** | Ansökan, din kontroll och ditt godkännande, utseende (färger och märke), fler administratörer, adresser `skramlat.se/<klubb>`, e-post från skramlat.se, flytt av sidorna och domänen till Cloudflare. | M |
| **3. Juridik och drift** | Biträdesavtal i flödet, automatisk radering efter 60 dagar, integritetspolicy, säkerhetskopior, övervakning, en andra person med åtkomst. Görs parallellt med Fas 2. | M |
| **4. Skolor** | Förening eller skola (ord per kund), samlad lista över obetalda för skolans administratör, Swish per kund (låst nummer för alla klasser). | M |

Fas 1 är byggd (se *Läge efter Fas 1*). Eskilsminne kan gå live när Fas 1 och Fas 3 är klara, och när styrelsens skriftliga ok finns. Fas 2 behövs först för klubb nummer två. Bingolotter och rutan "Kräver 18 år" är inte med: de är strukna tills vidare.

## Det här byggs inte

- Betalningar eller Swish-integration. Pengarna går aldrig via Skramlat.
- Lösenord. Klubben använder e-postlänk, lagföräldern en länk med nyckel.
- Temaeditor, plattformsadmin med eget gränssnitt eller fler lager än klubb och lag. Du godkänner klubbar i databasens egen vy.
- Flera försäljningar per grupp. Det är fortfarande en post per försäljning, som idag.
- Bingolotter och åldersgräns (struket).

## Beslut som är tagna (17 oktober 2026)

1. **Cloudflare** (Pages, Workers, D1, Email Service), inte Supabase.
2. **Ingen mellanlösning med Apps Script.** Eskilsminne blir första klubben på nya servern. Bingolotterna är struket, så det finns ingen brådska.
3. **Beställningar raderas 60 dagar efter avslutad försäljning.**
4. **Du godkänner varje ny klubb** under piloten.
5. **Avtalspart:** du som privatperson under piloten, enligt "Utan bolag i början". Enskild firma senast före första betalande kund.

## Kvar att göra eller kontrollera

- Biträdesavtalets text granskas av någon som kan.
- **Frågor till Cloudflare:** stannar D1:s Time Travel inom jurisdiktionen? Var lagrar Email Service meddelanden och hur länge? Var finns Cloudflares biträdesavtal, underbiträdeslista och överföringsmekanism för tredjeland? Pris och tillgänglighet för Regional Services, om en kund kräver att även behandlingen sker i EU.
- Att Email Service fungerar tillräckligt stabilt (beta), annars en annan leverantör.
- Styrelsens skriftliga ok och namnet på klubbens administratör i Eskilsminne.
- Att `wrangler` och Miniflare går att köra i den här miljön.

## Läge efter Fas 1 (17 oktober 2026)

**Byggt och testat lokalt** (på grenen `fas1-cloudflare-server`, inte sammanfogad med `main`):
- Schema för D1, och servern i `server/`: beställning med lagerkontroll och ordernummer i ett enda atomärt databasuttryck, lagförälderns och klubbens åtgärder (samma regler och felmeddelanden som i `Server.gs`), start av försäljning, spärrar.
- Inloggning med e-postlänk för klubbens administratör, session i cookie, kontroll av Origin, och klubbstatus (väntar, aktiv, avstängd) som gäller överallt.
- Sidorna (`eskilsminne/`) pratar med servern via `/api` och klubbens adress (`slug`), och klubbadministratören loggar in med e-post. De kör fortfarande demoläge (`endpoint` är tom), så den publicerade sidan påverkas inte.
- `wrangler.toml` (en Worker med statiska filer, D1, e-post, inga loggar), `scripts/` (bygg, ny klubb, kontroll av jurisdiktion, lasttest), och testerna: `api` (44), `inloggning` (22), `attack` (38) och `eu` (9). De körs mot en riktig D1 lokalt (Miniflare) och kostar ingenting.
- `wrangler dev` har provats lokalt: Workern svarar på `/api` med `no-store`, statiska sidor serveras, schemat och klubbskriptet fungerar, och den lokala e-postsimulatorn tog emot inloggningsmejlet.

**Det testerna hittade och som är åtgärdat:** servern godtog `antal: true` och `antal: [1]` som 1, och `id: "1; DELETE …"` som ordernummer 1 (`parseInt` läser bara början). Båda kräver nu ett riktigt tal respektive bara siffror. Apps Script-versionen hade samma slarv.

**Hos Cloudflare (17 oktober 2026):** kontot finns (gratisnivån). D1-databasen `skramlat` är skapad i panelen med **jurisdiktion EU**, kontrollerat för hand av ägaren i panelen (D1 → skramlat). Id:t ligger i `wrangler.toml`. Konsolen i panelen lade troligen inte in tabellerna, och byggets token får bara läsa D1. Därför lägger Workern in migreringarna själv vid första anropet (`server/migrera.js`), med samma bokföring som wrangler (`d1_migrations`). Workern `skramlat` är kopplad till GitHub och byggs från `main`: https://skramlat.adelborg.workers.dev. Grenen sammanfogades med `main` samma dag, på ägarens begäran.

**Provat hos riktiga Cloudflare (17 oktober 2026):** Workern publiceras automatiskt från `main` och lägger in tabellerna själv. En testklubb (`eskilsminne`, *Eskilsminne IF (test)*, ägarens adress som administratör) är inlagd via Studio i panelen. Ägaren begärde en inloggningslänk på https://skramlat.adelborg.workers.dev/eskilsminne/admin.html, fick mejlet från `inloggning@skramlat.se` och kunde logga in. Mejl till verifierade mottagare i Email Routing fungerar alltså på gratisnivån, och fältnamnen i `server/epost.js` är rätt. Testklubbens uppgifter ska tömmas innan klubben används på riktigt.

**Inte gjort, och varför:**
- **Inget är uppsatt hos Cloudflare** (ingen databas, ingen Worker, inget konto). Därför är det som bara går att visa där inte visat: att databasen verkligen fick jurisdiktion `eu` (`scripts/kontrollera-eu.js`), samtidighet mot en riktig D1 (`scripts/lasttest.js`), och att Cloudflares e-posttjänst tar emot fältnamnen i `server/epost.js` (den lokala simulatorn godtog dem, men tjänsten är i beta och fältnamnen kommer från en tredjepartsbeskrivning).
- **Mutationstestet** (`npm run test:mutera`, 43 skydd) har konfigurerats men inte körts färdigt: det tar lång tid och körs bara före lansering.
- **XSS-testet i webbläsare** (`npm run test:xss`) är portat till nya servern. Det körs en gång i slutet av arbetet.
- **Eskilsminne som första klubb** kräver ett Cloudflare-konto, klubbens skriftliga ok och en administratör i klubben. Det är inte gjort.
- **Fas 3** (biträdesavtal, radering efter 60 dagar, integritetspolicy) återstår. `wrangler.toml` har inga `[triggers]` än: vaktprovet `test/eu.test.js` förbjuder dem och måste ändras när raderingen läggs till.

## Rollerna efter genomgången med ägaren (17 oktober 2026)

Ägarens beslut: lagföräldern äger försäljningen, och klubbens administratör granskar.
- **Klubben godkänner, och då öppnar försäljningen** direkt (ingen status *öppnar snart* längre vid godkännandet). Klubben kan också skicka tillbaka med en kommentar.
- **Lagföräldern öppnar och avslutar** själv, och kan öppna en avslutad försäljning igen. Bara det klubben har godkänt kan öppnas.
- **Ändringar efter godkännandet granskas igen.** Lagföräldern väljer *Ändra uppgifter*: försäljningen stängs, blir ett utkast, och öppnar först när klubben har godkänt den på nytt. Klubben ändrar aldrig uppgifterna själv (servern avvisar det).
- **Klubben kan stoppa** en godkänd försäljning i nödfall, med en kommentar som lagföräldern ser. Den blir ett utkast och måste godkännas igen.
- **Klubben lägger inte till lag.** Under Alla lag finns länken *Starta en försäljning* som klubben delar med lagföräldrarna.
- Klubbens administratör ser fortsatt alla lags beställningar, med namn och mobilnummer, som idag.
- **Inloggningen gäller i 30 dagar**, och sidan frågar servern när den laddas, så administratören behöver en ny länk bara på en ny enhet eller efter en månad.

Testerna har attacker för det nya: lagföräldern gör klubbens jobb, klubben ändrar försäljningens uppgifter, och lagföräldern öppnar något som klubben inte har godkänt (utkast, granskas, stoppad, ändrad). `npm test`: 119 tester, alla gröna. Mutationstestet har 45 skydd (kontrollerat att alla ändringar går att göra, inte kört färdigt).

### Notiser, pengarna och utlämningen (17 oktober 2026, ägarens val)

- **Mejl till klubbens administratörer** när en försäljning väntar på godkännande (med vilka fält som ändrats sedan förra godkännandet, till exempel Swish-numret), när den är avslutad (antal, kartonger att beställa från leverantören, betalt och obetalt) och när pengarna är skickade. Det klubben godkänner sparas (`lag.godkant`), så att granskningen visar exakt vad som ändrats, med gammalt och nytt värde i klubbens vy.
- **Pengarna efter avslutad försäljning:** klubben skriver in sitt bankgiro en gång. Lagföräldern ser beloppet (allt som är betalt, räknat av servern) och bankgirot, skickar pengarna och markerar det. Klubben kvitterar. Så gick det till i P2019:s försäljning: laget tog emot all Swish, skickade pengarna till klubbens bankgiro, och klubben beställde från leverantören och fick fakturan.
- **Klubben ser beställningarna men bockar inte av** (servern avvisar det).
- **Först betald, sedan hämtad:** en obetald beställning kan inte markeras som hämtad, och en hämtad kan inte bli obetald. I utlämningen får en obetald beställning knappen *Betald nu* och sedan bocken för hämtad.
- Migreringen `0002_pengar_och_notiser.sql` lägger till kolumnerna. Workern lägger in den själv. `npm test`: 125 tester, alla gröna. Mutationstestet: 49 skydd (kontrollerat, inte kört färdigt).

### Förfrågningar från klubbar (17 oktober 2026, ägarens val)

`skramlat.se/kom-igang/` har ett formulär: klubb eller skola, förening eller skola, namn, e-post, telefon (valfritt), ungefär hur många lag och ett meddelande. Servern mejlar förfrågan till ägaren och sparar ingenting i databasen, bara en räknare mot spam med en hash av IP-numret (5 per IP-nummer och 30 totalt i timmen). Mottagaren är hemligheten `FORFRAGAN_TILL` hos Cloudflare. Förfrågan finns alltså bara i ägarens inkorg, och den som frågar får veta det på sidan. Formuläret är inte Fas 2:s ansökan, där klubben skapar sitt konto själv. Den kommer senare.

### Inriktning efter diskussion med ägaren (17 oktober 2026)

- **Ett lag eller en klass kan använda Skramlat utan klubben.** En andra förälder, till exempel lagets kassör, godkänner försäljningarna i stället för klubben, så att två personer alltid tittar. Inte byggt. Förslag på genomförande: `klubb.typ` (klubb eller lag), samma inloggning, godkännande, notiser och ändringsgranskning som för en klubb, andra ord i sidorna och mejlen ("klubben" blir till exempel "kassören"), och inget pengasteg till klubbens bankgiro. Hör ihop med *Ord per kund* inför Sally Bauerskolorna. Den som godkänner måste vara en annan person än lagföräldern, vilket bara kan kontrolleras när laget läggs upp.
- **Guiderna skrivs för lagföräldern och klassföräldern**, de som väljer vad laget ska sälja och sköter försäljningen. Inga nya guider skrivs förrän ägaren säger till.
- **Klubben eller skolan betalar** efter pilotåret: ett årspris per klubb för överblick, alla lag, egna färger och godkännande. Enskilda lag och klasser är gratis. Ingen avgift per köp och ingen provision.
- **Ett lag utan klubb lägger upp sig själv direkt**, men inget syns för föräldrarna förrän ägaren har godkänt laget (samma som för en klubb som väntar idag). Ägaren kontrollerar då att lagföräldern och den som godkänner är två olika personer.
- **När klubben senare vill vara med börjar laget om i klubben.** Lagets gamla försäljningar ligger kvar tills de raderas, och nya startas i klubben. Ingen flytt behöver byggas.
- **Prisnivå (preliminär):** ungefär 999 kr per år för Bas, med 10 försäljningar. Prissidan säger fortfarande "Kontakta oss" tills priset är bestämt.
- **Leverantörstips:** guiderna börjar neutrala, utan namn på leverantörer. Tips kan läggas till senare om lagföräldrarna efterfrågar det. Ingen provision.
