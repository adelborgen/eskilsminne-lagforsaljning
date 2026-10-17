-- Skramlat: databasen för alla klubbar (Cloudflare D1, SQLite).
-- Skapa databasen med EU-jurisdiktion från början, det går inte att lägga till efteråt:
--   npx wrangler d1 create skramlat --jurisdiction=eu
-- Lägg sedan in databasens id i wrangler.toml och kör:
--   npx wrangler d1 migrations apply skramlat --remote
--
-- Allt som sparas om personer (barnets förnamn, mobilnummer, e-postadresser) ligger i den här databasen och ingen annanstans.
-- Se PLAN-gemensam-server.md, avsnittet "Lagring bara i EU".

CREATE TABLE IF NOT EXISTS klubb (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  namn TEXT NOT NULL,
  motto TEXT NOT NULL DEFAULT '',
  -- vantar: ansökt, inte godkänd av Skramlat. Inget syns för föräldrar och ingen kan beställa.
  -- aktiv: godkänd. avstangd: stängd av, försäljningarna döljs och inga beställningar tas emot.
  status TEXT NOT NULL DEFAULT 'vantar' CHECK (status IN ('vantar', 'aktiv', 'avstangd')),
  skapad TEXT NOT NULL
);

-- Klubbens administratörer. E-postadressen sparas med små bokstäver.
CREATE TABLE IF NOT EXISTS klubb_admin (
  klubb_id INTEGER NOT NULL REFERENCES klubb (id) ON DELETE CASCADE,
  epost TEXT NOT NULL,
  skapad TEXT NOT NULL,
  PRIMARY KEY (klubb_id, epost)
);
CREATE INDEX IF NOT EXISTS klubb_admin_epost ON klubb_admin (epost);

-- Ett lag (eller en klass) och dess försäljning. En försäljning med en produkt per post.
CREATE TABLE IF NOT EXISTS lag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  klubb_id INTEGER NOT NULL REFERENCES klubb (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  namn TEXT NOT NULL,
  kampanj TEXT NOT NULL DEFAULT '',
  -- utkast: laget fyller i. granskas: väntar på klubbens godkännande. snart: godkänd men inte öppen. pagar: öppen. avslutad: stängd.
  status TEXT NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast', 'granskas', 'snart', 'pagar', 'avslutad')),
  swish_nummer TEXT NOT NULL DEFAULT '',
  mottagare TEXT NOT NULL DEFAULT '',
  meddelande TEXT NOT NULL DEFAULT '',
  pris REAL NOT NULL DEFAULT 0,
  inkopspris REAL NOT NULL DEFAULT 0,
  minimum INTEGER NOT NULL DEFAULT 0,
  mal INTEGER NOT NULL DEFAULT 0,
  max_antal INTEGER NOT NULL DEFAULT 50,
  kartong INTEGER NOT NULL DEFAULT 0,
  nyckel_hash TEXT NOT NULL,           -- bara hashen av lagets nyckel sparas, aldrig nyckeln
  nasta_order INTEGER NOT NULL DEFAULT 1,   -- räknas bara upp, så ett ordernummer används aldrig igen
  kommentar TEXT NOT NULL DEFAULT '',  -- klubbens kommentar när en försäljning skickas tillbaka
  produkt TEXT NOT NULL DEFAULT '',
  detalj TEXT NOT NULL DEFAULT '',
  enhet_en TEXT NOT NULL DEFAULT '',
  enhet TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  utlamning_text TEXT NOT NULL DEFAULT '',
  belonning TEXT NOT NULL DEFAULT '',
  lager INTEGER NOT NULL DEFAULT 0,    -- 0 = ingen gräns
  UNIQUE (klubb_id, slug)
);

CREATE TABLE IF NOT EXISTS bestallning (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lag_id INTEGER NOT NULL REFERENCES lag (id) ON DELETE RESTRICT,
  nr INTEGER NOT NULL,                 -- ordernumret, löpande per lag
  tid TEXT NOT NULL,
  barn TEXT NOT NULL,
  mobil TEXT NOT NULL,
  antal INTEGER NOT NULL CHECK (antal >= 1),
  belopp REAL NOT NULL,
  betald TEXT NOT NULL DEFAULT '' CHECK (betald IN ('', 'JA', 'AVBRUTEN')),
  hamtad TEXT NOT NULL DEFAULT '' CHECK (hamtad IN ('', 'JA')),
  kod TEXT,                            -- beställningskoden från sidan, skyddar mot dubbletter
  UNIQUE (lag_id, nr)
);
CREATE UNIQUE INDEX IF NOT EXISTS bestallning_kod ON bestallning (lag_id, kod) WHERE kod IS NOT NULL;

-- Vem gjorde vad. Innehåller aldrig barnets namn, mobilnummer eller e-postadresser: bara ordernummer, antal och belopp.
CREATE TABLE IF NOT EXISTS logg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tid TEXT NOT NULL,
  klubb_id INTEGER,
  lag_slug TEXT NOT NULL DEFAULT '',
  atgard TEXT NOT NULL,
  order_nr TEXT NOT NULL DEFAULT '',
  varde TEXT NOT NULL DEFAULT ''
);

-- Räknare för spärrar (felaktiga nyckelförsök, beställningar per mobilnummer, startade försäljningar, inloggningsbegäranden).
-- Nyckeln innehåller bara hashar, aldrig klartext. till = när räknaren går ut (millisekunder sedan 1970).
CREATE TABLE IF NOT EXISTS sparr (
  nyckel TEXT PRIMARY KEY,
  antal INTEGER NOT NULL,
  till INTEGER NOT NULL
);

-- Inloggning för klubbens administratör: länken i e-postmeddelandet och sessionen efteråt. Bara hashar sparas.
CREATE TABLE IF NOT EXISTS inloggningslank (
  hash TEXT PRIMARY KEY,
  epost TEXT NOT NULL,
  giltig_till INTEGER NOT NULL,
  anvand INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session (
  hash TEXT PRIMARY KEY,
  epost TEXT NOT NULL,
  giltig_till INTEGER NOT NULL
);
