import type { LucideIcon } from "lucide-react";
import { Activity, Crown, LineChart, Users, WalletCards } from "lucide-react";
import type { AiChipVisual } from "../constants";

const MAP: Record<AiChipVisual, LucideIcon> = {
  chart: LineChart,
  invoice: WalletCards,
  crown: Crown,
  team: Users,
  health: Activity,
};

export function AiChipIcon({ kind, className }: { kind: AiChipVisual; className?: string }) {
  const Icon = MAP[kind];
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

/** Эвристика для динамических подсказок от API */
export function iconForChipText(text: string): AiChipVisual {
  const t = text.toLowerCase();
  if (/выручк|доход|аналит|отчёт|отчет|оборот/i.test(t)) return "chart";
  if (/неоплачен|счёт|счет|долг|invoice|billing|оплат|платеж|касс/i.test(t)) return "invoice";
  if (/топ.*врач|crown|рейтинг|перегруж|нагрузк/i.test(t)) return "crown";
  if (/врач|специалист|запис|расписан|слот|окн/i.test(t)) return "team";
  if (/пациент|голов|боль|симптом|медицин|no-?show|отмен/i.test(t)) return "health";
  return "chart";
}
