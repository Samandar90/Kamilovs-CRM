-- Baseline doctors table (API-facing fields map to first_name/last_name + dual name/specialty columns).
-- For existing databases created from an older definition, also apply doctors_dual_schema_patch.sql

CREATE TABLE IF NOT EXISTS doctors (
  id BIGSERIAL PRIMARY KEY,
  first_name VARCHAR(128) NOT NULL,
  last_name VARCHAR(128) NOT NULL,
  specialty VARCHAR(128) NOT NULL,
  full_name VARCHAR(255),
  name VARCHAR(255),
  speciality VARCHAR(128),
  percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_doctors_last_first_active
ON doctors (last_name, first_name)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_specialty_active
ON doctors (specialty)
WHERE deleted_at IS NULL;
