/* Skickar e-post. Det här är den enda filen som känner till e-postleverantören, så att den går att byta.

   Nu: Cloudflares bindning send_email (EMAIL i wrangler.toml). Fältnamnen (to, from.email, from.name, subject, text) fungerar hos
   riktiga Cloudflare: provat 17 oktober 2026 med ett inloggningsmejl till en verifierad mottagare i Email Routing (gratisnivån).
   Till andra adresser krävs Workers Paid och Cloudflare Email Service (npx wrangler email sending enable skramlat.se).

   Mejlen innehåller bara administratörens egen adress och en inloggningslänk, aldrig barnens uppgifter. */

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
