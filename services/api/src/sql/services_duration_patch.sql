ALTER TABLE services
ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'services_duration_positive'
  ) THEN
    ALTER TABLE services
    ADD CONSTRAINT services_duration_positive CHECK (duration > 0);
  END IF;
END
$$;
