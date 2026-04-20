import React from "react";
import { useLocation, Link } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { cn } from "../ui/utils/cn";

const routeTitleMap: Record<string, string> = {
  "/": "Панель управления",
  "/patients": "Пациенты",
  "/appointments": "Записи",
  "/doctor-workspace": "Рабочее место врача",
  "/billing/invoices": "Счета",
  "/billing/cash-desk": "Касса",
  "/reports": "Отчеты",
  "/ai-assistant": "AI Ассистент",
  "/users": "Пользователи",
  "/system/architecture": "Архитектура системы",
};

const getTitleForPath = (path: string): string => {
  if (routeTitleMap[path]) return routeTitleMap[path];
  // simple prefix matching for nested paths if needed later
  const match = Object.entries(routeTitleMap).find(
    ([key]) => key !== "/" && path.startsWith(key)
  );
  return match ? match[1] : "Панель управления";
};

type MainLayoutProps = {
  children: React.ReactNode;
};

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const title = getTitleForPath(location.pathname);
  const lockMainScroll = location.pathname === "/ai-assistant";

  return (
    <div className="flex h-screen bg-[#f8fafc] text-[#0f172a]">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className="truncate text-sm font-semibold tracking-tight text-slate-900 transition-colors hover:text-emerald-700"
            >
              Kamilovs clinic
            </Link>
            <span className="shrink-0 text-slate-300">/</span>
            <h1 className="truncate text-sm font-medium text-slate-500">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="hidden max-w-[220px] truncate text-xs text-slate-500 sm:block">
              {user ? `${user.fullName ?? user.username} · ${user.role}` : "Гость"}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void logout()}
              className="shrink-0 border-slate-200 shadow-sm"
            >
              Выйти
            </Button>
          </div>
        </header>
        <main
          className={cn(
            "min-h-0 flex-1 bg-[#f8fafc]",
            lockMainScroll ? "overflow-hidden" : "overflow-auto"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

