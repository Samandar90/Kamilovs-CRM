import React from "react";

type Props = {
  clinicName: string;
  patientName: string;
  doctorName: string;
  visitDate: string;
  diagnosis: string;
  treatment: string;
  notes?: string | null;
};

export const PrescriptionTemplate: React.FC<Props> = ({
  clinicName,
  patientName,
  doctorName,
  visitDate,
  diagnosis,
  treatment,
  notes,
}) => {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: 24, color: "#111" }}>
      <h1 style={{ marginBottom: 8 }}>{clinicName}</h1>
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        <div>Дата: {visitDate}</div>
        <div>Пациент: {patientName}</div>
        <div>Врач: {doctorName}</div>
      </div>
      <h2 style={{ marginBottom: 6, fontSize: 18 }}>Диагноз</h2>
      <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>{diagnosis}</p>
      <h2 style={{ marginBottom: 6, fontSize: 18 }}>Назначение</h2>
      <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>{treatment}</p>
      {notes && (
        <>
          <h3 style={{ marginBottom: 6, fontSize: 16 }}>Заметки</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{notes}</p>
        </>
      )}
    </div>
  );
};
