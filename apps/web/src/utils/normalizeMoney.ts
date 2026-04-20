/**
 * Приводит сумму из UI / API (пробелы, запятая) к числу для тел запросов.
 * @deprecated предпочтительно `shared/lib/money` — `normalizeMoneyInput`
 */
import { normalizeMoneyInput } from "../shared/lib/money";

export const normalizeMoney = (value: string | number): number => {
  const n = normalizeMoneyInput(value);
  return n ?? Number.NaN;
};
