CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_doctor_active_no_overlap'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_doctor_active_no_overlap
    EXCLUDE USING gist (
      doctor_id WITH =,
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (
      deleted_at IS NULL
      AND status IN ('scheduled', 'confirmed', 'arrived', 'in_consultation')
    );
  END IF;
END
$$;
