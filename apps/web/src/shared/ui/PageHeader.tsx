import React from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>
);

