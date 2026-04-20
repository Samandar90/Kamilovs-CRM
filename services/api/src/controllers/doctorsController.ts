import type { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { services } from "../container";
import { getAuthPayload } from "../utils/requestAuth";

export const listDoctorsController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const doctors = await services.doctors.list(auth);
  return res.status(200).json(doctors);
};

export const getDoctorByIdController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const doctor = await services.doctors.getById(auth, Number(req.params.id));
  if (!doctor) throw new ApiError(404, "Doctor not found");
  return res.status(200).json(doctor);
};

export const createDoctorController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const created = await services.doctors.create(auth, req.body);
  return res.status(201).json(created);
};

export const updateDoctorController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const updated = await services.doctors.update(auth, Number(req.params.id), req.body);
  if (!updated) throw new ApiError(404, "Doctor not found");
  return res.status(200).json(updated);
};

export const deleteDoctorController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const deleted = await services.doctors.delete(auth, Number(req.params.id));
  if (!deleted) throw new ApiError(404, "Doctor not found");
  return res.status(200).json({ success: true, id: Number(req.params.id) });
};

