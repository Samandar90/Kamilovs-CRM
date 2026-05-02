/** Источники названия клиники для квитанции (без хардкода бренда). */
export type ReceiptClinicSource = {
  clinic?: { id?: number; name?: string | null } | null;
  clinicName?: string | null;
};

/**
 * Имя для шапки чека: из счёта (JOIN clinics), иначе из meta API, иначе нейтральная подпись.
 */
export function resolveReceiptClinicName(
  invoice: ReceiptClinicSource | null | undefined,
  metaClinicName?: string | null
): string {
  const fromInvoice = invoice?.clinic?.name?.trim() || invoice?.clinicName?.trim() || "";
  if (fromInvoice) return fromInvoice;
  const fromMeta = metaClinicName?.trim() || "";
  if (fromMeta) return fromMeta;
  return "Клиника";
}
