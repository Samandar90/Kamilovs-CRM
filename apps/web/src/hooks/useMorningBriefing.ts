import React from "react";
import { aiAssistantService } from "../modules/ai-assistant/services/aiAssistantService";

export type MorningBriefingState =
  | { status: "loading" }
  | { status: "success"; briefing: string }
  | { status: "error"; message: string };

export function useMorningBriefing(token: string): {
  state: MorningBriefingState;
  refresh: () => void;
} {
  const [state, setState] = React.useState<MorningBriefingState>({ status: "loading" });

  const fetchBriefing = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await aiAssistantService.morningBriefing(token);
      const briefing = typeof data.briefing === "string" ? data.briefing : "";
      setState({ status: "success", briefing: briefing.trim() || "Брифинг пуст." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось загрузить брифинг";
      setState({ status: "error", message });
    }
  }, [token]);

  React.useEffect(() => {
    void fetchBriefing();
  }, [fetchBriefing]);

  return { state, refresh: fetchBriefing };
}
