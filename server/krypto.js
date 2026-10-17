/* Slumptal och hashar. Använder Web Crypto, som finns både i Cloudflare Workers och i Node. */

const enc = new TextEncoder();

export async function sha256(text) {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

// n slumpade byte som hexadecimal text (2 tecken per byte)
export function slumpHex(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// En nyckel som ska visas för en person: 32 slumpade hex-tecken (128 bit) i grupper om fyra: a1b2-c3d4-…
export function nyNyckelText() {
  return slumpHex(16).match(/.{4}/g).join("-");
}

// Nycklar skrivs ofta med streck och blandade versaler: bara gemena hex-tecken räknas
export function normNyckel(k) {
  return String(k || "").toLowerCase().replace(/[^a-f0-9]/g, "");
}

// Hash av en lagnyckel (efter normalisering). Bara hashen sparas.
export function hashNyckel(k) {
  return sha256(normNyckel(k));
}

// Jämför två hashar utan att tiden visar var de skiljer sig
export function likaHash(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
