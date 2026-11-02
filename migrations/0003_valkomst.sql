-- Välkomstmejl och guiden Kom igång för klubbens administratörer.
-- Läggs in en gång (Workern bokför det i d1_migrations), så ALTER TABLE körs aldrig två gånger.

-- 0: en ny administratör som ska få ett välkomstmejl med en länk. 1: mejlet är skickat, eller administratören fanns redan före den här ändringen.
ALTER TABLE klubb_admin ADD COLUMN valkommen INTEGER NOT NULL DEFAULT 1;

-- 1 när klubbens administratör har gått igenom guiden Kom igång eller stängt den.
ALTER TABLE klubb ADD COLUMN guide_klar INTEGER NOT NULL DEFAULT 0;
