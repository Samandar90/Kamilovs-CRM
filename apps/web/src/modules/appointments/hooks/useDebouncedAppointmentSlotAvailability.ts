import * as React from "react";
import { appointmentsFlowApi } from "../api/appointmentsFlowApi";
import { normalizeDateTimeForApi } from "../utils/appointmentFormUtils";

export type SlotAvailabilityPhase = "idle" | "pending" | "loading" | "free" | "busy" | "error";

const DEBOUNCE_MS = 400;

export type SlotAvailabilityParams = {
  doctorId: string;
  serviceId: string;
  date: string;
  time: string;
};

/**
 * GET /api/appointments/check-availability с debounce и отменой предыдущего запроса.
 * Нужны врач, услуга (для длительности на сервере), дата и время.
 */
export function useDebouncedAppointmentSlotAvailability(
  token: string | null | undefined,
  params: SlotAvailabilityParams,
  enabled: boolean
): SlotAvailabilityPhase {
  const [phase, setPhase] = React.useState<SlotAvailabilityPhase>("idle");

  React.useEffect(() => {
    if (!enabled || !token) {
      setPhase("idle");
      return;
    }

    const doctorId = Number(params.doctorId);
    const serviceId = Number(params.serviceId);
    if (!doctorId || !serviceId || !params.date || !params.time) {
      setPhase("idle");
      return;
    }

    const startAt = normalizeDateTimeForApi(params.date, params.time);
    if (!startAt) {
      setPhase("idle");
      return;
    }

    setPhase("pending");
    let cancelled = false;
    const ac = new AbortController();

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setPhase("loading");
      void appointmentsFlowApi
        .checkAppointmentAvailability(
          token,
          {
            doctorId,
            serviceId,
            date: params.date,
            time: params.time,
          },
          ac.signal
        )
        .then((res) => {
          if (cancelled) return;
          setPhase(res.available ? "free" : "busy");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const name = err instanceof Error ? err.name : "";
          if (name === "AbortError") return;
          setPhase("error");
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [
    enabled,
    token,
    params.doctorId,
    params.serviceId,
    params.date,
    params.time,
  ]);

  return phase;
}
