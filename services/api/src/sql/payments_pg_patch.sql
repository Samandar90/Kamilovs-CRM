CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  void_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_created_active
ON payments (invoice_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_created_active
ON payments (created_at DESC)
WHERE deleted_at IS NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key_client_supplied BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS uq_payments_idempotency_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_idempotency_user_client
  ON payments (created_by, idempotency_key)
  WHERE deleted_at IS NULL
    AND idempotency_key_client_supplied = true
    AND created_by IS NOT NULL;
