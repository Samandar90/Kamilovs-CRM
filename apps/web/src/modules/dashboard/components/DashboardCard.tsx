import React from "react";
import type { LucideIcon } from "lucide-react";

/** Цветная иконка на белом фоне карточки (SaaS KPI) */
export type DashboardIconTone = "emerald" | "indigo" | "violet" | "amber" | "sky" | "rose";

const toneStyles: Record<
  DashboardIconTone,
  { box: string; icon: string }
> = {
  emerald: {
    box: "border-emerald-200/80 bg-emerald-50",
    icon: "text-emerald-600",
  },
  indigo: {
    box: "border-indigo-200/80 bg-indigo-50",
    icon: "text-indigo-600",
  },
  violet: {
    box: "border-violet-200/80 bg-violet-50",
    icon: "text-violet-600",
  },
  amber: {
    box: "border-amber-200/80 bg-amber-50",
    icon: "text-amber-600",
  },
  sky: {
    box: "border-sky-200/80 bg-sky-50",
    icon: "text-sky-600",
  },
  rose: {
    box: "border-rose-200/80 bg-rose-50",
    icon: "text-rose-600",
  },
};

export type DashboardCardProps = {
  /** Подпись метрики */
  title: string;
  value: string;
  icon: LucideIcon;
  animationIndex: number;
  valueMuted?: boolean;
  /** Подзаголовок под значением (контекст периода и т.д.) */
  subtitle?: string;
  hint?: string;
  comparisonHint?: string;
  footnote?: string;
  loading?: boolean;
  /** Акцент иконки */
  iconTone?: DashboardIconTone;
  className?: string;
  /** Крупная метрика «как в банковском приложении» (выручка): цвет по сумме */
  revenueHighlight?: boolean;
  /** Сумма в минимальных единицах для окраски value (0 = серый, >0 = зелёный) */
  revenueAmount?: number;
};

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  icon: Icon,
  animationIndex,
  valueMuted,
  subtitle,
  hint,
  comparisonHint,
  footnote,
  loading,
  iconTone = "emerald",
  className,
  revenueHighlight,
  revenueAmount = 0,
}) => {
  const tone = toneStyles[iconTone];
  const revenueZero = revenueHighlight && !loading && !valueMuted && revenueAmount === 0;
  const revenuePositive = revenueHighlight && !loading && !valueMuted && revenueAmount > 0;

  if (revenueHighlight) {
    return (
      <div
        className={`dashboard-card-enter group relative flex min-h-[140px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-transform duration-100 ease-out active:scale-[0.98] max-md:active:scale-[0.98] md:transition-all md:duration-200 md:ease-[cubic-bezier(0.22,1,0.36,1)] md:hover:-translate-y-0.5 md:hover:shadow-md md:hover-scale-subtle ${className ?? ""}`}
        style={{
          animationDelay: `${animationIndex * 55}ms`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{title}</p>
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm md:transition-transform md:duration-200 md:group-hover:scale-[1.02] ${tone.box}`}
          >
            <Icon className={`h-[18px] w-[18px] ${tone.icon}`} strokeWidth={1.75} />
          </div>
        </div>
        {loading ? (
          <div className="mt-4 h-9 w-44 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <p
            className={`mt-2 text-[clamp(1.75rem,6vw,2rem)] font-bold leading-none tracking-tight tabular-nums md:text-[1.875rem] md:font-semibold ${
              valueMuted ? "text-slate-300" : revenueZero ? "text-slate-400" : revenuePositive ? "text-emerald-600" : "text-slate-900"
            }`}
          >
            {value}
          </p>
        )}
        {hint && !loading && !valueMuted ? (
          <p className="mt-2 text-xs font-medium text-[#64748b]">{hint}</p>
        ) : null}
        {comparisonHint && !loading && !valueMuted ? (
          <p className="mt-1.5 text-[11px] font-medium tabular-nums text-[#94a3b8]">{comparisonHint}</p>
        ) : null}
        {footnote && !loading ? <p className="mt-2 text-xs text-[#64748b]">{footnote}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={`dashboard-card-enter group relative flex min-h-[168px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm transition-transform duration-100 ease-out active:scale-[0.98] max-md:active:scale-[0.98] md:transition-all md:duration-200 md:ease-[cubic-bezier(0.22,1,0.36,1)] md:hover:-translate-y-0.5 md:hover:shadow-md md:hover-scale-subtle ${className ?? ""}`}
      style={{
        animationDelay: `${animationIndex * 55}ms`,
      }}
    >
      <div className="relative flex items-start gap-3">
        <div
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm md:transition-transform md:duration-200 md:group-hover:scale-[1.02] ${tone.box}`}
        >
          <Icon className={`h-5 w-5 ${tone.icon}`} strokeWidth={1.85} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium tracking-wide text-[#64748b]">{title}</p>
          {subtitle ? <p className="mt-0.5 text-[11px] text-[#94a3b8]">{subtitle}</p> : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-5 h-10 w-40 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <p
          className={`mt-4 text-2xl font-semibold leading-tight tracking-tight tabular-nums ${
            valueMuted ? "text-[#94a3b8]" : "text-[#0f172a]"
          }`}
        >
          {value}
        </p>
      )}
      {hint && !loading && !valueMuted ? (
        <p className="mt-2 text-xs font-medium text-[#64748b]">{hint}</p>
      ) : null}
      {comparisonHint && !loading && !valueMuted ? (
        <p className="mt-1.5 text-[11px] font-medium tabular-nums text-[#94a3b8]">
          {comparisonHint}
        </p>
      ) : null}
      {footnote && !loading ? (
        <p className="mt-2 text-xs text-[#64748b]">{footnote}</p>
      ) : null}
    </div>
  );
};
