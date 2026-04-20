import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../../ui/utils/cn";
import { AI_CHAT_GUTTER } from "./ChatMessage";
import { AiChipIcon, iconForChipText } from "./aiChipIcons";

export type SuggestionChipsProps = {
  labels: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  labels,
  onSelect,
  disabled,
  className,
}) => {
  if (labels.length === 0) return null;

  return (
    <motion.div
      className={cn(AI_CHAT_GUTTER, "flex flex-wrap gap-2", className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {labels.map((label) => {
        const kind = iconForChipText(label);
        return (
          <motion.button
            key={label}
            type="button"
            disabled={disabled}
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 460, damping: 26 }}
            onClick={() => onSelect(label)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 py-1.5 pl-2 pr-3.5 text-[12px] font-semibold text-slate-700",
              "shadow-sm backdrop-blur-md transition-[border-color,box-shadow,background-color] duration-300",
              "hover:border-blue-200/80 hover:bg-white hover:shadow-md",
              "disabled:pointer-events-none disabled:opacity-45"
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80">
              <AiChipIcon kind={kind} className="h-3 w-3" />
            </span>
            {label}
          </motion.button>
        );
      })}
    </motion.div>
  );
};
