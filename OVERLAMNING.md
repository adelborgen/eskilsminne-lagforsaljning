# Överlämning

Läs den här filen först när arbetet fortsätter i en ny session. Senast uppdaterad 17 oktober 2026.

## Vad det här är

**Skramlat** (skramlat.se) är en enkel tjänst för lagförsäljning i föreningar och skolor. Föräldrar beställer i mobilen och swishar direkt till laget eller skolan. Pengarna går aldrig via Skramlat. Lagföräldern lägger upp försäljningen och skickar den till klubben eller skolan, som godkänner (då öppnar den). Lagföräldern avslutar och öppnar igen, bockar av betalt och hämtat, och ändringar efter godkännandet granskas av klubben igen. När försäljningen är avslutad skickar lagföräldern pengarna till klubbens bankgiro och klubben kvitterar. Klubben får mejl när något väntar på den. Se *Rollerna efter genomgången med ägaren* och *Notiser, pengarna och utlämningen* i planen.

- Sidorna är statiska filer. Idag ligger de på GitHub Pages och visar demo.
- **Servern är byggd för Cloudflare** (en Worker med statiska filer och databasen D1, EU-jurisdiktion), en gemensam server för alla klubbar, så att en klubb kan onboarda sig själv utan Google. Den gamla Apps Script-servern (`Server.gs`) används inte längre och tas bort när Eskilsminne har flyttat. **Inget är uppsatt hos Cloudflare, och ingenting är köpt.**
- Varje kund har idag en egen mapp: `eskilsminne/` är den första. README.md beskriver roller, säkerhet, uppsättning och tester. **PLAN-gemensam-server.md** är planen och beslutsunderlaget (fyra faser, kostnader, lagring i EU, vem som får skapa en klubb, att börja utan bolag).
- Ägaren är Andreas (adelborgen), förälder i P2019 i Eskilsminne IF. Skramlat ägs privat tills vidare, utan bolag.

## Läge

Fas 1 i planen är byggd, testad lokalt och ligger på `main` (publiceras hos Cloudflare på skramlat.adelborg.workers.dev). Rollerna ändrades 17 oktober 2026 efter en genomgång med ägaren. Se *Läge efter Fas 1* längst ned i planen: vad som är gjort, vad testerna hittade, och vad som bara går att visa hos Cloudflare. De lokala testerna kostar ingenting och körs mot en riktig D1 på datorn.

## Live på skramlat.se

| Adress | Vad |
|---|---|
| `skramlat.se` | Framsidan (`index.html`): loggan, tre steg, Tryggt för alla, kunder, länkar. Har fortfarande `noindex`, fråga om den ska bort. |
| `skramlat.se/pris/` | Gratis, Bas, Plus. Bas och Plus: "Kontakta oss för pris", gratis för pilotklubbar under pilotåret. |
| `skramlat.se/demo/` | Demosidan (Skramlats färger): förälderns och lagförälderns vy för ett påhittat lag, utan inloggning. Länkad från framsidan. Publicerad 17 oktober 2026. |
| `skramlat.se/kom-igang/` | Formulär för förfrågningar från klubbar och skolor. Servern mejlar dem till ägaren (hemligheten `FORFRAGAN_TILL` hos Cloudflare, inlagd av ägaren 17 oktober 2026) och sparar inget i databasen. |
| `skramlat.se/om/` | Om Skramlat: varför det finns, vad vi lovar, vem som står bakom (Andreas Adelborg, med ägarens ok). Räknaren (17 340 kr swishat) finns här och på framsidan och uppdateras för hand i båda filerna. |
| `skramlat.se/guider/` | Fyra guider med källor: lotter, förenings-Swish eller privat, vem som ansvarar för pengarna, hur länge uppgifter sparas. |
| `skramlat.adelborg.workers.dev` | Cloudflare-versionen (Worker och D1), byggs automatiskt från `main`. `/api?action=version` visar serverns version. Databasen är tom. |
| `skramlat.se/eskilsminne/` | Eskilsminnes sida. **Visar demo**: `endpoint` i `eskilsminne/lag.js` är tom. Sätts till `/api` först när Cloudflare-versionen är uppsatt. |

Gamla länkar med `?lag=` skickas vidare till `eskilsminne/`.

## Domän, DNS och e-post

- **skramlat.se** köpt hos Loopia (förnyas 2027-10-16; slå på automatisk förnyelse). Namnservrarna pekar på **Cloudflare** (gratis).
- Hos Cloudflare: fyra A-poster till GitHub (185.199.108–111.153) och CNAME `www` → `adelborgen.github.io`, alla **DNS only** (grått moln). TXT-post för GitHubs domänverifiering.
- GitHub Pages: DNS-kontrollen är grön. **Att göra:** kryssa i *Enforce HTTPS*, och verifiera domänen på github.com/settings/pages (TXT-posten fanns men GitHub hade inte sett den än).
- **hej@skramlat.se** vidarebefordras till ägarens Gmail med Cloudflare Email Routing. Inte testad än. Utgående e-post (inloggningslänkar) kräver Cloudflares e-posttjänst (beta) och Workers Paid.

## Varumärket

- **Brand-manual / designsystem:** https://claude.ai/artifact/TPCYXxUVyUBVnhxuszmFeh (Design System-artefakten "Skramlat").
- **Färger:** grafit `#16191d`, krämvit `#fff8d6`, mint `#6fe3b4`, mörk mint `#1c8a5f` (grafik på ljust), mint-text `#187a54`. Aldrig vit bakgrund.
- **Typsnitt:** Archivo (rubriker, siffror) och Atkinson Hyperlegible Next (text). Ligger i `fonts/`.
- **Logga:** genomskinlig insamlingsbössa med mynt. Filer i `logga/` (används av sidorna) och `material/logga/` (alla varianter, PNG, rörliga SVG, `gen.py` som ritar dem).
- **Ton:** du-form, vardagligt, rollnamn (förälder, lagförälder, klubbens administratör), inga kanaler i texten, inga bilder på barn, inga stockbilder.

## Marknadsföring

- **Inlägg för sociala medier:** https://claude.ai/artifact/6UV22ao2tioSKLjTRo4RCy (Design-arbetsyta). 17 inlägg plus en karusell. Inlägg 13 har platshållaren [Ditt förnamn].
- **Filmer** i `material/film/`: rörlig logga (10 s, kvadrat), "Så funkar det" (20 s, stående), "Före och efter" (15 s, stående). HTML-filerna bredvid är källorna. De läser typsnitten från `/home/user/eskilsminne-lagforsaljning/fonts/` och renderas bild för bild med Playwright (`rendera.cjs`) och ffmpeg.
- Ägarens egen skärminspelning av riktiga Swish-betalningar ska **aldrig** användas: riktiga namn.

## Google Drive (ägarens konto, mappen "Skramlat")

- *Skramlat – beslut och läge*
- *Skramlat – prismodell och kundcase (förslag)*
- *Skramlat – guider om lagförsäljning (utkast 2)*
- *Skramlat – attacktester 16 oktober 2026*
- Undermapparna *Logga* och *Kunder* (*Eskilsminne IF*, *Sally Bauerskolorna*).

## Beslutat, inte byggt

Från planen (se PLAN-gemensam-server.md, *Beslut som är tagna*): Cloudflare, ingen mellanlösning med Apps Script, radering 60 dagar efter avslutad försäljning, Skramlat godkänner varje ny klubb under piloten (klubben kan sätta upp allt medan den väntar), start som privatperson under piloten och enskild firma före första betalande kund. Bingolotter och rutan "Kräver 18 år" är struket tills vidare.

Inför Sally Bauerskolorna, andra kunden:
- **Utseende per kund:** två färger (mörk och ljus) och ett märke som klubben väljer i adminvyn, utan att ändra CSS. Kontrollkrav: ljus färg under 4,5 : 1 mot svart text byts mot krämvitt.
- **Ord per kund:** förening (lag, lagförälder, klubb) eller skola (klass, klassförälder, skola).
- **Lagbrickan:** P över 2019 för lag, 6B eller ÅK över 9 för klasser.
- **Swish per kund:** varje lag eget nummer (Eskilsminne) eller ett låst nummer för alla (Sally Bauer). Kunden bestämmer.
- **Sally Bauer:** skolans administratör bockar av betalningar och behöver en samlad lista över obetalda i alla klasser. Färger marinblå `#1d345f` och vit. Loggan godkänd att använda. Skolor kräver ofta organisationsnummer för att få godkänna en leverantör.
- **Prismodell:** Gratis (1–3 försäljningar samtidigt), Bas (10, egna färger), Plus (20, support). Pris per år. Eskilsminne och Sally Bauer är kundcase: gratis till och med våren 2028.
- **Villkor:** kunden ansvarar för att försäljningen följer reglerna. Skramlat är verktyget.

## Nästa steg, i ordning

1. **Cloudflare:** kontot finns (gratisnivån), och D1-databasen `skramlat` är skapad med **jurisdiktion EU** (kontrollerat för hand i panelen 17 oktober 2026, id:t i `wrangler.toml`). Workern `skramlat` är kopplad till GitHub och byggs från `main`, och den lägger in tabellerna själv vid första anropet. Inloggningsmejl går utan Workers Paid bara till verifierade mottagare i Email Routing (ägarens Gmail), vilket räcker för test. **Provat 17 oktober 2026:** testklubben `eskilsminne` (*Eskilsminne IF (test)*, ägaren som administratör) är inlagd, och ägaren loggade in via mejlad länk. Töm testklubbens uppgifter innan klubben används på riktigt. Kvar: e-post till andra adresser (Workers Paid och Email Service), första klubben, och Workers Paid (5 $ i månaden) innan inloggningsmejlen ska skickas på riktigt. En andra person ska ha åtkomst. Se README, *Sätt upp Cloudflare*.
2. **Frågor till Cloudflare** (se planen): stannar D1:s Time Travel inom jurisdiktionen? Var lagrar e-posttjänsten meddelanden? Var finns biträdesavtalet, underbiträdeslistan och överföringsmekanismen? Verifiera fältnamnen i `server/epost.js` mot deras dokumentation.
3. **Lasttest och kontroll av jurisdiktionen** mot en testdatabas (`scripts/lasttest.js`, `scripts/kontrollera-eu.js`).
4. **Eskilsminne:** styrelsens skriftliga ok och en administratör i klubben (inte ägaren), sedan första klubben i databasen och `endpoint: "/api"`.
5. **Fas 3:** biträdesavtal (granskat av någon som kan), integritetspolicy, automatisk radering efter 60 dagar (kräver `[triggers]` i `wrangler.toml` och en ändring av vaktprovet `test/eu.test.js`), rutin för incidenter, säkerhetskopior, en andra person med åtkomst.
6. **Fas 2:** ansökan på `skramlat.se/kom-igang`, ägarens godkännande, utseende (färger och märke), `skramlat.se/<klubb>`, flytt av domänen från GitHub Pages till Cloudflare, e-post från skramlat.se.
7. HTTPS och domänverifiering hos GitHub så länge sidorna ligger där (17 oktober 2026: ägaren väntar på att GitHub skapar certifikatet, upp till ett dygn, och kryssar sedan i *Enforce HTTPS*). Testa hej@skramlat.se.
8. **Prova formuläret på kom-igang hos riktiga Cloudflare.** Första försöket gav "Det gick inte att nå servern", troligen för att sidan låg på http:// eller att servern inte hunnit uppdateras. Servern tillåter nu http://skramlat.se och visar det riktiga felet (version `2026-10-17-forfragan-2`). Hemligheten `FORFRAGAN_TILL` är inlagd enligt ägaren, men inte bekräftad med ett mejl.

## Säkerhet och tester

`npm test` (api, inloggning, attacker och vaktprov för EU-reglerna), `npm run test:mutera` (bevis för att testerna biter, långsamt), `npm run test:xss` (XSS i webbläsare), `npm run test:gammal` (den gamla Apps Script-servern). Se README.md. Alla körs lokalt och kostar ingenting.

## Arbetssätt

- Fråga innan något nytt byggs. Ändra aldrig i P2019-repot (chokladförsäljningen).
- Utkast läggs på en egen gren och publiceras först när ägaren säger till. **Allt som pushas till `main` publiceras både på skramlat.se (GitHub Pages) och hos Cloudflare.**
- **Kör få tester.** Ägaren tycker att täta testkörningar är överdrivet nu, eftersom inget är köpt hos Cloudflare. Kör bara det som täcker det som ändrats, en gång när ett arbete är klart, och mutationstestet bara före lansering.
- Skriv på svenska, i vardaglig ton. Nycklar, adminlänkar och e-postadresser skickas aldrig i chattar och läggs aldrig i repot.
