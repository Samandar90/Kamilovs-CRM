import { formatMoney as formatMoneySpaced } from "../formatMoney";

/** Группы по 3 цифры (пробел), без Intl. */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return formatMoneySpaced(value);
}

export function formatMoneySum(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatMoneySpaced(value)} сум`;
}
