import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";

export type SetupStep = {
  label: string;
  to: string;
};

type DashboardSetupBannerProps = {
  steps: SetupStep[];
};

export const DashboardSetupBanner: React.FC<DashboardSetupBannerProps> = ({
  steps,
}) => {
  if (steps.length === 0) return null;

  return (
    <div className="dashboard-card-enter relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[3px] hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.12)]">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-[#6366f1]">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[#0f172a]">Система ещё не настроена</h3>
          <p className="mt-1 text-sm text-[#64748b]">
            Пройдите шаги ниже — каждый пункт ведёт в нужный раздел.
          </p>
          <ol className="mt-4 space-y-2">
            {steps.map((step, i) => (
              <li key={step.to}>
                <Link
                  to={step.to}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 text-left text-sm font-medium text-[#0f172a] transition-all duration-200 hover:border-[#e2e8f0] hover:bg-white hover:shadow-sm active:scale-[0.99]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-xs font-semibold text-[#64748b]">
                      {i + 1}
                    </span>
                    {step.label}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#94a3b8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#6366f1]" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};
