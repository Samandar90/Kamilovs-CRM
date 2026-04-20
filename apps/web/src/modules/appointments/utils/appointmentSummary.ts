import type { Appointment, AppointmentStatus } from "../api/appointmentsFlowApi";

export type AppointmentListSummary = {
  total: number;
  awaitingReception: number;
  inConsultation: number;
  completed: number;
};

const awaitingStatuses: AppointmentStatus[] = ["scheduled", "confirmed", "arrived"];

export function summarizeAppointments(rows: Appointment[]): AppointmentListSummary {
  let awaitingReception = 0;
  let inConsultation = 0;
  let completed = 0;

  for (const a of rows) {
    if (awaitingStatuses.includes(a.status)) awaitingReception += 1;
    else if (a.status === "in_consultation") inConsultation += 1;
    else if (a.status === "completed") completed += 1;
  }

  return {
    total: rows.length,
    awaitingReception,
    inConsultation,
    completed,
  };
}
