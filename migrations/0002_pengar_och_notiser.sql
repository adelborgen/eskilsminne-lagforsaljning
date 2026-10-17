-- Pengarna efter en avslutad försäljning, och det klubben behöver för att se vad som ändrats.
-- Läggs in en gång (Workern bokför det i d1_migrations), så ALTER TABLE körs aldrig två gånger.

-- Klubbens bankgiro, dit lagen skickar pengarna när försäljningen är avslutad. Skrivs in av klubbens administratör.
ALTER TABLE klubb ADD COLUMN bankgiro TEXT NOT NULL DEFAULT '';

-- Det klubben senast godkände (försäljningens uppgifter som JSON), så att en ny granskning visar vad som har ändrats, till exempel Swish-numret.
ALTER TABLE lag ADD COLUMN godkant TEXT NOT NULL DEFAULT '';

-- Lagföräldern markerar att pengarna är skickade till klubben (belopp och tid), och klubben kvitterar när de har kommit.
ALTER TABLE lag ADD COLUMN pengar_skickat_kr REAL NOT NULL DEFAULT 0;
ALTER TABLE lag ADD COLUMN pengar_skickat_tid TEXT NOT NULL DEFAULT '';
ALTER TABLE lag ADD COLUMN pengar_mottaget_tid TEXT NOT NULL DEFAULT '';
