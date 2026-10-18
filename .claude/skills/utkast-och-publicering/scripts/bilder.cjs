// Bilder av Skramlats sidor i mobil och dator, för att visa ägaren en ändring innan den publiceras.
//   node bilder.cjs <utmapp> <adress> [adress …]        till exempel: node bilder.cjs /tmp/bilder / /pris/ /om/
// Kräver en lokal server från repots rot på PORT (standard 8765): python3 -m http.server 8765
// Mobil: hela sidan i 390 px. Dator: första skärmen i 1280 px. Reducerad rörelse, så att räknaren visar slutsiffran.
const fs = require("fs");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

(async () => {
  const [ut, ...adresser] = process.argv.slice(2);
  if (!ut || !adresser.length) { console.error("Användning: node bilder.cjs <utmapp> <adress> [adress …]"); process.exit(1); }
  fs.mkdirSync(ut, { recursive: true });
  const bas = "http://localhost:" + (process.env.PORT || 8765);
  const lagen = [["mobil", { width: 390, height: 844 }, true], ["dator", { width: 1280, height: 800 }, false]];
  const b = await chromium.launch();
  for (const adress of adresser) {
    const namn = adress.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "framsidan";
    for (const [lage, viewport, helSida] of lagen) {
      const p = await b.newPage({ viewport, reducedMotion: "reduce" });
      await p.goto(bas + adress, { waitUntil: "networkidle" });
      const fil = path.join(ut, namn + "-" + lage + ".png");
      await p.screenshot({ path: fil, fullPage: helSida });
      console.log(fil);
      await p.close();
    }
  }
  await b.close();
})();
