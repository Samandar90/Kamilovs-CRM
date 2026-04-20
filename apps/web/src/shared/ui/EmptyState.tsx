import React from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle, action }) => (
  <div className="px-4 py-10 text-center">
    <Inbox className="mx-auto mb-2 h-5 w-5 text-gray-400" />
    <p className="text-sm font-medium text-gray-700">{title}</p>
    {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
  </div>
);

