import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  invoicesStatusSummaryController,
  paymentsByMethodReportController,
  reportMetricsController,
  reportsSummaryController,
  revenueByDoctorController,
  revenueByServiceController,
  revenueReportController,
} from "../controllers/reportsController";
import { validateReportsQuery } from "../validators/reportsValidators";
import { requireAuth } from "../middleware/authMiddleware";
import { requireFinancialPortalAccess } from "../middleware/doctorFinanceBlockMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.get(
  "/summary",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  asyncHandler(reportsSummaryController)
);
router.get(
  "/revenue",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  validateReportsQuery,
  asyncHandler(revenueReportController)
);
router.get(
  "/payments-by-method",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  validateReportsQuery,
  asyncHandler(paymentsByMethodReportController)
);
router.get(
  "/invoices-status-summary",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  validateReportsQuery,
  asyncHandler(invoicesStatusSummaryController)
);
router.get(
  "/revenue-by-doctor",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  validateReportsQuery,
  asyncHandler(revenueByDoctorController)
);
router.get(
  "/revenue-by-service",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  validateReportsQuery,
  asyncHandler(revenueByServiceController)
);
router.get(
  "/metrics",
  requireAuth,
  requireFinancialPortalAccess,
  checkPermission("reports", "read"),
  validateReportsQuery,
  asyncHandler(reportMetricsController)
);

export { router as reportsRouter };
