import React from "react";
import { Loader2 } from "lucide-react";

type PageLoaderProps = {
  label?: string;
};

export const PageLoader: React.FC<PageLoaderProps> = ({ label = "Загрузка..." }) => (
  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
    <Loader2 className="h-4 w-4 animate-spin" />
    {label}
  </div>
);

