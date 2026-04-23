type ServiceLike = {
  serviceId?: number;
  id?: number;
  name?: string | null;
  price?: number | string | null;
};

type AppointmentLike = {
  service?: ServiceLike | null;
  serviceId?: number;
  price?: number | null;
  services?: ServiceLike[] | null;
};

export type UnifiedAppointmentService = {
  serviceId: number;
  name: string;
  price: number;
  isBase: boolean;
};

type GetAllServicesOptions = {
  fallbackBase?: ServiceLike | null;
  fallbackServices?: ServiceLike[];
};

const toMoneyNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/\s+/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export const getAllServices = (
  appointment: AppointmentLike,
  options?: GetAllServicesOptions
): UnifiedAppointmentService[] => {
  const baseSource = appointment.service ?? options?.fallbackBase;
  const result: UnifiedAppointmentService[] = [];

  if (baseSource) {
    const serviceId = baseSource.serviceId ?? baseSource.id ?? appointment.serviceId ?? 0;
    if (serviceId > 0) {
      result.push({
        serviceId,
        name: baseSource.name?.trim() || `Услуга #${serviceId}`,
        price: toMoneyNumber(baseSource.price ?? appointment.price ?? 0),
        isBase: true,
      });
    }
  }

  const extraSources = appointment.services?.length
    ? appointment.services
    : (options?.fallbackServices ?? []);
  for (const source of extraSources) {
    const serviceId = source.serviceId ?? source.id ?? 0;
    if (serviceId <= 0) continue;
    result.push({
      serviceId,
      name: source.name?.trim() || `Услуга #${serviceId}`,
      price: toMoneyNumber(source.price ?? 0),
      isBase: false,
    });
  }

  const deduped: UnifiedAppointmentService[] = [];
  const seen = new Set<number>();
  for (const service of result) {
    if (seen.has(service.serviceId)) continue;
    seen.add(service.serviceId);
    deduped.push(service);
  }

  return deduped;
};

