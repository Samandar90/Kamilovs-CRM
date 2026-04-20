import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  createPaymentController,
  deletePaymentController,
  getPaymentByIdController,
  listPaymentsController,
  refundPaymentController,
} from "../controllers/paymentsController";
import {
  validateCreatePayment,
  validatePaymentIdParam,
  validateRefundPayment,
} from "../validators/paymentsValidators";
import { requireAuth } from "../middleware/authMiddleware";
import { requireFinancialPortalAccess } from "../middleware/doctorFinanceBlockMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("payments", "read"),
  asyncHandler(listPaymentsController)
);
router.get(
  "/:id",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("payments", "read"),
  validatePaymentIdParam,
  asyncHandler(getPaymentByIdController)
);
router.post(
  "/",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("payments", "create"),
  validateCreatePayment,
  asyncHandler(createPaymentController)
);
router.post(
  "/:id/refund",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("payments", "update"),
  validatePaymentIdParam,
  validateRefundPayment,
  asyncHandler(refundPaymentController)
);
router.delete(
  "/:id",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("payments", "delete"),
  validatePaymentIdParam,
  asyncHandler(deletePaymentController)
);

export { router as paymentsRouter };
