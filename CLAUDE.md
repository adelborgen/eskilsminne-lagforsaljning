# Skramlat

Skramlat (skramlat.se) är en tjänst för lagens och skolornas försäljningar. En Cloudflare Worker serverar både sidorna och servern (`/api`), och databasen D1 ligger i EU. Eskilsminne IF (idrottsföreningen, inte Eskilsminne Byggservice) är första klubben.

Läs `OVERLAMNING.md` först: där står läget och nästa steg. Besluten står i `PLAN-gemensam-server.md` och tekniken i `README.md`.

## Regler som alltid gäller

- **Inga hemligheter i chatten eller repot:** nycklar, adminlänkar, e-postadresser, telefonnummer och klubbens bankgiro. Bankgirot skrivs in i klubbens vy och sparas i databasen. Hemligheter läggs hos Cloudflare (till exempel `FORFRAGAN_TILL`).
- **Allt på `main` publiceras direkt på skramlat.se.** Ändringar görs på en egen gren och går till main först när ägaren säger till. Se skillen `utkast-och-publicering`.
- **Fråga innan något nytt byggs.** Rättelser av det ägaren redan har bett om går bra direkt.
- **Kör få tester:** bara det som täcker ändringen, en gång när arbetet är klart. Mutationstestet körs bara före lansering.
- **Personuppgifter:** allt som sparas om personer ligger i D1 (EU). Lägg inte till KV, R2, köer, Durable Objects eller loggning, eftersom vaktprovet `test/eu.test.js` stoppar det. Servern loggar aldrig uppgifter om personer, och mejlnotiser innehåller aldrig barnens namn eller mobilnummer.
- Använd aldrig ägarens skärminspelning av riktiga Swish-betalningar, eftersom den har riktiga namn.

## Så jobbar vi med ägaren

- Skriv på svenska, i vardaglig ton och du-form. Ägaren är inte utvecklare: förklara utan jargong.
- Det ägaren själv behöver göra (i Cloudflares panel, i GitHub, ett mejl) beskrivs steg för steg, med var knapparna finns.
- Ägaren svarar gärna på frågor i en pop-up (`AskUserQuestion`) med färdiga alternativ.
- Visa ändringar på sidorna som bilder i mobil och dator innan de publiceras.

## Skills

- `utkast-och-publicering`: ändringar på skramlat.se, från gren till publicering.
- `ton-och-varumarke`: all text och grafik för Skramlat.
- `ny-klubb-och-go-live`: lägga in en klubb och gå live, först Eskilsminne.
