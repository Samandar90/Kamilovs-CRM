/** Человекочитаемая подпись позиции (fallback для синтетических строк API). */
export const lineItemDisplayLabel = (description: string): string => {
  const t = description.trim();
  if (t === "Invoice total" || t === "Итог по счёту") {
    return "Итог по услугам";
  }
  return t;
};
