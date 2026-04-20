import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  listPatientsController,
  getPatientByIdController,
  createPatientController,
  updatePatientController,
  deletePatientController,
} from "../controllers/patientsController";
import {
  validateCreatePatient,
  validatePatientIdParam,
  validateUpdatePatient,
} from "../validators/patientsValidators";
import { requireAuth } from "../middleware/authMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.get("/", requireAuth, checkPermission("patients", "read"), asyncHandler(listPatientsController));
router.get(
  "/:id",
  requireAuth,
  checkPermission("patients", "read"),
  validatePatientIdParam,
  asyncHandler(getPatientByIdController)
);
router.post(
  "/",
  requireAuth,
  checkPermission("patients", "create"),
  validateCreatePatient,
  asyncHandler(createPatientController)
);
router.put(
  "/:id",
  requireAuth,
  checkPermission("patients", "update"),
  validatePatientIdParam,
  validateUpdatePatient,
  asyncHandler(updatePatientController)
);
router.delete(
  "/:id",
  requireAuth,
  checkPermission("patients", "delete"),
  validatePatientIdParam,
  asyncHandler(deletePatientController)
);

export { router as patientsRouter };
