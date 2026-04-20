import type { UserRole } from "../auth/permissions";
import { canReadFinancialFactsInAi } from "../ai/aiAssistantRoleAccess";
import { AI_UNAVAILABLE_PREFIX, completeMorningBriefing } from "../ai/aiLlmService";
import { formatSum } from "../ai/aiRuleEngine";
import { ApiError } from "../middleware/errorHandler";
import type { IUsersRepository } from "../repositories/interfaces/IUsersRepository";
import type { AuthTokenPayload, User } from "../repositories/interfaces/userTypes";
import {
  loadMorningBriefingData,
  type MorningBriefingData,
} from "../repositories/morningBriefing/morningBriefingMetricsRepository";

/**
 * Процент изменения «вчера» к «позавчера»: ((yesterday - beforeYesterday) / beforeYesterday) * 100, округление до целых.
 * При beforeYesterday === 0 деления нет — null.
 */
function percentChangeInt(yesterday: number, beforeYesterday: number): number | null {
  if (beforeYesterday === 0) return null;
  return Math.round(((yesterday - beforeYesterday) / beforeYesterday) * 100);
}

/**
 * AI-сервис: брифинги и прочие обёртки над LLM (отдельно от чата aiAssistant).
 */
export class AIService {
  constructor(private readonly usersRepository: IUsersRepository) {}

  /**
   * Сырые метрики для утреннего брифинга (PostgreSQL, TZ из `env.reportsTimezone`, по умолчанию Asia/Tashkent).
   * Для `user.role === "doctor"` — фильтр `doctor_id = user.doctorId` на записях, где поле есть; иначе вся клиника.
   */
  async getMorningBriefingData(user: User): Promise<MorningBriefingData> {
    const scopedDoctorId = user.role === "doctor" && user.doctorId != null ? user.doctorId : null;
    return loadMorningBriefingData(scopedDoctorId);
  }

  /**
   * Персонализированный утренний брифинг.
   * Для role === doctor метрики только по doctorId; иначе — по всей клинике.
   */
  async generateMorningBriefing(auth: AuthTokenPayload): Promise<{ briefing: string }> {
    const user = await this.usersRepository.findById(auth.userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    if (!user.isActive) {
      throw new ApiError(403, "User is inactive");
    }

    const scopedDoctorId = user.role === "doctor" && user.doctorId != null ? user.doctorId : null;
    const includeFinancial = canReadFinancialFactsInAi(auth.role);

    const m = await this.getMorningBriefingData(user);

    const revenueChange = includeFinancial
      ? percentChangeInt(m.revenueYesterday, m.revenueBeforeYesterday)
      : null;
    const patientsChange = percentChangeInt(m.patientsYesterday, m.patientsBeforeYesterday);

    const context: Record<string, unknown> = {
      userName: (user.fullName ?? "").trim() || user.username,
      role: auth.role,
      scope: scopedDoctorId != null ? "doctor" : "clinic",
      revenueYesterday: includeFinancial ? m.revenueYesterday : null,
      revenueBeforeYesterday: includeFinancial ? m.revenueBeforeYesterday : null,
      revenueYesterdayFormatted: includeFinancial ? formatSum(m.revenueYesterday) : null,
      revenueBeforeYesterdayFormatted: includeFinancial ? formatSum(m.revenueBeforeYesterday) : null,
      revenueChange,
      patientsYesterday: m.patientsYesterday,
      patientsBeforeYesterday: m.patientsBeforeYesterday,
      patientsChange,
      cancellationsYesterday: m.cancellationsYesterday,
      unpaidInvoicesCount: includeFinancial ? m.unpaidInvoicesCount : null,
      appointmentsToday: m.appointmentsToday,
      freeSlotsToday: m.freeSlotsToday,
    };

    const raw = await completeMorningBriefing(context);
    if (raw == null) {
      return {
        briefing: `${AI_UNAVAILABLE_PREFIX} проверьте OPENAI_API_KEY и доступ к API.`,
      };
    }
    const trimmed = raw.trim().slice(0, 2500);
    return { briefing: trimmed || "Краткий брифинг недоступен." };
  }
}
