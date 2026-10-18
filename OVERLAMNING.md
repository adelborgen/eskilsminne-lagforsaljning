# Överlämning

Läs den här filen först när arbetet fortsätter i en ny session. Senast uppdaterad 17 oktober 2026.

## Vad det här är

**Skramlat** (skramlat.se) är en enkel tjänst för lagförsäljning i föreningar och skolor. Föräldrar beställer i mobilen och swishar direkt till laget eller skolan. Pengarna går aldrig via Skramlat. Lagföräldern lägger upp försäljningen och skickar den till klubben eller skolan, som godkänner (då öppnar den). Lagföräldern avslutar och öppnar igen, bockar av betalt och hämtat, och ändringar efter godkännandet granskas av klubben igen. När försäljningen är avslutad skickar lagföräldern pengarna till klubbens bankgiro och klubben kvitterar. Klubben får mejl när något väntar på den. Se *Rollerna efter genomgången med ägaren* och *Notiser, pengarna och utlämningen* i planen.

- Sidorna är statiska filer i samma Worker som servern hos Cloudflare, på skramlat.se sedan 18 oktober 2026. Eskilsminnes sida visar demo på skramlat.se.
- **Servern är byggd för Cloudflare** (en Worker med statiska filer och databasen D1, EU-jurisdiktion), en gemensam server för alla klubbar, så att en klubb kan onboarda sig själv utan Google. Den gamla Apps Script-servern (`Server.gs`) används inte längre och tas bort när Eskilsminne har flyttat. Cloudflare är uppsatt på gratisnivån, och ingenting är köpt.
- Varje kund har idag en egen mapp: `eskilsminne/` är den första. README.md beskriver roller, säkerhet, uppsättning och tester. **PLAN-gemensam-server.md** är planen och beslutsunderlaget (fyra faser, kostnader, lagring i EU, vem som får skapa en klubb, att börja utan bolag).
- Ägaren är Andreas (adelborgen), förälder i P2019 i Eskilsminne IF. Skramlat ägs privat tills vidare, utan bolag.

## Läge

Fas 1 i planen är byggd, testad lokalt och ligger på `main` (publiceras hos Cloudflare på skramlat.se och skramlat.adelborg.workers.dev). Rollerna ändrades 17 oktober 2026 efter en genomgång med ägaren. Se *Läge efter Fas 1* längst ned i planen: vad som är gjort, vad testerna hittade, och vad som bara går att visa hos Cloudflare. De lokala testerna kostar ingenting och körs mot en riktig D1 på datorn.

## Live på skramlat.se

| Adress | Vad |
|---|---|
| `skramlat.se` | Framsidan (`index.html`): loggan, tre steg, Tryggt för alla, kunder, länkar. Syns i Google sedan 18 oktober 2026 (ägarens val: `noindex` borttaget, Eskilsminne märkt *pilotklubb*). `eskilsminne/` har kvar `noindex`. |
| `skramlat.se/pris/` | Gratis, Bas 999 kr och Plus 1 999 kr per år exklusive moms, gratis för pilotklubbar under pilotåret. |
| `skramlat.se/demo/` | Demosidan (Skramlats färger): förälderns och lagförälderns vy för ett påhittat lag, utan inloggning. Länkad från framsidan. Publicerad 17 oktober 2026. |
| `skramlat.se/kom-igang/` | Formulär för förfrågningar från klubbar och skolor. Servern mejlar dem till ägaren (hemligheten `FORFRAGAN_TILL` hos Cloudflare, inlagd av ägaren 17 oktober 2026) och sparar inget i databasen. |
| `skramlat.se/om/` | Om Skramlat: varför det finns, vad vi lovar, vem som står bakom (Andreas Adelborg, med ägarens ok). Räknaren (17 340 kr swishat) finns här och på framsidan och uppdateras för hand i båda filerna. |
| `skramlat.se/guider/` | Fyra guider med källor: lotter, förenings-Swish eller privat, vem som ansvarar för pengarna, hur länge uppgifter sparas. |
| `skramlat.adelborg.workers.dev` | Cloudflare-versionen (Worker och D1), byggs automatiskt från `main`. `/api?action=version` visar serverns version. Databasen är tom. |
| `skramlat.se/eskilsminne/` | Eskilsminnes sida. **Visar demo**: `endpoint` i `eskilsminne/lag.js` är tom. Sätts till `/api` när Eskilsminne går live (se *Nästa steg*, punkt 4). |

Gamla länkar med `?lag=` skickas vidare till `eskilsminne/`.

## Domän, DNS och e-post

- **skramlat.se** köpt hos Loopia (förnyas 2027-10-16; slå på automatisk förnyelse). Namnservrarna pekar på **Cloudflare** (gratis).
- Hos Cloudflare: `skramlat.se` och `www.skramlat.se` är *Custom domains* på Workern `skramlat` (lagda av ägaren 18 oktober 2026), så Cloudflare serverar sidorna med https. TXT-posten för GitHubs domänverifiering är kvar med flit: den hindrar att någon annan kopplar domänen till GitHub Pages. *Always Use HTTPS* är påslaget (ägaren, 18 oktober 2026).
- GitHub Pages: avstängt av ägaren 18 oktober 2026. `CNAME`-filen är borttagen.
- **hej@skramlat.se** vidarebefordras till ägarens Gmail med Cloudflare Email Routing. Inte testad än. Utgående e-post (inloggningslänkar) kräver Cloudflares e-posttjänst (beta) och Workers Paid.

## Varumärket

- **Brand-manual / designsystem:** https://claude.ai/artifact/TPCYXxUVyUBVnhxuszmFeh (Design System-artefakten "Skramlat").
- **Färger:** grafit `#16191d`, krämvit `#fff8d6`, mint `#6fe3b4`, mörk mint `#1c8a5f` (grafik på ljust), mint-text `#187a54`. Aldrig vit bakgrund.
- **Typsnitt:** Archivo (rubriker, siffror) och Atkinson Hyperlegible Next (text). Ligger i `fonts/`.
- **Logga:** genomskinlig insamlingsbössa med mynt. Filer i `logga/` (används av sidorna) och `material/logga/` (alla varianter, PNG, rörliga SVG, `gen.py` som ritar dem).
- **Ton:** du-form, vardagligt, rollnamn (förälder, lagförälder, klubbens administratör), inga kanaler i texten, inga bilder på barn, inga stockbilder.

## Utkast till juridiska dokument (17 oktober 2026, inte granskade)

Claude-dokument som någon som kan dataskydd ska granska innan de används. Det som inte är byggt eller bekräftat är markerat **[Kontrollera]**, och varje dokument slutar med öppna frågor.
- Integritetspolicy: https://claude.ai/code/artifact/5e5cce04-e008-4fb9-89c3-2e62c67f7c97
- Personuppgiftsbiträdesavtal: https://claude.ai/code/artifact/2967a9b2-5762-44dc-8f5f-a76a7a0190a4
- Villkor för klubbar och skolor: https://claude.ai/code/artifact/798b808b-b642-4e81-a444-d8cd7687856f

Granskare är inte utsedd. Automatisk radering efter 60 dagar måste byggas innan dokumenten används. Den byggs när Eskilsminne har sagt ja (ägarens val).

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
- **Prismodell:** Gratis (1 försäljning åt gången), Bas (3 samtidigt, egna färger), Plus (upp till 10, support; fler efter kontakt). Pris per år. Eskilsminne och Sally Bauer är kundcase: gratis till och med våren 2028.
- **Villkor:** kunden ansvarar för att försäljningen följer reglerna. Skramlat är verktyget.

## Nästa steg, i ordning

1. **Cloudflare:** kontot finns (gratisnivån), och D1-databasen `skramlat` är skapad med **jurisdiktion EU** (kontrollerat för hand i panelen 17 oktober 2026, id:t i `wrangler.toml`). Workern `skramlat` är kopplad till GitHub och byggs från `main`, och den lägger in tabellerna själv vid första anropet. Inloggningsmejl går utan Workers Paid bara till verifierade mottagare i Email Routing (ägarens Gmail), vilket räcker för test. **Provat 17 oktober 2026:** testklubben `eskilsminne` (*Eskilsminne IF (test)*, ägaren som administratör) är inlagd, och ägaren loggade in via mejlad länk. Töm testklubbens uppgifter innan klubben används på riktigt. Kvar: e-post till andra adresser (Workers Paid och Email Service), första klubben, och Workers Paid (5 $ i månaden) innan inloggningsmejlen ska skickas på riktigt. En reserv i familjen ska ha åtkomst. Se README, *Sätt upp Cloudflare*.
2. **Frågor till Cloudflare** (se planen): stannar D1:s Time Travel inom jurisdiktionen? Var lagrar e-posttjänsten meddelanden? Var finns biträdesavtalet, underbiträdeslistan och överföringsmekanismen? Verifiera fältnamnen i `server/epost.js` mot deras dokumentation.
3. **Lasttest och kontroll av jurisdiktionen** mot en testdatabas (`scripts/lasttest.js`, `scripts/kontrollera-eu.js`).
4. **Eskilsminne (nästa steg enligt ägaren, 17 oktober 2026):** styrelsens skriftliga ok och en administratör i klubben (inte ägaren). Ägaren frågar klubben. Ingen startdag bestämd. Sedan: töm testklubben, Workers Paid, och växla både `SIDA_ORIGIN` i `wrangler.toml` och `endpoint` i `eskilsminne/lag.js` till skramlat.se samtidigt. Fram till dess visar skramlat.se/eskilsminne/ demo och allt riktigt provas på workers.dev. Integritetspolicy, biträdesavtal och villkor skrivs som utkast som granskas av någon som kan juridik, och automatisk radering efter 60 dagar behöver finnas innan start (byggs när klubben har sagt ja).
5. **Fas 3:** biträdesavtal (granskat av någon som kan), integritetspolicy, automatisk radering efter 60 dagar (kräver `[triggers]` i `wrangler.toml` och en ändring av vaktprovet `test/eu.test.js`), rutin för incidenter, säkerhetskopior, en reserv i familjen med åtkomst (med tystnadsplikt och en kort instruktion om ägaren inte nås).
6. **Domänen till Cloudflare: klar 18 oktober 2026.** skramlat.se och www är Custom domains på Workern, GitHub Pages är avstängt, `CNAME`-filen borttagen och *Always Use HTTPS* påslaget.
7. **Fas 2:** ansökan på `skramlat.se/kom-igang`, ägarens godkännande, utseende (färger och märke), `skramlat.se/<klubb>`, e-post från skramlat.se.
8. Testa hej@skramlat.se.
9. **Formuläret på kom-igang fungerar hos riktiga Cloudflare:** ägaren skickade en förfrågan på skramlat.se 18 oktober 2026 och mejlet kom fram (hemligheten `FORFRAGAN_TILL` är alltså rätt inlagd).

## Säkerhet och tester

`npm test` (api, inloggning, attacker och vaktprov för EU-reglerna), `npm run test:mutera` (bevis för att testerna biter, långsamt), `npm run test:xss` (XSS i webbläsare), `npm run test:gammal` (den gamla Apps Script-servern). Se README.md. Alla körs lokalt och kostar ingenting.

## Arbetssätt

- Fråga innan något nytt byggs. Ändra aldrig i P2019-repot (chokladförsäljningen).
- Utkast läggs på en egen gren och publiceras först när ägaren säger till. **Allt som pushas till `main` publiceras direkt på skramlat.se (Cloudflare).**
- **Kör få tester.** Ägaren tycker att täta testkörningar är överdrivet nu, eftersom inget är köpt hos Cloudflare. Kör bara det som täcker det som ändrats, en gång när ett arbete är klart, och mutationstestet bara före lansering.
- Skriv på svenska, i vardaglig ton. Nycklar, adminlänkar och e-postadresser skickas aldrig i chattar och läggs aldrig i repot.
