/* Skramlats server: ett litet JSON-API på /api, för alla klubbar. Se PLAN-gemensam-server.md.

   GET  /api?action=lag&klubb=<adress>      den offentliga laglistan (inga personuppgifter, inga nycklar)
   GET  /api?action=version
   POST /api                               beställning (utan action), eller {action: "admin" | "starta" | "login", klubb, …}

   Sidan tar aldrig emot pengar. Föräldern swishar direkt till lagets eget nummer.
   Allt som sparas om personer ligger i D1 (EU). Inget sparas på något annat ställe, och inget svar får cachas. */
import { hittaAktivKlubb, lasLag, publik } from "./data.js";
import { hanteraBestallning, hanteraStart } from "./bestall.js";
import { hanteraAdmin } from "./ops.js";
import { hanteraLogin, ursprungOk } from "./auth.js";

export const VERSION = "2026-10-17-d1";
const MAX_KROPP = 32 * 1024;   // en förfrågan är aldrig större än så

// Inget svar får cachas (inte heller av Cloudflare runt om i världen), eftersom svaren kan innehålla uppgifter om personer.
function json(obj, status, extra) {
  const rubriker = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (extra) for (const [n, v] of extra) rubriker.append(n, v);
  return new Response(JSON.stringify(obj), { status: status || 200, headers: rubriker });
}

// Svaret till en inloggning kan bära en cookie. Den lyfts ur svaret så att den aldrig syns i texten.
function svara(obj) {
  if (obj && obj._kaka) {
    const { _kaka, ...resten } = obj;
    return json(resten, 200, [["Set-Cookie", _kaka]]);
  }
  return json(obj);
}

async function publikLista(k, slug) {
  const klubb = await hittaAktivKlubb(k, slug);
  if (!klubb) return null;
  return (await lasLag(k, klubb.id)).map((l) => {
    const u = publik(l);
    if (l.status !== "utkast" && l.status !== "granskas") u.bestallt = l.bestallt || 0;
    return u;
  });
}

async function hanteraGet(k, url) {
  const p = url.searchParams;
  const action = p.get("action");
  if (action === "version") return { ok: true, version: VERSION };
  if (action === "lag") {
    const lista = await publikLista(k, p.get("klubb"));
    return lista ? { ok: true, lag: lista } : { ok: false, fel: "Okänd klubb." };
  }
  if (action === "status") {   // äldre sidor frågar så här: samma siffra som följer med laglistan
    const lista = await publikLista(k, p.get("klubb"));
    const slug = String(p.get("lag") || "").toLowerCase();
    const l = lista && lista.filter((x) => x.slug === slug)[0];
    return l ? { ok: true, bestallt: l.bestallt || 0 } : { ok: false, fel: "Okänt lag." };
  }
  return { ok: false, fel: "Okänd förfrågan." };
}

async function hanteraPost(k) {
  if (!ursprungOk(k, false)) return { ok: false, fel: "Felaktig förfrågan." };
  const text = await k.request.text();
  if (text.length > MAX_KROPP) return { ok: false, fel: "Förfrågan är för stor." };
  let d;
  try { d = JSON.parse(text); } catch (e) { return { ok: false, fel: "Felaktig förfrågan." }; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, fel: "Felaktig förfrågan." };
  switch (d.action) {
    case undefined: case "bestall": return await hanteraBestallning(k, d);
    case "admin": return await hanteraAdmin(k, d);
    case "starta": return await hanteraStart(k, d);
    case "login": return await hanteraLogin(k, d);
    default: return { ok: false, fel: "Okänd åtgärd." };
  }
}

// request: anropet. env: bindningarna (DB, EMAIL, vars). ctx: Workers kontext (waitUntil). ctx.nu: klockan, som tester kan styra.
export async function hantera(request, env, ctx) {
  const k = { env, db: env.DB, request, nu: (ctx && ctx.nu) || Date.now,
    waitUntil: ctx && ctx.waitUntil ? ctx.waitUntil.bind(ctx) : null, ip: request.headers.get("CF-Connecting-IP") || "" };
  try {
    if (request.method === "GET") return svara(await hanteraGet(k, new URL(request.url)));
    if (request.method === "POST") return svara(await hanteraPost(k));
    return json({ ok: false, fel: "Okänd förfrågan." }, 405);
  } catch (e) {
    // Aldrig något som kan innehålla uppgifter om personer: bara felets typ.
    console.error("tekniskt fel", e && e.name);
    return json({ ok: false, fel: "Tekniskt fel. Försök igen om en stund, eller hör av dig där du brukar prata med laget." }, 500);
  }
}
