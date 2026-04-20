# Production RBAC

## Источник правды

- `src/auth/permissions.ts` — матрица `ROLE_PERMISSIONS`, `hasPermission`, `checkPermission` в роутерах.
- `src/middleware/permissionMiddleware.ts` — `checkPermission(module, action)`.
- Дополнительно: `src/services/clinicalDataScope.ts` (скрытие клиники в JSON, scope врача/медсестры), `appointmentsService`, `usersService` (superadmin-only для пользователей).

## Модули и действия

Модули: `patients`, `doctors`, `services`, `appointments`, `invoices`, `payments`, `cash`, `reports`, `users`, `ai`.

Действия: `read`, `create`, `update`, `delete`.

`superadmin` — полный доступ (в `hasPermission` обрабатывается до матрицы).

## Middleware

```ts
router.get("/", requireAuth, checkPermission("patients", "read"), handler);
```

## Frontend

Дублирование матрицы: `apps/web/src/auth/permissions.ts` (синхронизировать с API).

Навигация и guards: `roleGroups.ts` (`rolesWithPermission`, `hasPermission`, производные списки ролей).

## 2FA

Удалено: нет `verify-2fa`, нет OTP в `AuthService`, колонка `two_factor_enabled` в ответах не используется. Для PostgreSQL опционально: `DROP TABLE auth_otp_codes` (см. `sql/rbac_roles_v2_migration.sql`).

## Миграция PostgreSQL

См. `src/sql/rbac_roles_v2_migration.sql` — обновление `CHECK` на роли и маппинг `admin` → `superadmin`, `lab` → `operator`.
