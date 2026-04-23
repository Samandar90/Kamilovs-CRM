import React, { useLayoutEffect, useRef } from "react";
import {
  formatMoney,
  moneyCaretAfterDigitCount,
  moneyDigitCountBeforeCaret,
  parseMoney,
  sanitizeMoneyInput,
} from "../lib/formatMoney";

export type MoneyInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Целые сумы (услуги, цена записи). Дробный режим — касса, оплата, возврат. */
  mode?: "integer" | "decimal";
  min?: number;
  max?: number;
};

const clamp = (n: number, min?: number, max?: number): number => {
  let x = n;
  if (min !== undefined && x < min) x = min;
  if (max !== undefined && x > max) x = max;
  return x;
};

export const MoneyInput: React.FC<MoneyInputProps> = ({
  id,
  value,
  onChange,
  disabled,
  className,
  placeholder = "0",
  mode = "integer",
  min,
  max,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigitsRef = useRef<number | null>(null);

  const safe = Number.isFinite(value) ? value : 0;
  const display =
    mode === "integer"
      ? safe === 0
        ? ""
        : formatMoney(Math.trunc(safe))
      : formatMoney(Math.round(safe * 100) / 100);

  useLayoutEffect(() => {
    if (caretDigitsRef.current === null) return;
    const el = inputRef.current;
    if (!el) return;
    const v = Number.isFinite(value) ? value : 0;
    const nextDisplay =
      mode === "integer"
        ? v === 0
          ? ""
          : formatMoney(Math.trunc(v))
        : formatMoney(Math.round(v * 100) / 100);
    const pos = moneyCaretAfterDigitCount(nextDisplay, caretDigitsRef.current);
    caretDigitsRef.current = null;
    el.setSelectionRange(pos, pos);
  }, [value, mode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    caretDigitsRef.current = moneyDigitCountBeforeCaret(el.value, el.selectionStart ?? 0);

    let next: number;
    if (mode === "integer") {
      const digits = sanitizeMoneyInput(el.value);
      next = digits === "" ? 0 : Number(digits);
      if (!Number.isFinite(next)) next = 0;
      next = Math.trunc(next);
    } else {
      next = parseMoney(el.value);
      next = Math.round(next * 100) / 100;
    }

    next = clamp(next, min, max);
    onChange(next);
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode={mode === "integer" ? "numeric" : "decimal"}
      autoComplete="off"
      disabled={disabled}
      value={display}
      placeholder={placeholder}
      onChange={handleChange}
      className={className}
    />
  );
};
