---
name: ton-och-varumarke
description: Skramlats ton, ordval, löften och grafiska profil (färger, typsnitt, logga). Använd den när du skriver eller granskar text för Skramlat, till exempel webbsidor, mejl till klubbar och skolor, inlägg i sociala medier, guider, vanliga frågor, texter och felmeddelanden i appen eller filmtexter. Använd den också när du gör grafik eller sidor i Skramlats stil, även när ägaren bara ber om "en text" eller "ett mejl". Gäller Skramlat och Eskilsminne IF (idrottsföreningen), inte Eskilsminne Byggservice AB.
---

# Ton och varumärke

Skramlat gör lagförsäljning enkel. Föräldrar beställer i mobilen och swishar direkt till laget eller skolan. Lagföräldern bockar av betalt och hämtat, och klubben eller skolan godkänner. Texten ska låta som en förälder som har gjort det här själv, inte som ett företag som vill sälja något.

## Ton

- **Du-form och vardagligt.** Skriv korta meningar, med en sak per mening.
- **Lite text.** Ägaren tycker att det lätt blir för mycket.
  - Säg varje sak en gång. Upprepa inte samma löfte i flera avsnitt på samma sida.
  - Berätta vad Skramlat är innan du beskriver hur det går till.
- **Rollnamn i stället för personer:** förälder, lagförälder, klubbens administratör, klubben eller skolan, laget eller klassen.
- **Nämn inga kanaler.** Skriv "där du brukar få besked från laget" i stället för Facebook, WhatsApp eller sms, eftersom lagen använder olika kanaler.
- **Öppet om pengar.** Ägaren driver Skramlat för att lagförsäljning ska skötas ordnat och öppet, inte för att tjäna pengar. Förklara inte priserna om ingen frågar.

## Löften som måste stämma

Skriv bara det som är sant i tjänsten idag. Är du osäker, kontrollera i koden eller fråga ägaren.

- Pengarna swishas direkt till lagets eller skolans nummer. Skramlat tar aldrig emot pengar och tar ingen avgift per köp.
- Bara barnets förnamn och ett mobilnummer sparas, i en databas inom EU.
- Det finns ingen ruta att kryssa i, eftersom uppgifterna behövs för att hantera beställningen. Under beställningsknappen står vad som sparas.
- Ingen försäljning öppnar utan klubbens eller skolans godkännande. Ändras Swish-numret efter godkännandet måste klubben godkänna igen.
- Lagföräldern bockar av betalt och hämtat, i den ordningen, och kan ta ut underlaget till Excel och CSV.
- När försäljningen är slut skickar lagföräldern pengarna till klubbens bankgiro, och klubben kvitterar.
- Pris, exklusive moms:
  - Gratis: 1 försäljning åt gången.
  - Bas: 999 kr per år, 3 försäljningar samtidigt.
  - Plus: 1 999 kr per år, upp till 10 samtidigt (fler efter kontakt).
  - Pilotklubbar använder Skramlat gratis under pilotåret.
- Räknaren står på 17 340 kr swishat, från det första lagets försäljning. Den uppdateras för hand i `index.html` och `om/index.html`.
- Lova inget som inte är byggt utan att skriva att det kommer. Exempel: automatisk radering efter 60 dagar, ansökan för klubbar, klubbens kontaktuppgift på klubbsidan.

## Det här använder vi inte

- Inga bilder på barn och inga stockbilder.
- Ägarens skärminspelning av riktiga Swish-betalningar används aldrig, eftersom den har riktiga namn.
- På Om-sidan nämns inte P2019 eller Eskilsminne, bara att det började i ett fotbollslag. Andreas Adelborg står med namn som den som driver Skramlat, med ägarens ok.

## Grafisk profil

- **Brand-manual:** https://claude.ai/artifact/TPCYXxUVyUBVnhxuszmFeh (Design System-artefakten "Skramlat"). Läs den för komponenter och exempel.
- **Färger:**
  - grafit `#16191d` för bakgrunden
  - krämvit `#fff8d6` för kort och rubriker
  - mint `#6fe3b4` för detaljer och knappar
  - mörk mint `#1c8a5f` för grafik på ljus bakgrund
  - mint-text `#187a54` för text på ljus bakgrund

  Aldrig vit bakgrund.
- **Typsnitt:** Archivo för rubriker och siffror, Atkinson Hyperlegible Next för brödtext. Filerna ligger i `fonts/`.
- **Logga:** en genomskinlig insamlingsbössa med mynt. Sidorna använder filerna i `logga/`. Alla varianter finns i `material/logga/`.
- **Klubbarnas egna sidor** har klubbens färger och märke, inte Skramlats. Eskilsminne har blått `#174297`, gult `#faeb1e` och krämvitt (se `eskilsminne/style.css`).

## Exempel

Framsidan, som säger vad Skramlat är innan scenariot:

> **Vad är Skramlat?** Skramlat underlättar administrationen av lagens och skolornas försäljningar och insamlingar, och gör processen säker och trygg för alla.

Under beställningsknappen, där en ruta att kryssa i annars hade stått:

> Laget sparar barnets förnamn och ditt mobilnummer för att hantera beställningen. Läs mer under Vanliga frågor.
