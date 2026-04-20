-- Users table for authentication and admin user management (PostgreSQL).
-- Apply after core schema (doctors table must exist for FK doctor_id).

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(128) NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'admin',
      'manager',
      'doctor',
      'cashier'
    )
  ),
  is_active BOOLEAN NOT NULL DEFAULT true,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ NULL,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
ON users (lower(trim(username)));

CREATE INDEX IF NOT EXISTS idx_users_role_active
ON users (role, is_active)
WHERE is_active = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_otp_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temp_token_hash TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts_left INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS login_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
