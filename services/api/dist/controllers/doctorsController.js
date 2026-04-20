"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDoctorController = exports.updateDoctorController = exports.createDoctorController = exports.getDoctorByIdController = exports.listDoctorsController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const listDoctorsController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const doctors = await container_1.services.doctors.list(auth);
    return res.status(200).json(doctors);
};
exports.listDoctorsController = listDoctorsController;
const getDoctorByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const doctor = await container_1.services.doctors.getById(auth, Number(req.params.id));
    if (!doctor)
        throw new errorHandler_1.ApiError(404, "Doctor not found");
    return res.status(200).json(doctor);
};
exports.getDoctorByIdController = getDoctorByIdController;
const createDoctorController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.doctors.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createDoctorController = createDoctorController;
const updateDoctorController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const updated = await container_1.services.doctors.update(auth, Number(req.params.id), req.body);
    if (!updated)
        throw new errorHandler_1.ApiError(404, "Doctor not found");
    return res.status(200).json(updated);
};
exports.updateDoctorController = updateDoctorController;
const deleteDoctorController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const deleted = await container_1.services.doctors.delete(auth, Number(req.params.id));
    if (!deleted)
        throw new errorHandler_1.ApiError(404, "Doctor not found");
    return res.status(200).json({ success: true, id: Number(req.params.id) });
};
exports.deleteDoctorController = deleteDoctorController;
