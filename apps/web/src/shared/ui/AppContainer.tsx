import React from "react";
import { cn } from "../../ui/utils/cn";

type AppContainerProps = React.HTMLAttributes<HTMLDivElement>;

export const AppContainer: React.FC<AppContainerProps> = ({ className, ...props }) => (
  <div className={cn("crm-page-enter mx-auto w-full max-w-7xl px-5 py-8 md:px-8", className)} {...props} />
);

