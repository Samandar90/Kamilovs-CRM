import React from "react";
import { Sparkles } from "lucide-react";
import { formatSum } from "../../../utils/formatMoney";

type Props = {
  revenue: number;
  growthPct: number | null;
  averageCheck: number;
  paymentsCount: number;
  topDoctor?: string | null;
  topService?: string | null;
  loading: boolean;
};

export const ReportsInsights: React.FC<Props> = ({
  revenue,
  growthPct,
  averageCheck,
  paymentsCount,
  topDoctor,
  topService,
  loading,
}) => {
  const growthText =
    growthPct == null
      ? "Недостаточно исторических данных для оценки динамики."
      : growthPct > 0
        ? `Выручка растёт: +${Math.round(growthPct)}% к прошлому периоду.`
        : growthPct < 0
          ? `Выручка снизилась на ${Math.abs(Math.round(growthPct))}% к прошлому периоду.`
          : "Выручка на уровне прошлого периода.";

  const doctorText = topDoctor ? `Лидер среди врачей: ${topDoctor}.` : "Нет выраженного лидера среди врачей.";
  const serviceText = topService ? `Лидер по услугам: ${topService}.` : "Нет выраженного лидера по услугам.";

  return (
    <section className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-base font-semibold text-slate-950">AI-выводы</h3>
      </div>
      {loading ? (
        <div className="mt-4 h-28 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          <p>{growthText}</p>
          <p>
            Общая выручка: <span className="font-semibold text-slate-900">{formatSum(revenue)}</span>, средний чек:{" "}
            <span className="font-semibold text-slate-900">{formatSum(averageCheck)}</span>, оплат:{" "}
            <span className="font-semibold text-slate-900">{paymentsCount}</span>.
          </p>
          <p>{doctorText}</p>
          <p>{serviceText}</p>
        </div>
      )}
    </section>
  );
};

