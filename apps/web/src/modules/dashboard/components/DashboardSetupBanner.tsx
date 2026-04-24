import React from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SetupStep = {
  label: string;
  to: string;
  done?: boolean;
  icon: LucideIcon;
};

type DashboardSetupBannerProps = {
  steps: SetupStep[];
};

export const DashboardSetupBanner: React.FC<DashboardSetupBannerProps> = ({ steps }) => {
  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;

  return (
    <div className="dashboard-card-enter rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm md:p-5 md:shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] md:transition-all md:duration-300 md:ease-[cubic-bezier(0.22,1,0.36,1)] md:hover:-translate-y-[2px] md:hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <h3 className="text-xs font-semibold tracking-tight text-slate-900 md:text-sm">Первые шаги</h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
          {doneCount}/{total} выполнено
        </span>
      </div>
      <ul className="mt-1 divide-y divide-slate-100">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.to}>
              <Link
                to={step.to}
                className="flex min-h-[48px] items-center justify-between gap-3 py-2.5 transition-transform duration-100 ease-out active:scale-[0.98] md:py-3 md:transition-colors md:duration-150 md:active:scale-100"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium text-slate-800">{step.label}</span>
                </span>
                {step.done ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2.25} aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={2} aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
