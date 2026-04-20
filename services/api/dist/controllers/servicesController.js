"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteServiceController = exports.updateServiceController = exports.createServiceController = exports.getServiceByIdController = exports.listServicesController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const listServicesController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    let doctorId;
    if (req.query.doctorId !== undefined) {
        if (typeof req.query.doctorId !== "string") {
            throw new errorHandler_1.ApiError(400, "Query param 'doctorId' must be a positive integer");
        }
        const parsed = Number(req.query.doctorId);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new errorHandler_1.ApiError(400, "Query param 'doctorId' must be a positive integer");
        }
        doctorId = parsed;
    }
    const result = await container_1.services.services.list(auth, {
        doctorId,
    });
    return res.status(200).json(result);
};
exports.listServicesController = listServicesController;
const getServiceByIdController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const entity = await container_1.services.services.getById(auth, Number(req.params.id));
    if (!entity)
        throw new errorHandler_1.ApiError(404, "Service not found");
    return res.status(200).json(entity);
};
exports.getServiceByIdController = getServiceByIdController;
const createServiceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const created = await container_1.services.services.create(auth, req.body);
    return res.status(201).json(created);
};
exports.createServiceController = createServiceController;
const updateServiceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const updated = await container_1.services.services.update(auth, Number(req.params.id), req.body);
    if (!updated)
        throw new errorHandler_1.ApiError(404, "Service not found");
    return res.status(200).json(updated);
};
exports.updateServiceController = updateServiceController;
const deleteServiceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const deleted = await container_1.services.services.delete(auth, Number(req.params.id));
    if (!deleted)
        throw new errorHandler_1.ApiError(404, "Service not found");
    return res.status(200).json({ success: true, id: Number(req.params.id) });
};
exports.deleteServiceController = deleteServiceController;
