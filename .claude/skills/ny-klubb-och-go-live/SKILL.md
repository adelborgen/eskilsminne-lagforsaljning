---
name: ny-klubb-och-go-live
description: Checklistan för att lägga in en ny klubb eller skola i Skramlat och för att gå live på riktigt, först med Eskilsminne IF. Använd den när ägaren säger att en klubb har tackat ja eller nämner styrelsens ok, en ny administratör, att gå live, att sluta visa demo, Workers Paid, SIDA_ORIGIN, endpoint i lag.js, testklubben eller att Eskilsminne ska börja använda Skramlat, även om ordet go-live inte används.
---

# Ny klubb och go-live

Klubben är grunden för allt annat. Klubbens administratör godkänner försäljningarna och därmed vilket Swish-nummer föräldrarna betalar till. En falsk administratör kan godkänna sin egen försäljning med sitt eget nummer. Därför kontrolleras klubben enligt en fast rutin, och inget når föräldrarna förrän kontrollen är klar.

Det mesta här kräver ägarens Cloudflare-konto. Har sessionen inte tillgång till det, ge ägaren kommandona eller visa var det görs i panelen (D1 → skramlat → Console). E-postadresser skrivs bara in av ägaren själv och skickas aldrig i chatten.

## 1. Kontrollera klubben (ägaren gör det)

- Kontakta klubben via en uppgift från klubbens egen webbplats eller ett offentligt register, aldrig via uppgifterna i förfrågan.
- Styrelsen, ordföranden eller kassören bekräftar skriftligt att klubben vill använda Skramlat och vem som är administratör. Ett mejl räcker.
- Administratören ska vara en person i klubben, helst med en klubbadress, och aldrig ägaren. Lägg in en andra administratör från start.
- Villkoren och biträdesavtalet godkänns av någon som får teckna föreningen. Utkasten (länkarna finns i `OVERLAMNING.md`) ska vara granskade innan de används.

## 2. Lägg in klubben

Kör från repots rot. Ägaren skriver in adressen själv:

```
node scripts/ny-klubb.js --slug <slug> --namn "<Klubbens namn>" --epost <administratörens adress> > ny-klubb.sql
npx wrangler d1 execute skramlat --remote --file ny-klubb.sql
rm ny-klubb.sql
```

- Adressen hamnar bara i databasen. Den läggs aldrig i en fil i repot.
- En andra administratör läggs in med SQL:
  `INSERT INTO klubb_admin (klubb_id, epost, skapad) SELECT id, '<adress>', '<ISO-tid>' FROM klubb WHERE slug = '<slug>';`
- Klubbens sida: i Fas 1 har varje klubb en egen mapp, till exempel `eskilsminne/`. Där står namn, färger, märke och vanliga frågor i `lag.js`.
  - För en ny klubb, kopiera mappen och sätt `slug` i `lag.js` till klubbens slug.
  - Lägg till mappen i `MED` i `scripts/bygg.js`.
  - Publicera enligt skillen `utkast-och-publicering`.
  - En gemensam klubbsida på `skramlat.se/<klubb>/` hör till Fas 2 och är inte byggd.

## 3. Gå live, först med Eskilsminne

### Det här måste vara klart innan

- [ ] Styrelsens skriftliga ok och klubbens administratör (punkt 1).
- [ ] De juridiska utkasten är granskade, och klubben har godkänt biträdesavtalet.
- [ ] Automatisk radering 60 dagar efter avslutad försäljning är byggd. Ägaren har valt att den byggs när klubben har sagt ja. Den kräver `[triggers]` i `wrangler.toml` och en ändring i vaktprovet `test/eu.test.js`, som förbjuder triggers idag.
- [ ] Workers Paid (5 $ i månaden) och Cloudflares e-posttjänst (`npx wrangler email sending enable skramlat.se`). Utan dem kommer inloggningsmejlen bara fram till verifierade adresser.

### Steg

1. **Töm testklubben `eskilsminne`** (*Eskilsminne IF (test)*, med ägaren som administratör).
   - Beställningarna måste tas bort före lagen, eftersom databasen annars stoppar borttagningen (`ON DELETE RESTRICT`). Klubbens administratörer och lag försvinner automatiskt med klubben.
     ```sql
     DELETE FROM bestallning WHERE lag_id IN (SELECT l.id FROM lag l JOIN klubb k ON k.id = l.klubb_id WHERE k.slug = 'eskilsminne');
     DELETE FROM logg WHERE klubb_id = (SELECT id FROM klubb WHERE slug = 'eskilsminne');
     DELETE FROM klubb WHERE slug = 'eskilsminne';
     DELETE FROM session; DELETE FROM inloggningslank;
     ```
     De två sista raderna loggar ut alla. Det är rätt så länge testklubben är den enda klubben.
   - Visa SQL:en för ägaren och kör den först när ägaren har sagt ja. Den går inte att ångra. D1:s Time Travel kan återställa databasen i efterhand, men räkna inte med det.
   - Lägg sedan in klubben igen enligt punkt 2, med klubbens riktiga administratör.
2. **Växla till skarpt läge i samma commit:**
   - I `wrangler.toml`: `SIDA_ORIGIN = "https://skramlat.se"`. Det är dit inloggningslänkarna i mejlen pekar.
   - I `eskilsminne/lag.js`: `endpoint: "/api"` i `KLUBB`.

   Görs bara det ena pekar inloggningslänkarna fel, eller så visar sidan demo medan servern redan är skarp. Kör `npm test` en gång före push, och publicera enligt `utkast-och-publicering`.
3. **Synlighet i Google:** `eskilsminne/index.html` har `noindex`. Ta bort det om ägaren vill att klubbsidan ska synas i Google. Framsidan märker Eskilsminne som *pilotklubb*.
4. **Kontrollera hos Cloudflare:**
   - `https://skramlat.se/api?action=version` visar den nya versionen.
   - Klubbens administratör kan logga in via länken i mejlet.
   - En lagförälder startar en försäljning, klubben godkänner, och en provbeställning går igenom. Ta bort provbeställningen efteråt.
   - `node scripts/kontrollera-eu.js` visar jurisdiktion EU. Skriptet behöver `CLOUDFLARE_ACCOUNT_ID` och `CLOUDFLARE_API_TOKEN`, som ägaren har.
5. **Uppdatera dokumentationen:** `OVERLAMNING.md` (*Live på skramlat.se* och *Nästa steg*) och avsnittet *Läge* i `PLAN-gemensam-server.md`.

## Inte byggt än

Säg hellre att det här saknas än att lova det:

- Ansökan på `skramlat.se/kom-igang` där ägaren godkänner klubben i ett gränssnitt (Fas 2). Idag mejlar formuläret bara en förfrågan till ägaren.
- Klubbens kontaktuppgift på klubbsidan. Det är dit föräldrar ska vända sig med frågor om sina uppgifter.
- Lag utan klubb, där en andra förälder godkänner försäljningarna.
