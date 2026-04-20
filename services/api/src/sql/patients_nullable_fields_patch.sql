-- Allow quick-create payloads with nullable optional patient fields.
-- Safe to run multiple times.
ALTER TABLE patients ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN birth_date DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN gender DROP NOT NULL;

