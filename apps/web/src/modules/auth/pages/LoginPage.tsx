import React from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";

const WRONG_CREDENTIALS_MSG = "Неверный логин или пароль";

/** Единый текст для неверной пары логин/пароль (в т.ч. если API отдало другое сообщение). */
const mapLoginApiError = (message: string): string => {
  if (message === WRONG_CREDENTIALS_MSG) return message;
  const m = message.toLowerCase().trim();
  if (
    m.includes("invalid credentials") ||
    m.includes("invalid username") ||
    m.includes("wrong password") ||
    m.includes("incorrect password") ||
    m.includes("unauthorized") ||
    (m.includes("неверн") && (m.includes("логин") || m.includes("парол")))
  ) {
    return WRONG_CREDENTIALS_MSG;
  }
  return message;
};

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading, error, clearError } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const lastSubmitAtRef = React.useRef(0);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const canSubmit = Boolean(username.trim() && password.trim());

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const now = Date.now();
    if (now - lastSubmitAtRef.current < 700) return;
    lastSubmitAtRef.current = now;
    if (!username.trim() || !password.trim()) {
      setFormError("Введите логин и пароль");
      return;
    }
    setFormError(null);
    clearError();
    await login(username.trim(), password, false);
  };

  const displayError = formError ?? (error ? mapLoginApiError(error) : null);

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-sm outline-none transition " +
    "placeholder:text-zinc-400 " +
    "hover:border-zinc-300 " +
    "focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Левая панель — бренд */}
        <aside className="relative flex flex-col justify-center border-b border-zinc-800/80 bg-zinc-950 px-8 py-12 md:w-1/2 md:border-b-0 md:border-r md:py-16 md:pl-12 md:pr-10 lg:pl-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.08) 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
          />
          <div className="relative mx-auto w-full max-w-md md:mx-0">
            <div className="mb-8 flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-lg font-semibold tracking-tight text-zinc-950 shadow-sm"
                aria-hidden
              >
                K
              </div>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[1.75rem] lg:text-4xl">
              Kamilovs clinic
            </h1>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-zinc-400">
              Управление клиникой в одном месте
            </p>
          </div>
        </aside>

        {/* Правая часть — форма */}
        <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50/80 px-5 py-12 md:px-8 md:py-16">
          <div className="w-full max-w-[400px] rounded-xl border border-zinc-200/80 bg-white p-8 shadow-lg">
            <form
              className="space-y-5"
              onSubmit={onSubmit}
              noValidate
              aria-busy={isLoading}
            >
              <div>
                <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Логин
                </label>
                <input
                  id="login-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setFormError(null);
                    clearError();
                  }}
                  className={inputClass}
                  placeholder="Введите логин"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Пароль
                </label>
                <div className="relative isolate">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFormError(null);
                      clearError();
                    }}
                    className={`crm-login-password-field ${inputClass} pr-12`}
                    placeholder="Введите пароль"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 z-10 flex w-11 shrink-0 items-center justify-center rounded-r-xl text-zinc-400 transition-colors hover:bg-zinc-100/80 hover:text-zinc-600 focus:outline-none focus-visible:bg-zinc-100/80 focus-visible:text-zinc-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              {displayError ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
                  role="alert"
                  aria-live="polite"
                >
                  {displayError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isLoading || !canSubmit}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2.5} aria-hidden />
                    <span>Вход…</span>
                  </>
                ) : (
                  "Войти"
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
      <footer className="shrink-0 border-t border-zinc-100 py-3 text-center text-[11px] text-zinc-400">
        © 2026 Kamilovs clinic
      </footer>
    </div>
  );
};
