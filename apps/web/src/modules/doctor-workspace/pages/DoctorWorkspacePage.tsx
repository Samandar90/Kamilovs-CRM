import React from "react";

export const DoctorWorkspacePage: React.FC = () => {
  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-50">
            Рабочее место врача
          </h2>
          <p className="text-sm text-slate-400">
            Осмотр пациента, ЭМК, диагнозы, назначения и план лечения.
          </p>
        </div>
        <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
          Завершить прием
        </button>
      </header>
      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Пациент
            </div>
            <p className="mt-1 text-sm text-slate-100">
              Здесь будет панель с данными текущего пациента (ФИО, возраст,
              контакты, источник).
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
            Здесь будет краткая сводка по текущему визиту и истории ЭМК.
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
            <div className="text-sm font-semibold text-slate-100">Осмотр</div>
            <p className="mt-1 text-xs text-slate-400">
              Здесь будут поля для жалоб, анамнеза, объективного статуса и
              заключения.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
            <div className="text-sm font-semibold text-slate-100">
              Диагноз, назначения и план лечения
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Здесь появятся вкладки для диагноза, лекарственных назначений,
              планов лечения и назначенных услуг.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

