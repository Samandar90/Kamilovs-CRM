import React from "react";
import { cn } from "./utils/cn";

export type ChatBubbleProps = {
  role: "user" | "assistant";
  /** 1–2 символа в аватаре */
  avatarLabel: string;
  children: React.ReactNode;
  className?: string;
  /** Задержка анимации появления (мс), для каскада в списке */
  animationDelayMs?: number;
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  role,
  avatarLabel,
  children,
  className,
  animationDelayMs = 0,
}) => {
  const isUser = role === "user";
  const bubble = (
    <div
      className={cn(
        "max-w-[60%] rounded-xl px-4 py-2.5 text-[13px] leading-relaxed",
        isUser
          ? "bg-neutral-900 text-neutral-50"
          : "border border-neutral-200 bg-neutral-50 text-neutral-800"
      )}
    >
      {children}
    </div>
  );
  const avatar = (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-[10px] font-semibold tracking-tight",
        isUser
          ? "bg-neutral-200 text-neutral-700"
          : "border border-neutral-200 bg-white text-neutral-500"
      )}
      aria-hidden
    >
      {isUser ? avatarLabel.slice(0, 2) : "AI"}
    </div>
  );
  return (
    <div
      style={{ animationDelay: `${animationDelayMs}ms` }}
      className={cn("flex w-full max-w-full items-end gap-3", isUser ? "justify-end" : "justify-start", className)}
    >
      {isUser ? (
        <>
          {bubble}
          {avatar}
        </>
      ) : (
        <>
          {avatar}
          {bubble}
        </>
      )}
    </div>
  );
};
