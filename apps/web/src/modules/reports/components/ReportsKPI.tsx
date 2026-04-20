import React from "react";
import { motion } from "framer-motion";
import { Activity, LineChart, FileText, Receipt, Wallet } from "lucide-react";
import { formatSum } from "../../../utils/formatMoney";

type KpiItem = {
  title: string;
  value: number | string;
  changePct?: number | null;
};

type Props = {
  items: KpiItem[];
  loading: boolean;
};

const pctLabel = (v: number): string => `${v > 0 ? "+" : ""}${Math.round(v)}%`;

export const ReportsKPI: React.FC<Props> = ({ items, loading }) => {
  const iconByTitle: Record<string, React.ReactNode> = {
    "Выручка": <Wallet className="h-4 w-4 text-emerald-600" />,
    "Рост": <LineChart className="h-4 w-4 text-violet-600" />,
    "Пациенты": <Activity className="h-4 w-4 text-sky-600" />,
    "Счета": <FileText className="h-4 w-4 text-amber-600" />,
    "Средний чек": <Receipt className="h-4 w-4 text-rose-600" />,
  };

  if (loading) {
    return (
      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
        ))}
      </section>
    );
  }

  return (
    <motion.section
      className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 } },
      }}
    >
      {items.map((item, idx) => {
        const tone =
          item.changePct == null
            ? "text-slate-500"
            : item.changePct > 0
              ? "text-emerald-600"
              : item.changePct < 0
                ? "text-rose-600"
                : "text-slate-500";
        return (
          <motion.article
            key={item.title}
            className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)] transition hover:scale-[1.05] hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.22)]"
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.28, ease: "easeOut", delay: idx * 0.01 }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.title}</p>
              {iconByTitle[item.title] ?? null}
            </div>
            <p className="mt-4 text-[1.8rem] font-bold tracking-tight text-slate-950">
              {typeof item.value === "number" ? formatSum(item.value) : item.value}
            </p>
            <p className={`mt-2 text-sm font-semibold tabular-nums ${tone}`}>
              {item.changePct == null ? "—" : `${pctLabel(item.changePct)} ${item.changePct >= 0 ? "↑" : "↓"}`}
            </p>
          </motion.article>
        );
      })}
    </motion.section>
  );
};

