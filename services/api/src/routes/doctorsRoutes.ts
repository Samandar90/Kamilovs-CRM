import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  createDoctorController,
  deleteDoctorController,
  getDoctorByIdController,
  listDoctorsController,
  updateDoctorController,
} from "../controllers/doctorsController";
import {
  validateCreateDoctor,
  validateDoctorIdParam,
  validateUpdateDoctor,
} from "../validators/doctorsValidators";
import { requireAuth } from "../middleware/authMiddleware";
import {
  allowDoctorsReadOrClinicalAssistant,
} from "../middleware/clinicalDirectoryReadMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.get(
  "/",
  requireAuth,
  allowDoctorsReadOrClinicalAssistant,
  asyncHandler(listDoctorsController)
);
router.get(
  "/:id",
  requireAuth,
  allowDoctorsReadOrClinicalAssistant,
  validateDoctorIdParam,
  asyncHandler(getDoctorByIdController)
);
router.post(
  "/",
  requireAuth,
  checkPermission("doctors", "create"),
  validateCreateDoctor,
  asyncHandler(createDoctorController)
);
router.put(
  "/:id",
  requireAuth,
  checkPermission("doctors", "update"),
  validateDoctorIdParam,
  validateUpdateDoctor,
  asyncHandler(updateDoctorController)
);
router.delete(
  "/:id",
  requireAuth,
  checkPermission("doctors", "delete"),
  validateDoctorIdParam,
  asyncHandler(deleteDoctorController)
);

export { router as doctorsRouter };
