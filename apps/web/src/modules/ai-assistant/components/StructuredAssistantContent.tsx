import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "../../../ui/utils/cn";
import { parseStructuredAssistantText } from "../utils/parseStructuredAssistantText";

const EASE = [0.16, 1, 0.3, 1] as const;

function blockStyle(heading: string): string {
  if (heading.startsWith("📊")) return "border-slate-200/80 bg-slate-50/65";
  if (heading.startsWith("📉")) return "border-amber-200/70 bg-amber-50/50";
  if (heading.startsWith("📈")) return "border-emerald-200/70 bg-emerald-50/45";
  if (heading.startsWith("💡")) return "border-blue-200/70 bg-blue-50/45";
  if (heading.startsWith("👉")) return "border-indigo-200/60 bg-indigo-50/40";
  return "border-slate-200/70 bg-white/70";
}

export type StructuredAssistantContentProps = {
  text: string;
  className?: string;
};

export const StructuredAssistantContent: React.FC<StructuredAssistantContentProps> = ({ text, className }) => {
  const { structured, blocks, plain } = useMemo(() => parseStructuredAssistantText(text), [text]);

  if (!structured) {
    return (
      <div className={cn("whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-slate-800", className)}>
        {plain}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {blocks.map((b, i) => (
        <motion.div
          key={`${b.key}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: i * 0.05, ease: EASE }}
          className={cn(
            "rounded-xl border px-3.5 py-2.5 backdrop-blur-[2px]",
            blockStyle(b.heading)
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{b.heading}</p>
          {b.body ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-800">{b.body}</p>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
};
