import React from "react";
import { cn } from "./utils/cn";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
export type BadgeSize = "sm" | "md";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
};

const variantClass: Record<BadgeVariant, string> = {
  default: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

const sizeClass: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
};

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  size = "md",
  ...props
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-lg border font-medium tracking-tight",
      variantClass[variant],
      sizeClass[size],
      className
    )}
    {...props}
  />
);
