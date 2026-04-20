CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  doctor_id BIGINT NOT NULL REFERENCES doctors(id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'scheduled',
      'confirmed',
      'arrived',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show'
    )
  ),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_start_active
ON appointments (doctor_id, start_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_patient_start_active
ON appointments (patient_id, start_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_status_start_active
ON appointments (status, start_at)
WHERE deleted_at IS NULL;
