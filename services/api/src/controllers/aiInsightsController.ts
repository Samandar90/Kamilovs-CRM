import type { Request, Response } from "express";
import { generateBusinessInsights, loadBusinessInsightsMetrics } from "../services/ai/businessInsights";
import { buildInsightsSidebarMeta } from "../services/ai/businessInsights.sidebarMeta";
import { getAuthPayload } from "../utils/requestAuth";

export const aiInsightsController = async (_req: Request, res: Response): Promise<void> => {
  const auth = getAuthPayload(_req);
  const metrics = await loadBusinessInsightsMetrics(auth);
  const insights = generateBusinessInsights(metrics, auth.role);
  const sidebar = buildInsightsSidebarMeta(insights);
  res.status(200).json({
    insights,
    generatedAt: new Date().toISOString(),
    ...sidebar,
  });
};
