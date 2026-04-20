import { formatMoney as formatMoneyPlain, formatMoneySum, normalizeMoneyInput } from "../shared/lib/money";

const normalizeAmount = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = normalizeMoneyInput(value);
  return n ?? 0;
};

/** Только число с разрядами, без «сум» (для JSX с суффиксом или печати). */
export const formatCurrency = (value: number | string | null | undefined): string => {
  const amount = normalizeAmount(value);
  if (!amount) return "0";
  return formatMoneyPlain(amount);
};

/** Uzbekistan so'm display (UI label «сум»). */
export const formatSum = (amount: number | string | null | undefined): string => {
  const n = normalizeAmount(amount);
  return formatMoneySum(n);
};

/** @deprecated Prefer `formatSum` — same output (UZS / сум). */
export const formatMoney = formatSum;
