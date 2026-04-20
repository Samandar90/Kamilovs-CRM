import React from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

type DashboardEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional primary CTA (e.g. navigate to create flow). */
  action?: { label: string; to: string };
};

export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-2 py-16 text-center">
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-3xl bg-[#f3f4f6] blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-[#e5e7eb] bg-[#f9fafb] text-[#9ca3af] shadow-sm">
          <Icon className="h-8 w-8" strokeWidth={1.5} />
        </div>
      </div>
      <div className="max-w-sm space-y-2">
        <p className="text-base font-medium leading-snug text-[#0f172a]">{title}</p>
        {description ? <p className="text-sm leading-relaxed text-[#64748b]">{description}</p> : null}
      </div>
      {action ? (
        <Link
          to={action.to}
          className="crm-btn-interactive inline-flex items-center justify-center rounded-xl bg-[#16a34a] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(22,163,74,0.4)] transition-colors hover:bg-[#22c55e]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
};
