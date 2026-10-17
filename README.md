# Skramlat: lagförsäljning för föreningar och skolor (prototyp)

Föräldern väljer lag i en lista och beställer, och swishar direkt till lagets nummer. Lagföräldern sätter upp försäljningen, och klubben godkänner den innan något säljs. Sedan följer lagföräldern upp beställningar, betalningar och utlämning i en adminvy. Klubbens administratör godkänner försäljningarna.

**Status (17 oktober 2026):** servern på Cloudflare är byggd och testad lokalt (Fas 1 i [PLAN-gemensam-server.md](PLAN-gemensam-server.md)). **Inget är uppsatt hos Cloudflare än**: sidorna kör demoläge, och ingen databas eller server är köpt. Den gamla Apps Script-servern (`Server.gs`) finns kvar tills Eskilsminne har flyttat, men används inte längre och tas bort efter flytten.

Repot är fristående från P2019-sidan ([adelborgen/eskilsminne-p2019](https://github.com/adelborgen/eskilsminne-p2019)), som inte påverkas.

## Principen

- **Pengarna går direkt till lagets Swish-nummer.** Systemet tar aldrig emot, håller eller flyttar pengar. Lagets eget nummer, ett privat eller ett Swish Handel-nummer: det bestämmer laget.
- **En gemensam server för alla klubbar** (Cloudflare Worker och databasen D1). Klubbens administratör och lagföräldrar använder adminvyn, inte databasen.
- **Priset räknas alltid på servern.** Sidan skickar bara antal.
- **Allt som sparas om personer ligger i D1 med EU-jurisdiktion**, och ingen annanstans (se *Lagring i EU*).

## Tre roller

| Roll | Gör | Loggar in med |
|---|---|---|
| Förälder | Väljer lag och beställer, swishar till lagets nummer | Inget |
| Lagförälder | Startar försäljningen själv (eller får en länk av klubben), fyller i den (vad som säljs, priser, Swish-nummer, mål) och skickar den till klubben för godkännande. När den är godkänd: avslutar och öppnar den igen, och väljer *Ändra uppgifter* för att ändra (då stängs den och granskas igen). Ser översikt och beställningar för sitt lag, markerar betald/avbruten och sedan hämtad (en obetald beställning markeras som betald först, även i utlämningen), tar bort obetalda beställningar, skriver ut en utlämningslista, ringer eller skickar SMS-påminnelse, exporterar CSV. När försäljningen är avslutad: skickar allt som är betalt till klubbens bankgiro och markerar det | Lagets adminnyckel (via en personlig länk) |
| Klubbens administratör | Godkänner (då öppnar försäljningen) eller skickar tillbaka med en kommentar, stoppar en godkänd försäljning i nödfall, tar bort felaktiga eller dubbla utkast, byter lagets nyckel, skriver in klubbens bankgiro och kvitterar lagens pengar, ser alla lag och deras beställningar (men bockar inte av). Får mejl när en försäljning väntar på godkännande (med vilka fält som ändrats sedan förra godkännandet), när den är avslutad och när pengarna är skickade. Ändrar aldrig försäljningens uppgifter och lägger inte till lag: lagföräldrarna startar själva via en länk som klubben delar | E-post: en länk som gäller i 15 minuter och kan användas en gång. Sidan minns inloggningen i 30 dagar |

## Filer

| Fil eller mapp | Innehåll |
|---|---|
| `index.html`, `pris/`, `guider/` | Skramlats framsida, prissida och guider. |
| `eskilsminne/` | Eskilsminnes sidor: `index.html` + `app.js` (laglista och beställning, `?lag=p2019` visar ett lag), `admin.html` + `admin.js` (adminvyn), `lag.js` (klubbens namn, texter och `slug`/`endpoint`), `util.js`, `style.css`, `assets/`. |
| `server/` | Servern. `worker.js` (ingången), `api.js` (adresser), `ops.js` (adminvyn), `bestall.js` (beställning och start), `auth.js` (nycklar, inloggning, session), `data.js` (databasen), `regler.js` (kontroller och uträkningar), `krypto.js`, `epost.js`. |
| `migrations/` | Databasens schema (D1). |
| `wrangler.toml` | Cloudflare-konfigurationen. Bara databasen, de statiska filerna, e-posten och två inställningar: ingen annan lagring, inga loggar. |
| `scripts/` | `bygg.js` (samlar de publika filerna i `dist/`), `ny-klubb.js` (lägger in en klubb och dess administratör), `kontrollera-eu.js` (kontrollerar jurisdiktionen), `lasttest.js` (lasttest mot en riktig testdatabas). |
| `test/` | Tester av servern. Se längst ned. |
| `fonts/`, `logga/`, `material/` | Typsnitt (Archivo och Atkinson Hyperlegible Next, självhostade), logga och marknadsmaterial. |
| `Server.gs` | **Gammal**: Apps Script-servern. Används inte längre. |

## Prova utan att sätta upp något (demoläge)

Så länge `endpoint` i `eskilsminne/lag.js` är tom visar sidorna exempellag och exempeldata, och inget sparas eller skickas. Kör `python3 -m http.server` i repots rot och gå till `http://localhost:8000/eskilsminne/` (adminvyn på `…/eskilsminne/admin.html`).

I adminvyn i demoläge är nyckeln `demo` för ett lags admin. Klubbadministratör: skriv valfri e-postadress under *Klubbens administratör* och välj *Logga in direkt (demo)*. *Starta en försäljning* fungerar också i demon. Förälderns sida och adminsidan har varsitt demotillstånd som nollställs när sidan laddas om.

## Kör servern lokalt (kostar ingenting)

```
npm install
node scripts/ny-klubb.js --slug eskilsminne --namn "Eskilsminne IF" --epost du@example.se > ny-klubb.sql
npx wrangler d1 execute skramlat --local --file ny-klubb.sql            # första klubben och dess administratör
npm run dev -- --var SIDA_ORIGIN:http://localhost:8787                  # bygger och startar Worker, sidor och lokal D1 (tabellerna läggs in vid första anropet)
```

Sätt `endpoint: "/api"` i `eskilsminne/lag.js` för att sidorna ska prata med servern (ändra tillbaka till `""` innan du publicerar på GitHub Pages: servern finns bara på Cloudflare). Inloggningsmejlet skickas inte på riktigt lokalt: det skrivs som en fil under `.wrangler/tmp/email/` och loggas i terminalen, och länken i det är den du öppnar.

## Sätt upp Cloudflare (en gång)

Görs av den som driver Skramlat. Kräver ett Cloudflare-konto med **Workers Paid** (5 $ i månaden): gratisnivån har dagstak som gör att anropen felar en dag med många föräldrar, och utgående e-post kräver betalnivån. Stegen står också överst i `wrangler.toml`.

1. **Databasen, med EU-jurisdiktion.** `npx wrangler d1 create skramlat --jurisdiction=eu`. Jurisdiktionen kan bara sättas när databasen skapas. Klistra in databasens id i `wrangler.toml`.
2. **Schemat.** Läggs in av Workern själv vid första anropet (`server/migrera.js`, från `migrations/` via `server/schema.js`). Bokföringen är densamma som wranglers (`d1_migrations`), så `npx wrangler d1 migrations apply skramlat --remote` fungerar också.
3. **E-post.** `npx wrangler email sending enable skramlat.se`. Cloudflares e-posttjänst är i beta, och fältnamnen i `server/epost.js` är hämtade från en tredjepartsbeskrivning: kontrollera mot Cloudflares egen dokumentation.
4. **Första klubben.** `node scripts/ny-klubb.js --slug eskilsminne --namn "Eskilsminne IF" --epost <administratörens adress> > ny-klubb.sql`, sedan `npx wrangler d1 execute skramlat --remote --file ny-klubb.sql`. Radera filen efteråt. Administratören ska vara en person i klubben, inte den som driver Skramlat.
5. **Publicera.** `npx wrangler deploy` (bygger själv först, se `[build]` i `wrangler.toml`), eller automatiskt från GitHub (se *Publicera*). Sätt `endpoint: "/api"` i `eskilsminne/lag.js` först.
6. **Kontrollera jurisdiktionen.** `CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node scripts/kontrollera-eu.js`. Kan skriptet inte avgöra det (svaret nämner ingen jurisdiktion) kontrolleras det för hand i Cloudflares panel och skrivs ner.
7. **Lasttest mot en testdatabas** innan skarp drift: `scripts/lasttest.js`.

Domänen `skramlat.se` pekar idag på GitHub Pages. Flytten till Cloudflare görs i Fas 2.

## Så går en försäljning till (alla försäljningar godkänns av klubben)

1. **Lagföräldern startar försäljningen** på adminsidan med *Starta en försäljning*: skriver lagets namn och får en personlig länk som visas **en enda gång**. Länken är lagförälderns inloggning. Försäljningen börjar alltid som **Utkast** och syns inte för föräldrarna. Klubben lägger inte till lag: under Alla lag finns länken till *Starta en försäljning* som klubben kan dela med lagföräldrarna. Vem som helst kan starta ett utkast, men det kan inte öppnas utan klubbens godkännande, klubben kan ta bort felaktiga eller dubbla utkast, och högst tio försäljningar kan startas per timme och klubb.
2. **Lagföräldern fyller i försäljningen** i adminvyn: **vad som säljs** (produktens namn, en kort beskrivning, enhet i ental och flertal, till exempel *kaka* och *kakor*, en text om försäljningen, hur och när varorna delas ut och en belöningstext), pris, inköpspris, minimum, mål, eventuellt antal i lager, Swish-nummer och mottagarens namn. Det finns inga färdiga produkter: varje lag skriver in sin egen, en produkt per försäljning. Två punkter ska bekräftas innan den kan skickas: att den som äger Swish-numret vet om det, och att laget bara säljer sådant som klubben har godkänt att laget får sälja. Servern kontrollerar att allt är ifyllt. Status blir **Väntar på godkännande** och uppgifterna låses. Lagföräldern kan dra tillbaka den och ändra.
3. **Klubbens administratör granskar** under *Väntar på godkännande* på sidan Alla lag. Administratören kan **godkänna och öppna** eller **skicka tillbaka med en kommentar** som lagföräldern ser. Servern kontrollerar uppgifterna en gång till vid godkännandet.
4. **Först när försäljningen är öppen** syns den för föräldrar och går att beställa från. Utkast och väntande försäljningar visas inte i listan och inte på lagets egen länk. Lagföräldern kan **avsluta** försäljningen och **öppna den igen**. Efter godkännandet kan ingen ändra pris eller Swish-nummer direkt: lagföräldern väljer *Ändra uppgifter*, då stängs försäljningen och blir ett utkast igen, och den öppnar först när klubben har godkänt den på nytt. Beställningarna finns kvar. Klubben kan **stoppa** en godkänd försäljning med en kommentar (till exempel om Swish-numret är fel): den stängs och blir ett utkast som lagföräldern rättar och skickar in igen.
5. **När försäljningen är avslutad** får klubben ett mejl med antal, kartonger att beställa från leverantören och belopp. Lagföräldern ser beloppet (allt som är markerat som betalt) och klubbens bankgiro, skickar pengarna och trycker *Pengarna är skickade*. Klubben får ett mejl och kvitterar under *Pengar att kvittera* på sidan Alla lag. Öppnas försäljningen igen redovisas pengarna på nytt.
6. Gör en testbeställning på lagets sida och markera den som avbruten.

Mejlen till klubben innehåller lagets namn, antal, belopp, vilka fält som ändrats och en länk, aldrig barnens namn eller mobilnummer och aldrig själva värdena (till exempel Swish-numret): de syns i klubbens vy. Utan Workers Paid kommer mejlen bara fram till verifierade adresser i Email Routing. Kommer ett mejl inte fram görs åtgärden ändå.

Alla steg skrivs i tabellen *logg* (vem som gjorde vad, utan namn eller mobilnummer). Förlorad nyckel: *Ny nyckel* under Alla lag. Den gamla slutar fungera direkt.

## Klubbens status

En klubb är **väntar** (ansökt, inget syns för föräldrar och ingen kan beställa), **aktiv** eller **avstangd** (försäljningarna döljs, inga beställningar tas emot, och administratörens och lagens inloggningar slutar fungera). Besökare ser en väntande eller avstängd klubb som en klubb som inte finns. Skramlat godkänner klubbar: det går inte att bevisa tekniskt att någon företräder en förening, så det görs som en rutin (se *Vem får skapa en klubb?* i planen).

## Säkerhet

- **Nycklar.** Lagets nyckel är 32 slumpade tecken (128 bit). I databasen lagras bara en hash. Adminlänken har formen `admin.html#lag=<lag>&k=<nyckel>`: nyckeln ligger efter `#`, så den skickas inte till webbservern, och tas bort ur adressfältet vid inloggning. Inloggningen sparas bara i webbläsarflikens `sessionStorage`.
- **Klubbens administratör.** E-post med en länk (32 slumpade byte, bara hashen sparas) som gäller i 15 minuter och kan användas en gång. Länken öppnar en sida med en knapp, och först knappen loggar in, så att en e-postskanner inte förbrukar den. Sessionen gäller i 30 dagar (sidan frågar servern när den laddas, så administratören behöver en ny länk bara på en ny enhet eller efter en månad), ligger i en cookie som bara går över https, inte är läsbar för skript och bara gäller den egna adressen (`__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`), och sparas bara som hash. Förfrågningar från en annan webbplats gäller inte (Origin kontrolleras).
- **Behörighet kontrolleras alltid av servern**, aldrig av sidan. Ett lags nyckel ger bara det laget i just den klubben. Bara klubbens administratör kan lägga till lag, godkänna försäljningar, ändra uppgifter efter godkännandet och byta nycklar. Ett lags nyckel kan bara ändra försäljningens uppgifter medan den är ett utkast.
- **Samtidighet.** Lagerkontrollen och ordernumret är samma databasuttryck som sparar beställningen, och körs som en transaktion: två föräldrar kan inte ta samma sista, och ett ordernummer används aldrig två gånger.
- **Spärr.** Efter 10 felaktiga nyckelförsök för ett lag (eller 40 för klubben) på tio minuter stoppas fel nycklar en stund. Rätt nyckel kommer alltid in. Högst fem inloggningslänkar per adress och 20 per IP-nummer och timme, och svaret är detsamma oavsett om adressen är en administratör.
- **Skydd mot skräp.** Beställningar har honeypot, tidsspärr, spärr per mobilnummer och kontroll av lag, status och högsta antal (antalet måste vara ett tal). Texter som lagföräldern skriver rensas från inledande `=`, `+`, `-`, `@`, så att inget tolkas som formel om uppgifterna exporteras till ett kalkylprogram. Alla databasfrågor har parametrar.
- **Inget cachas.** Alla svar skickas med `Cache-Control: no-store`.
- **Logg.** Tabellen *logg* visar när ett lag skapades, ändrades eller fick ny nyckel och varje betalningsmarkering, med ordernummer, antal och belopp, aldrig barnets namn, mobilnummer eller e-postadresser.
- Servern är en publik webbadress: den som känner den kan anropa den. Därför ligger all behörighet i nycklarna och sessionen.

## Lagring i EU

Allt som sparas om personer (barnets förnamn, mobilnummer, administratörernas e-postadresser) ligger i D1, som skapas med EU-jurisdiktion. Inget KV, ingen R2, inga köer, inga Durable Objects, ingen cache och inga loggar med uppgifter om personer. Vaktprovet `test/eu.test.js` fallerar om något sådant läggs till.

**Det Skramlat kan lova är att uppgifterna lagras i EU**, inte att de aldrig lämnar EU: koden körs i Cloudflares globala nätverk, och Cloudflares egna loggar (till exempel IP-nummer) lagras i både USA och Europa. Cloudflare är dessutom ett amerikanskt bolag. Se *Lagring bara i EU* i [PLAN-gemensam-server.md](PLAN-gemensam-server.md), och frågorna till Cloudflare som återstår.

## Personuppgifter

Beställningarna innehåller barnets förnamn och förälderns mobilnummer.

- **Klubben är personuppgiftsansvarig** för alla sina lag. **Skramlat är personuppgiftsbiträde** och behandlar uppgifterna på klubbens uppdrag. Biträdesavtal, integritetspolicy och radering efter 60 dagar (efter avslutad försäljning) ska vara klara innan en riktig klubb använder tjänsten (Fas 3 i planen). Det här är inte juridisk rådgivning.
- Klubbens administratör ser **alla** lags uppgifter. Lagens lagföräldrar ser bara sitt eget lag, via adminvyn.
- Klubben ska ha minst två administratörer, så att det inte hänger på en enskild person.

## Bra att veta

- **Pengarna.** Den som äger lagets Swish-nummer tar emot pengarna och betalar tillbaka vid behov, till exempel om minimum inte nås. Skriv ner vem det är för varje lag.
- **Notiser.** Det finns ingen Telegram eller e-post om beställningar: den som tar emot pengarna tittar i adminvyn. Beställningar är *Obetalda* tills de markeras *Betald*.
- **Utlämning.** Fliken *Utlämning* i adminvyn är en lista att bocka av när någon hämtar. *Markera alla betalda som hämtade* markerar bara betalda beställningar: obetalda och avbrutna rörs inte. *Skriv ut listan* skriver ut alla beställningar utom de avbrutna, i namnordning.
- **En sak per lag.** Ett lag har en försäljning, med en produkt, i taget. Säljer laget något nytt efter att den förra avslutats, eller två saker samtidigt, startar lagföräldern (eller klubben) en ny post för laget, till exempel *P2019 Lotter*, med egen nyckel och egen länk.
- **Lager.** Har laget fått ett bestämt antal, till exempel bingolotter, skriver lagföräldern *Antal i lager*. Servern nekar då beställningar över det som finns kvar, och försäljningen visas som *Slutsåld* när allt är beställt. Avbrutna och borttagna beställningar ger tillbaka sina. Med ett lager behövs inget minimum (bara ett mål). Tomt eller 0 betyder ingen gräns.
- **Länk till beställningssidan.** Lagföräldern delar lagets egen länk (`?lag=…`) med föräldrarna på det sätt laget brukar kommunicera. Verktyget förutsätter ingen särskild kanal. Föräldrar som saknar länken väljer sitt lag i listan på klubbsidan.
- **Betalningar matchas för hand.** Föräldern skriver ordernumret i Swish-meddelandet, den som tar emot pengarna matchar det mot Swish-historiken och trycker *Betald*. Automatisk matchning kräver Swish Handel med API eller en betalleverantör och finns inte här.
- **Ta bort en beställning.** Obetalda och avbrutna beställningar kan tas bort (två tryck). Betalda och hämtade kan inte det: ångra betalningen eller hämtningen först. Raden försvinner helt, även barnets namn och mobilnummer. I loggen sparas bara ordernummer, antal och belopp. Ordernumret används inte igen.
- **Dubbletter.** Varje beställning får en kod av sidan. Försöker föräldern igen med samma uppgifter efter ett svar som uteblev får hen samma kvitto, inte en ny beställning. Det gäller även om två försök kommer exakt samtidigt.
- **Kvittot överlever en omladdning.** Ordernummer, belopp och antal sparas i webbläsaren i 14 dagar (inte barnets namn eller mobilnummer), så att Swish-uppgifterna finns kvar om sidan laddas om medan föräldern är i Swish-appen.
- **Namn och nummer.** Barnets namn måste börja med en bokstav men får innehålla mellanslag, bindestreck, apostrof, punkt, komma, `&`, `/` och parenteser (till exempel *Emil & Ella*). Mobilnummer skrivna `+46 (0)70 …` godtas. Bara svenska mobilnummer (07…) går att beställa med.
- **Många lag.** Klubbsidan visar kompakta rader och en sökruta när fler än sex lag säljer. Adminvyn *Alla lag* får sökruta, filter på status och hopfällbara kort.

## Tester

Servertesterna körs mot en riktig D1 på den här datorn (Miniflare, samma databasmotor som Cloudflare), utan att något konto, någon databas eller något riktigt uppgift rörs. Det kostar ingenting.

```
npm test             # funktionella tester, inloggning, attacker och vaktprov för EU-reglerna
npm run test:mutera  # bevis för att testerna biter (långsamt: kör bara före lansering)
npm run test:xss     # XSS-attacker i en riktig webbläsare (kräver Playwright och Chromium)
npm run test:gammal  # testerna av den gamla Apps Script-servern (Server.gs)
```

- **`test/api.test.js`**: priset räknas på servern, ordernummer, lager (även med många samtidiga beställningar), dubbletter, adminvyn, godkännande, start av försäljning, spärrar och trasiga anrop.
- **`test/inloggning.test.js`**: länkens livslängd och engångsanvändning, cookiens egenskaper, förfrågningar från andra webbplatser, spärrar, flera klubbar, och klubbar som väntar eller är avstängda.
- **`test/attack.test.js`**: försöker göra det som inte ska gå: läsa eller ändra ett annat lags eller en annan klubbs uppgifter, ge sig själv klubbadministratörens behörighet, smyga in status eller nyckel, beställa förbi knapparna, skicka ett eget belopp, SQL-injektion, skript i texterna, gissa länkar och sessioner, skicka förfrågningar i den inloggades namn, ta reda på vilka adresser som är administratörer och fylla en brevlåda. `ATTACK_RAPPORT=rapport.md npm test` skriver en tabell över varje attack med anrop, svar och resultat.
- **`test/eu.test.js`**: vaktprov för *Lagring i EU* (ingen cache, ingen annan lagring, inga loggar med uppgifter, konfigurationen, var personuppgifter finns).
- **`test/mutera.js`**: kopplar bort varje skydd i en kopia av `server/`, ett i taget, och kontrollerar att rätt test då fallerar. Ett test som går igenom även utan sitt skydd bevisar ingenting.

Det som bara kan bevisas hos riktiga Cloudflare, till exempel många beställningar exakt samtidigt mot en riktig D1, provas med `scripts/lasttest.js` mot en testdatabas innan skarp drift.

## Publicera

- **Idag:** sidorna ligger på GitHub Pages (*Settings → Pages*, gren `main`, mapp `/`), och `skramlat.se` pekar dit. Eskilsminne visar demo.
- **Cloudflare:** Workern `skramlat` är kopplad till GitHub och byggs om automatiskt från `main` (publicering: `npx wrangler deploy`, som bygger själv). Workern lägger in nya migreringar i databasen själv vid första anropet efter en publicering, så bygget behöver ingen behörighet till databasen. Migreringarna i `migrations/` ska tåla att köras igen (`IF NOT EXISTS`), och `server/schema.js` skapas från dem av `npm run bygg`. Adress: **https://skramlat.adelborg.workers.dev**. Där pratar sidorna med servern (`lag.js` väljer `/api` på workers.dev), medan samma filer på skramlat.se visar demo. Inloggningslänkarna pekar på workers.dev-adressen tills domänen flyttas (`SIDA_ORIGIN` i `wrangler.toml`). Utan Workers Paid går inloggningsmejl bara till adresser som är verifierade mottagare i Email Routing, vilket räcker för att testa med sin egen adress. **Allt som pushas till `main` publiceras alltså på båda ställena.**
- **Med Cloudflare (Fas 2):** sidorna och servern ligger i samma Worker, och domänen flyttas dit. Då får varje klubb sin adress `skramlat.se/<klubb>/` utan en egen mapp i repot, och en klubb skapas på `skramlat.se/kom-igang`. Se planen.

## Flytta P2019 hit

P2019-sidan och dess skript (`Code.gs` i [P2019-repot](https://github.com/adelborgen/eskilsminne-p2019)) fortsätter som idag tills försäljningen är klar. Därefter:

1. Lägg till P2019 i adminvyn. Produkten, enheten och belöningstexten skrivs in av lagföräldern i försäljningens uppgifter.
2. Exportera de gamla beställningarna om de ska sparas (Order-ID och belopp följer inte med automatiskt).
3. Ersätt `index.html` i P2019-repot med en omdirigering till den här sidan (`skramlat.se/eskilsminne/?lag=p2019`), så att gamla länkar fortsätter fungera.

## Att bestämma innan ni går live

1. **Klubbens skriftliga ok** för att Eskilsminne använder Skramlat, och vem som är klubbens administratör (en person i klubben, inte den som driver Skramlat). Samt klubbens ok för märke, namn och färger.
2. **Biträdesavtal och integritetspolicy** (Fas 3), granskade av någon som kan.
3. **Svar från Cloudflare** på de frågor som återstår (se planen).
4. **En andra person** med åtkomst till Cloudflare-kontot, databasen och domänen.
5. **Vem betalar tillbaka** om minimum inte nås, för varje lag.
