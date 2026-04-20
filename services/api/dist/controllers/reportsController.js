"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsSummaryController = exports.reportMetricsController = exports.revenueByServiceController = exports.revenueByDoctorController = exports.invoicesStatusSummaryController = exports.paymentsByMethodReportController = exports.revenueReportController = void 0;
const container_1 = require("../container");
const requestAuth_1 = require("../utils/requestAuth");
const q = (req, key) => typeof req.query[key] === "string" ? req.query[key] : undefined;
const revenueReportController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getRevenueReport(auth, {
        dateFrom: q(req, "dateFrom"),
        dateTo: q(req, "dateTo"),
        granularity: q(req, "granularity"),
    });
    return res.status(200).json(data);
};
exports.revenueReportController = revenueReportController;
const paymentsByMethodReportController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getPaymentsByMethodReport(auth, {
        dateFrom: q(req, "dateFrom"),
        dateTo: q(req, "dateTo"),
    });
    return res.status(200).json(data);
};
exports.paymentsByMethodReportController = paymentsByMethodReportController;
const invoicesStatusSummaryController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getInvoicesStatusSummary(auth, {
        dateFrom: q(req, "dateFrom"),
        dateTo: q(req, "dateTo"),
    });
    return res.status(200).json(data);
};
exports.invoicesStatusSummaryController = invoicesStatusSummaryController;
const revenueByDoctorController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getRevenueByDoctor(auth, {
        dateFrom: q(req, "dateFrom"),
        dateTo: q(req, "dateTo"),
    });
    return res.status(200).json(data);
};
exports.revenueByDoctorController = revenueByDoctorController;
const revenueByServiceController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getRevenueByService(auth, {
        dateFrom: q(req, "dateFrom"),
        dateTo: q(req, "dateTo"),
    });
    return res.status(200).json(data);
};
exports.revenueByServiceController = revenueByServiceController;
const reportMetricsController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getReportMetrics(auth, {
        dateFrom: q(req, "dateFrom"),
        dateTo: q(req, "dateTo"),
    });
    return res.status(200).json(data);
};
exports.reportMetricsController = reportMetricsController;
const reportsSummaryController = async (req, res) => {
    const auth = (0, requestAuth_1.getAuthPayload)(req);
    const data = await container_1.services.reports.getReportsSummary(auth);
    return res.status(200).json(data);
};
exports.reportsSummaryController = reportsSummaryController;
