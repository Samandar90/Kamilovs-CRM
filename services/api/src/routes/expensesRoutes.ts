import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/authMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";
import {
  createExpenseController,
  deleteExpenseController,
  listExpensesController,
  updateExpenseController,
} from "../controllers/expensesController";
import {
  validateCreateExpense,
  validateExpenseIdParam,
  validateUpdateExpense,
} from "../validators/expensesValidators";

const router = Router();

router.get("/", requireAuth, checkPermission("expenses", "read"), asyncHandler(listExpensesController));
router.post("/", requireAuth, checkPermission("expenses", "create"), validateCreateExpense, asyncHandler(createExpenseController));
router.put(
  "/:id",
  requireAuth,
  checkPermission("expenses", "update"),
  validateExpenseIdParam,
  validateUpdateExpense,
  asyncHandler(updateExpenseController)
);
router.delete(
  "/:id",
  requireAuth,
  checkPermission("expenses", "delete"),
  validateExpenseIdParam,
  asyncHandler(deleteExpenseController)
);

export { router as expensesRouter };

