import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  BarChart3,
  Calendar,
  FileText,
  Stethoscope,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../../ui/utils/cn";
import { AI_CHAT_GUTTER } from "./ChatMessage";
import type { AiRuleAction } from "../utils/getActionsForMessage";

const iconById: Record<string, LucideIcon> = {
  "open-reports": BarChart3,
  "by-doctors": Stethoscope,
  "open-invoices": FileText,
  "take-payment": Banknote,
  "open-doctors": Stethoscope,
  "add-patient": UserPlus,
  "open-patients": Users,
  "open-appointments": Calendar,
  "open-doctors-load": Stethoscope,
  "doctor-appointments": Calendar,
  "patients-debt": Users,
};

function actionIcon(action: AiRuleAction): LucideIcon {
  return iconById[action.id] ?? BarChart3;
}

export type AiMessageActionsProps = {
  actions: AiRuleAction[];
  disabled?: boolean;
  className?: string;
};

export const AiMessageActions: React.FC<AiMessageActionsProps> = ({ actions, disabled, className }) => {
  const navigate = useNavigate();

  const handleAction = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  if (actions.length === 0) return null;

  return (
    <motion.div
      className={cn(AI_CHAT_GUTTER, className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => {
          const Icon = actionIcon(action);
          return (
            <motion.button
              key={action.id}
              type="button"
              disabled={disabled}
              title={action.tooltip}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleAction(action.path)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-800",
                "shadow-sm ring-1 ring-neutral-200/60 transition-[background-color,box-shadow,transform] duration-200",
                "hover:bg-neutral-200 hover:shadow-md hover:ring-neutral-300/50",
                "active:bg-neutral-300/90",
                "disabled:pointer-events-none disabled:opacity-40"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-600" strokeWidth={2} aria-hidden />
              {action.label}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};
