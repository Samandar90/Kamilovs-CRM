ALTER TABLE patients
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_patients_not_deleted_created_at
ON patients (created_at DESC)
WHERE deleted_at IS NULL;
