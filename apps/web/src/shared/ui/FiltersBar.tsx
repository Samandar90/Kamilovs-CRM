import React from "react";
import { cn } from "../../ui/utils/cn";
import { SectionCard } from "./SectionCard";

type FiltersBarProps = React.HTMLAttributes<HTMLDivElement>;

export const FiltersBar: React.FC<FiltersBarProps> = ({ className, ...props }) => (
  <SectionCard className={cn("crm-filters-shell grid grid-cols-1 gap-4 md:grid-cols-4", className)} {...props} />
);

