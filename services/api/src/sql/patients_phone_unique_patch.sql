CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_phone_active
ON patients (phone)
WHERE deleted_at IS NULL;
