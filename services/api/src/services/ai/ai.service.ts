import {
  AI_ACCESS_DENIED_MESSAGE,
  checkAIActionAccess,
  checkAIRequestAccess,
} from "../../ai/aiAssistantHardGate";
import type { AIAction } from "./ai.actions";
import { AIContextBuilder, type AIContext } from "./ai.context";
import { callAiRouterLlm, type AiRouterDbAction } from "./ai.routerLlm";
import { callResponderLlm, normalizeResponse } from "./ai.llm";
import { AIValidationService, type AIValidationDependencies } from "./ai.validation";
import { AIExecutorService, type AIExecutorDependencies } from "./ai.executor";
import type { AuthTokenPayload } from "../../repositories/interfaces/userTypes";
import type { AiChatHistoryTurn } from "../aiMessagesService";
import type {
  AiRevenueAnalyticsInput,
  AiRevenueAnalyticsResult,
  ReportsService,
} from "../reportsService";

const AI_ROUTER_UNAVAILABLE = "AI временно недоступен. Проверьте настройку OpenAI API.";

const formatSum = (value: number): string => `${Math.round(value).toLocaleString("ru-RU")} сум`;
const YEAR_QUERY_PATTERN = /(какой\s+сейчас\s+год|какой\s+год\s+сейчас|сейчас\s+какой\s+год|текущий\s+год)/i;
const DATE_QUERY_PATTERN =
  /(какое\s+сегодня\s+число|какое\s+число\s+сегодня|какая\s+сегодня\s+дата|какая\s+дата|сегодняшн(?:яя|ее)\s+дата|сегодняшн(?:ее|яя)\s+число|какой\s+сегодня\s+день)/i;

function getTashkentDateInfo(): { year: string; fullDate: string } {
  const now = new Date();
  const year = new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    timeZone: "Asia/Tashkent",
  }).format(now);
  const fullDate = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Tashkent",
  })
    .format(now)
    .replace(/\s?г\.$/, " года");
  return { year, fullDate };
}

type Deps = AIExecutorDependencies &
  AIValidationDependencies & {
    reportsService: ReportsService;
  };

type DbRunContext = {
  userMessage: string;
  crmContext: AIContext;
  chatHistory: AiChatHistoryTurn[];
};

function parseRevenuePayload(payload: Record<string, unknown>): AiRevenueAnalyticsInput {
  const pr = typeof payload.preset === "string" ? payload.preset.toLowerCase().trim() : "";
  if (pr === "today" || pr === "сегодня" || pr === "day") {
    return { preset: "today" };
  }
  if (
    pr === "month" ||
    pr === "месяц" ||
    pr === "calendar_month" ||
    pr === "this_month" ||
    pr === "текущий_месяц"
  ) {
    return { preset: "calendar_month" };
  }

  const weeksNum =
    typeof payload.weeks === "number" && Number.isFinite(payload.weeks)
      ? Math.floor(payload.weeks)
      : typeof payload.weeks === "string"
        ? parseInt(payload.weeks.replace(/\s/g, ""), 10)
        : NaN;
  if (Number.isFinite(weeksNum) && weeksNum > 0) {
    return { preset: "last_days", days: Math.min(400, Math.max(1, weeksNum * 7)) };
  }

  const daysNum =
    typeof payload.days === "number" && Number.isFinite(payload.days)
      ? Math.floor(payload.days)
      : typeof payload.days === "string"
        ? parseInt(String(payload.days).replace(/\s/g, ""), 10)
        : NaN;
  if (Number.isFinite(daysNum) && daysNum > 0) {
    return { preset: "last_days", days: Math.min(400, Math.max(1, daysNum)) };
  }

  return { preset: "last_days", days: 7 };
}

function formatRevenueFactsForLlm(f: AiRevenueAnalyticsResult): string {
  const lines = [
    `Период: ${f.periodLabelRu}`,
    `Календарных дней: ${f.daysInPeriod}`,
    `Выручка: ${formatSum(f.revenue)}`,
    `Число оплат: ${f.paymentsCount}`,
    `Средний чек: ${f.paymentsCount > 0 ? formatSum(f.avgCheck) : "нет оплат"}`,
    `Сравнение: ${f.comparisonLabelRu}`,
    `Выручка в сравниваемом периоде: ${formatSum(f.previousRevenue)}, оплат: ${f.previousPaymentsCount}`,
  ];
  if (f.growthPct != null) {
    lines.push(
      `Изменение выручки к предыдущему периоду: ${f.growthPct > 0 ? "+" : ""}${f.growthPct}%`
    );
  } else if (f.previousRevenue <= 0 && f.revenue > 0) {
    lines.push("В прошлом периоде не было выручки — процент изменения не считаем.");
  }
  return lines.join("\n");
}

function formatRevenueFallback(f: AiRevenueAnalyticsResult): string {
  const growthLine =
    f.growthPct != null
      ? `\n📈 К предыдущему периоду: ${f.growthPct > 0 ? "+" : ""}${f.growthPct}%`
      : f.previousRevenue <= 0 && f.revenue > 0
        ? "\n📈 Сравнение: в прошлом периоде не было выручки."
        : "";
  const avg =
    f.paymentsCount > 0 ? `— Средний чек: ${formatSum(f.avgCheck)}` : "— Средний чек: —";
  return `📊 ${f.periodLabelRu.charAt(0).toUpperCase()}${f.periodLabelRu.slice(1)}:\n— Выручка: ${formatSum(f.revenue)}\n${avg}\n— Оплат: ${f.paymentsCount}${growthLine}`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

export class AIService {
  private readonly contextBuilder = new AIContextBuilder();
  private readonly validator: AIValidationService;
  private readonly executor: AIExecutorService;
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
    this.validator = new AIValidationService(deps);
    this.executor = new AIExecutorService(deps);
  }

  async handleMessage(
    message: string,
    auth: AuthTokenPayload,
    chatHistory: AiChatHistoryTurn[] = []
  ): Promise<string> {
    const safeMessage = String(message ?? "").trim();
    if (!safeMessage) return "Пустой запрос.";
    if (YEAR_QUERY_PATTERN.test(safeMessage)) {
      const { year } = getTashkentDateInfo();
      return `Сейчас ${year} год.`;
    }
    if (DATE_QUERY_PATTERN.test(safeMessage)) {
      const { fullDate } = getTashkentDateInfo();
      return `Сегодня ${fullDate}.`;
    }

    if (!checkAIRequestAccess(auth.role, safeMessage)) {
      return AI_ACCESS_DENIED_MESSAGE;
    }

    const crmContext = await this.contextBuilder.buildCRMContext();
    const routed = await callAiRouterLlm(safeMessage, auth.role, crmContext, chatHistory);

    if (routed.ok === false) {
      const recovered = await callResponderLlm(safeMessage, crmContext, auth.role, chatHistory, {
        fallback: true,
      });
      return recovered?.trim() ? recovered : AI_ROUTER_UNAVAILABLE;
    }
    if ("rawFallback" in routed) {
      const recovered = await callResponderLlm(safeMessage, crmContext, auth.role, chatHistory, {
        fallback: true,
      });
      return recovered?.trim() ? recovered : normalizeResponse(routed.rawFallback);
    }

    const decision = routed.data;
    const gateAction = decision.type === "chat" ? "CHAT" : decision.action;
    if (!checkAIActionAccess(auth.role, gateAction)) {
      return AI_ACCESS_DENIED_MESSAGE;
    }

    if (decision.type === "chat") {
      const reply = await callResponderLlm(safeMessage, crmContext, auth.role, chatHistory);
      return reply ?? "Недостаточно данных.";
    }

    if (decision.type === "db") {
      return this.executeDb(decision.action, decision.payload, auth, {
        userMessage: safeMessage,
        crmContext,
        chatHistory,
      });
    }

    return this.executeMutation(decision.action, decision.payload, auth);
  }

  private async executeDb(
    action: AiRouterDbAction,
    payload: Record<string, unknown>,
    auth: AuthTokenPayload,
    ctx: DbRunContext
  ): Promise<string> {
    switch (action) {
      case "GET_DOCTORS":
        return this.answerGetDoctors(auth);
      case "GET_PATIENTS":
        return this.answerGetPatients(auth, payload);
      case "GET_APPOINTMENTS":
        return this.answerGetAppointments(auth, payload);
      case "GET_REVENUE": {
        const input = parseRevenuePayload(payload);
        const facts = await this.deps.reportsService.getAiRevenueAnalytics(input);
        const factBlock = formatRevenueFactsForLlm(facts);
        const reply = await callResponderLlm(
          ctx.userMessage,
          ctx.crmContext,
          auth.role,
          ctx.chatHistory,
          { factualDataBlock: factBlock }
        );
        return reply?.trim() ? reply : formatRevenueFallback(facts);
      }
      case "GET_DEBTS": {
        const context = await this.contextBuilder.buildCRMContext();
        return `Неоплаченных счетов: ${context.unpaidInvoicesCount} на сумму ${formatSum(context.unpaidInvoicesAmount)}.`;
      }
      default:
        return normalizeResponse("Запрос к данным пока не поддерживается.");
    }
  }

  private async executeMutation(
    action: "CREATE_PATIENT" | "CREATE_APPOINTMENT" | "CREATE_PAYMENT",
    payload: Record<string, unknown>,
    auth: AuthTokenPayload
  ): Promise<string> {
    if (action === "CREATE_PATIENT") {
      const fullName =
        typeof payload.fullName === "string"
          ? payload.fullName.trim()
          : typeof payload.name === "string"
            ? payload.name.trim()
            : "";
      const aiAction: AIAction = {
        type: "CREATE_PATIENT",
        payload: { patientName: fullName || undefined, confirmed: false },
      };
      const validation = await this.validator.validateAction(aiAction, auth);
      if (!validation.ok) return validation.message;
      try {
        return normalizeResponse(await this.executor.executeAction(validation.action, auth));
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Недостаточно данных";
        return normalizeResponse(msg);
      }
    }

    if (action === "CREATE_APPOINTMENT") {
      const date =
        typeof payload.date === "string" && payload.date.trim()
          ? payload.date.trim()
          : undefined;
      const timeRaw =
        typeof payload.time === "string" && payload.time.trim() ? payload.time.trim() : undefined;
      const aiAction: AIAction = {
        type: "CREATE_APPOINTMENT",
        payload: {
          patientName:
            typeof payload.patientName === "string"
              ? payload.patientName.trim() || undefined
              : typeof payload.patient === "string"
                ? payload.patient.trim() || undefined
                : undefined,
          doctorName:
            typeof payload.doctorName === "string"
              ? payload.doctorName.trim() || undefined
              : typeof payload.doctor === "string"
                ? payload.doctor.trim() || undefined
                : undefined,
          serviceName:
            typeof payload.serviceName === "string" ? payload.serviceName.trim() || undefined : undefined,
          date,
          time: timeRaw ?? (date ? "10:00" : undefined),
          confirmed: false,
        },
      };
      const validation = await this.validator.validateAction(aiAction, auth);
      if (!validation.ok) return validation.message;
      try {
        return normalizeResponse(await this.executor.executeAction(validation.action, auth));
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Недостаточно данных";
        return normalizeResponse(msg);
      }
    }

    const amountRaw = payload.amount;
    const amount =
      typeof amountRaw === "number" && Number.isFinite(amountRaw)
        ? amountRaw
        : typeof amountRaw === "string"
          ? Number(amountRaw.replace(/\s/g, "").replace(",", "."))
          : NaN;
    const methodRaw = typeof payload.method === "string" ? payload.method.toLowerCase() : "";
    const paymentMethod =
      methodRaw === "cash" || methodRaw.includes("налич")
        ? "cash"
        : "card";
    const aiAction: AIAction = {
      type: "CREATE_PAYMENT",
      payload: {
        amount: Number.isFinite(amount) ? amount : undefined,
        invoiceRef: typeof payload.invoiceRef === "string" ? payload.invoiceRef.trim() : undefined,
        paymentMethod,
        confirmed: false,
      },
    };
    const validation = await this.validator.validateAction(aiAction, auth);
    if (!validation.ok) return validation.message;
    try {
      return normalizeResponse(await this.executor.executeAction(validation.action, auth));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Недостаточно данных";
      return normalizeResponse(msg);
    }
  }

  /** Полный список врачей из БД; без normalizeResponse (без обрезки текста). */
  private async answerGetDoctors(auth: AuthTokenPayload): Promise<string> {
    const doctors = await this.deps.doctorsService.list(auth);
    if (doctors.length === 0) return "В справочнике нет врачей.";
    const names = doctors.map((d) => d.name.trim()).filter(Boolean).join(", ");
    return `У нас ${doctors.length} врачей: ${names}.`;
  }

  private async answerGetPatients(
    auth: AuthTokenPayload,
    payload: Record<string, unknown>
  ): Promise<string> {
    const search = typeof payload.search === "string" ? payload.search.trim() : undefined;
    const patients = await this.deps.patientsService.list(auth, search ? { search } : undefined);
    if (patients.length === 0) {
      return search ? "Пациенты по запросу не найдены." : "В списке нет пациентов.";
    }
    const maxShow = 100;
    const slice = patients.slice(0, maxShow);
    const names = slice.map((p) => p.fullName.trim()).filter(Boolean).join(", ");
    const tail =
      patients.length > maxShow ? ` (показано ${maxShow} из ${patients.length})` : "";
    return `Пациентов: ${patients.length}. ${names}.${tail}`;
  }

  private async answerGetAppointments(
    auth: AuthTokenPayload,
    payload: Record<string, unknown>
  ): Promise<string> {
    const { startFrom, startTo } = this.appointmentWindowFromPayload(payload);
    const appts = await this.deps.appointmentsService.list(auth, { startFrom, startTo });
    if (appts.length === 0) {
      return "Записей в выбранном периоде нет.";
    }
    const patients = await this.deps.patientsService.list(auth);
    const doctors = await this.deps.doctorsService.list(auth);
    const pMap = new Map(patients.map((p) => [p.id, p.fullName]));
    const dMap = new Map(doctors.map((d) => [d.id, d.name]));
    const maxShow = 80;
    const lines = appts.slice(0, maxShow).map((a) => {
      const dt = a.startAt.slice(0, 16).replace("T", " ");
      const pn = pMap.get(a.patientId) ?? `id ${a.patientId}`;
      const dn = dMap.get(a.doctorId) ?? `врач ${a.doctorId}`;
      return `${dt} — ${pn}, ${dn} (${a.status})`;
    });
    const tail = appts.length > maxShow ? ` … ещё ${appts.length - maxShow} записей.` : "";
    return `Записей в периоде: ${appts.length}. ${lines.join("; ")}${tail}`;
  }

  private appointmentWindowFromPayload(payload: Record<string, unknown>): {
    startFrom: string;
    startTo: string;
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let fromD = new Date(today);
    let toD = new Date(today);
    toD.setDate(toD.getDate() + 14);

    const df = typeof payload.dateFrom === "string" ? payload.dateFrom.trim() : "";
    const dt = typeof payload.dateTo === "string" ? payload.dateTo.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(df)) {
      fromD = new Date(`${df}T00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      toD = new Date(`${dt}T23:59:59`);
    }

    const isoLocal = (d: Date, end: boolean): string => {
      const y = d.getFullYear();
      const m = pad2(d.getMonth() + 1);
      const day = pad2(d.getDate());
      const time = end ? "23:59:59" : "00:00:00";
      return `${y}-${m}-${day} ${time}`;
    };

    return {
      startFrom: isoLocal(fromD, false),
      startTo: isoLocal(toD, true),
    };
  }
}
