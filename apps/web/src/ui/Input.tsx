import React from "react";
import { cn } from "./utils/cn";

export type InputSize = "sm" | "md" | "lg";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  inputSize?: InputSize;
};

const sizeClass: Record<InputSize, string> = {
  sm: "h-8 text-xs rounded-[10px] px-2.5",
  /** Stripe-like: 44px, 10px radius, 12px horizontal padding */
  md: "h-11 text-sm rounded-[10px] px-3 py-3",
  lg: "h-12 text-sm rounded-xl px-3.5",
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize = "md", type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "input w-full border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
        "transition-all duration-200 ease-out",
        "focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-500/35",
        "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
        sizeClass[inputSize],
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
