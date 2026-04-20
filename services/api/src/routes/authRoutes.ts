import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  authAuditLogController,
  loginController,
  logoutController,
  meController,
} from "../controllers/authController";
import { validateLoginBody } from "../validators/authValidators";
import { requireAuth } from "../middleware/authMiddleware";
import { loginRateLimit } from "../middleware/authRateLimit";
import { checkPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.post("/login", loginRateLimit, validateLoginBody, asyncHandler(loginController));
router.post("/logout", requireAuth, asyncHandler(logoutController));
router.get("/me", requireAuth, asyncHandler(meController));
router.get(
  "/audit-log",
  requireAuth,
  checkPermission("users", "read"),
  asyncHandler(authAuditLogController)
);

export { router as authRouter };
