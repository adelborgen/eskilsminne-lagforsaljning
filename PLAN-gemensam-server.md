# Plan: gemensam server för Skramlat (utan Apps Script)

Utkast för beslut, 17 oktober 2026. Inget av det här är byggt. Det är en plan att godkänna eller ändra innan arbetet börjar.

## Mål

En klubb går till skramlat.se, loggar in med sin e-post, skriver klubbens namn, väljer två färger, laddar upp märket och är igång. Inget Google-konto, inget kalkylark, ingen kod. Lagföräldrar och föräldrar märker ingen skillnad mot idag.

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

## Teknikval

**Supabase** (Postgres-databas, inloggning med e-postlänk, fillagring för märken), med en enda serverfunktion i TypeScript som motsvarar dagens `doGet` och `doPost`.

Varför det och inte en egen lösning på Cloudflare Workers med D1:
- Inloggning med e-postlänk är det som är farligast att bygga själv, och här följer den med färdig.
- Postgres har riktiga transaktioner. Lagerkontrollen och ordernumret (idag skyddade av ett skriptlås i Apps Script) blir en rad i en transaktion, och går att testa på riktigt.
- Det går att köra databasen i Europa.

Att kontrollera innan vi bestämmer (jag har inte kollat dem idag): aktuella priser, om gratisnivån pausar projekt som inte används (då behövs en betald nivå i drift), och vilken EU-region som finns.

Alla tabeller stängs för direktåtkomst. Allt går via serverfunktionen, som kontrollerar behörighet i koden precis som `Server.gs` gör idag. Det gör att behörighetstesterna kan följa med.

## Datamodell

- **klubb**: adress (till exempel `eskilsminne`), namn, motto, mörk färg, ljus färg, märke, status (*väntar*, *aktiv*, *avstängd*), tidpunkt och version för godkänt biträdesavtal.
- **klubb_admin**: koppling mellan inloggad person och klubb. Flera per klubb, så att "andra administratören" finns från start.
- **lag**: som dagens flik *Lag*, plus klubb och nyckelns hash. Fortfarande en försäljning med en produkt per post.
- **bestallning**: som dagens flik *Beställningar*, plus beställningskoden. Unikt per lag, så att dubbletter stoppas bestående och inte bara i 15 minuter.
- **logg**: som dagens flik *Logg*.
- **sparr**: räknare för spärr på felaktiga nyckelförsök, beställningar per mobilnummer (hashat) och startade försäljningar.

Order och lager: raden för laget låses i transaktionen, lagret kontrolleras, ordernumret räknas upp och beställningen sparas. Det är samma regler som idag, men med ett riktigt lås.

## API: så lite som möjligt ändras

Samma åtgärder och samma svar som idag, med två tillägg:
- **klubb** (adressen) följer med i varje anrop.
- Klubbens administratörsåtgärder (`lagLista`, `lagNy`, `godkann`, `skickaTillbaka` med flera) kräver inloggning som administratör för just den klubben, i stället för superadmin-nyckeln.

Därför blir ändringarna i `app.js`, `admin.js` och `util.js` små: adressen till servern, klubbens adress från sökvägen, och inloggningen för klubbens administratör.

## Utseende

`style.css` bygger redan på färgvariabler (`--blue`, `--yellow`, `--cream`, `--sky`, `--hard` med flera, och mörkt läge längre ned). Klubben väljer en mörk och en ljus färg. Sidan sätter variablerna när den laddas och räknar ut övriga nyanser.

- Kontrollen som redan är beslutad: en ljus färg som inte syns mot svart text (under 4,5 : 1) byts mot krämvitt. Samma kontroll görs för den mörka färgen mot krämvit text.
- Märket laddas upp som PNG, JPEG eller WebP, högst 1 MB. Inte SVG, eftersom en uppladdad SVG kan innehålla skript.
- Det blir **två färger och ett märke**, ingen temaeditor.

## Adresser

`skramlat.se/<klubb>/` ska peka på samma sidor för alla klubbar. GitHub Pages kan inte skriva om adresser, så de statiska sidorna flyttas till Cloudflare Pages (gratis, och DNS ligger redan hos Cloudflare). Eskilsminnes adress `skramlat.se/eskilsminne/` och gamla `?lag=`-länkar fortsätter fungera. Behöver kontrolleras: att Cloudflare Pages skriver om adresser som vi behöver.

## Kom igång-flödet för en klubb

1. Klubben går till `skramlat.se/kom-igang`, skriver sin e-post och bekräftar att den inte är en robot (Cloudflare Turnstile, gratis).
2. Inloggningslänk till e-posten.
3. Klubben skriver namn, adress, motto, väljer färger och laddar upp märket. Klubben godkänner **biträdesavtalet** (se nedan).
4. Klubben skapas med status *väntar*. **Under piloten godkänner du varje ny klubb**, så att ingen kan registrera en klubb som inte finns. Senare kan det bli automatiskt med verifierad e-post.
5. Klubbens administratör bjuder in en andra administratör.
6. Lagföräldrar startar sina försäljningar som idag. Klubben godkänner som idag.

Kräver att Skramlat skickar e-post från `skramlat.se` (inloggningslänkar). Det behöver en e-posttjänst med riktig avsändare. Dagens `hej@skramlat.se` tar bara emot.

## Personuppgifter: det som flyttar till dig

Idag ligger barnets förnamn och förälderns mobilnummer i klubbens eget Google-konto. Efter bytet håller Skramlat dem åt alla klubbar. Då är klubben personuppgiftsansvarig och Skramlat personuppgiftsbiträde.

Det här måste vara klart **innan en riktig klubb använder tjänsten**:
- **Biträdesavtal** som klubben godkänner när den skapar kontot. Godkännandets tidpunkt och version sparas. Texten bör granskas av någon som kan, jag är inte jurist.
- **Servern i EU**, och en lista över underbiträden (databasleverantören, Cloudflare, e-posttjänsten).
- **Automatisk radering** av beställningarna en bestämd tid efter att försäljningen avslutats. Loggen behåller bara ordernummer, antal och belopp, som idag.
- **Integritetspolicy** (står redan på att-göra-listan).
- **Rutin för incidenter**: som biträde måste du kunna säga till klubbarna om något händer.
- **Säkerhetskopior** hos leverantören, och att policyn säger hur länge de finns kvar.
- **Minst två personer** med åtkomst till servern, databasen och domänen.
- **Vem som är avtalspart.** Skramlat ägs privat tills vidare. Fundera på om avtalen ska skrivas av dig som privatperson eller av ett bolag.

## Vad som återanvänds

- **Sidorna.** `app.js` (563 rader), `admin.js` (1 115), `util.js`, `style.css` och alla texter. Demoläget behålls.
- **Reglerna.** Pris räknas på servern, namn och mobilnummer kontrolleras, spärrar, honeypot och tidsspärr, lager, dubbletter, rensning av text. All logik i `Server.gs` flyttas över.
- **Testerna.** Testerna anropar servern via `post`, `get` och `admin` i `test/harness.cjs`. Behåller den nya servern samma anrop går scenarierna att köra om mot den, med klubbens adress och administratörsinloggning som tillägg. `test/xss.webblasare.cjs` går att behålla nästan som den är. `test/mutera.cjs` ändrar texten i `Server.gs` och måste skrivas om, men idén (koppla bort ett skydd i taget) behålls.
- **Bättre test av det som inte gick att prova.** Idag testas servern mot låtsas-Google, och "20 beställningar på sista lotten" kan inte bevisas förrän riktiga Google. Med Postgres går det att köra mot en riktig databas i testerna (till exempel PGlite i Node eller en lokal Supabase). Att kontrollera: vilket av dem som fungerar i vår miljö.

## Faser

Storleken är relativ (S, M, L). Jag vill inte gissa antal dagar innan vi har provat Fas 1.

| Fas | Innehåll | Storlek |
|---|---|---|
| **1. Servern** | Databas, beställning, lagförälderns och klubbens åtgärder, inloggning för klubbens administratör, testerna flyttade och körda. Eskilsminne som första klubb. Sidorna pekar på nya servern. | L |
| **2. Kom igång** | Registrering, godkännande, utseende (färger och märke), fler administratörer, adresser `skramlat.se/<klubb>`, e-post från skramlat.se. | M |
| **3. Juridik och drift** | Biträdesavtal i flödet, automatisk radering, integritetspolicy, säkerhetskopior, övervakning, en andra person med åtkomst. Görs parallellt med Fas 2. | M |
| **4. Skolor och lotter** | Förening eller skola (ord per kund), samlad lista över obetalda för skolans administratör, Swish per kund, rutan "Kräver 18 år". | M |

Eskilsminne kan gå live när Fas 1 och Fas 3 är klara. Fas 2 behövs först för klubb nummer två.

## Det här byggs inte

- Betalningar eller Swish-integration. Pengarna går aldrig via Skramlat.
- Lösenord. Klubben använder e-postlänk, lagföräldern en länk med nyckel.
- Temaeditor, plattformsadmin med eget gränssnitt eller fler lager än klubb och lag. Du godkänner klubbar i databasens egen vy.
- Flera försäljningar per grupp. Det är fortfarande en post per försäljning, som idag.

## Beslut jag behöver från dig

1. **Supabase** enligt ovan, eller Cloudflare Workers med D1?
2. **Eskilsminne och bingolotterna.** Jag föreslår att vi **inte** sätter upp Apps Script som mellanlösning. Då finns ingen riktig data att flytta, och Eskilsminne blir första klubben på nya servern. Finns det ett datum som inte kan skjutas?
3. **Hur länge sparas beställningar efter avslutad försäljning?** Förslag: 60 dagar.
4. **Godkänner du varje ny klubb under piloten?** Förslag: ja.
5. **Vem är avtalspart** för biträdesavtalet: du privat, eller ett bolag?
