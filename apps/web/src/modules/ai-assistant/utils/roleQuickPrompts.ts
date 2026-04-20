import type { UserRole } from "../../../auth/permissions";
import type { AiChipVisual, EmptyHeroAction, SmartQuickChip } from "../constants";

type Chip = SmartQuickChip;
type Hero = EmptyHeroAction;

const chart = "chart" as AiChipVisual;
const invoice = "invoice" as AiChipVisual;
const crown = "crown" as AiChipVisual;
const team = "team" as AiChipVisual;
const health = "health" as AiChipVisual;

const EXEC_CHIPS: Chip[] = [
  { text: "Покажи выручку за неделю", icon: chart, domain: "Аналитика" },
  { text: "Кто перегружен сегодня", icon: crown, domain: "Нагрузка" },
  { text: "Какие пациенты с долгами", icon: invoice, domain: "Деньги" },
  { text: "Где мы теряем деньги", icon: chart, domain: "Риски" },
  { text: "Что важно сегодня", icon: health, domain: "Фокус" },
];

const EXEC_HERO: Hero[] = [
  { prompt: "Покажи выручку за неделю", subtitle: "Динамика и сравнение периодов", icon: chart },
  { prompt: "Кто перегружен сегодня", subtitle: "Распределение записей по врачам", icon: crown },
  { prompt: "Какие пациенты с долгами", subtitle: "Дебиторка и неоплаченные счета", icon: invoice },
  { prompt: "Где мы теряем деньги", subtitle: "Сигналы отмен, no-show, простоя", icon: chart },
];

const FINANCE_CHIPS: Chip[] = [
  { text: "Сколько неоплаченных счетов", icon: invoice, domain: "Счета" },
  { text: "Статус кассы и смены", icon: chart, domain: "Касса" },
  { text: "Покажи последние платежи", icon: invoice, domain: "Оплаты" },
  { text: "Счета к оплате сегодня", icon: invoice, domain: "Деньги" },
  { text: "Что важно по финансам", icon: chart, domain: "Фокус" },
];

const FINANCE_HERO: Hero[] = [
  { prompt: "Сколько неоплаченных счетов", subtitle: "Суммы и статусы", icon: invoice },
  { prompt: "Статус кассы и смены", subtitle: "Открыта ли смена", icon: chart },
  { prompt: "Покажи последние платежи", subtitle: "Лента оплат", icon: invoice },
  { prompt: "Счета к оплате сегодня", subtitle: "Приоритет взыскания", icon: invoice },
];

const FRONT_CHIPS: Chip[] = [
  { text: "Записи на сегодня", icon: team, domain: "Расписание" },
  { text: "Свободные окна у врачей", icon: team, domain: "Слоты" },
  { text: "Как найти пациента", icon: team, domain: "Пациенты" },
  { text: "Что важно сегодня по записи", icon: health, domain: "Фокус" },
  { text: "Сколько приёмов на сегодня", icon: team, domain: "День" },
];

const FRONT_HERO: Hero[] = [
  { prompt: "Записи на сегодня", subtitle: "Календарь и статусы", icon: team },
  { prompt: "Свободные окна у врачей", subtitle: "Куда записать пациента", icon: team },
  { prompt: "Как найти пациента", subtitle: "Поиск карточки", icon: team },
  { prompt: "Сколько приёмов на сегодня", subtitle: "Объём дня", icon: team },
];

const CLINICAL_CHIPS: Chip[] = [
  { text: "Мои записи на сегодня", icon: team, domain: "Расписание" },
  { text: "Сколько отмен за месяц", icon: health, domain: "No-show" },
  { text: "Напомни правила no-show", icon: health, domain: "Процесс" },
  { text: "Как отметить приём в CRM", icon: team, domain: "Система" },
  { text: "Что важно перед приёмами", icon: health, domain: "Фокус" },
];

const CLINICAL_HERO: Hero[] = [
  { prompt: "Мои записи на сегодня", subtitle: "Ваш день в календаре", icon: team },
  { prompt: "Сколько отмен за месяц", subtitle: "Контроль no-show", icon: health },
  { prompt: "Напомни правила no-show", subtitle: "Кратко по процессу", icon: health },
  { prompt: "Как отметить приём в CRM", subtitle: "Статусы визита", icon: team },
];

export function getQuickPromptChipsForRole(role: UserRole): SmartQuickChip[] {
  if (role === "superadmin" || role === "manager" || role === "director") return EXEC_CHIPS;
  if (role === "cashier" || role === "accountant") return FINANCE_CHIPS;
  if (role === "doctor" || role === "nurse") return CLINICAL_CHIPS;
  return FRONT_CHIPS;
}

export function getEmptyHeroActionsForRole(role: UserRole): EmptyHeroAction[] {
  if (role === "superadmin" || role === "manager" || role === "director") return EXEC_HERO;
  if (role === "cashier" || role === "accountant") return FINANCE_HERO;
  if (role === "doctor" || role === "nurse") return CLINICAL_HERO;
  return FRONT_HERO;
}
