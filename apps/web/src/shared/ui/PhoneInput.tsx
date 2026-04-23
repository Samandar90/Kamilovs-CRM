import React, { useLayoutEffect, useRef } from "react";
import {
  caretAfterDigitCount,
  digitCountBeforeCaret,
  formatPhoneForDisplay,
  parsePhoneInputToNormalized,
} from "../../utils/phoneInput";

export type PhoneInputProps = {
  id?: string;
  value: string;
  onChange: (normalized: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** When true, empty field on focus gets +998 (user can delete and enter +7, etc.). Default true. */
  defaultCountry998Prefix?: boolean;
};

export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  value,
  onChange,
  disabled,
  className,
  placeholder = "+998 00 000 00 00",
  autoComplete = "tel",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  defaultCountry998Prefix = true,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigitsRef = useRef<number | null>(null);

  const display = formatPhoneForDisplay(value);

  useLayoutEffect(() => {
    if (caretDigitsRef.current === null) return;
    const el = inputRef.current;
    if (!el) return;
    const next = formatPhoneForDisplay(value);
    const pos = caretAfterDigitCount(next, caretDigitsRef.current);
    caretDigitsRef.current = null;
    el.setSelectionRange(pos, pos);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    caretDigitsRef.current = digitCountBeforeCaret(el.value, el.selectionStart ?? 0);
    onChange(parsePhoneInputToNormalized(el.value));
  };

  const handleFocus = () => {
    if (!defaultCountry998Prefix || disabled) return;
    if (!value) {
      onChange("+998");
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete={autoComplete}
      disabled={disabled}
      value={display}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      onChange={handleChange}
      onFocus={handleFocus}
      className={className}
    />
  );
};
