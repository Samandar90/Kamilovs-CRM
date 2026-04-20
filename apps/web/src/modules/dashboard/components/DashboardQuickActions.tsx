import React from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export type DashboardQuickActionItem = {
  to: string;
  label: string;
  subLabel?: string;
  icon: LucideIcon;
  disabled?: boolean;
  disabledReason?: string;
};

type DashboardQuickActionsProps = {
  items: DashboardQuickActionItem[];
};

export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  items,
}) => {
  if (items.length === 0) return null;

  const firstEnabledIndex = items.findIndex((i) => !i.disabled);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#0f172a]">Быстрые действия</h2>
        <p className="mt-0.5 text-sm text-[#64748b]">Частые сценарии в один клик</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isPrimary = index === firstEnabledIndex && !item.disabled;

          const baseClass =
            "group relative flex min-h-[3.5rem] items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform";
          const lift =
            "hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_14px_40px_-18px_rgba(15,23,42,0.14)] active:translate-y-0 active:scale-[0.99]";
          const primaryClass = `${baseClass} border-[#16a34a] bg-[#16a34a] text-white shadow-[0_8px_28px_-12px_rgba(22,163,74,0.55)] ${lift} hover:border-[#22c55e] hover:bg-[#22c55e]`;
          const secondaryClass = `${baseClass} border-[#e5e7eb] bg-white text-[#0f172a] ${lift} hover:border-[#e2e8f0] hover:bg-[#f1f5f9]`;
          const disabledClass = `${baseClass} cursor-not-allowed border-[#e5e7eb] bg-[#f8fafc] opacity-60`;

          if (item.disabled) {
            return (
              <div
                key={`${item.to}-${item.label}`}
                className={disabledClass}
                aria-disabled="true"
                title={item.disabledReason ?? "Недоступно для текущей роли"}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#94a3b8]">
                  <Icon className="h-5 w-5" strokeWidth={1.85} />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-[#64748b]">{item.label}</p>
                  {item.subLabel ? (
                    <p className="truncate text-xs text-[#94a3b8]">{item.subLabel}</p>
                  ) : null}
                </div>
              </div>
            );
          }

          const className = isPrimary ? primaryClass : secondaryClass;

          return (
            <Link key={`${item.to}-${item.label}`} to={item.to} className={className}>
              {!isPrimary ? (
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-indigo-500/[0.06] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              ) : (
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/20 opacity-40 blur-2xl" />
              )}
              <div
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm ${
                  isPrimary
                    ? "border-white/25 bg-white/15 text-white"
                    : "border-indigo-100 bg-indigo-50 text-[#6366f1]"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.85} />
              </div>
              <div className="relative min-w-0 flex-1 text-left">
                <p className={`truncate text-sm font-semibold ${isPrimary ? "text-white" : "text-[#0f172a]"}`}>
                  {item.label}
                </p>
                {item.subLabel ? (
                  <p
                    className={`truncate text-xs ${isPrimary ? "text-emerald-100" : "text-[#64748b]"}`}
                  >
                    {item.subLabel}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
