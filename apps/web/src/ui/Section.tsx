import React from "react";
import { cn } from "./utils/cn";

export type SectionProps = React.HTMLAttributes<HTMLElement> & {
  title?: string;
  description?: string;
};

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  className,
  children,
  ...props
}) => (
  <section className={cn("space-y-4", className)} {...props}>
    {(title || description) && (
      <header className="space-y-1">
        {title ? <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2> : null}
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </header>
    )}
    {children}
  </section>
);
