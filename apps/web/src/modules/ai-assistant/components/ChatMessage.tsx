import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "../../../ui/utils/cn";
import { StructuredAssistantContent } from "./StructuredAssistantContent";

export const AI_CHAT_GUTTER = "pl-11";

const EASE = [0.16, 1, 0.3, 1] as const;
const ENTER_MS = 0.2;

export type ChatMessageProps = {
  role: "user" | "assistant";
  avatarLabel?: string;
  children: React.ReactNode;
  index?: number;
  className?: string;
};

const avatarOuter =
  "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full transition-transform duration-300";

export function AiChatAvatar({ stagger = 0 }: { stagger?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_MS, delay: stagger, ease: EASE }}
      className={cn(
        avatarOuter,
        "bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-[0_2px_8px_-2px_rgba(79,70,229,0.2)] ring-2 ring-white ring-offset-2 ring-offset-transparent"
      )}
      aria-hidden
    >
      <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 shadow-inner">
        <Sparkles className="h-3 w-3 text-white" strokeWidth={2.2} />
      </div>
    </motion.div>
  );
}

function UserAvatar({ label, stagger }: { label: string; stagger: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_MS, delay: stagger, ease: EASE }}
      className={cn(
        avatarOuter,
        "bg-gradient-to-br from-slate-100 to-slate-50 text-[11px] font-bold tracking-tight text-slate-600",
        "shadow-sm ring-2 ring-white ring-offset-2 ring-offset-[#f8f9fb]"
      )}
      aria-hidden
    >
      {label.slice(0, 2).toUpperCase()}
    </motion.div>
  );
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  avatarLabel = "U",
  children,
  index = 0,
  className,
}) => {
  const isUser = role === "user";
  const stagger = Math.min(index * 0.032, 0.13);

  const bubble = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_MS, ease: EASE, delay: stagger }}
      whileHover={{
        y: -1,
        transition: { type: "spring", stiffness: 420, damping: 26 },
      }}
      className={cn("group/bubble relative max-w-[75%] sm:max-w-[72%]", !isUser && "max-w-[80%] sm:max-w-[78%]")}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl px-[1.125rem] py-3.5 text-[15px] leading-[1.55] transition-[box-shadow,transform] duration-300",
          isUser
            ? cn(
                "bg-gradient-to-br from-[#3b82f6] via-[#2563eb] to-[#4f46e5] text-white",
                "shadow-[0_2px_8px_-2px_rgba(37,99,235,0.35),0_12px_28px_-12px_rgba(37,99,235,0.38),inset_0_1px_0_rgba(255,255,255,0.2)]",
                "hover:shadow-[0_4px_14px_-4px_rgba(37,99,235,0.45),0_16px_40px_-14px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.22)]"
              )
            : cn(
                "border border-white/60 bg-white text-slate-800",
                "shadow-sm hover:border-slate-200/80 hover:shadow-md"
              )
        )}
      >
        {isUser ? (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.18] via-transparent to-transparent"
            aria-hidden
          />
        ) : (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50/50 to-transparent"
            aria-hidden
          />
        )}
        <div className="relative [text-rendering:optimizeLegibility]">
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{children}</div>
          ) : typeof children === "string" ? (
            <StructuredAssistantContent text={children} />
          ) : (
            children
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div
      className={cn(
        "flex gap-3.5",
        isUser ? "flex-row-reverse justify-end" : "flex-row justify-start",
        className
      )}
    >
      {isUser ? <UserAvatar label={avatarLabel} stagger={stagger} /> : <AiChatAvatar stagger={stagger} />}
      {bubble}
    </div>
  );
};
