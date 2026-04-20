/** Allowed service.category values (clinic CRM). */
export const SERVICE_CATEGORIES = [
  "consultation",
  "diagnostics",
  "hygiene",
  "treatment",
  "surgery",
  "orthodontics",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const isValidServiceCategory = (value: string): value is ServiceCategory =>
  (SERVICE_CATEGORIES as readonly string[]).includes(value);
