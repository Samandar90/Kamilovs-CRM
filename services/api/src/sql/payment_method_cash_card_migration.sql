-- Миграция: только cash | card; бывший безнал (bank_transfer и др.) → card.
-- Выполнить вручную на существующей БД до смены CHECK, если в таблицах были старые значения.

UPDATE payments SET method = 'card' WHERE method IS NOT NULL AND method <> 'cash';

UPDATE cash_register_entries SET method = 'card' WHERE method IS NOT NULL AND method <> 'cash';

-- PostgreSQL: снять старый CHECK и добавить новый (имена constraint могут отличаться — проверьте \d payments).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cash', 'card'));

ALTER TABLE cash_register_entries DROP CONSTRAINT IF EXISTS cash_register_entries_method_check;
ALTER TABLE cash_register_entries ADD CONSTRAINT cash_register_entries_method_check CHECK (method IN ('cash', 'card'));
