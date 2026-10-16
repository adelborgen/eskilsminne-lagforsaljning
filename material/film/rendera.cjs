const { chromium } = require("/opt/node-tools/node_modules/playwright");
const D = __dirname + "/";
const lage = process.argv[2] || "test";
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await (await b.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
  const fel = []; p.on("pageerror", (e) => fel.push(e.message));
  await p.goto("file://" + D + "flode.html");
  await p.evaluate(() => document.fonts.ready);
  const tider = lage === "test" ? [0.8, 3.2, 5.9, 6.95, 8.9, 10.9, 13.0, 14.5, 16.3, 19] : Array.from({ length: 600 }, (_, i) => i / 30);
  for (const [i, t] of tider.entries()) {
    await p.evaluate((t) => window.render(t), t);
    await p.screenshot({ path: lage === "test" ? D + `t-${i}.png` : D + "frames/f" + String(i).padStart(4, "0") + ".png" });
  }
  console.log("fel:", fel);
  await b.close();
})();
