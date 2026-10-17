/* Behörighet och inloggning.

   Tre sätt att komma in:
   - Föräldern: ingen inloggning.
   - Lagföräldern: lagets nyckel (som i Apps Script-versionen). Bara hashen sparas.
   - Klubbens administratör: e-post med en inloggningslänk. Länken gäller i 15 minuter och kan användas en gång. Sedan en session
     i en cookie. Bara hashar av länken och sessionen sparas.
   All behörighet kontrolleras här, aldrig av sidan. */
import { hittaLag, lasRakning, raknaUpp, iso, stada, loggUttryck } from "./data.js";
import { sha256, slumpHex, normNyckel, likaHash } from "./krypto.js";
import { CFG, normEpost, SLUG_RE } from "./regler.js";
import { skickaInloggningslank } from "./epost.js";

const KAKA = "__Host-session";   // __Host-: bara över https, bara för den här adressen, ingen annan domän kan sätta den

/* ---------- Cookie och ursprung ---------- */
function lasKaka(request, namn) {
  const rubrik = request.headers.get("Cookie") || "";
  for (const del of rubrik.split(";")) {
    const i = del.indexOf("=");
    if (i > 0 && del.slice(0, i).trim() === namn) return del.slice(i + 1).trim();
  }
  return "";
}

function kakaText(varde, sekunder) {
  return KAKA + "=" + varde + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + sekunder;
}

// En förfrågan som skickas från en annan webbplats ska aldrig gälla. Med strict krävs att webbläsaren talar om varifrån den kommer
// (används när en cookie ger behörighet, så att en annan webbplats inte kan skicka förfrågningar i den inloggades namn).
export function ursprungOk(k, strict) {
  const o = k.request.headers.get("Origin");
  if (o === null) return !strict;
  return o === new URL(k.request.url).origin;
}

/* ---------- Sessionen ---------- */
export async function aktuellSession(k) {
  const v = lasKaka(k.request, KAKA);
  if (!/^[a-f0-9]{64}$/.test(v)) return null;
  const r = await k.db.prepare("SELECT epost FROM session WHERE hash = ?1 AND giltig_till > ?2").bind(await sha256(v), k.nu()).first();
  return r ? { epost: r.epost } : null;
}

async function arAdmin(k, klubbId, epost) {
  const r = await k.db.prepare(`SELECT 1 AS ja FROM klubb_admin a JOIN klubb kl ON kl.id = a.klubb_id
    WHERE a.klubb_id = ?1 AND a.epost = ?2 AND kl.status != 'avstangd'`).bind(klubbId, epost).first();
  return !!r;
}

async function klubbarFor(k, epost) {
  const { results } = await k.db.prepare(`SELECT kl.slug, kl.namn FROM klubb_admin a JOIN klubb kl ON kl.id = a.klubb_id
    WHERE a.epost = ?1 AND kl.status != 'avstangd' ORDER BY kl.namn`).bind(epost).all();
  return results;
}

/* ---------- Kontrollerar vem som anropar adminvyn ---------- */
// Ger { roll: "super" | "lag", lag } eller { fel }. super = klubbens administratör, som får göra allt i klubben.
export async function autentisera(k, klubb, slug, key) {
  slug = String(slug || "").toLowerCase().slice(0, 40);
  const lag = slug && slug !== "*" ? await hittaLag(k, klubb.id, slug) : null;

  // Klubbens administratör: inloggad med e-postlänk
  const s = await aktuellSession(k);
  if (s && await arAdmin(k, klubb.id, s.epost)) {
    if (!ursprungOk(k, true)) return { fel: "Felaktig förfrågan." };
    return { roll: "super", lag };
  }

  // Lagförälderns nyckel. Gäller bara i en godkänd klubb.
  const kn = normNyckel(key);
  const hk = kn.length >= 20 ? await sha256(kn) : "";
  if (hk && lag && lag.hash && klubb.status === "aktiv" && likaHash(hk, lag.hash)) return { roll: "lag", lag };

  // Rätt nyckel kommer alltid in, även under en spärr. Nycklarna är för långa för att gissa, så spärren ska bara bromsa fel nycklar och
  // får inte kunna användas för att låsa ute den som har rätt. Spärren räknas per lag, och okända lag delar en gemensam räknare så
  // att ingen kan fylla databasen med påhittade lagnamn.
  const kLag = "fel:" + klubb.id + ":" + (lag ? lag.slug : "okant"), kAlla = "fel:" + klubb.id + ":alla";
  const fonster = CFG.FEL_MINUTER * 60000;
  if ((await lasRakning(k, kLag)) >= CFG.FEL_MAX || (await lasRakning(k, kAlla)) >= CFG.FEL_MAX_ALLA)
    return { fel: "För många felaktiga försök. Vänta en stund och försök igen." };
  if (kn) { await raknaUpp(k, kLag, fonster); await raknaUpp(k, kAlla, fonster); }
  return { fel: "Fel lag eller nyckel." };
}

/* ---------- Inloggning med e-postlänk ---------- */
const GRANSKA = { ok: true, meddelande: "Om adressen är registrerad som administratör har vi skickat en länk. Den gäller i 15 minuter. Kolla även skräpposten." };

async function raknaTillfalle(k, nyckel, max) {
  return (await raknaUpp(k, nyckel, 3600000)) <= max;
}

async function loginBegar(k, d) {
  if (d.website) return GRANSKA;   // honungsfälla
  const epost = normEpost(d.epost);
  if (!epost) return { ok: false, fel: "Skriv en e-postadress." };
  const slug = String(d.klubb || "").toLowerCase();
  if (!SLUG_RE.test(slug)) return GRANSKA;
  await stada(k);
  // Spärr per adress och per IP-nummer. Svaret är detsamma oavsett, så att ingen kan se vilka adresser som är administratörer.
  const ipOk = await raknaTillfalle(k, "lank:ip:" + await sha256(k.ip || "okand"), CFG.LANK_PER_IP_TIMME);
  const epostOk = await raknaTillfalle(k, "lank:e:" + await sha256(epost), CFG.LANK_PER_EPOST_TIMME);
  if (!ipOk || !epostOk) return GRANSKA;

  const admin = await k.db.prepare(`SELECT kl.id FROM klubb_admin a JOIN klubb kl ON kl.id = a.klubb_id
    WHERE kl.slug = ?1 AND a.epost = ?2 AND kl.status != 'avstangd'`).bind(slug, epost).first();
  if (!admin) return GRANSKA;

  const token = slumpHex(32);
  await k.db.batch([
    k.db.prepare("INSERT INTO inloggningslank (hash, epost, giltig_till) VALUES (?1, ?2, ?3)")
      .bind(await sha256(token), epost, k.nu() + CFG.LANK_GILTIG_MIN * 60000),
    loggUttryck(k, admin.id, "", "inloggningslänk begärd", "", "")
  ]);
  // Själva länken ligger efter # så att den inte skickas till någon server, och inte syns i loggar eller referenser.
  const bas = (k.env.SIDA_ORIGIN || new URL(k.request.url).origin).replace(/\/$/, "");
  const lank = bas + "/" + slug + "/admin.html#lank=" + token;
  // E-posten skickas efter svaret, så att svarstiden inte visar om adressen finns.
  const skicka = skickaInloggningslank(k, epost, lank).catch(() => { console.error("inloggningslänken kunde inte skickas"); });
  if (k.waitUntil) k.waitUntil(skicka); else await skicka;
  return GRANSKA;
}

async function loginAnvand(k, d) {
  if (!ursprungOk(k, false)) return { ok: false, fel: "Felaktig förfrågan." };
  const token = String(d.token || "");
  const ogiltig = { ok: false, fel: "Länken gäller inte längre. Be om en ny." };
  if (!/^[a-f0-9]{64}$/.test(token)) return ogiltig;
  // En länk kan användas en gång: markeringen och kontrollen är ett enda uttryck, så två samtidiga försök kan inte båda lyckas.
  const r = await k.db.prepare("UPDATE inloggningslank SET anvand = 1 WHERE hash = ?1 AND anvand = 0 AND giltig_till > ?2 RETURNING epost")
    .bind(await sha256(token), k.nu()).first();
  if (!r) return ogiltig;
  const secret = slumpHex(32);
  const sek = CFG.SESSION_DAGAR * 86400;
  await k.db.prepare("INSERT INTO session (hash, epost, giltig_till) VALUES (?1, ?2, ?3)").bind(await sha256(secret), r.epost, k.nu() + sek * 1000).run();
  return { ok: true, klubbar: await klubbarFor(k, r.epost), _kaka: kakaText(secret, sek) };
}

async function loginVem(k) {
  const s = await aktuellSession(k);
  return { ok: true, inloggad: !!s, klubbar: s ? await klubbarFor(k, s.epost) : [] };
}

async function loginUtlogga(k) {
  if (!ursprungOk(k, false)) return { ok: false, fel: "Felaktig förfrågan." };
  const v = lasKaka(k.request, KAKA);
  if (/^[a-f0-9]{64}$/.test(v)) await k.db.prepare("DELETE FROM session WHERE hash = ?1").bind(await sha256(v)).run();
  return { ok: true, _kaka: kakaText("", 0) };
}

export async function hanteraLogin(k, d) {
  switch (String(d.op || "")) {
    case "begar": return await loginBegar(k, d);
    case "anvand": return await loginAnvand(k, d);
    case "vem": return await loginVem(k);
    case "utlogga": return await loginUtlogga(k);
    default: return { ok: false, fel: "Okänd åtgärd." };
  }
}
