import type { InvoiceCreateInput } from "../modules/appointments/api/appointmentsFlowApi";
import { cleanMoney, normalizeMoneyInput } from "../shared/lib/money";

const toPositiveIntId = (value: unknown, fallback = 0): number => {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : Math.trunc(normalizeMoneyInput(String(value ?? "0")) ?? Number.NaN);
  return Number.isFinite(n) ? n : fallback;
};

const toPositiveQuantity = (value: unknown): number => {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : normalizeMoneyInput(String(value ?? "0"));
  const q = n ?? Number.NaN;
  return Number.isFinite(q) && q > 0 ? q : 1;
};

/**
 * POST /api/invoices: только числа, без строковых сумм и NaN в JSON.
 */
export function normalizeInvoiceCreatePayload(raw: InvoiceCreateInput): InvoiceCreateInput {
  const items = raw.items.map((item) => {
    const line: InvoiceCreateInput["items"][number] = {
      serviceId: toPositiveIntId(item.serviceId),
      quantity: toPositiveQuantity(item.quantity),
    };
    if (item.description != null && String(item.description).trim() !== "") {
      line.description = String(item.description).trim();
    }
    if (
      "price" in item &&
      item.price !== undefined &&
      item.price !== null &&
      String(item.price).trim() !== ""
    ) {
      const p = cleanMoney(item.price);
      if (Number.isFinite(p)) {
        line.price = p;
      }
    }
    return line;
  });

  const out: InvoiceCreateInput = {
    patientId: toPositiveIntId(raw.patientId),
    appointmentId: toPositiveIntId(raw.appointmentId),
    items,
  };

  if (raw.status != null) {
    out.status = raw.status;
  }

  if (raw.discount !== undefined && raw.discount !== null) {
    const d = normalizeMoneyInput(raw.discount as string | number);
    if (d != null && Number.isFinite(d) && d >= 0) {
      out.discount = d;
    }
  }

  return out;
}
