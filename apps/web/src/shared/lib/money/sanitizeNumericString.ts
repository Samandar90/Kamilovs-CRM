/** Должен совпадать с `services/api/src/utils/numbers/sanitizeNumericString.ts`. */
export function sanitizeNumericString(raw: string): string {
  let s = String(raw).trim();
  if (!s) return "";

  s = s.replace(/[\u00a0\u2009\u202f\u2007\u2008\u2028\u2029]/g, " ");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*(сум|uzs|UZS|руб\.?|₽|\$|сом)\s*$/gi, "").trim();
  s = s.replace(/ /g, "");

  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;

  if (!body) {
    return neg ? "-" : "";
  }

  let n = body;

  const hasComma = n.includes(",");
  const hasDot = n.includes(".");

  if (hasComma && hasDot) {
    const lastComma = n.lastIndexOf(",");
    const lastDot = n.lastIndexOf(".");
    if (lastComma > lastDot) {
      n = n.replace(/\./g, "").replace(",", ".");
    } else {
      n = n.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const parts = n.split(",");
    if (parts.length === 2 && /^-?\d+$/.test(parts[0] ?? "") && /^\d{1,4}$/.test(parts[1] ?? "")) {
      const dec = parts[1]!.length;
      if (dec <= 2) {
        n = `${parts[0]}.${parts[1]}`;
      } else {
        n = parts.join("");
      }
    } else {
      n = n.replace(/,/g, "");
    }
  } else if (!hasComma && hasDot) {
    const parts = n.split(".");
    if (parts.length > 2) {
      const last = parts[parts.length - 1] ?? "";
      if (/^\d{1,4}$/.test(last) && last.length <= 4 && parts.length >= 2) {
        const head = parts.slice(0, -1).join("");
        n = `${head}.${last}`;
      }
    }
  }

  return neg ? `-${n}` : n;
}
