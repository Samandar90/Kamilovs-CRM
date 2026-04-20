import React from "react";
import { useMorningBriefing } from "../../../hooks/useMorningBriefing";
import { DashboardMorningBriefingCard } from "./DashboardMorningBriefingCard";

export type DashboardMorningBriefingSectionProps = {
  token: string;
  userName: string;
};

/** Секция дашборда: загрузка GET /api/ai/morning-briefing и карточка брифинга. */
export const DashboardMorningBriefingSection: React.FC<DashboardMorningBriefingSectionProps> = ({
  token,
  userName,
}) => {
  const { state, refresh } = useMorningBriefing(token);
  return <DashboardMorningBriefingCard userName={userName} state={state} onRefresh={refresh} />;
};
