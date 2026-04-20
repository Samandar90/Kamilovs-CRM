import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { createAdminDevController } from "../controllers/devController";
import { requireAuth } from "../middleware/authMiddleware";
import { allowPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.post(
  "/create-admin",
  requireAuth,
  allowPermission("DEV_ADMIN_BOOTSTRAP"),
  asyncHandler(createAdminDevController)
);

export { router as devRouter };

