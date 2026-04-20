import React from "react";
import type { InvoiceStatus } from "../../api/cashDeskApi";

const LABELS: Record<InvoiceStatus, string> = {
  draft: "Черновик",
  issued: "К оплате",
  partially_paid: "Частично оплачен",
  paid: "Оплачен",
  cancelled: "Отменён",
  refunded: "Возврат",
};

/** Светлая палитра статусов — спокойный контраст, без тёмных заливок */
const styles: Record<InvoiceStatus, string> = {
  draft: "border border-slate-200 bg-slate-100 text-slate-600",
  issued: "border border-amber-200/80 bg-[#fef9c3] text-[#854d0e]",
  partially_paid: "border border-sky-200/80 bg-[#e0f2fe] text-[#075985]",
  paid: "border border-emerald-200/80 bg-[#dcfce7] text-[#166534]",
  cancelled: "border border-rose-200 bg-rose-50 text-rose-800",
  refunded: "border border-violet-200 bg-violet-50 text-violet-900",
};

type Props = {
  status: InvoiceStatus;
  className?: string;
};

export const InvoiceStatusBadge: React.FC<Props> = ({ status, className = "" }) => {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-tight tracking-wide transition-all duration-150 ease-out hover:opacity-90 ${styles[status]} ${className}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
};
