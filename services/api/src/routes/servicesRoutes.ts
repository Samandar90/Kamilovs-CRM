import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  createServiceController,
  deleteServiceController,
  getServiceByIdController,
  listServicesController,
  updateServiceController,
} from "../controllers/servicesController";
import {
  validateCreateService,
  validateServiceIdParam,
  validateUpdateService,
} from "../validators/servicesValidators";
import { requireAuth } from "../middleware/authMiddleware";
import {
  allowServicesReadOrClinicalAssistant,
} from "../middleware/clinicalDirectoryReadMiddleware";
import { checkPermission } from "../middleware/permissionMiddleware";

const router = Router();

router.get(
  "/",
  requireAuth,
  allowServicesReadOrClinicalAssistant,
  asyncHandler(listServicesController)
);
router.get(
  "/:id",
  requireAuth,
  allowServicesReadOrClinicalAssistant,
  validateServiceIdParam,
  asyncHandler(getServiceByIdController)
);
router.post(
  "/",
  requireAuth,
  checkPermission("services", "create"),
  validateCreateService,
  asyncHandler(createServiceController)
);
router.put(
  "/:id",
  requireAuth,
  checkPermission("services", "update"),
  validateServiceIdParam,
  validateUpdateService,
  asyncHandler(updateServiceController)
);
router.delete(
  "/:id",
  requireAuth,
  checkPermission("services", "delete"),
  validateServiceIdParam,
  asyncHandler(deleteServiceController)
);

export { router as servicesRouter };
