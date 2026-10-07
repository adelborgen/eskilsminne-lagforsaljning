# Lagförsäljning för Eskilsminne IF: flera lag, adminvy och ett Swish-nummer per lag (prototyp)

En klubbsida där föräldern väljer lag i en lista och beställer, i samma stil som P2019-sidan. Varje lags kassör har en adminvy där de ser beställningar och markerar betalningar. Klubbens administratör lägger till lag.

**Det här är en prototyp, och repot är fristående från P2019-sidan ([adelborgen/eskilsminne-p2019](https://github.com/adelborgen/eskilsminne-p2019)), som inte påverkas. Inget här är kopplat till P2019:s server, kalkylark eller Swish-nummer.**

## Principen

- **Pengarna går direkt till lagets Swish-nummer.** Systemet tar aldrig emot, håller eller flyttar pengar. Det kräver inget särskilt slags nummer: lagets eget, ett privat eller ett Swish Handel-nummer, det bestämmer laget. Numret skrivs in i lagets uppgifter och visas för föräldern efter beställningen.
- **Ett skript och ett kalkylark för hela klubben** (`Server.gs`). Alla beställningar ligger i klubbens kalkylark. Lagens kassörer använder adminvyn, inte kalkylarket, och ser bara sitt eget lag.
- **Priset räknas alltid på servern.** Sidan skickar bara antal.

## Tre roller

| Roll | Gör | Loggar in med |
|---|---|---|
| Förälder | Väljer lag och beställer, swishar till lagets nummer | Inget |
| Lagets kassör | Ser översikt och beställningar för sitt lag, markerar betald/avbruten, ringer eller skickar SMS-påminnelse, exporterar CSV | Lagets adminnyckel (via en personlig länk) |
| Klubbens administratör | Lägger till lag, öppnar/stänger/avslutar försäljning, ändrar uppgifter, byter nycklar, ser alla lag | Superadmin-nyckeln |

## Filer

| Fil | Innehåll |
|---|---|
| `index.html`, `app.js` | Laglistan och beställningssidan. `?lag=p2019` visar ett lag. |
| `admin.html`, `admin.js` | Adminvyn för kassörer och klubbens administratör. |
| `Server.gs` | Servern: klistras in i Google Apps Script. Sköter lag, beställningar, nycklar och adminåtgärder. |
| `lag.js` | Klubbens gemensamma inställningar (namn, texter, adressen till servern) och texter som skiljer för ett visst lag. **Inte lagens siffror**, de läggs till i adminvyn. |
| `util.js`, `style.css` | Delade hjälpfunktioner och utseende. |
| `test/` | Tester för servern. Se längst ned. |

## Prova utan att sätta upp något (demoläge)

Så länge `endpoint` i `lag.js` är tom visar sidorna exempellag och exempeldata, och inget sparas eller skickas. Öppna `index.html` och `admin.html` i webbläsaren, eller kör `python3 -m http.server` i repots rot och gå till `http://localhost:8000/`.

I adminvyn i demoläge är nyckeln `demo` för ett lags admin och `super` för klubbens administratör.

## Sätt upp servern (en gång, ca 30 minuter)

Görs av klubbens administratör.

1. **Konto och kalkylark.** Skapa kalkylarket "Lagförsäljning" på ett Google-konto som **klubben äger** och som fler än en person kommer åt (se "Personuppgifter" nedan). Dela det inte med lagens kassörer.
2. **Apps Script.** I kalkylarket: **Tillägg → Apps Script**. Ta bort befintlig kod, klistra in hela `Server.gs` och spara.
3. **Kör `setup`.** Välj funktionen `setup` och tryck **Kör**. Godkänn behörigheterna. Flikarna *Lag*, *Beställningar* och *Logg* skapas. Öppna **Körningar** (eller *Exekveringslogg*): där står **superadmin-nyckeln**. Den visas bara nu. Spara den i en lösenordshanterare. Tappas den: kör `nySuperNyckel` (den gamla slutar fungera).
4. **Publicera som webbapp.** **Implementera → Ny implementering → Webbapp**. *Kör som:* **Jag**. *Vem har åtkomst:* **Alla** (inte "Alla med Google-konto", då stoppas beställningarna). Kopiera webbappens URL (slutar på `/exec`).
5. **Koppla sidan.** Klistra in URL:en som `endpoint` i `lag.js`.
6. **Lägg till lag.** Öppna `admin.html`, välj *Klubbadministratör*, logga in med superadmin-nyckeln och öppna **Lägg till lag**. Du får en adminlänk per lag att skicka till lagets kassör.
7. **Efter varje ändring i `Server.gs`:** Implementera → Hantera implementeringar → pennan → Version: Ny version → Implementera.

## Så läggs ett lag till

1. Kassören hör av sig med lagets uppgifter: Swish-nummer, mottagarens namn, pris, inköpspris, minimum och mål.
2. Klubbens administratör kontrollerar (kryssrutorna i formuläret påminner om det): att klubben eller lagets ansvariga har bekräftat laget, att numrets ägare vet om att numret används, och att kassören vet att länken är personlig.
3. Administratören fyller i formuläret. Laget får en nyckel och en adminlänk som visas **en enda gång**. Skicka länken på ett säkert sätt, inte i en öppen grupp.
4. Sätt status till *Pågår*, gör en testbeställning på lagets sida och markera den som avbruten.

Förlorad nyckel: *Ny nyckel* under Alla lag. Den gamla slutar fungera direkt.

## Säkerhet

- **Nycklar.** 32 slumpade tecken (122 bit). I kalkylarket och i servern lagras bara en hash av nyckeln, aldrig själva nyckeln. Adminlänken har formen `admin.html#lag=<lag>&k=<nyckel>`: nyckeln ligger efter `#`, så den skickas inte till webbservern, och tas bort ur adressfältet vid inloggning. Inloggningen sparas bara i webbläsarflikens `sessionStorage` och försvinner när fliken stängs.
- **Behörighet kontrolleras alltid av servern**, aldrig av sidan. Ett lags nyckel ger bara det laget. Bara superadmin-nyckeln kan lägga till lag, ändra uppgifter och byta nycklar.
- **Spärr.** Efter 10 felaktiga nyckelförsök för ett lag (eller 40 totalt) spärras inloggningen en stund.
- **Logg.** Fliken *Logg* i kalkylarket visar när ett lag skapades, ändrades eller fick ny nyckel och varje betalningsmarkering.
- **Skydd mot skräp.** Beställningar har honeypot, tidsspärr, spärr per mobilnummer och kontroll av lag, status och högsta antal. Text som admin skriver rensas från inledande `=`, `+`, `-`, `@` så att inget tolkas som formel i kalkylarket.
- Servern är en publik webbadress: den som känner URL:en kan anropa den. Därför ligger all behörighet i nycklarna ovan.

## Personuppgifter

Beställningarna innehåller barnets förnamn och förälderns mobilnummer.

- **Klubben är personuppgiftsansvarig** för alla sina lag. Den som sätter upp och sköter servern behandlar uppgifterna **på klubbens uppdrag** (personuppgiftsbiträde). Skriv ner uppdraget kort: vem som får se uppgifterna, till vad, och att de raderas efter säsongen. Stäm av med klubbens styrelse hur det ska se ut. Det här är inte juridisk rådgivning.
- Klubbens administratör (och den som äger kalkylarket) ser **alla** lags uppgifter. Lagens kassörer ser bara sitt eget lag, via adminvyn.
- Kalkylarket ska ligga på ett konto som klubben äger och som minst två personer kommer åt, så att det inte hänger på en enskild privatperson.
- Radera beställningsraderna när säsongen är över.

## Bra att veta

- **Pengarna.** Den som äger lagets Swish-nummer tar emot pengarna och betalar tillbaka vid behov, till exempel om minimum inte nås. Skriv ner vem det är för varje lag.
- **Notiser.** Det finns ingen Telegram eller e-post i den här versionen: kassören tittar i adminvyn. Beställningar är *Obetalda* tills kassören trycker *Betald*.
- **Betalningar matchas för hand.** Föräldern skriver ordernumret i Swish-meddelandet, kassören matchar det mot Swish-historiken och trycker *Betald*. Automatisk matchning kräver Swish Handel med API eller en betalleverantör och finns inte här.
- **Inloggning med nyckel** är enkel och passar volontärer, men en vidarebefordrad länk ger åtkomst. Byt nyckel om den kan ha hamnat fel.
- **Skalning.** Apps Script och ett kalkylark räcker för en klubb med några lag och några hundra beställningar. Blir det betydligt mer (många lag, tusentals beställningar) bör servern bytas mot en riktig databas. Sidorna pratar med servern via ett litet JSON-API, så servern kan bytas ut senare.

## Flytta P2019 hit

P2019-sidan och dess skript (`Code.gs` i [P2019-repot](https://github.com/adelborgen/eskilsminne-p2019)) fortsätter som idag tills försäljningen är klar. Därefter:

1. Lägg till P2019 i adminvyn med samma uppgifter. Belöningstexterna för P2019 finns redan i `LAG_EXTRA.p2019` i `lag.js`.
2. Exportera de gamla beställningarna om de ska sparas (Order-ID och belopp följer inte med automatiskt).
3. Ersätt `index.html` i P2019-repot med en omdirigering till den här sidan (`?lag=p2019`), så att gamla länkar fortsätter fungera.

## Publicera

- **GitHub Pages:** under *Settings → Pages* välj *Deploy from a branch*, gren `main`, mapp `/ (root)`. Sidan ligger då på `https://adelborgen.github.io/eskilsminne-lagforsaljning/` och adminvyn på `…/admin.html`. Pages på ett personligt konto kräver att repot är publikt.
- **Egen domän:** ange domänen under *Settings → Pages → Custom domain* med en CNAME-post hos registratorn. Det ger också egen webbadress (ursprung), så att sidan inte delar adress med andra projektsidor under `adelborgen.github.io`.
- **Gärna under en GitHub-organisation** för klubben, så att repot inte hänger på ett privat konto.

## Beslut hittills (oktober 2026)

Tagna efter granskningen av designbriefen "Kassaskrinet":

1. **Bara Eskilsminne IF.** Designen delas i lager (plattform, förening, grupp, försäljning) så att den går att bygga ut, men vi bygger inte plattformsadmin, temaeditor eller fler föreningstyper. En dialekt: Matchdag.
2. **Ingen förifylld Swish.** Föräldern kopierar nummer, belopp och meddelande. Appen försöker inte öppna Swish. (Redan så i prototypen.)
3. **Swish-meddelandet innehåller bara ordernumret**, inte barnets namn. (Redan så i prototypen.) Kassören slår upp namnet i adminvyn.
4. **Mätarens "till lagkassan" märks "beräknat"**, eftersom pengarna inte är inne förrän de är swishade. Ännu inte ändrat i prototypen.
5. **Typsnitten ligger i repot** (`fonts/`: Archivo och Atkinson Hyperlegible Next) och laddas inte från Google. Inte kopplade till appen än.
6. **"Kassaskrinet" är ett arbetsnamn.** Byt innan lansering: kontrollera domän och varumärke. Briefen anger att kassaskrinet.se och klubbkassan.se redan är upptagna.

Det som designbriefen beskriver och som ännu inte finns i prototypen: försäljning som egen nivå (flera per grupp, status på försäljningen), kvittosida som tål omladdning, ordernummer med lagkod (P14-037), ångra-fönster på 8 sekunder, rensa-knapp per lag, och utseendet (Matchdag).

## Att bestämma innan ni går live

1. **Namn.** "Lagförsäljning" i prototypen och "Kassaskrinet" i designbriefen är arbetsnamn. Välj ett namn som inte krockar med någon annan tjänst (kolla domän och varumärke).
2. **Klubbens godkännande** för namn, logga och färger (färgerna är de som redan används på P2019-sidan och hämtades från en tredjepartssida, inte från klubben), och för att administratören sköter servern.
3. **En andra administratör** som kommer åt kalkylarket, Apps Script-projektet, GitHub och domänen.
4. **Uppdraget kring personuppgifter** (se ovan).
5. **Vem betalar tillbaka** om minimum inte nås, för varje lag.

## Tester

Servern körs i Node mot låtsas-versioner av Googles tjänster, utan att något riktigt kalkylark rörs:

```
node --test test/server.test.cjs
```

Testerna täcker bland annat att ett lag inte kan se eller ändra ett annat lags beställningar, att priset räknas på servern, att nycklar och hashar aldrig syns i något svar, att bara klubbens administratör kan lägga till lag, spärren efter felaktiga försök, och att varje kontroll av indata avvisar fel värden. Sidorna är dessutom provkörda i en webbläsare mot den riktiga `Server.gs`.
