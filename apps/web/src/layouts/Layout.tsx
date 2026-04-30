import { NavLink, Outlet } from "react-router-dom";
import { BRANDING } from "../shared/config/branding";
import { useClinic } from "../hooks/useClinic";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/patients", label: "Пациенты" },
  { to: "/appointments", label: "Записи" },
  { to: "/cash", label: "Касса" },
  { to: "/reports", label: "Отчеты" },
  { to: "/ai", label: "AI Ассистент" },
];

const navClass = (isActive: boolean): string =>
  isActive
    ? "block rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900"
    : "block rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100";

export const Layout = () => {
  const { clinic } = useClinic();
  const brandName = clinic.name || BRANDING.productName;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        <aside className="w-[240px] shrink-0 border-r border-gray-200 bg-white p-5">
          <div className="mb-6 text-xl font-semibold text-gray-900">{brandName}</div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navClass(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="w-full bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
