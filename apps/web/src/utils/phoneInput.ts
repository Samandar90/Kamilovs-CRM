const MAX_E164_DIGITS = 15;
const MAX_UZ_TOTAL_DIGITS = 12; // 998 + 9 national

/** Digits only, max length (no leading +). */
export function phoneDigitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, MAX_E164_DIGITS);
}

/**
 * Normalized value for API / state: `+` + up to 15 digits, or "".
 */
export function parsePhoneInputToNormalized(raw: string): string {
  const d = phoneDigitsOnly(raw);
  return d ? `+${d}` : "";
}

/**
 * Same as parsing any masked or compact string into +digits.
 */
export function phoneToApiValue(raw: string | null | undefined): string {
  return parsePhoneInputToNormalized(raw ?? "");
}

/** Load stored API phone into controlled normalized value for PhoneInput. */
export function storedPhoneToNormalized(stored: string | null | undefined): string {
  return parsePhoneInputToNormalized(stored ?? "");
}

function formatInternationalLoose(digits: string): string {
  if (!digits) return "";
  const first = digits[0];
  const rest = digits.slice(1);
  let s = `+${first}`;
  if (!rest) return s;
  for (let i = 0; i < rest.length; i += 3) {
    s += ` ${rest.slice(i, i + 3)}`;
  }
  return s;
}

/** +998 95 088 41 41 (998 + up to 9 national digits). */
function formatUz998Display(digits: string): string {
  const d = digits.slice(0, MAX_UZ_TOTAL_DIGITS);
  if (!d.startsWith("998")) {
    return formatInternationalLoose(d);
  }
  const rest = d.slice(3);
  let s = "+998";
  if (rest.length === 0) return s;

  s += ` ${rest.slice(0, 2)}`;
  if (rest.length <= 2) return s;

  s += ` ${rest.slice(2, Math.min(5, rest.length))}`;
  if (rest.length <= 5) return s;

  s += ` ${rest.slice(5, Math.min(7, rest.length))}`;
  if (rest.length <= 7) return s;

  s += ` ${rest.slice(7, Math.min(9, rest.length))}`;
  return s;
}

/**
 * Human-readable phone for the input (from normalized `+digits` or "").
 */
export function formatPhoneForDisplay(normalized: string | null | undefined): string {
  const d = phoneDigitsOnly(normalized ?? "");
  if (!d) return "";
  if (d.startsWith("998")) {
    return formatUz998Display(d);
  }
  return formatInternationalLoose(d);
}

export function digitCountBeforeCaret(display: string, caret: number): number {
  return display.slice(0, Math.max(0, caret)).replace(/\D/g, "").length;
}

export function caretAfterDigitCount(display: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++) {
    if (/\d/.test(display[i])) {
      seen += 1;
      if (seen === digitCount) {
        return i + 1;
      }
    }
  }
  return display.length;
}

/** @deprecated Prefer PhoneInput + parsePhoneInputToNormalized */
export function formatPhoneMaskInput(raw: string): string {
  return formatPhoneForDisplay(parsePhoneInputToNormalized(raw));
}

/** @deprecated Use storedPhoneToNormalized */
export function formatStoredPhoneForInput(stored: string | null | undefined): string {
  return formatPhoneForDisplay(storedPhoneToNormalized(stored));
}
