import type { Intent } from "./ai.intents";

export type AIActionType =
  | "CREATE_PATIENT"
  | "CREATE_APPOINTMENT"
  | "CREATE_INVOICE"
  | "CREATE_PAYMENT"
  | "CLOSE_SHIFT";

export type AIActionPayload = {
  patientName?: string;
  doctorName?: string;
  serviceName?: string;
  date?: string;
  time?: string;
  invoiceRef?: string;
  amount?: number;
  paymentMethod?: "cash" | "card";
  confirmed?: boolean;
};

export type AIAction = {
  type: AIActionType;
  payload: AIActionPayload;
};

const normalize = (raw: string): string => String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Пациент для записи: «для Иванова», плюс общие шаблоны из parsePatientName. */
const parseAppointmentPatientName = (message: string): string | undefined => {
  const direct = parsePatientName(message);
  if (direct) return direct;
  const m = message.match(/\b(?:для|пациент[а-я]*)\s+([А-ЯA-ZЁ][^,.\n]{1,120})/i);
  return m?.[1]?.trim();
};

const parsePatientName = (message: string): string | undefined => {
  const m =
    message.match(/(?:добавь|создай|зарегистрируй)\s+пациент[а-я]*\s+([А-ЯA-ZЁ][^,.\n]{1,120})/i) ??
    message.match(/пациент[а-я]*\s+([А-ЯA-ZЁ][^,.\n]{1,120})/i);
  if (m?.[1]?.trim()) return m[1].trim();
  const stripped = message
    .replace(/\bдобавь\s+пациента\b/gi, "")
    .replace(/\bсоздай\s+пациента\b/gi, "")
    .replace(/\bновый\s+пациент\b/gi, "")
    .replace(/\bзарегистрируй\s+пациента\b/gi, "")
    .trim();
  return stripped.length >= 2 ? stripped : undefined;
};

const parseDoctorName = (message: string): string | undefined => {
  const mDoc =
    message.match(/\bк\s+(?:доктору|врачу)\s+([А-ЯA-ZЁ][А-ЯA-ZЁа-яa-z\-\s]{0,60})/i) ??
    message.match(/\b(?:доктору|врачу)\s+([А-ЯA-ZЁ][А-ЯA-ZЁа-яa-z\-\s]{0,60})/i);
  if (mDoc?.[1]?.trim()) return mDoc[1].trim();
  const m = message.match(/\bк\s+([А-ЯA-ZЁ][А-ЯA-ZЁа-яa-z\-\s]{1,60})/i);
  return m?.[1]?.trim();
};

const parseServiceName = (message: string): string | undefined => {
  const m = message.match(/(?:услуг[ауеи]\s+|на\s+услуг[ауеи]\s+)([А-ЯA-ZЁ][^,.\n]{1,80})/i);
  return m?.[1]?.trim();
};

const parseTime = (message: string): string | undefined => {
  const m = message.match(/(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const parseDate = (message: string): string | undefined => {
  const text = normalize(message);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (text.includes("завтра")) d.setDate(d.getDate() + 1);
  else if (!(text.includes("сегодня"))) {
    const iso = message.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const ru = message.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/);
    if (ru) {
      const year = Number(ru[3] ?? new Date().getFullYear());
      return `${year}-${String(Number(ru[2])).padStart(2, "0")}-${String(Number(ru[1])).padStart(2, "0")}`;
    }
    return undefined;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const parseAmount = (message: string): number | undefined => {
  const m = message.match(/(\d[\d\s]{1,})/);
  if (!m) return undefined;
  const num = Number(m[1].replace(/\s+/g, ""));
  return Number.isFinite(num) && num > 0 ? num : undefined;
};

const parsePaymentMethod = (message: string): "cash" | "card" | undefined => {
  const t = normalize(message);
  if (t.includes("налич")) return "cash";
  if (
    t.includes("карт") ||
    t.includes("терминал") ||
    t.includes("перевод") ||
    t.includes("банк") ||
    t.includes("безнал")
  ) {
    return "card";
  }
  return undefined;
};

const parseInvoiceRef = (message: string): string | undefined => {
  const byNum = message.match(/(?:счет|инвойс|invoice)\s*#?\s*([a-zа-я0-9\-]+)/i);
  return byNum?.[1]?.trim();
};

export function parseAction(message: string, intent: Intent): AIAction | null {
  if (
    intent !== "CREATE_PATIENT" &&
    intent !== "CREATE_APPOINTMENT" &&
    intent !== "CREATE_INVOICE" &&
    intent !== "CREATE_PAYMENT" &&
    intent !== "CLOSE_SHIFT"
  ) {
    return null;
  }

  const t = normalize(message);
  const confirmed = t.includes("подтверждаю") || t.includes("подтвердить");

  if (intent === "CREATE_PATIENT") {
    return { type: "CREATE_PATIENT", payload: { patientName: parsePatientName(message), confirmed } };
  }
  if (intent === "CREATE_APPOINTMENT") {
    const date = parseDate(message);
    return {
      type: "CREATE_APPOINTMENT",
      payload: {
        patientName: parseAppointmentPatientName(message),
        doctorName: parseDoctorName(message),
        serviceName: parseServiceName(message),
        date,
        time: parseTime(message) ?? (date ? "10:00" : undefined),
        confirmed,
      },
    };
  }
  if (intent === "CREATE_INVOICE") {
    return {
      type: "CREATE_INVOICE",
      payload: {
        patientName: parsePatientName(message),
        serviceName: parseServiceName(message),
        confirmed,
      },
    };
  }
  if (intent === "CREATE_PAYMENT") {
    return {
      type: "CREATE_PAYMENT",
      payload: {
        amount: parseAmount(message),
        paymentMethod: parsePaymentMethod(message),
        invoiceRef: parseInvoiceRef(message),
        confirmed,
      },
    };
  }
  return { type: "CLOSE_SHIFT", payload: { confirmed } };
}

