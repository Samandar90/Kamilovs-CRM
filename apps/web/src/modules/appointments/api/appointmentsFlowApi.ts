import { requestJson } from "../../../api/http";
import { cleanMoney } from "../../../shared/lib/money";
import { normalizeInvoiceCreatePayload } from "../../../utils/normalizeInvoiceCreatePayload";

/** Сырые цены с UI/API (строка «1 500 000 сум» и т.п.) — только для createInvoice. */
export type InvoiceCreatePriceSource = {
  servicePrice: unknown;
  /** Переопределение цены записи (в модели Appointment это поле `price`). */
  appointmentPriceOverride?: unknown | null;
};

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "no_show";

export type Appointment = {
  id: number;
  patientId: number;
  doctorId: number;
  serviceId: number;
  price: number | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledBy: number | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientSource = "instagram" | "telegram" | "advertising" | "referral" | "other";

export type Patient = {
  id: number;
  fullName: string;
  phone?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  source?: PatientSource | null;
  notes?: string | null;
  createdAt?: string;
};

/** POST /api/patients — тело как на бэкенде (camelCase) */
export type PatientCreateInput = {
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  gender: "male" | "female" | null;
  source?: PatientSource | null;
  notes?: string | null;
};

export type Doctor = {
  id: number;
  name: string;
};

export type Service = {
  id: number;
  name: string;
  category?: string;
  /** Каталог может отдавать число или отформатированную строку. */
  price: number | string;
  duration: number;
  active?: boolean;
  doctorIds?: number[];
};

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "cancelled"
  | "refunded";

export type InvoiceSummary = {
  id: number;
  number: string;
  patientId: number;
  appointmentId: number | null;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type PaymentMethod = "cash" | "card";

export type Payment = {
  id: number;
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  voidReason: string | null;
};

type AppointmentCreateInput = {
  patientId: number;
  doctorId: number;
  serviceId: number;
  price?: number;
  startAt: string;
  status: AppointmentStatus;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
};

export type InvoiceCreateInput = {
  patientId: number;
  appointmentId: number;
  /** Server uses item.price when present; иначе цена из каталога на бэкенде. */
  items: Array<{
    serviceId: number;
    quantity: number;
    description?: string;
    /** Опционально; строки вида "150 000 сум" → number в normalizeInvoiceCreatePayload. */
    price?: number | string;
  }>;
  status?: InvoiceStatus;
  discount?: number;
};

export type AppointmentSlotAvailability = {
  available: boolean;
};

export const appointmentsFlowApi = {
  listAppointments: (token: string) =>
    requestJson<Appointment[]>("/api/appointments", { token }),

  checkAppointmentAvailability: (
    token: string,
    params: { doctorId: number; serviceId: number; date: string; time: string },
    signal?: AbortSignal
  ) => {
    const time =
      params.time.length === 5 ? `${params.time}:00` : params.time;
    const qs = new URLSearchParams({
      doctorId: String(params.doctorId),
      serviceId: String(params.serviceId),
      date: params.date,
      time,
    });
    return requestJson<AppointmentSlotAvailability>(
      `/api/appointments/check-availability?${qs.toString()}`,
      { token, signal }
    );
  },

  createAppointment: (token: string, payload: AppointmentCreateInput) =>
    requestJson<Appointment>("/api/appointments", {
      method: "POST",
      token,
      body: payload,
    }),

  updateAppointmentPrice: (
    token: string,
    appointmentId: number,
    price: number
  ) =>
    requestJson<Appointment>(`/api/appointments/${appointmentId}/price`, {
      method: "PATCH",
      token,
      body: { price },
    }),

  updateAppointmentStatus: (
    token: string,
    appointmentId: number,
    status: AppointmentStatus
  ) =>
    requestJson<Appointment>(`/api/appointments/${appointmentId}`, {
      method: "PUT",
      token,
      body: { status },
    }),

  updateAppointment: (
    token: string,
    appointmentId: number,
    payload: Partial<Pick<Appointment, "status" | "diagnosis" | "treatment" | "notes">>
  ) =>
    requestJson<Appointment>(`/api/appointments/${appointmentId}`, {
      method: "PUT",
      token,
      body: payload,
    }),

  cancelAppointment: (
    token: string,
    appointmentId: number,
    reason?: string
  ) =>
    requestJson<Appointment>(`/api/appointments/${appointmentId}/cancel`, {
      method: "PATCH",
      token,
      body: reason?.trim() ? { reason: reason.trim() } : {},
    }),

  listPatients: (token: string, init?: { signal?: AbortSignal; search?: string }) =>
    requestJson<Patient[]>(
      init?.search?.trim()
        ? `/api/patients?search=${encodeURIComponent(init.search.trim())}`
        : "/api/patients",
      { token, signal: init?.signal }
    ),

  createPatient: (token: string, payload: PatientCreateInput) =>
    requestJson<Patient>("/api/patients", {
      method: "POST",
      token,
      body: payload,
    }),

  listDoctors: (token: string) =>
    requestJson<Doctor[]>("/api/doctors", { token }),

  listServices: (token: string, doctorId?: number) =>
    requestJson<Service[]>(
      doctorId
        ? `/api/services?doctorId=${encodeURIComponent(String(doctorId))}`
        : "/api/services",
      { token }
    ),

  listInvoicesByAppointment: (token: string, appointmentId: number) =>
    requestJson<InvoiceSummary[]>(
      `/api/invoices?appointmentId=${encodeURIComponent(String(appointmentId))}`,
      { token }
    ),

  createInvoice: (
    token: string,
    payload: InvoiceCreateInput,
    priceSource?: InvoiceCreatePriceSource
  ) => {
    let payloadToNormalize = payload;

    if (priceSource) {
      // eslint-disable-next-line no-console
      console.log("RAW PRICE SOURCE:", {
        servicePrice: priceSource.servicePrice,
        override: priceSource.appointmentPriceOverride ?? null,
      });

      const rawPrice =
        priceSource.appointmentPriceOverride ?? priceSource.servicePrice;
      const price = cleanMoney(rawPrice);

      if (!price || Number.isNaN(price)) {
        throw new Error("Invalid price before sending invoice");
      }

      payloadToNormalize = {
        ...payload,
        items: payload.items.map((item) => ({
          ...item,
          price,
        })),
      };
    }

    const body = normalizeInvoiceCreatePayload(payloadToNormalize);
    // eslint-disable-next-line no-console
    console.log("INVOICE PAYLOAD FINAL:", body);
    return requestJson<InvoiceSummary>("/api/invoices", {
      method: "POST",
      token,
      body,
    });
  },

  createPayment: (
    token: string,
    payload: { invoiceId: number; amount: number; method: PaymentMethod }
  ) =>
    requestJson<{ id: number }>("/api/payments", {
      method: "POST",
      token,
      body: payload,
    }),

  listPaymentsByInvoice: (token: string, invoiceId: number) =>
    requestJson<Payment[]>(
      `/api/payments?invoiceId=${encodeURIComponent(String(invoiceId))}`,
      { token }
    ),
};
