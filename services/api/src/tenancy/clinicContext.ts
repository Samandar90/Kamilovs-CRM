import { AsyncLocalStorage } from "node:async_hooks";
import { ApiError } from "../middleware/errorHandler";

type ClinicContextStore = {
  clinicId: number;
};

const clinicContext = new AsyncLocalStorage<ClinicContextStore>();

export const runWithClinicContext = <T>(clinicId: number, fn: () => T): T => {
  return clinicContext.run({ clinicId }, fn);
};

export const getClinicId = (): number | null => {
  return clinicContext.getStore()?.clinicId ?? null;
};

export const requireClinicId = (): number => {
  const clinicId = getClinicId();
  if (!Number.isInteger(clinicId) || clinicId == null || clinicId <= 0) {
    throw new ApiError(401, "Clinic context is missing");
  }
  return clinicId;
};
