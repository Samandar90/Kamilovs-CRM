BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE cash_register_shifts ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE cash_register_entries ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS clinic_id bigint;
ALTER TABLE nurses ADD COLUMN IF NOT EXISTS clinic_id bigint;

UPDATE users SET clinic_id = COALESCE(clinic_id, 1);
UPDATE doctors SET clinic_id = COALESCE(clinic_id, 1);
UPDATE services SET clinic_id = COALESCE(clinic_id, 1);
UPDATE patients SET clinic_id = COALESCE(clinic_id, 1);
UPDATE appointments SET clinic_id = COALESCE(clinic_id, 1);
UPDATE invoices SET clinic_id = COALESCE(clinic_id, 1);
UPDATE invoice_items SET clinic_id = COALESCE(clinic_id, 1);
UPDATE payments SET clinic_id = COALESCE(clinic_id, 1);
UPDATE cash_register_shifts SET clinic_id = COALESCE(clinic_id, 1);
UPDATE cash_register_entries SET clinic_id = COALESCE(clinic_id, 1);
UPDATE expenses SET clinic_id = COALESCE(clinic_id, 1);
UPDATE nurses SET clinic_id = COALESCE(clinic_id, 1);

ALTER TABLE users ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE doctors ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE services ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patients ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE invoice_items ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE cash_register_shifts ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE cash_register_entries ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE nurses ALTER COLUMN clinic_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id ON doctors(clinic_id);
CREATE INDEX IF NOT EXISTS idx_services_clinic_id ON services(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_invoices_clinic_id ON invoices(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payments_clinic_id ON payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_shifts_clinic_id ON cash_register_shifts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_entries_clinic_id ON cash_register_entries(clinic_id);
CREATE INDEX IF NOT EXISTS idx_expenses_clinic_id ON expenses(clinic_id);
CREATE INDEX IF NOT EXISTS idx_nurses_clinic_id ON nurses(clinic_id);

COMMIT;
