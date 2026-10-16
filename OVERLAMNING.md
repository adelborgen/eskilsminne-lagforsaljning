# Överlämning

Läs den här filen först när arbetet fortsätter i en ny session. Senast uppdaterad 16 oktober 2026, kväll.

## Vad det här är

**Skramlat** (skramlat.se) är en enkel tjänst för lagförsäljning i föreningar och skolor. Föräldrar beställer i mobilen och swishar direkt till laget eller skolan. Pengarna går aldrig via Skramlat. Lagföräldern lägger upp försäljningen, klubben eller skolan godkänner, och lagföräldern bockar av betalt och hämtat.

- Sidorna är statiska filer på GitHub Pages. Servern är en Google Apps Script (`Server.gs`) med ett kalkylark per kund, på kundens eget Google-konto.
- Varje kund har en egen mapp: `eskilsminne/` är den första. README.md beskriver installation, roller, säkerhet och tester.
- Ägaren är Andreas (adelborgen), förälder i P2019 i Eskilsminne IF. Skramlat ägs privat tills vidare.

## Live på skramlat.se

| Adress | Vad |
|---|---|
| `skramlat.se` | Framsidan (`index.html`): loggan, tre steg, Tryggt för alla, kunder, länkar. Har fortfarande `noindex`, fråga om den ska bort. |
| `skramlat.se/pris/` | Gratis, Bas, Plus. Bas och Plus: "Kontakta oss för pris", gratis för pilotklubbar under pilotåret. |
| `skramlat.se/guider/` | Fyra guider med källor: lotter, förenings-Swish eller privat, vem som ansvarar för pengarna, hur länge uppgifter sparas. |
| `skramlat.se/eskilsminne/` | Eskilsminnes sida. **Visar demo**: `endpoint` i `eskilsminne/lag.js` är tom. |

Gamla länkar med `?lag=` skickas vidare till `eskilsminne/`.

## Domän, DNS och e-post

- **skramlat.se** köpt hos Loopia (förnyas 2027-10-16; slå på automatisk förnyelse). Namnservrarna pekar på **Cloudflare** (gratis).
- Hos Cloudflare: fyra A-poster till GitHub (185.199.108–111.153) och CNAME `www` → `adelborgen.github.io`, alla **DNS only** (grått moln). TXT-post för GitHubs domänverifiering.
- GitHub Pages: DNS-kontrollen är grön. **Att göra:** kryssa i *Enforce HTTPS*, och verifiera domänen på github.com/settings/pages (TXT-posten fanns men GitHub hade inte sett den än).
- **hej@skramlat.se** vidarebefordras till ägarens Gmail med Cloudflare Email Routing. Inte testad än.

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

Inför Sally Bauerskolorna, andra kunden:
- **Utseende per kund:** mörk färg, ljus färg och märke. Kontrastkontroll: ljus färg under 4,5 : 1 mot svart text byts mot krämvitt.
- **Ord per kund:** förening (lag, lagförälder, klubb) eller skola (klass, klassförälder, skola).
- **Lagbrickan:** P över 2019 för lag, 6B eller ÅK över 9 för klasser.
- **Swish per kund:** varje lag eget nummer (Eskilsminne) eller ett låst nummer för alla (Sally Bauer). Kunden bestämmer.
- **Sally Bauer:** skolans administratör bockar av betalningar och behöver en samlad lista över obetalda i alla klasser. Färger marinblå `#1d345f` och vit. Loggan godkänd att använda.
- **Rutan "Kräver 18 år"** per försäljning, för lotter (Folkspels villkor). Behövs innan Bingolotterna säljs.
- **Prismodell:** Gratis (1–3 försäljningar samtidigt), Bas (10, egna färger), Plus (20, support). Pris per år. Eskilsminne och Sally Bauer är kundcase: gratis till och med våren 2028.
- **Villkor:** kunden ansvarar för att försäljningen följer reglerna. Skramlat är verktyget.

## Nästa steg, i ordning

1. HTTPS och domänverifiering hos GitHub. Testa hej@skramlat.se.
2. Installera `Server.gs` för Eskilsminne på ett Google-konto och lägg in `/exec`-adressen i `eskilsminne/lag.js`. Provkör i riktiga Google. Då kan **Bingolotter P2019 och P2014** starta.
3. Rutan "Kräver 18 år". Fråga vilket Swish-nummer bingolotterna ska ha (klubbens?).
4. Bygga det som är beslutat för Sally Bauer. Kolla först att skolan kan köra Google Apps Script.
5. Integritetspolicy och villkor.
6. Rutin för att uppdatera `Server.gs` hos flera kunder, och tester som körs innan publicering.

## Säkerhet och tester

`npm test` (servertester och 23 attacktester), `npm run test:mutera` (19 bevis för att testerna biter), `npm run test:xss` (XSS i webbläsare). Se README.md.

## Arbetssätt

- Fråga innan något nytt byggs. Ändra aldrig i P2019-repot (chokladförsäljningen).
- Utkast läggs på en egen gren och publiceras först när ägaren säger till.
- Skriv på svenska, i vardaglig ton. Nycklar och adminlänkar skickas aldrig i chattar och läggs aldrig i repot.
