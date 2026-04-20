import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "../../../ui/utils/cn";
import { PREMIUM_GLASS_HOVER } from "../constants";

export type AIAssistantHeaderProps = {
  className?: string;
  /** Действие справа сверху (например очистка чата) */
  trailing?: React.ReactNode;
};

export const AIAssistantHeader: React.FC<AIAssistantHeaderProps> = ({ className, trailing }) => (
  <header className={cn("w-full", className)}>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.005 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-white/80 via-white/65 to-blue-50/40",
        "shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl",
        PREMIUM_GLASS_HOVER
      )}
    >
      <div
        className={cn(
          "relative flex flex-col gap-4 rounded-2xl px-5 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5",
          "bg-white/40"
        )}
      >
        {trailing ? (
          <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-5">{trailing}</div>
        ) : null}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-indigo-400/[0.07] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-blue-400/[0.08] blur-3xl"
          aria-hidden
        />

        <motion.div
          className={cn(
            "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14",
            "bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600",
            "shadow-[0_8px_24px_-6px_rgba(79,70,229,0.45),inset_0_1px_0_rgba(255,255,255,0.2)]"
          )}
          aria-hidden
          animate={{
            boxShadow: [
              "0 8px 24px -6px rgba(79,70,229,0.4)",
              "0 12px 32px -8px rgba(79,70,229,0.5)",
              "0 8px 24px -6px rgba(79,70,229,0.4)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="h-6 w-6 text-white sm:h-7 sm:w-7" strokeWidth={1.5} />
        </motion.div>

        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">
              AI Ассистент
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 backdrop-blur-sm"
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-35" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Онлайн
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
            Умный помощник по работе клиники, аналитике и ежедневным решениям
          </p>
        </div>
      </div>
    </motion.div>
  </header>
);
