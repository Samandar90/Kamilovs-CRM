export { sanitizeNumericString } from "./sanitizeNumericString";
export {
  parseNumericInput,
  parseMoneyInput,
  parseNumericFromPg,
  parseRequiredNumber,
  parseRequiredMoney,
  parseNonNegativeMoneyFromPg,
  parseRequiredMoneyFromPg,
} from "./parseNumericInput";
export { formatMoneyForUi } from "./formatMoneyForUi";

import { parseNumericFromPg } from "./parseNumericInput";

/** Число из PG для mapRow: числовые колонки numeric/float8, без NaN в DTO. */
export function parseMoneyColumn(value: string | number | null | undefined, fallback = 0): number {
  return parseNumericFromPg(value) ?? fallback;
}

/** Округление до копеек (бизнес-логика денег). */
export function roundMoney2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
