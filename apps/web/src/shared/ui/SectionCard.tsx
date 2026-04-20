import React from "react";
import { cn } from "../../ui/utils/cn";

type SectionCardProps = React.HTMLAttributes<HTMLDivElement>;

export const SectionCard: React.FC<SectionCardProps> = ({ className, ...props }) => (
  <section
    className={cn(
      "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm",
      "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
      className
    )}
    {...props}
  />
);

