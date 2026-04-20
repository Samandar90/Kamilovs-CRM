import type { Request, Response } from "express";
import { services } from "../container";
import { getAuthPayload } from "../utils/requestAuth";

const q = (req: Request, key: string): string | undefined =>
  typeof req.query[key] === "string" ? req.query[key] : undefined;

export const revenueReportController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getRevenueReport(auth, {
    dateFrom: q(req, "dateFrom"),
    dateTo: q(req, "dateTo"),
    granularity: q(req, "granularity"),
  });

  return res.status(200).json(data);
};

export const paymentsByMethodReportController = async (
  req: Request,
  res: Response
) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getPaymentsByMethodReport(auth, {
    dateFrom: q(req, "dateFrom"),
    dateTo: q(req, "dateTo"),
  });

  return res.status(200).json(data);
};

export const invoicesStatusSummaryController = async (
  req: Request,
  res: Response
) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getInvoicesStatusSummary(auth, {
    dateFrom: q(req, "dateFrom"),
    dateTo: q(req, "dateTo"),
  });

  return res.status(200).json(data);
};

export const revenueByDoctorController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getRevenueByDoctor(auth, {
    dateFrom: q(req, "dateFrom"),
    dateTo: q(req, "dateTo"),
  });
  return res.status(200).json(data);
};

export const revenueByServiceController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getRevenueByService(auth, {
    dateFrom: q(req, "dateFrom"),
    dateTo: q(req, "dateTo"),
  });
  return res.status(200).json(data);
};

export const reportMetricsController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getReportMetrics(auth, {
    dateFrom: q(req, "dateFrom"),
    dateTo: q(req, "dateTo"),
  });
  return res.status(200).json(data);
};

export const reportsSummaryController = async (req: Request, res: Response) => {
  const auth = getAuthPayload(req);
  const data = await services.reports.getReportsSummary(auth);
  return res.status(200).json(data);
};

