import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../../ui/utils/cn";
import { AI_CHAT_GUTTER } from "./ChatMessage";

export type MessageActionPayload = {
  type: "navigate" | "open_quick_create_appointment";
  payload?: Record<string, unknown>;
};

export type MessageActionsProps = {
  action: MessageActionPayload;
  onAction: () => void;
  className?: string;
};

function actionLabel(action: MessageActionPayload): string {
  if (action.type === "open_quick_create_appointment") {
    return "Открыть записи";
  }
  const to = typeof action.payload?.to === "string" ? action.payload.to : "";
  if (/patient/i.test(to)) return "Открыть пациентов";
  if (/invoice|billing/i.test(to)) return "Открыть счета";
  if (/appointment/i.test(to)) return "Открыть записи";
  if (/cash/i.test(to)) return "Открыть кассу";
  return "Перейти в раздел";
}

export const MessageActions: React.FC<MessageActionsProps> = ({ action, onAction, className }) => (
  <motion.div
    className={cn(AI_CHAT_GUTTER, className)}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
  >
    <motion.button
      type="button"
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 480, damping: 26 }}
      onClick={onAction}
      className={cn(
        "rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-indigo-500/20",
        "transition-[box-shadow,transform] duration-200 hover:shadow-lg hover:shadow-indigo-500/30"
      )}
    >
      {actionLabel(action)}
    </motion.button>
  </motion.div>
);
