import React from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Modal } from "./Modal";
import { cn } from "./utils/cn";

export const AppShell: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("min-h-full bg-[#f8fafc] text-[#334155]", className)} {...props} />
);

export const PageContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("mx-auto w-full max-w-7xl space-y-6 px-5 py-8 md:px-8", className)} {...props} />
);

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>
);

export const SectionCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <Card className={cn("rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm", className)} {...props} />
);

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  trendTone?: "neutral" | "positive" | "negative";
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, subValue, trendTone = "neutral" }) => (
  <SectionCard>
    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">{label}</p>
    <p className="mt-2 text-3xl font-semibold tracking-tight text-[#0f172a]">{value}</p>
    {subValue ? (
      <p
        className={cn(
          "mt-1 text-xs",
          trendTone === "positive" && "text-emerald-600",
          trendTone === "negative" && "text-rose-600",
          trendTone === "neutral" && "text-[#64748b]"
        )}
      >
        {subValue}
      </p>
    ) : null}
  </SectionCard>
);

export const FiltersBar: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <SectionCard className={cn("grid grid-cols-1 gap-4 md:grid-cols-4", className)} {...props} />
);

type DataTableShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
};

export const DataTableShell: React.FC<DataTableShellProps> = ({
  children,
  title,
  subtitle,
  loading = false,
  isEmpty = false,
  emptyTitle = "Нет данных",
  emptyDescription = "Записи появятся после операций",
}) => (
  <SectionCard className="overflow-hidden p-0">
    {title || subtitle ? (
      <div className="border-b border-[#e5e7eb] px-4 py-3 sm:px-5">
        {title ? <p className="text-sm font-semibold text-[#0f172a]">{title}</p> : null}
        {subtitle ? <p className="mt-0.5 text-xs text-[#64748b]">{subtitle}</p> : null}
      </div>
    ) : null}
    {loading ? (
      <LoadingState title="Загрузка..." />
    ) : isEmpty ? (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    ) : (
      children
    )}
  </SectionCard>
);

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="px-4 py-10 text-center sm:px-5">
    <Inbox className="mx-auto mb-2 h-5 w-5 text-[#94a3b8]" />
    <p className="text-sm font-medium text-[#475569]">{title}</p>
    {description ? <p className="mt-1 text-sm text-[#64748b]">{description}</p> : null}
    {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
  </div>
);

type LoadingStateProps = {
  title?: string;
};

export const LoadingState: React.FC<LoadingStateProps> = ({ title = "Загрузка..." }) => (
  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#64748b] sm:px-5">
    <Loader2 className="h-4 w-4 animate-spin" />
    {title}
  </div>
);

type ErrorStateProps = {
  message: string;
  retryAction?: () => void;
};

export const ErrorState: React.FC<ErrorStateProps> = ({ message, retryAction }) => (
  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p>{message}</p>
        {retryAction ? (
          <button type="button" onClick={retryAction} className="mt-2 text-xs font-semibold underline underline-offset-2">
            Повторить
          </button>
        ) : null}
      </div>
    </div>
  </div>
);

type ModalShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  footer,
  className,
  children,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    className={cn("relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl", className)}
  >
    <div className="p-6">
      <h2 className="text-lg font-semibold text-[#0f172a]">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
    {footer ? <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-4">{footer}</div> : null}
  </Modal>
);

type FormFieldProps = {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
};

export const FormField: React.FC<FormFieldProps> = ({ label, error, hint, children }) => (
  <div>
    <label className="mb-1 block text-sm font-medium text-[#334155]">{label}</label>
    {children}
    {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-[#64748b]">{hint}</p> : null}
  </div>
);

type StatusBadgeProps = {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ tone = "neutral", children }) => (
  <span
    className={cn(
      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
      tone === "neutral" && "border-[#e5e7eb] bg-[#f8fafc] text-[#475569]",
      tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
      tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
      tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700",
      tone === "info" && "border-sky-200 bg-sky-50 text-sky-700"
    )}
  >
    {children}
  </span>
);

export const ActionButtonGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex flex-wrap items-center justify-end gap-2", className)} {...props} />
);

export const PrimaryActionButton = Button;
export const SecondaryActionButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  (props, ref) => <Button ref={ref} variant="secondary" {...props} />
);
SecondaryActionButton.displayName = "SecondaryActionButton";

