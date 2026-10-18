/* Förfrågan från en klubb eller skola som vill vara med (skramlat.se/kom-igang/).

   Servern mejlar förfrågan till Skramlat och sparar ingenting i databasen: bara en räknare mot spam, med en hash av IP-numret.
   Mottagarens adress är en hemlighet hos Cloudflare (FORFRAGAN_TILL), aldrig i koden. Den måste vara en verifierad mottagare
   i Email Routing så länge kontot inte har Workers Paid.

   Sidan låg först på GitHub Pages och anropade servern från en annan adress. Sedan 18 oktober 2026 ligger sidan och servern i samma
   Worker och sidan anropar /api på sin egen adress. Rubrikerna för anrop från skramlat.se till en annan adress (se api.js) finns
   kvar, men behövs bara om sidan åter skulle ligga någon annanstans än servern. */
import { raknaUpp } from "./data.js";
import { sha256 } from "./krypto.js";
import { CFG, normEpost } from "./regler.js";
import { skickaForfragan } from "./epost.js";

// http:// också, så länge Cloudflare inte skickar http:// vidare till https:// (Always Use HTTPS)
const URSPRUNG = ["https://skramlat.se", "https://www.skramlat.se", "http://skramlat.se", "http://www.skramlat.se"];

// Skramlats sidor på en annan adress än servern (skramlat.se). Ger adressen om anropet kommer därifrån, annars null.
export function korsUrsprung(request) {
  const o = request.headers.get("Origin");
  return o && URSPRUNG.indexOf(o) >= 0 ? o : null;
}
export const ANTAL_LAG = ["1–3", "4–10", "Fler än 10", "Vet inte"];
export const TYP = ["Förening", "Skola", "Annat"];
const SKICKAT = { ok: true, meddelande: "Vi hör av oss på mejlen så snart vi kan." };

// Varifrån anropet får komma: servern själv, sidornas inställda adress och skramlat.se. Ger adressen, eller null.
function tillatetUrsprung(k) {
  const o = k.request.headers.get("Origin");
  if (!o) return null;
  const egna = [new URL(k.request.url).origin, (k.env.SIDA_ORIGIN || "").replace(/\/$/, ""), ...URSPRUNG];
  return egna.indexOf(o) >= 0 ? o : null;
}

// En rad text: utan radbrytningar och styrtecken, och med inledande = + - @ borttagna (som all text som kan hamna i ett kalkylark)
function rad(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[=+\-@\s]+/, "").slice(0, max);
}

export async function hanteraForfragan(k, d) {
  const fran = tillatetUrsprung(k);
  if (!fran) return { ok: false, fel: "Felaktig förfrågan." };

  if (d.website) return SKICKAT;   // honungsfälla: en robot får samma svar, men inget skickas
  if (!(Number(d.t) >= CFG.MIN_TID_MS)) return { ok: false, fel: "Vänta några sekunder och försök igen." };

  const f = {
    klubb: rad(d.klubb, 80), namn: rad(d.namn, 60), epost: normEpost(d.epost), telefon: rad(d.telefon, 20),
    typ: TYP.indexOf(d.typ) >= 0 ? d.typ : "", antal: ANTAL_LAG.indexOf(d.antal) >= 0 ? d.antal : "",
    meddelande: String(d.meddelande == null ? "" : d.meddelande).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, 1500)
  };
  if (f.klubb.length < 2) return { ok: false, fel: "Skriv vilken klubb eller skola det gäller." };
  if (f.namn.length < 2) return { ok: false, fel: "Skriv ditt namn." };
  if (!f.epost) return { ok: false, fel: "Skriv en e-postadress som vi kan svara till." };
  if (f.telefon && !/^\+?[\d\s\-()]{6,20}$/.test(f.telefon)) return { ok: false, fel: "Telefonnumret ser inte rätt ut. Det är valfritt, så du kan lämna det tomt." };

  // Spärr mot spam: per IP-nummer och för alla tillsammans
  const ip = await raknaUpp(k, "forfragan:ip:" + await sha256(k.ip || "okand"), 3600000);
  const alla = await raknaUpp(k, "forfragan:alla", 3600000);
  if (ip > CFG.FORFRAGAN_PER_IP_TIMME || alla > CFG.FORFRAGAN_PER_TIMME) return { ok: false, fel: "Många förfrågningar just nu. Försök igen om en stund, eller mejla hej@skramlat.se." };

  const reserv = { ok: false, fel: "Det gick inte att skicka just nu. Mejla hej@skramlat.se i stället." };
  if (!k.env.FORFRAGAN_TILL) return reserv;
  try {
    await skickaForfragan(k, k.env.FORFRAGAN_TILL, f);
  } catch (e) {
    console.error("förfrågan kunde inte skickas");
    return reserv;
  }
  return SKICKAT;
}
