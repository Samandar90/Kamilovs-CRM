import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/authMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";
import {
  aiMessagesClearController,
  aiMessagesListController,
} from "../controllers/aiMessagesController";
import { aiSummaryController } from "../controllers/aiAssistantController";
import { aiRecommendationsController } from "../controllers/aiRecommendationsController";
import { aiAskV2Controller } from "../services/ai/ai.controller";
import { aiInsightsController } from "../controllers/aiInsightsController";
import { getMorningBriefing } from "../controllers/aiController";

const router = Router();

router.use(requireAuth);
router.get("/messages", checkPermission("ai", "read"), asyncHandler(aiMessagesListController));
router.delete("/messages", checkPermission("ai", "create"), asyncHandler(aiMessagesClearController));
router.post("/ask", checkPermission("ai", "create"), asyncHandler(aiAskV2Controller));
router.post("/chat", checkPermission("ai", "create"), asyncHandler(aiAskV2Controller));
router.get("/summary", checkPermission("ai", "read"), asyncHandler(aiSummaryController));
router.get("/insights", checkPermission("ai", "read"), asyncHandler(aiInsightsController));
router.get("/morning-briefing", checkPermission("ai", "read"), asyncHandler(getMorningBriefing));
router.get("/recommendations", checkPermission("ai", "read"), asyncHandler(aiRecommendationsController));

export { router as aiAssistantRouter };
