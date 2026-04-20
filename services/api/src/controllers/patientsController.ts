import type { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { services } from "../container";
import { getAuthPayload } from "../utils/requestAuth";
const querySearchString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

export const listPatientsController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const search = querySearchString(req.query.search);
  const patients = await services.patients.list(auth, { search });
  return res.status(200).json(patients);
};

export const getPatientByIdController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const id = Number(req.params.id);
  const patient = await services.patients.getById(auth, id);

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  return res.status(200).json(patient);
};

export const createPatientController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const created = await services.patients.create(auth, req.body);
  return res.status(201).json(created);
};

export const updatePatientController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const id = Number(req.params.id);
  const updated = await services.patients.update(auth, id, req.body);

  if (!updated) {
    throw new ApiError(404, "Patient not found");
  }

  return res.status(200).json(updated);
};

export const deletePatientController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const id = Number(req.params.id);
  const deleted = await services.patients.delete(auth, id);

  if (!deleted) {
    throw new ApiError(404, "Patient not found");
  }

  return res.status(200).json({
    success: true,
    id,
  });
};

