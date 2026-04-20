-- Dual-schema compatibility for doctors (historical name/full_name, specialty/speciality)
-- Run after baseline doctors table exists.

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS speciality VARCHAR(128);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS percent NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doctors_percent_range'
  ) THEN
    ALTER TABLE doctors
    ADD CONSTRAINT doctors_percent_range CHECK (percent >= 0 AND percent <= 100);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS doctor_services (
  doctor_id BIGINT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  PRIMARY KEY (doctor_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_services_service_id ON doctor_services (service_id);
