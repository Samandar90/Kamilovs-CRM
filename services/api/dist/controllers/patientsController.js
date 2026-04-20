"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePatientController = exports.updatePatientController = exports.createPatientController = exports.getPatientByIdController = exports.listPatientsController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const querySearchString = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
};
const listPatientsController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const search = querySearchString(req.query.search);
    const patients = await container_1.services.patients.list(auth, { search });
    return res.status(200).json(patients);
};
exports.listPatientsController = listPatientsController;
const getPatientByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const patient = await container_1.services.patients.getById(auth, id);
    if (!patient) {
        throw new errorHandler_1.ApiError(404, "Patient not found");
    }
    return res.status(200).json(patient);
};
exports.getPatientByIdController = getPatientByIdController;
const createPatientController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.patients.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createPatientController = createPatientController;
const updatePatientController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const updated = await container_1.services.patients.update(auth, id, req.body);
    if (!updated) {
        throw new errorHandler_1.ApiError(404, "Patient not found");
    }
    return res.status(200).json(updated);
};
exports.updatePatientController = updatePatientController;
const deletePatientController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const id = Number(req.params.id);
    const deleted = await container_1.services.patients.delete(auth, id);
    if (!deleted) {
        throw new errorHandler_1.ApiError(404, "Patient not found");
    }
    return res.status(200).json({
        success: true,
        id,
    });
};
exports.deletePatientController = deletePatientController;
