/* Skapad av scripts/schema.js från migrations/. Ändra inte här: ändra i migrations/ och kör npm run bygg. */
export const MIGRERINGAR = [
  {
    "namn": "0001_start.sql",
    "uttryck": [
      "CREATE TABLE IF NOT EXISTS klubb ( id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, namn TEXT NOT NULL, motto TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'vantar' CHECK (status IN ('vantar', 'aktiv', 'avstangd')), skapad TEXT NOT NULL )",
      "CREATE TABLE IF NOT EXISTS klubb_admin ( klubb_id INTEGER NOT NULL REFERENCES klubb (id) ON DELETE CASCADE, epost TEXT NOT NULL, skapad TEXT NOT NULL, PRIMARY KEY (klubb_id, epost) )",
      "CREATE INDEX IF NOT EXISTS klubb_admin_epost ON klubb_admin (epost)",
      "CREATE TABLE IF NOT EXISTS lag ( id INTEGER PRIMARY KEY AUTOINCREMENT, klubb_id INTEGER NOT NULL REFERENCES klubb (id) ON DELETE CASCADE, slug TEXT NOT NULL, namn TEXT NOT NULL, kampanj TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast', 'granskas', 'snart', 'pagar', 'avslutad')), swish_nummer TEXT NOT NULL DEFAULT '', mottagare TEXT NOT NULL DEFAULT '', meddelande TEXT NOT NULL DEFAULT '', pris REAL NOT NULL DEFAULT 0, inkopspris REAL NOT NULL DEFAULT 0, minimum INTEGER NOT NULL DEFAULT 0, mal INTEGER NOT NULL DEFAULT 0, max_antal INTEGER NOT NULL DEFAULT 50, kartong INTEGER NOT NULL DEFAULT 0, nyckel_hash TEXT NOT NULL, nasta_order INTEGER NOT NULL DEFAULT 1, kommentar TEXT NOT NULL DEFAULT '', produkt TEXT NOT NULL DEFAULT '', detalj TEXT NOT NULL DEFAULT '', enhet_en TEXT NOT NULL DEFAULT '', enhet TEXT NOT NULL DEFAULT '', intro TEXT NOT NULL DEFAULT '', utlamning_text TEXT NOT NULL DEFAULT '', belonning TEXT NOT NULL DEFAULT '', lager INTEGER NOT NULL DEFAULT 0, UNIQUE (klubb_id, slug) )",
      "CREATE TABLE IF NOT EXISTS bestallning ( id INTEGER PRIMARY KEY AUTOINCREMENT, lag_id INTEGER NOT NULL REFERENCES lag (id) ON DELETE RESTRICT, nr INTEGER NOT NULL, tid TEXT NOT NULL, barn TEXT NOT NULL, mobil TEXT NOT NULL, antal INTEGER NOT NULL CHECK (antal >= 1), belopp REAL NOT NULL, betald TEXT NOT NULL DEFAULT '' CHECK (betald IN ('', 'JA', 'AVBRUTEN')), hamtad TEXT NOT NULL DEFAULT '' CHECK (hamtad IN ('', 'JA')), kod TEXT, UNIQUE (lag_id, nr) )",
      "CREATE UNIQUE INDEX IF NOT EXISTS bestallning_kod ON bestallning (lag_id, kod) WHERE kod IS NOT NULL",
      "CREATE TABLE IF NOT EXISTS logg ( id INTEGER PRIMARY KEY AUTOINCREMENT, tid TEXT NOT NULL, klubb_id INTEGER, lag_slug TEXT NOT NULL DEFAULT '', atgard TEXT NOT NULL, order_nr TEXT NOT NULL DEFAULT '', varde TEXT NOT NULL DEFAULT '' )",
      "CREATE TABLE IF NOT EXISTS sparr ( nyckel TEXT PRIMARY KEY, antal INTEGER NOT NULL, till INTEGER NOT NULL )",
      "CREATE TABLE IF NOT EXISTS inloggningslank ( hash TEXT PRIMARY KEY, epost TEXT NOT NULL, giltig_till INTEGER NOT NULL, anvand INTEGER NOT NULL DEFAULT 0 )",
      "CREATE TABLE IF NOT EXISTS session ( hash TEXT PRIMARY KEY, epost TEXT NOT NULL, giltig_till INTEGER NOT NULL )"
    ]
  },
  {
    "namn": "0002_pengar_och_notiser.sql",
    "uttryck": [
      "ALTER TABLE klubb ADD COLUMN bankgiro TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE lag ADD COLUMN godkant TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE lag ADD COLUMN pengar_skickat_kr REAL NOT NULL DEFAULT 0",
      "ALTER TABLE lag ADD COLUMN pengar_skickat_tid TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE lag ADD COLUMN pengar_mottaget_tid TEXT NOT NULL DEFAULT ''"
    ]
  }
];
