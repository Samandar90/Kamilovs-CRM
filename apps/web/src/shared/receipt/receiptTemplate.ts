import { formatMoney } from "../lib/formatMoney";

export type ReceiptTemplateItem = {
  name: string;
  price: number;
};

export type ReceiptTemplateData = {
  clinicName: string;
  logoUrl?: string;
  patient: string;
  doctor?: string | null;
  invoiceId: string;
  date: string;
  paymentMethod: string;
  total: number;
  paid: number;
  items: ReceiptTemplateItem[];
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoneyUz = (value: number): string => `${formatMoney(value)} сум`;

const DEFAULT_CLINIC_LABEL = "Клиника";

export function buildReceiptHTML(data: ReceiptTemplateData): string {
  const itemsHtml =
    data.items.length > 0
      ? data.items
          .map(
            (item) => `
          <div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;">${escapeHtml(item.name)}</span>
            <span style="text-align:right;white-space:nowrap;">${escapeHtml(formatMoneyUz(item.price))}</span>
          </div>`
          )
          .join("")
      : `<div style="display:flex;justify-content:space-between;margin:2px 0;">
            <span>—</span><span>—</span>
         </div>`;

  const doctorValue =
    data.doctor && data.doctor.trim() !== "" ? data.doctor : "—";
  const clinicName =
    data.clinicName && data.clinicName.trim() !== ""
      ? data.clinicName.trim()
      : DEFAULT_CLINIC_LABEL;

  const resolvedLogoUrl =
    data.logoUrl && data.logoUrl.trim() !== "" ? data.logoUrl.trim() : `${window.location.origin}/logo.png`;

  const logoBlock = `<div style="text-align:center;margin:0 0 4px;">
      <img src="${escapeHtml(resolvedLogoUrl)}" alt="logo" style="display:block;width:56px;height:auto;margin:0 auto;" />
    </div>`;

  return `<div id="receipt" style="width:80mm;margin:0;padding:8px 10px;box-sizing:border-box;font-family:monospace;font-size:11px;line-height:1.3;color:#000;background:#fff;">
      ${logoBlock}
      <div style="text-align:center;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(clinicName)}</div>
      <div style="text-align:center;margin-top:2px;">Квитанция</div>
      <div style="border-top:1px dashed #000;margin:6px 0;"></div>

      <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>Дата:</span><span style="text-align:right;max-width:170px;">${escapeHtml(data.date)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>Пациент:</span><span style="text-align:right;max-width:170px;">${escapeHtml(data.patient)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>Врач:</span><span style="text-align:right;max-width:170px;">${escapeHtml(doctorValue)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>Счёт:</span><span>${escapeHtml(data.invoiceId)}</span></div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>Метод:</span><span>${escapeHtml(data.paymentMethod)}</span></div>

      <div style="border-top:1px dashed #000;margin:6px 0;"></div>
      ${itemsHtml}
      <div style="border-top:1px dashed #000;margin:6px 0;"></div>

      <div style="display:flex;justify-content:space-between;font-weight:700;margin:4px 0;">
        <span>ИТОГО</span><span>${escapeHtml(formatMoneyUz(data.total))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;">
        <span>Оплачено</span><span>${escapeHtml(formatMoneyUz(data.paid))}</span>
      </div>

      <div style="border-top:1px dashed #000;margin:8px 0 0;"></div>
      <div style="text-align:center;margin-top:6px;">Спасибо за визит!</div>
    </div>`;
}
