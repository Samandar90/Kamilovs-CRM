"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMorningBriefing = void 0;
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
/**
 * GET /api/ai/morning-briefing — персонализированный утренний AI-брифинг.
 */
const getMorningBriefing = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const { briefing } = await container_1.services.aiService.generateMorningBriefing(auth);
    res.status(200).json({ briefing });
};
exports.getMorningBriefing = getMorningBriefing;
