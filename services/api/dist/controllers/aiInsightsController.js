"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiInsightsController = void 0;
const businessInsights_1 = require("../services/ai/businessInsights");
const businessInsights_sidebarMeta_1 = require("../services/ai/businessInsights.sidebarMeta");
const requestAuth_1 = require("../utils/requestAuth");
const aiInsightsController = async (_req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(_req);
    const metrics = await (0, businessInsights_1.loadBusinessInsightsMetrics)(auth);
    const insights = (0, businessInsights_1.generateBusinessInsights)(metrics, auth.role);
    const sidebar = (0, businessInsights_sidebarMeta_1.buildInsightsSidebarMeta)(insights);
    res.status(200).json({
        insights,
        generatedAt: new Date().toISOString(),
        ...sidebar,
    });
};
exports.aiInsightsController = aiInsightsController;
