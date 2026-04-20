import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MessageSquareText, SendHorizontal } from "lucide-react";
import { cn } from "../../../ui/utils/cn";

export type ChatInputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
};

const MAX_TA_HEIGHT = 140;

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Сообщение ассистенту…",
  className,
  onFocus,
}) => {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TA_HEIGHT)}px`;
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-end gap-2 rounded-full border border-white/50 py-2 pl-4 pr-2",
          "bg-gradient-to-r from-white/85 via-blue-50/40 to-indigo-50/35",
          "shadow-lg backdrop-blur-xl backdrop-saturate-150",
          "transition-[border-color,box-shadow] duration-300",
          "focus-within:border-blue-200/80 focus-within:shadow-xl focus-within:ring-2 focus-within:ring-blue-200/90"
        )}
      >
        <div className="mb-2 ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/60 text-blue-600 shadow-sm ring-1 ring-white/80 backdrop-blur-sm">
          <MessageSquareText className="h-4 w-4 opacity-90" strokeWidth={2} aria-hidden />
        </div>
        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocus?.()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className={cn(
            "max-h-[140px] min-h-[48px] w-full flex-1 resize-none border-0 bg-transparent py-2.5 pr-1 text-[15px] leading-relaxed text-slate-900 outline-none ring-0",
            "placeholder:text-slate-400",
            "focus:ring-0",
            "disabled:cursor-not-allowed disabled:opacity-45"
          )}
        />
        <motion.button
          type="button"
          disabled={disabled || !value.trim()}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 500, damping: 26 }}
          onClick={onSubmit}
          aria-label="Отправить"
          className={cn(
            "mb-1.5 mr-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            "bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white",
            "shadow-md shadow-blue-500/25",
            "transition-[opacity,box-shadow] duration-200 hover:shadow-lg hover:shadow-blue-500/30",
            "disabled:pointer-events-none disabled:opacity-25"
          )}
        >
          <SendHorizontal className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </motion.button>
      </div>
      <p className="sr-only">
        Enter — отправить сообщение. Shift+Enter — новая строка.
      </p>
    </div>
  );
};
