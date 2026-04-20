import React from "react";
import { Lightbulb } from "lucide-react";
import type { AppointmentListSummary } from "../utils/appointmentSummary";
import { SectionCard } from "../../../shared/ui";

type Props = {
  /** Метрики по текущему отфильтрованному списку (дата + поиск) */
  filterSummary: AppointmentListSummary;
  isLoading: boolean;
};

const hintRows = [
  { label: "Сегодня", text: "текущие приёмы" },
  { label: "Завтра", text: "план следующего дня" },
  { label: "Неделя", text: "обзор нагрузки" },
] as const;

export const AppointmentActionPanel: React.FC<Props> = ({
  filterSummary,
  isLoading,
}) => {
  const { total, awaitingReception, inConsultation, completed } = filterSummary;

  return (
    <aside className="w-full lg:sticky lg:top-4">
      <div className="space-y-3">
        <SectionCard className="p-4">
          <h3 className="mb-3 text-sm font-medium text-[#111827]">Статистика дня</h3>
          <dl className="grid grid-cols-2 gap-2">
            <Metric label="Всего" value={total} loading={isLoading} />
            <Metric label="Ожидают" value={awaitingReception} loading={isLoading} />
            <Metric label="На приёме" value={inConsultation} loading={isLoading} />
            <Metric label="Завершено" value={completed} loading={isLoading} />
          </dl>
        </SectionCard>

        <SectionCard className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-[#64748b]" />
            <h3 className="text-sm font-medium text-[#111827]">Подсказки</h3>
          </div>
          <ul className="space-y-2 text-xs text-[#6b7280]">
            {hintRows.map((row) => (
              <li key={row.label} className="flex items-center gap-2">
                <span className="font-medium text-[#111827]">{row.label}</span>
                <span className="text-[#9ca3af]">—</span>
                <span>{row.text}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </aside>
  );
};

const Metric: React.FC<{
  label: string;
  value: number;
  loading: boolean;
}> = ({ label, value, loading }) => (
  <div className="rounded-xl bg-gray-50 p-2">
    <dt className="text-[10px] font-medium uppercase tracking-wide text-[#6b7280]">{label}</dt>
    <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-[#111827]">
      {loading ? <span className="inline-block animate-pulse text-[#9ca3af]">…</span> : value}
    </dd>
  </div>
);
