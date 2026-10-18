---
name: utkast-och-publicering
description: Arbetsgången för att ändra Skramlats webbsidor på skramlat.se (framsidan, pris, om, demo, guider, kom-igang, eskilsminne/, skramlat.css och skramlat.js). Ändringen görs på en utkastgren och visas som bilder i mobil och dator innan den publiceras på main. Använd den varje gång något ska ändras eller synas på skramlat.se, och när ägaren säger "publicera", "lägg ut" eller "visa hur det ser ut" eller ber om ny text, nya priser eller ny layout, även om ordet utkast inte nämns. Allt som pushas till main publiceras direkt.
---

# Utkast och publicering

Allt som hamnar på `main` publiceras direkt på skramlat.se. Cloudflare (Workers Builds) bygger `dist/` med `scripts/bygg.js` och publicerar Workern inom någon minut. Därför går en ändring via en egen gren tills ägaren har sett den och sagt "publicera".

## Gången

1. **Skapa en gren från main:** `git checkout main && git pull -q origin main && git checkout -b utkast/<kort-namn>`.
2. **Gör ändringen.** Här finns sakerna:
   - Sidorna är fristående HTML-filer, var och en med egen `<style>` och egna färger i `:root`: `index.html`, `pris/`, `om/`, `demo/`, `guider/` och `kom-igang/`.
   - Menyn och räknaren använder `skramlat.css` och `skramlat.js`. Menyn står också som HTML i varje sida, så en ny menypunkt läggs in i alla sidor.
   - Räknaren (kronor swishat) står i både `index.html` och `om/index.html`, och i varje fil både i `data-varde` och i texten. Ändra alla fyra ställena.
   - En ny mapp på toppnivå måste läggas till i `MED` i `scripts/bygg.js`. Annars publiceras den inte.
   - `eskilsminne/` visar demo på skramlat.se tills klubben går live. Se skillen `ny-klubb-och-go-live`.
   - Texten ska följa skillen `ton-och-varumarke`. Ägaren vill ha lite text.
3. **Titta på resultatet** (se *Bilder i mobil och dator*). Titta på bilderna själv först och rätta det som ser fel ut. Skicka dem sedan till ägaren med `SendUserFile` och `display: "render"`.
4. **Committa och pusha grenen:** `git push -u origin utkast/<kort-namn>`.
5. **Fråga om publicering** i en pop-up (`AskUserQuestion`), till exempel med alternativen "Publicera som den är" och en ändring du tror kan behövas.
6. **Publicera först när ägaren har sagt till:**
   ```
   git checkout main && git pull -q origin main
   git merge --ff-only utkast/<kort-namn> || git merge --no-edit utkast/<kort-namn>
   node scripts/bygg.js > /dev/null && git push -u origin main
   git branch -D utkast/<kort-namn>
   ```
   Det går inte alltid att ta bort grenen på GitHub härifrån. Låt den i så fall vara.
7. **Uppdatera `OVERLAMNING.md`** (tabellen *Live på skramlat.se*) om något som ägaren behöver veta har ändrats. Säg kort vad som nu är ute.

## Bilder i mobil och dator

Starta en lokal server från repots rot i bakgrunden och kör skriptet:

```
(python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1
node .claude/skills/utkast-och-publicering/scripts/bilder.cjs <utmapp> / /pris/ /om/
```

För varje adress tar skriptet en bild av hela sidan i mobilbredd (390 px) och en bild av första skärmen i datorbredd (1280 px). Det kör med reducerad rörelse, så att räknaren visar slutsiffran och inte en siffra mitt i uppräkningen. Lägg bilderna i scratchpad, aldrig i repot.

Stäng servern med ett **eget** kommando: `kill $(pgrep -f "http[.]server 8765")`. Skriv aldrig `pkill -f "http.server 8765"`. Mönstret träffar då skalets eget kommando, skalet dör (exit 144), och resten av kommandot körs aldrig, till exempel en commit eller push.

Playwright finns i `/opt/node-tools/node_modules/playwright` och Chromium är redan installerat. Kör inte `playwright install`. En beskuren bild nedanför första skärmen kräver `fullPage: true` tillsammans med `clip`.

## Tester

Ägaren vill att få tester körs. Välj efter vad som har ändrats:

- **Bara HTML och CSS:** `node scripts/bygg.js` och bilderna räcker.
- **`eskilsminne/app.js`, `admin.js` eller `util.js`:** `npm run test:xss`. Testet beställer i en riktig webbläsare.
- **`server/`:** kör `npm test` en gång. Det tar 3–4 minuter.
  - Om du har ändrat en sträng som `test/mutera.js` letar efter: kör också `node test/mutera.js --kontrollera`.
  - Om serverns beteende har ändrats: höj `VERSION` i `server/api.js`. Då kan ägaren se på `https://skramlat.se/api?action=version` att den nya versionen är ute.
