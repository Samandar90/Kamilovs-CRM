import React, { forwardRef } from "react";
import { cn } from "../../../ui/utils/cn";
import { AI_ASSISTANT_MAX_CLASS, PREMIUM_GLASS } from "../constants";

export type ChatWorkspaceProps = {
  children: React.ReactNode;
  className?: string;
  /** Плавающий слой поверх области сообщений (например кнопка «вниз») */
  overlay?: React.ReactNode;
};

export const ChatWorkspace = forwardRef<HTMLDivElement, ChatWorkspaceProps>(
  ({ children, className, overlay }, ref) => (
    <div className={cn("flex h-full min-h-0 w-full flex-1 flex-col pb-1", AI_ASSISTANT_MAX_CLASS, className)}>
      <div
        className={cn(
          "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl",
          PREMIUM_GLASS
        )}
      >
        <div
          ref={ref}
          className={cn(
            "min-h-0 w-full flex-1 basis-0 scroll-smooth overflow-y-auto overscroll-contain px-5 py-7 sm:px-8 sm:py-8",
            "max-h-[calc(100dvh-260px)] sm:max-h-[calc(100dvh-280px)]",
            "[scrollbar-color:rgba(148,163,184,0.4)_transparent]",
            "[scrollbar-width:thin]",
            "[&::-webkit-scrollbar]:w-[5px]",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/50",
            "[&::-webkit-scrollbar-track]:bg-transparent"
          )}
        >
          <div className="flex flex-col gap-4">{children}</div>
        </div>
        {overlay}
      </div>
    </div>
  )
);
ChatWorkspace.displayName = "ChatWorkspace";
