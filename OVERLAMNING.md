# Överlämning

Läs den här filen först när arbetet fortsätter i en ny session. Senast uppdaterad 16 oktober 2026.

## Vad det här är

**Skramlat** (skramlat.se) är en enkel sida för lagförsäljning. Föräldrar beställer i mobilen och swishar direkt till laget eller skolan, och pengarna går aldrig via Skramlat. Lagföräldern lägger upp försäljningen, klubben eller skolan godkänner, och lagföräldern bockar av betalt och hämtat.

- Sidorna är statiska filer på GitHub Pages. Servern är en Google Apps Script (`Server.gs`) med ett kalkylark per kund.
- Varje kund har en egen mapp: `eskilsminne/` är den första. Framsidan i roten listar kunderna.
- README.md beskriver installation, roller, säkerhet och tester i detalj.

## Läget nu

- **Domänen** skramlat.se är köpt hos Loopia. DNS ligger hos Cloudflare med GitHub Pages-posterna som "DNS only". Repot har en `CNAME`-fil. HTTPS slås på i repots Pages-inställningar när GitHub har godkänt domänen.
- **Ingen kund är i skarp drift än.** `endpoint` i `eskilsminne/lag.js` är tom, så sidorna visar demo. Nästa steg för Eskilsminne är att installera `Server.gs` på ett Google-konto och lägga in `/exec`-adressen. Då kan Bingolotter P2019 och P2014 starta.
- **Chokladförsäljningen P2019** ligger kvar på den gamla sidan i ett annat repo, och ska inte röras härifrån.
- **Säkerhet:** 23 attacker, 19 bevis för att de biter och XSS-test i webbläsare. Se avsnittet Tester i README.md.

## Beslutat, inte byggt

Inför Sally Bauerskolorna, den andra kunden:

- **Utseende per kund:** Skramlats neutrala grund (grafit #16191d, krämvit #fff8d6, mint #6fe3b4). Varje kund väljer en mörk färg, en ljus färg och sitt märke. Korten är alltid krämfärgade. En kontrastkontroll byter den ljusa färgen mot krämvitt om texten på den blir sämre än 4,5 : 1.
- **Ord per kund:** förening (lag, lagförälder, klubb) eller skola (klass, klassförälder, skola).
- **Lagbrickan:** P över 2019 för lag. 6B, eller ÅK över 9, för klasser.
- **Sally Bauer:** ett gemensamt, låst Swish-nummer för hela skolan. Skolans administratör bockar av betalningar, och behöver en samlad lista över obetalda beställningar i alla klasser. Färger: marinblå #1d345f och vit.
- **Logga:** genomskinlig insamlingsbössa med mynt.

## Nästa steg, i ordning

1. HTTPS och domänverifiering hos GitHub.
2. Installera servern för Eskilsminne, och provkör i riktiga Google. Ett lasttest hör hit.
3. Bygga det som är beslutat för Sally Bauer. Kolla först att skolan kan köra Google Apps Script.
4. Integritetspolicy, villkor och gallring efter säsongen.
5. En rutin för att uppdatera `Server.gs` hos flera kunder (versionen står överst i filen).
6. Testerna körs automatiskt innan sidan publiceras.

## Var saker finns

- **Kod och tester:** det här repot.
- **Logga, skisser och beslutsdokument:** mappen *Skramlat* i ägarens Google Drive.

## Arbetssätt

- Fråga innan något nytt byggs. Ändra aldrig i P2019-repot.
- Skriv på svenska, i en vardaglig ton. Använd rollnamn (förälder, lagförälder, klubbens administratör), aldrig påhittade personer. Ingen vit bakgrund, och inga bilder på barn.
- Nycklar och adminlänkar skickas aldrig i chattar och läggs aldrig i repot.
