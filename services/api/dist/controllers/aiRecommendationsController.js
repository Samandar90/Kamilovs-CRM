"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRecommendationsController = void 0;
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const aiRecommendationsController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    try {
        const result = await container_1.services.aiRecommendations.getRecommendations(auth);
        return res.status(200).json(result);
    }
    catch (error) {
        console.error("[AI RECOMMENDATIONS ERROR]", error);
        return res.status(500).json({
            error: "Не удалось загрузить рекомендации",
        });
    }
};
exports.aiRecommendationsController = aiRecommendationsController;
