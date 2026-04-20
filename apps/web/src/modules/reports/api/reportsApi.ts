import { requestJson } from "../../../api/http";

export type PeriodKey = "today" | "week" | "month" | "custom";
export type ReportsGranularity = "day" | "week" | "month";

export type RevenuePoint = { periodStart: string; totalRevenue: number };
export type RevenueByDoctorRow = { doctorId: number | null; doctorName: string | null; totalRevenue: number };
export type RevenueByServiceRow = { serviceId: number | null; serviceName: string | null; totalRevenue: number };

export type ReportsSummaryResponse = {
  timezone: string;
  revenueToday: number;
  revenueYesterday: number;
  revenueWeek: number;
  revenuePreviousWeek: number;
  revenueMonth: number;
  revenueByDay: Array<{ date: string; amount: number }>;
  revenueByDoctor: Array<{ doctorName: string; amount: number }>;
  revenueByService: Array<{ serviceName: string; amount: number; count: number }>;
};

export type RevenueReportResponse = {
  timezone: string;
  granularity: ReportsGranularity;
  dateFrom?: string;
  dateTo?: string;
  points: RevenuePoint[];
};

export type ReportMetricsResponse = {
  timezone: string;
  metrics: {
    totalPaymentsAmount: number;
    paymentsCount: number;
    appointmentsCount: number;
  };
  totalRevenue: number;
  prevRevenue: number;
};

export type DoctorOption = { id: number; name: string };
export type ServiceOption = { id: number; name: string };
export type PaymentRow = {
  id: number;
  invoiceId: number;
  amount: number;
  method: "cash" | "card";
  createdAt: string;
  deletedAt: string | null;
};
export type InvoiceRow = {
  id: number;
  number: string;
  patientId: number;
  appointmentId: number | null;
  status: string;
  total: number;
  paidAmount: number;
  createdAt: string;
};

const withRange = (basePath: string, range: { dateFrom?: string; dateTo?: string }): string => {
  const qs = new URLSearchParams();
  if (range.dateFrom) qs.set("dateFrom", range.dateFrom);
  if (range.dateTo) qs.set("dateTo", range.dateTo);
  const q = qs.toString();
  return q ? `${basePath}?${q}` : basePath;
};

export const reportsApi = {
  getSummary: () => requestJson<ReportsSummaryResponse>("/api/reports/summary"),
  getRevenue: (params: { dateFrom?: string; dateTo?: string; granularity: ReportsGranularity }) => {
    const qs = new URLSearchParams();
    if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
    if (params.dateTo) qs.set("dateTo", params.dateTo);
    qs.set("granularity", params.granularity);
    return requestJson<RevenueReportResponse>(`/api/reports/revenue?${qs.toString()}`);
  },
  getMetrics: (range: { dateFrom?: string; dateTo?: string }) =>
    requestJson<ReportMetricsResponse>(withRange("/api/reports/metrics", range)),
  getRevenueByDoctor: (range: { dateFrom?: string; dateTo?: string }) =>
    requestJson<{ rows: RevenueByDoctorRow[] }>(withRange("/api/reports/revenue-by-doctor", range)),
  getRevenueByService: (range: { dateFrom?: string; dateTo?: string }) =>
    requestJson<{ rows: RevenueByServiceRow[] }>(withRange("/api/reports/revenue-by-service", range)),
  listDoctors: () => requestJson<DoctorOption[]>("/api/doctors"),
  listServices: () => requestJson<ServiceOption[]>("/api/services"),
  listPayments: () => requestJson<PaymentRow[]>("/api/payments"),
  listInvoices: () => requestJson<InvoiceRow[]>("/api/invoices"),
};

