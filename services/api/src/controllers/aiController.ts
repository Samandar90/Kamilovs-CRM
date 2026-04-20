import type { Request, Response } from "express";
import { services } from "../container";
import { getAuthPayload } from "../utils/requestAuth";

/**
 * GET /api/ai/morning-briefing — персонализированный утренний AI-брифинг.
 */
export const getMorningBriefing = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthPayload(req);
  const { briefing } = await services.aiService.generateMorningBriefing(auth);
  res.status(200).json({ briefing });
};
