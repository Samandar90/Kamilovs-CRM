import type { RecommendationsAnalyticsData } from "./aiRecommendationsTypes";
import type {
  InvoiceStatusSummaryRow,
  PaymentsByMethodRow,
  ReportMetrics,
  ReportsDateRange,
  ReportsGranularity,
  ReportsSummaryData,
  RevenueByDoctorRow,
  RevenueByServiceRow,
  RevenuePoint,
} from "./billingTypes";

export interface IReportsRepository {
  getRevenueReport(
    granularity: ReportsGranularity,
    range: ReportsDateRange
  ): Promise<RevenuePoint[]>;
  getPaymentsByMethodReport(range: ReportsDateRange): Promise<PaymentsByMethodRow[]>;
  getInvoicesStatusSummaryReport(
    range: ReportsDateRange
  ): Promise<InvoiceStatusSummaryRow[]>;
  getRevenueByDoctor(range: ReportsDateRange): Promise<RevenueByDoctorRow[]>;
  getRevenueByService(range: ReportsDateRange): Promise<RevenueByServiceRow[]>;
  getReportMetrics(range: ReportsDateRange): Promise<ReportMetrics>;
  /** Сводка выручки: календарные периоды в env.reportsTimezone; разрезы за последние 30 дней. */
  getReportsSummary(): Promise<ReportsSummaryData>;
  getRecommendationsAnalytics(): Promise<RecommendationsAnalyticsData>;
}
