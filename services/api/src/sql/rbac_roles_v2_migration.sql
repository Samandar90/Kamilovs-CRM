-- RBAC v2: новые роли и снятие CHECK со старым enum.
-- Выполнить вручную на существующей БД (один раз).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'superadmin',
      'reception',
      'doctor',
      'nurse',
      'cashier',
      'operator',
      'accountant',
      'manager',
      'director'
    )
  );

-- Миграция старых значений (если были)
UPDATE users SET role = 'superadmin' WHERE role = 'admin';
UPDATE users SET role = 'operator' WHERE role = 'lab';

-- Таблица OTP больше не используется (2FA отключён)
DROP TABLE IF EXISTS auth_otp_codes;
