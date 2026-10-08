# Lagförsäljning för Eskilsminne IF: flera lag, adminvy och ett Swish-nummer per lag (prototyp)

En klubbsida där föräldern väljer lag i en lista och beställer, i samma stil som P2019-sidan. Varje lags lagförälder sätter upp försäljningen, och klubben godkänner den innan något säljs. Sedan har lagföräldern en adminvy där beställningar, betalningar och utlämning följs upp. Klubbens administratör lägger till lag och godkänner försäljningarna.

**Det här är en prototyp, och repot är fristående från P2019-sidan ([adelborgen/eskilsminne-p2019](https://github.com/adelborgen/eskilsminne-p2019)), som inte påverkas. Inget här är kopplat till P2019:s server, kalkylark eller Swish-nummer.**

## Principen

- **Pengarna går direkt till lagets Swish-nummer.** Systemet tar aldrig emot, håller eller flyttar pengar. Det kräver inget särskilt slags nummer: lagets eget, ett privat eller ett Swish Handel-nummer, det bestämmer laget. Numret skrivs in i lagets uppgifter och visas för föräldern efter beställningen.
- **Ett skript och ett kalkylark för hela klubben** (`Server.gs`). Alla beställningar ligger i klubbens kalkylark. Lagens lagföräldrar använder adminvyn, inte kalkylarket, och ser bara sitt eget lag.
- **Priset räknas alltid på servern.** Sidan skickar bara antal.

## Tre roller (och en begränsad länk för utlämning)

| Roll | Gör | Loggar in med |
|---|---|---|
| Förälder | Väljer lag och beställer, swishar till lagets nummer | Inget |
| Lagförälder | Fyller i försäljningen (vad som säljs, priser, Swish-nummer, mål) och skickar den till klubben för godkännande. När den är godkänd: ser översikt och beställningar för sitt lag, markerar betald/avbruten och hämtad (en och en, eller alla betalda på en gång), tar bort obetalda beställningar, skriver ut en utlämningslista, ringer eller skickar SMS-påminnelse, exporterar CSV | Lagets adminnyckel (via en personlig länk) |
| Klubbens administratör | Lägger till lag, godkänner eller skickar tillbaka försäljningar, öppnar/stänger/avslutar, ändrar uppgifter, byter nycklar, ser alla lag | Superadmin-nyckeln |
| Den som delar ut (valfri) | Ser en lista med namn och antal och bockar av *Hämtad*. Ser inga mobilnummer och inga belopp, och kan inte ändra betalningar eller ta bort något | Lagets utlämningslänk, som lagföräldern skapar (och kan byta eller stänga av) |

## Filer

| Fil | Innehåll |
|---|---|
| `index.html`, `app.js` | Laglistan och beställningssidan. `?lag=p2019` visar ett lag. |
| `admin.html`, `admin.js` | Adminvyn för lagföräldrar och klubbens administratör. |
| `Server.gs` | Servern: klistras in i Google Apps Script. Sköter lag, beställningar, nycklar och adminåtgärder. |
| `lag.js` | Klubbens gemensamma inställningar (namn, texter, adressen till servern) och texter som skiljer för ett visst lag. **Inte lagens siffror**, de läggs till i adminvyn. |
| `util.js`, `style.css` | Delade hjälpfunktioner och utseende (Matchdag: blå bakgrund med ränder, krämfärgade kort, gula lagbrickor, vimplar). Samma utseende för förälder, lagförälder och klubbadministratör. |
| `fonts/`, `assets/` | Typsnitten (Archivo och Atkinson Hyperlegible Next, självhostade) och klubbmärket. |
| `test/` | Tester för servern. Se längst ned. |

## Prova utan att sätta upp något (demoläge)

Så länge `endpoint` i `lag.js` är tom visar sidorna exempellag och exempeldata, och inget sparas eller skickas. Öppna `index.html` och `admin.html` i webbläsaren, eller kör `python3 -m http.server` i repots rot och gå till `http://localhost:8000/`.

I adminvyn i demoläge är nyckeln `demo` för ett lags admin, `super` för klubbens administratör och `utlamning` för den som delar ut (lag F2017, när lagföräldern har skapat en utlämningslänk). Förälderns sida och adminsidan har varsitt demotillstånd som nollställs när sidan laddas om: en beställning som läggs på ena sidan syns inte på den andra.

## Sätt upp servern (en gång, ca 30 minuter)

Görs av klubbens administratör.

1. **Konto och kalkylark.** Skapa kalkylarket "Lagförsäljning" på ett Google-konto som **klubben äger** och som fler än en person kommer åt (se "Personuppgifter" nedan). Dela det inte med lagens lagföräldrar.
2. **Apps Script.** I kalkylarket: **Tillägg → Apps Script**. Ta bort befintlig kod, klistra in hela `Server.gs` och spara.
3. **Kör `setup`.** Välj funktionen `setup` och tryck **Kör**. Godkänn behörigheterna. Flikarna *Lag*, *Beställningar* och *Logg* skapas. Öppna **Körningar** (eller *Exekveringslogg*): där står **superadmin-nyckeln**. Den visas bara nu. Spara den i en lösenordshanterare. Tappas den: kör `nySuperNyckel` (den gamla slutar fungera).
4. **Publicera som webbapp.** **Implementera → Ny implementering → Webbapp**. *Kör som:* **Jag**. *Vem har åtkomst:* **Alla** (inte "Alla med Google-konto", då stoppas beställningarna). Kopiera webbappens URL (slutar på `/exec`).
5. **Koppla sidan.** Klistra in URL:en som `endpoint` i `lag.js`.
6. **Lägg till lag.** Öppna `admin.html`, välj *Klubbadministratör*, logga in med superadmin-nyckeln och öppna **Lägg till lag**. Skriv lagets namn. Du får en adminlänk per lag att skicka till lagföräldern, som sedan fyller i vad laget säljer.
7. **Efter varje ändring i `Server.gs`:** Implementera → Hantera implementeringar → pennan → Version: Ny version → Implementera.

## Så går en försäljning till (alla försäljningar godkänns av klubben)

1. **Klubbens administratör lägger till laget**: det räcker med ett namn, resten fyller lagföräldern i. Försäljningen börjar alltid som **Utkast**. Laget får en nyckel och en adminlänk som visas **en enda gång**. Skicka länken till lagföräldern på ett säkert sätt, inte i en öppen grupp.
2. **Lagföräldern fyller i försäljningen** i adminvyn: **vad som säljs** (produktens namn, en kort beskrivning, enhet i ental och flertal, till exempel *kaka* och *kakor*, en text om försäljningen, hur och när varorna delas ut och en belöningstext), pris, inköpspris, minimum, mål, eventuellt antal i lager, Swish-nummer och mottagarens namn. Det finns inga färdiga produkter: varje lag skriver in sin egen, en produkt per försäljning. Två punkter ska bekräftas innan den kan skickas: att den som äger Swish-numret vet om det, och att laget bara säljer sådant som klubben har godkänt att laget får sälja. Servern kontrollerar att allt är ifyllt. Status blir **Väntar på godkännande** och uppgifterna låses. Lagföräldern kan dra tillbaka den och ändra.
3. **Klubbens administratör granskar** under *Väntar på godkännande* på sidan Alla lag. Administratören kan **godkänna och öppna nu**, **godkänna och öppna senare** (status *Godkänd, öppnar snart*) eller **skicka tillbaka med en kommentar** som lagföräldern ser. Servern kontrollerar uppgifterna en gång till vid godkännandet.
4. **Först när försäljningen är öppen** syns den för föräldrar och går att beställa från. Utkast och väntande försäljningar visas inte i listan och inte på lagets egen länk. Efter godkännandet kan lagföräldern inte ändra pris eller Swish-nummer: bara klubben kan det.
5. Gör en testbeställning på lagets sida och markera den som avbruten.

Alla steg skrivs i fliken *Logg* (vem som skickade, godkände eller skickade tillbaka, och kommentaren).

Förlorad nyckel: *Ny nyckel* under Alla lag. Den gamla slutar fungera direkt.

## Säkerhet

- **Nycklar.** 32 slumpade tecken (122 bit). I kalkylarket och i servern lagras bara en hash av nyckeln, aldrig själva nyckeln. Adminlänken har formen `admin.html#lag=<lag>&k=<nyckel>`: nyckeln ligger efter `#`, så den skickas inte till webbservern, och tas bort ur adressfältet vid inloggning. Inloggningen sparas bara i webbläsarflikens `sessionStorage` och försvinner när fliken stängs.
- **Behörighet kontrolleras alltid av servern**, aldrig av sidan. Ett lags nyckel ger bara det laget. Bara superadmin-nyckeln kan lägga till lag, godkänna försäljningar, ändra uppgifter efter godkännandet och byta nycklar. Ett lags nyckel kan bara ändra försäljningens uppgifter medan den är ett utkast.
- **Spärr.** Efter 10 felaktiga nyckelförsök för ett lag (eller 40 totalt) stoppas fel nycklar en stund. Rätt nyckel kommer alltid in: nycklarna är för långa för att gissa, så spärren ska bara bromsa fel nycklar och får inte kunna användas för att låsa ute en lagförälder.
- **Logg.** Fliken *Logg* i kalkylarket visar när ett lag skapades, ändrades eller fick ny nyckel och varje betalningsmarkering.
- **Skydd mot skräp.** Beställningar har honeypot, tidsspärr, spärr per mobilnummer och kontroll av lag, status och högsta antal. Text som admin skriver rensas från inledande `=`, `+`, `-`, `@` så att inget tolkas som formel i kalkylarket.
- Servern är en publik webbadress: den som känner URL:en kan anropa den. Därför ligger all behörighet i nycklarna ovan.

## Personuppgifter

Beställningarna innehåller barnets förnamn och förälderns mobilnummer.

- **Klubben är personuppgiftsansvarig** för alla sina lag. Den som sätter upp och sköter servern behandlar uppgifterna **på klubbens uppdrag** (personuppgiftsbiträde). Skriv ner uppdraget kort: vem som får se uppgifterna, till vad, och att de raderas efter säsongen. Stäm av med klubbens styrelse hur det ska se ut. Det här är inte juridisk rådgivning.
- Klubbens administratör (och den som äger kalkylarket) ser **alla** lags uppgifter. Lagens lagföräldrar ser bara sitt eget lag, via adminvyn.
- Kalkylarket ska ligga på ett konto som klubben äger och som minst två personer kommer åt, så att det inte hänger på en enskild privatperson.
- Radera beställningsraderna när säsongen är över.

## Bra att veta

- **Pengarna.** Den som äger lagets Swish-nummer tar emot pengarna och betalar tillbaka vid behov, till exempel om minimum inte nås. Skriv ner vem det är för varje lag.
- **Notiser.** Det finns ingen Telegram eller e-post i den här versionen: den som tar emot pengarna tittar i adminvyn. Beställningar är *Obetalda* tills de markeras *Betald*.
- **Utlämning.** Fliken *Utlämning* i adminvyn är en lista att bocka av när någon hämtar. Kryssrutan sparas direkt. *Markera alla betalda som hämtade* markerar bara betalda beställningar: obetalda och avbrutna rörs inte. Ett svar i kalkylarket syns i kolumnen *Hämtad* (JA eller tomt). *Skriv ut listan* skriver ut alla beställningar utom de avbrutna, i namnordning.
- **En sak per lag.** Ett lag har en försäljning, med en produkt, i taget. Säljer laget något nytt efter att den förra avslutats, eller två saker samtidigt, lägger klubben till en ny post för laget, till exempel *P2019 Bingolotter*, med egen nyckel och egen länk. Det håller ordrar, mätare och utlämningslistor isär.
- **Lager.** Har laget fått ett bestämt antal, till exempel bingolotter, skriver lagföräldern *Antal i lager*. Servern nekar då beställningar över det som finns kvar (kontrollen görs inne i låset, så att två föräldrar inte kan ta samma sista), och försäljningen visas som *Slutsåld* när allt är beställt. Avbrutna och borttagna beställningar ger tillbaka sina. Sidan visar "Det finns N kvar" och begränsar valet, och om någon hunnit före visar den hur många som verkligen finns kvar. Med ett lager behövs inget minimum (bara ett mål), och frågan om minimum döljs bland de vanliga frågorna. Tomt eller 0 betyder ingen gräns.
- **Bingolotter.** Klubben köper in bingolotter som lagen får sälja. De läggs in som vilken produkt som helst (produkt *Bingolotter*, enhet *lott/lotter*) och klubben godkänner försäljningen som vanligt, så klubben ser priset innan något säljs. Lotterna är fysiska och lämnas ut vid hämtning, så flödet är det vanliga: beställ, swisha, hämta. Verktyget håller ingen koll på lottnummer. Vilka villkor som gäller för att sälja lotterna (till exempel åldersgräns och betalning via Swish) avgörs av den klubben köper dem av, inte av verktyget: kontrollera det innan försäljningen öppnas.
- **Utlämningslänk.** Under *Översikt* kan lagföräldern skapa en länk för den som delar ut varorna (en tränare eller en annan förälder). Den ger en egen nyckel med bara en lista över namn och antal, där man bockar av *Hämtad*. Länken visas bara när den skapas. *Skapa ny länk* ersätter den gamla, *Stäng av* tar bort den.
- **Länk till beställningssidan.** Lagföräldern delar lagets egen länk (`?lag=…`) med föräldrarna på det sätt laget brukar kommunicera. Verktyget förutsätter ingen särskild kanal: alla lag har inte till exempel WhatsApp, så texterna till föräldrarna säger "hör av dig där du brukar prata med laget". Föräldrar som saknar den väljer sitt lag i listan på klubbsidan.
- **Uppdaterar du en redan körd server?** Kör `setup` igen efter att du bytt in den nya `Server.gs`. Den lägger till kolumnen *Hämtad* i fliken *Beställningar* och kolumnerna *Klubbens kommentar*, produktfälten och *Utlämningsnyckel (hash)* i fliken *Lag* utan att röra befintliga rader. Lag som redan finns behåller sin status. Ett lag som saknar produkt kan inte öppnas igen förrän lagföräldern har fyllt i den.
- **Betalningar matchas för hand.** Föräldern skriver ordernumret i Swish-meddelandet, den som tar emot pengarna matchar det mot Swish-historiken och trycker *Betald*. Automatisk matchning kräver Swish Handel med API eller en betalleverantör och finns inte här.
- **Inloggning med nyckel** är enkel och passar volontärer, men en vidarebefordrad länk ger åtkomst. Byt nyckel om den kan ha hamnat fel.
- **Ta bort en beställning.** Obetalda och avbrutna beställningar kan tas bort i fliken *Beställningar* (två tryck). Betalda och hämtade kan inte det: ångra betalningen eller hämtningen först. Raden försvinner helt, även barnets namn och mobilnummer. I fliken *Logg* sparas bara ordernummer, antal och belopp. Ordernumret används inte igen.
- **Många lag.** Klubbsidan visar kompakta rader och en sökruta när fler än sex lag säljer. Adminvyn *Alla lag* får sökruta, filter på status och hopfällbara kort. De flesta föräldrar kommer ändå direkt till sitt lag via länken (`?lag=…`) som lagföräldern delar med föräldrarna där laget brukar prata (gruppchatt, SMS eller något annat), så listan är mest en reservväg. Demon visar 23 lag.
- **Besökare läser inte kalkylarket varje gång.** Laglistan, med antal beställda per lag, sparas i serverns minne. Sidan gör ett enda anrop för att visa ett lag. Det sparade svaret uppdateras när något händer, inte på en klocka: varje ny beställning räknas upp i det direkt, och allt som ändras i adminvyn (status, pris, betald, avbruten eller borttagen beställning) rensar det direkt. Som skyddsnät, om två saker råkar hända samtidigt, räknas det om från kalkylarket efter högst 5 minuter (`CFG.CACHE_SEK`). En beställning kontrollerar alltid lagets uppgifter direkt i kalkylarket, aldrig mot det sparade svaret, så en stängd försäljning stoppas direkt. **Ändra inte direkt i fliken *Lag* eller *Beställningar* medan en försäljning pågår:** det syns för besökarna först inom 5 minuter. Använd adminvyn.
- **Dubbletter.** Varje beställning får en kod av sidan. Försöker föräldern igen med samma uppgifter efter ett svar som uteblev (men beställningen hann sparas) får hen samma kvitto, inte en ny beställning. Koden minns beställningen i 15 minuter.
- **Kvittot överlever en omladdning.** Ordernummer, belopp och antal sparas i webbläsaren i 14 dagar (inte barnets namn eller mobilnummer), så att Swish-uppgifterna finns kvar om sidan laddas om medan föräldern är i Swish-appen. *Gör en ny beställning* rensar det.
- **Namn och nummer.** Barnets namn måste börja med en bokstav men får innehålla mellanslag, bindestreck, apostrof, punkt, komma, `&`, `/` och parenteser (till exempel *Emil & Ella*). Mobilnummer skrivna `+46 (0)70 …` godtas. Bara svenska mobilnummer (07…) går att beställa med.
- **Skalning.** Apps Script och ett kalkylark räcker för en klubb med några lag och några hundra beställningar. Beställningarna skrivs en i taget (ett lås), och Apps Script tillåter 30 samtidiga körningar per användare. Hur det beter sig med 23 lag samtidigt är inte provat mot riktiga Google: kör ett lasttest innan många lag öppnar på samma gång. Blir det betydligt mer (många lag, tusentals beställningar) bör servern bytas mot en riktig databas. Sidorna pratar med servern via ett litet JSON-API, så servern kan bytas ut senare.

## Flytta P2019 hit

P2019-sidan och dess skript (`Code.gs` i [P2019-repot](https://github.com/adelborgen/eskilsminne-p2019)) fortsätter som idag tills försäljningen är klar. Därefter:

1. Lägg till P2019 i adminvyn med samma uppgifter. Produkten, enheten och belöningstexten skrivs in av lagföräldern i försäljningens uppgifter. Det finns inga färdiga produkter i `lag.js`.
2. Exportera de gamla beställningarna om de ska sparas (Order-ID och belopp följer inte med automatiskt).
3. Ersätt `index.html` i P2019-repot med en omdirigering till den här sidan (`?lag=p2019`), så att gamla länkar fortsätter fungera.

## Publicera

- **GitHub Pages:** under *Settings → Pages* välj *Deploy from a branch*, gren `main`, mapp `/ (root)`. Sidan ligger då på `https://adelborgen.github.io/eskilsminne-lagforsaljning/` och adminvyn på `…/admin.html`. Pages på ett personligt konto kräver att repot är publikt.
- **Egen domän:** ange domänen under *Settings → Pages → Custom domain* med en CNAME-post hos registratorn. Det ger också egen webbadress (ursprung), så att sidan inte delar adress med andra projektsidor under `adelborgen.github.io`.
- **Gärna under en GitHub-organisation** för klubben, så att repot inte hänger på ett privat konto.

## Beslut hittills (oktober 2026)

Tagna efter genomgången av designbriefen:

1. **Bara Eskilsminne IF.** Designen delas i lager (plattform, förening, grupp, försäljning) så att den går att bygga ut, men vi bygger inte plattformsadmin, temaeditor eller fler föreningstyper. En dialekt: Matchdag.
2. **Ingen förifylld Swish.** Föräldern kopierar nummer, belopp och meddelande. Appen försöker inte öppna Swish. (Redan så i prototypen.)
3. **Swish-meddelandet innehåller bara ordernumret**, inte barnets namn. (Redan så i prototypen.) Lagföräldern slår upp namnet i adminvyn.
4. **Mätarens "till lagkassan" märks "beräknat"**, eftersom pengarna inte är inne förrän de är swishade. Gjort i prototypen.
5. **Typsnitten ligger i repot** (`fonts/`: Archivo och Atkinson Hyperlegible Next) och laddas inte från Google. De används nu i hela appen.
6. **Namnet är inte bestämt.** "Lagförsäljning" är ett arbetsnamn. Kontrollera domän och varumärke innan lansering.

Det som designbriefen beskriver och som ännu inte finns i prototypen: flera försäljningar per grupp (idag en produkt per försäljning och en försäljning per lag), start- och slutdatum, kvittosida som tål omladdning, ordernummer med lagkod (P14-037), ångra-fönster på 8 sekunder och rensa-knapp per lag.

Utseendet (Matchdag) är byggt: blå bakgrund med ränder, vimplar, klubbmärket med gul kant, krämfärgade kort (aldrig vitt), gula lagbrickor och Archivo/Atkinson. Alla text- och färgpar har minst 5,8:1 i kontrast. Färger, bilder och typsnitt är desamma för alla lag, eftersom klubben äger utseendet. Inga bilder på barn.

## Att bestämma innan ni går live

1. **Namn.** "Lagförsäljning" är ett arbetsnamn. Välj ett namn som inte krockar med någon annan tjänst (kolla domän och varumärke).
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
