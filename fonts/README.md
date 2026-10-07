# Typsnitt

Två typsnitt, självhostade så att inget anrop går till Google (besökarens IP-adress skickas då inte vidare). Båda är **SIL Open Font License 1.1**, som tillåter att de kopieras, används och ligger i repot. Behåll licensfilerna.

| Fil | Används till | Storlek |
|---|---|---|
| `archivo-latin-wdth-normal.woff2` | Tavelsiffror och rubriker. Variabel tjocklek 100–900 och bredd 62–125 % | 90 KB |
| `atkinson-hyperlegible-next-latin-wght-normal.woff2` | Brödtext, fält, knappar, metadata. Variabel tjocklek 200–800 | 34 KB |
| `fonts.css` | `@font-face` för båda | |
| `LICENSE-Archivo.txt`, `LICENSE-AtkinsonHyperlegibleNext.txt` | Licenstexterna | |

Källa: npm-paketen `@fontsource-variable/archivo` och `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0, som innehåller originalen från [Archivo](https://github.com/Omnibus-Type/Archivo) och [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next).

`fonts.css` är **inte kopplad till appen än**. Länka den först i sidan när designen byggs: `<link rel="stylesheet" href="fonts/fonts.css">`.

## Så används de (enligt designbriefen)

```css
/* Tavelsiffror: summa, mätare, obetalt */
font-family: "Archivo", system-ui, sans-serif;
font-stretch: 75%;  font-weight: 800;  font-variant-numeric: tabular-nums;

/* Lagnamn och rubriker */
font-family: "Archivo", system-ui, sans-serif;
font-stretch: 115%; font-weight: 600;

/* Text, fält, knappar */
font-family: "Atkinson Hyperlegible Next", system-ui, sans-serif;  /* 17 px */
```

## Att veta

- **Snedstreck genom nollan i Atkinson.** Det är avsiktligt (för att skilja 0 från O i ordernummer och telefonnummer) men går inte att stänga av, eftersom fonten saknar funktion för det. Det syns i all löpande text i Atkinson, till exempel "300 kr" och "18.00". Siffror som ska se ut som en resultattavla sätts därför i Archivo, som har vanlig nolla.
- **Archivo: stora I och små l ser likadana ut.** Det spelar ingen roll för ordernummer (bara bokstäverna P/F plus siffror), men gäller i löpande text.
- **Bara latinska tecken** (A–Ö, é, ü med flera, och vanliga skiljetecken). Andra tecken, till exempel polska och turkiska bokstäver, visas i systemets reservtypsnitt. Behövs fler: lägg till `latin-ext` från samma npm-paket.
- **`font-display: swap`:** texten visas direkt med reservtypsnittet och byts när filen har laddats.
- **Ordningen:** använd hårt mellanslag (U+00A0) i belopp, till exempel `1 400 kr`, så att de inte bryts över två rader. `Intl.NumberFormat("sv-SE")` gör det.

## Kontrollerat

Axlarna (tjocklek och bredd), tabellsiffror (`tnum`), å, ä, ö och é, och att båda filerna laddas från den egna servern utan anrop till andra värdar.

## Uppdatera

```
npm pack @fontsource-variable/archivo
npm pack @fontsource-variable/atkinson-hyperlegible-next
```
Packa upp och kopiera `files/*-latin-*-normal.woff2` och `LICENSE`.
