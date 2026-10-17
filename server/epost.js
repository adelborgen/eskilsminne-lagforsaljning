/* Skickar e-post. Det här är den enda filen som känner till e-postleverantören, så att den går att byta.

   Nu: Cloudflares bindning send_email (EMAIL i wrangler.toml). Fältnamnen (to, from.email, from.name, subject, text) fungerar hos
   riktiga Cloudflare: provat 17 oktober 2026 med ett inloggningsmejl till en verifierad mottagare i Email Routing (gratisnivån).
   Till andra adresser krävs Workers Paid och Cloudflare Email Service (npx wrangler email sending enable skramlat.se).

   Förfrågningar från klubbar (kom-igang) går till Skramlat och innehåller det som den som frågar själv skrev in.
   Mejlen till klubbarna innehåller bara mottagarens egen adress, lagets namn, antal och belopp, och en länk. Aldrig barnens namn eller mobilnummer,
   och aldrig Swish-nummer eller andra värden som lagföräldern skrivit in: notisen säger vilka fält som ändrats, och värdena syns i adminvyn. */

export async function skickaInloggningslank(k, till, lank) {
  if (!k.env.EMAIL || typeof k.env.EMAIL.send !== "function") throw new Error("e-postbindningen saknas");
  const text = [
    "Hej!",
    "",
    "Öppna länken för att logga in på Skramlat som klubbens administratör:",
    lank,
    "",
    "Länken gäller i 15 minuter och kan användas en gång. Du bekräftar inloggningen med en knapp på sidan.",
    "",
    "Begärde du inte den här länken kan du strunta i mejlet. Ingen kommer in utan den.",
    "",
    "Skramlat"
  ].join("\n");
  await k.env.EMAIL.send({
    to: till,
    from: { email: k.env.EPOST_FRAN || "inloggning@skramlat.se", name: "Skramlat" },
    subject: "Din inloggningslänk till Skramlat",
    text
  });
}

// En förfrågan från en klubb eller skola (kom-igang) till Skramlat. Avsändarens adress står i mejlet, så att det går att svara.
export async function skickaForfragan(k, till, f) {
  if (!k.env.EMAIL || typeof k.env.EMAIL.send !== "function") throw new Error("e-postbindningen saknas");
  const text = [
    "Ny förfrågan från skramlat.se/kom-igang",
    "",
    "Klubb eller skola: " + f.klubb + (f.typ ? " (" + f.typ + ")" : ""),
    "Namn: " + f.namn,
    "E-post: " + f.epost,
    "Telefon: " + (f.telefon || "–"),
    "Ungefär hur många lag eller klasser: " + (f.antal || "–"),
    "",
    "Meddelande:",
    f.meddelande || "–",
    "",
    "Svara till " + f.epost + ". Förfrågan sparas inte på webbplatsen, bara i det här mejlet."
  ].join("\n");
  await k.env.EMAIL.send({ to: till, from: { email: k.env.EPOST_FRAN || "inloggning@skramlat.se", name: "Skramlat" },
    subject: "Förfrågan: " + f.klubb, text });
}

// En notis till klubbens administratörer, till exempel att en försäljning väntar på godkännande. rader: mejlets text, rad för rad.
export async function skickaNotis(k, till, amne, rader) {
  if (!k.env.EMAIL || typeof k.env.EMAIL.send !== "function") throw new Error("e-postbindningen saknas");
  const text = ["Hej!", "", ...rader, "", "Skramlat"].join("\n");
  // Var mottagare för sig: kommer mejlet inte fram till en av dem ska de andra ändå få sitt
  let fel = 0;
  for (const t of till) {
    try { await k.env.EMAIL.send({ to: t, from: { email: k.env.EPOST_FRAN || "inloggning@skramlat.se", name: "Skramlat" }, subject: amne, text }); }
    catch (e) { fel++; }
  }
  if (fel) throw new Error("notisen kom inte fram till alla");
}
