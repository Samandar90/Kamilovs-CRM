import React from "react";
import { cn } from "./utils/cn";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Rounded full for circles */
  circle?: boolean;
};

export const Skeleton: React.FC<SkeletonProps> = ({ className, circle, ...props }) => (
  <div
    className={cn(
      "animate-pulse bg-slate-200/80",
      circle ? "rounded-full" : "rounded-xl",
      className
    )}
    {...props}
  />
);

export type SkeletonTextProps = React.HTMLAttributes<HTMLDivElement> & {
  lines?: number;
};

export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 1, className, ...props }) => (
  <div className={cn("space-y-2", className)} {...props}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={cn("h-3 w-full", i === lines - 1 && "w-4/5")} />
    ))}
  </div>
);
