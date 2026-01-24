// ===============================
// Kamilovs Clinic CRM — app.js (Pro)
// ===============================

// ===== НАСТРОЙКИ / КОНСТАНТЫ =====
const STORAGE_DOCTORS = "crm_doctors_v1";
const STORAGE_SERVICES = "crm_services_v1";
const STORAGE_APPTS = "crm_appointments_v1";
const LOGIN_KEY = "crm_logged_in_v1";
const STORAGE_PATIENTS_ARCHIVE = "crm_patients_archived_v1";

// White-label: акценты (можно менять — продавать “под клинику”)
const BRAND_THEME = {
  accent: "#22d3ee",
  accent2: "#6366f1",
  // можно сделать пресеты тем и переключение позже
};

const DEMO_USER = { username: "admin", password: "samandar014" };

const DEMO_DOCTORS = [
  {
    id: 1,
    name: "Д-р Ахмедов",
    speciality: "Терапевт",
    percent: 40,
    active: true,
  },
  { id: 2, name: "Д-р Камилов", speciality: "УЗИ", percent: 35, active: true },
  {
    id: 3,
    name: "Д-р Саидова",
    speciality: "Кардиолог",
    percent: 45,
    active: true,
  },
];

const DEMO_SERVICES = [
  {
    id: 1,
    name: "Первичная консультация",
    category: "Консультации",
    price: 200000,
    active: true,
  },
  {
    id: 2,
    name: "УЗИ брюшной полости",
    category: "УЗИ",
    price: 300000,
    active: true,
  },
  {
    id: 3,
    name: "Контрольный приём",
    category: "Консультации",
    price: 150000,
    active: true,
  },
];

let currentEditApptId = null;
let currentDoctorId = null;
let currentServiceId = null;
let currentPatientKey = null;

// ===== ПОМОЩНИКИ =====
function applyBrandTheme() {
  document.documentElement.style.setProperty("--accent", BRAND_THEME.accent);
  document.documentElement.style.setProperty("--accent-2", BRAND_THEME.accent2);
}
applyBrandTheme();

function formatDateISO(date) {
  // ЛОКАЛЬНАЯ дата YYYY-MM-DD (без UTC-сдвига)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const plus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/[^\d]/g, "");
  return plus + digits;
}

function normalizeName(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

function moneyUZS(n) {
  const val = Math.max(0, toNumber(n, 0));
  return `${val.toLocaleString("ru-RU")} UZS`;
}

function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getArchivedPatientsSet() {
  const arr = loadJSON(STORAGE_PATIENTS_ARCHIVE, []);
  return new Set(Array.isArray(arr) ? arr : []);
}

function saveArchivedPatientsSet(set) {
  saveJSON(STORAGE_PATIENTS_ARCHIVE, Array.from(set.values()));
}

function archivePatientKey(patientKey) {
  const set = getArchivedPatientsSet();
  set.add(patientKey);
  saveArchivedPatientsSet(set);
}

function restorePatientKey(patientKey) {
  const set = getArchivedPatientsSet();
  set.delete(patientKey);
  saveArchivedPatientsSet(set);
}

function isArchivedPatient(patientKey) {
  return getArchivedPatientsSet().has(patientKey);
}

function getDoctors() {
  let stored = loadJSON(STORAGE_DOCTORS, null);
  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    stored = DEMO_DOCTORS.map((d) => ({
      ...d,
      createdAt: new Date().toISOString(),
    }));
    saveJSON(STORAGE_DOCTORS, stored);
  }
  return stored;
}
function setDoctors(list) {
  saveJSON(STORAGE_DOCTORS, list);
}

function getServices() {
  let stored = loadJSON(STORAGE_SERVICES, null);
  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    stored = DEMO_SERVICES.map((s) => ({
      ...s,
      createdAt: new Date().toISOString(),
    }));
    saveJSON(STORAGE_SERVICES, stored);
  }
  return stored;
}
function setServices(list) {
  saveJSON(STORAGE_SERVICES, list);
}

function getAppointments() {
  return loadJSON(STORAGE_APPTS, []);
}
function setAppointments(list) {
  saveJSON(STORAGE_APPTS, list);
}

// “выручка” единым правилом
function isRevenueAppt(a) {
  return a.statusVisit === "done" && a.statusPayment !== "unpaid";
}

function visitLabel(status) {
  if (status === "done") return "Пришёл";
  if (status === "no_show") return "Не пришёл";
  return "Запланирован";
}
function paymentLabel(status) {
  if (status === "paid") return "Оплачено";
  if (status === "partial") return "Частично";
  return "Не оплачено";
}

function nextVisitStatus(s) {
  return s === "scheduled" ? "done" : s === "done" ? "no_show" : "scheduled";
}
function nextPaymentStatus(s) {
  return s === "unpaid" ? "partial" : s === "partial" ? "paid" : "unpaid";
}

function hasSlotConflict(all, { date, time, doctorId }, excludeId = null) {
  return all.some(
    (a) =>
      a.date === date &&
      a.time === time &&
      a.doctorId === doctorId &&
      (excludeId == null || a.id !== excludeId)
  );
}

// ===== TOAST =====
const toastContainer = document.getElementById("toastContainer");
function showToast(message, type = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-dot"></div><div>${message}</div>`;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--visible"));

  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

// ===== DOM-ЭЛЕМЕНТЫ =====
const loginScreen = document.getElementById("loginScreen");
const mainScreen = document.getElementById("mainScreen");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const todayDateEl = document.getElementById("todayDate");

const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

// Dashboard
const dashDoctorFilter = document.getElementById("dashDoctorFilter");
const dashboardTodayBody = document.getElementById("dashboardTodayBody");
const kpiTodayTotal = document.getElementById("kpiTodayTotal");
const kpiTodayDone = document.getElementById("kpiTodayDone");
const kpiTodayRevenue = document.getElementById("kpiTodayRevenue");

// дополнительные места (добавим в HTML, если их нет — просто пропустим)
const kpiHealthScore = document.getElementById("kpiHealthScore");
const kpiNoShowRate = document.getElementById("kpiNoShowRate");
const dashTimelineBody = document.getElementById("dashTimelineBody");
const dashDoctorLoadBody = document.getElementById("dashDoctorLoadBody");

// Записи
const apptForm = document.getElementById("appointmentForm");
const apptDateInput = document.getElementById("apptDate");
const apptTimeInput = document.getElementById("apptTime");
const apptDoctorSelect = document.getElementById("apptDoctor");
const apptPatientInput = document.getElementById("apptPatient");
const apptPhoneInput = document.getElementById("apptPhone");
const apptServiceSelect = document.getElementById("apptService");
const apptPriceInput = document.getElementById("apptPrice");
const apptStatusVisitSelect = document.getElementById("apptStatusVisit");
const apptStatusPaymentSelect = document.getElementById("apptStatusPayment");
const apptPaymentMethodSelect = document.getElementById("apptPaymentMethod");

const rangeFromInput = document.getElementById("rangeFrom");
const rangeToInput = document.getElementById("rangeTo");
const rangeDoctorSelect = document.getElementById("rangeDoctor");
const rangeSearchInput = document.getElementById("rangeSearch");
const exportRangeCsvBtn = document.getElementById("exportRangeCsv");
const allAppointmentsBody = document.getElementById("allAppointmentsBody");

// Врачи
const addDoctorBtn = document.getElementById("addDoctorBtn");
const doctorsTableBody = document.getElementById("doctorsTableBody");
const doctorModalBackdrop = document.getElementById("doctorModalBackdrop");
const doctorModalTitle = document.getElementById("doctorModalTitle");
const doctorForm = document.getElementById("doctorForm");
const doctorNameInput = document.getElementById("doctorName");
const doctorSpecialityInput = document.getElementById("doctorSpeciality");
const doctorPercentInput = document.getElementById("doctorPercent");
const doctorActiveSelect = document.getElementById("doctorActive");
const doctorCancelBtn = document.getElementById("doctorCancelBtn");

// Услуги
const addServiceBtn = document.getElementById("addServiceBtn");
const servicesTableBody = document.getElementById("servicesTableBody");
const serviceModalBackdrop = document.getElementById("serviceModalBackdrop");
const serviceModalTitle = document.getElementById("serviceModalTitle");
const serviceForm = document.getElementById("serviceForm");
const serviceNameInput = document.getElementById("serviceName");
const serviceCategoryInput = document.getElementById("serviceCategory");
const servicePriceInput = document.getElementById("servicePrice");
const serviceActiveSelect = document.getElementById("serviceActive");
const serviceCancelBtn = document.getElementById("serviceCancelBtn");

// Пациенты
const patientsSearchInput = document.getElementById("patientsSearch");
const patientsTableBody = document.getElementById("patientsTableBody");
const patientModalBackdrop = document.getElementById("patientModalBackdrop");
const patientModalTitle = document.getElementById("patientModalTitle");
const patientHistoryBody = document.getElementById("patientHistoryBody");
const patientModalClose = document.getElementById("patientModalClose");
const patientsArchiveMode = document.getElementById("patientsArchiveMode");

// Отчёты
const reportDateInput = document.getElementById("reportDate");
const reportDoctorTotals = document.getElementById("reportDoctorTotals");
const reportClinicTotal = document.getElementById("reportClinicTotal");
const reportMonthInput = document.getElementById("reportMonth");
const reportYearInput = document.getElementById("reportYear");
const reportMonthDoctorTotals = document.getElementById(
  "reportMonthDoctorTotals"
);
const reportMonthClinicTotal = document.getElementById(
  "reportMonthClinicTotal"
);
const reportYearDoctorTotals = document.getElementById(
  "reportYearDoctorTotals"
);
const reportYearClinicTotal = document.getElementById("reportYearClinicTotal");

// Модалка редактирования записи
const editApptModalBackdrop = document.getElementById("editApptModalBackdrop");
const editApptForm = document.getElementById("editApptForm");
const editApptDateInput = document.getElementById("editApptDate");
const editApptTimeInput = document.getElementById("editApptTime");
const editApptDoctorSelect = document.getElementById("editApptDoctor");
const editApptPatientInput = document.getElementById("editApptPatient");
const editApptPhoneInput = document.getElementById("editApptPhone");
const editApptServiceSelect = document.getElementById("editApptService");
const editApptPriceInput = document.getElementById("editApptPrice");
const editApptStatusVisitSelect = document.getElementById(
  "editApptStatusVisit"
);
const editApptStatusPaymentSelect = document.getElementById(
  "editApptStatusPayment"
);
const editApptPaymentMethodSelect = document.getElementById(
  "editApptPaymentMethod"
);
const editApptCancelBtn = document.getElementById("editApptCancelBtn");

// ===== ЛОГИН / ЛОГАУТ =====
function showLogin() {
  loginScreen?.classList.remove("hidden");
  mainScreen?.classList.add("hidden");
}
function showMain() {
  loginScreen?.classList.add("hidden");
  mainScreen?.classList.remove("hidden");
}
function checkAuthOnLoad() {
  const loggedIn = localStorage.getItem(LOGIN_KEY) === "1";
  if (loggedIn) {
    showMain();
    initAfterLoginOnce();
  } else {
    showLogin();
  }
}

function doLogin() {
  const u = (loginUsername?.value || "").trim();
  const p = loginPassword?.value || "";
  if (u === DEMO_USER.username && p === DEMO_USER.password) {
    localStorage.setItem(LOGIN_KEY, "1");
    if (loginError) loginError.textContent = "";
    showMain();
    showToast("Успешный вход в систему", "success");
    initAfterLoginOnce();
  } else {
    if (loginError) loginError.textContent = "Неверный логин или пароль";
    showToast("Неверный логин или пароль", "error");
  }
}

if (loginBtn) loginBtn.addEventListener("click", doLogin);
if (loginPassword) {
  loginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(LOGIN_KEY);
    showLogin();
    showToast("Вы вышли из CRM", "info");
  });
}

// ===== СЕЛЕКТЫ =====
function fillDoctorSelect(selectEl, doctors, includeAll = false) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  if (includeAll) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Все";
    selectEl.appendChild(opt);
  }
  doctors
    .filter((d) => d.active)
    .forEach((doc) => {
      const option = document.createElement("option");
      option.value = String(doc.id);
      option.textContent = doc.name;
      selectEl.appendChild(option);
    });

  if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) {
    selectEl.value = prev;
  }
}

function fillServiceSelect(selectEl, services, onlyActive = true) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = "";
  services
    .filter((s) => (onlyActive ? s.active : true))
    .forEach((srv) => {
      const option = document.createElement("option");
      option.value = String(srv.id);
      option.textContent = `${srv.name} (${srv.price.toLocaleString(
        "ru-RU"
      )} UZS)`;
      selectEl.appendChild(option);
    });

  if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) {
    selectEl.value = prev;
  }
}

function refreshSelectsOnly() {
  const doctors = getDoctors();
  const services = getServices();

  fillDoctorSelect(apptDoctorSelect, doctors);
  fillDoctorSelect(rangeDoctorSelect, doctors, true);
  fillDoctorSelect(dashDoctorFilter, doctors, true);
  fillDoctorSelect(editApptDoctorSelect, doctors);

  fillServiceSelect(apptServiceSelect, services);
  fillServiceSelect(editApptServiceSelect, services);
}

// ===== ИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЛОГИНА (ОДИН РАЗ) =====
let _afterLoginInitialized = false;
function initAfterLoginOnce() {
  if (_afterLoginInitialized) {
    refreshSelectsOnly();
    renderAll();
    return;
  }
  _afterLoginInitialized = true;

  const today = new Date();
  const todayISO = formatDateISO(today);

  if (todayDateEl) todayDateEl.textContent = today.toLocaleDateString("ru-RU");
  if (apptDateInput) apptDateInput.value = todayISO;
  if (rangeFromInput) rangeFromInput.value = todayISO;
  if (rangeToInput) rangeToInput.value = todayISO;
  if (reportDateInput) reportDateInput.value = todayISO;

  if (reportMonthInput) {
    reportMonthInput.value = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}`;
  }
  if (reportYearInput) reportYearInput.value = String(today.getFullYear());

  refreshSelectsOnly();

  const services = getServices().filter((s) => s.active);
  if (services.length && apptServiceSelect && apptPriceInput) {
    if (!apptServiceSelect.value)
      apptServiceSelect.value = String(services[0].id);
    const selected =
      services.find((s) => String(s.id) === String(apptServiceSelect.value)) ||
      services[0];
    apptPriceInput.value = selected.price;
  }

  renderAll();
}

function renderAll() {
  renderDashboard();
  renderAppointmentsTable();
  renderDoctors();
  renderServices();
  renderPatients();
  renderReportsDay();
  renderReportsMonthYear();
}

// ===== НАВИГАЦИЯ =====
if (navButtons && views) {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view) return;

      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      views.forEach((v) => v.classList.remove("view--active"));
      const viewEl = document.getElementById(`view-${view}`);
      if (viewEl) viewEl.classList.add("view--active");

      if (view === "dashboard") {
        pageTitle.textContent = "Дашборд";
        pageSubtitle.textContent =
          "Краткая сводка по клинике и быстрый доступ к основным действиям";
        renderDashboard();
      } else if (view === "appointments") {
        pageTitle.textContent = "Записи";
        pageSubtitle.textContent = "Создание и управление записями на приём";
        renderAppointmentsTable();
      } else if (view === "doctors") {
        pageTitle.textContent = "Врачи";
        pageSubtitle.textContent = "Справочник врачей и их процент";
        renderDoctors();
      } else if (view === "services") {
        pageTitle.textContent = "Услуги";
        pageSubtitle.textContent = "Справочник услуг и цен";
        renderServices();
      } else if (view === "patients") {
        pageTitle.textContent = "Пациенты";
        pageSubtitle.textContent =
          "История визитов, риск и выручка по каждому пациенту";
        renderPatients();
      } else if (view === "reports") {
        pageTitle.textContent = "Отчёты";
        pageSubtitle.textContent =
          "День, месяц и год: выручка по врачам и по клинике";
        renderReportsDay();
        renderReportsMonthYear();
      }
    });
  });
}

// ===== АВТОПОДСТАНОВКА ЦЕНЫ =====
function bindServicePrice(selectEl, priceEl) {
  if (!selectEl || !priceEl) return;
  selectEl.addEventListener("change", () => {
    const services = getServices();
    const id = Number(selectEl.value);
    const service = services.find((s) => s.id === id);
    if (service) priceEl.value = service.price;
  });
}
bindServicePrice(apptServiceSelect, apptPriceInput);
bindServicePrice(editApptServiceSelect, editApptPriceInput);

// ===== СОЗДАНИЕ ЗАПИСИ =====
if (apptForm) {
  apptForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const date = apptDateInput?.value;
    const time = apptTimeInput?.value;
    const doctorId = Number(apptDoctorSelect?.value || 0);
    const patientName = normalizeName(apptPatientInput?.value || "");
    const phone = normalizePhone(apptPhoneInput?.value || "");
    const serviceId = Number(apptServiceSelect?.value || 0);
    const price = toNumber(apptPriceInput?.value || 0);
    const statusVisit = apptStatusVisitSelect?.value || "scheduled";
    const statusPayment = apptStatusPaymentSelect?.value || "unpaid";
    const paymentMethod = apptPaymentMethodSelect?.value || "none";

    if (!date || !time || !doctorId || !patientName || !serviceId) {
      showToast("Заполните все обязательные поля", "error");
      return;
    }

    const allExisting = getAppointments();
    if (hasSlotConflict(allExisting, { date, time, doctorId })) {
      showToast("На это время у врача уже есть запись", "error");
      return;
    }

    const newAppt = {
      id: Date.now(),
      date,
      time,
      doctorId,
      patientName,
      phone,
      serviceId,
      price,
      statusVisit,
      statusPayment,
      paymentMethod,
      createdAt: new Date().toISOString(),
    };

    allExisting.push(newAppt);
    setAppointments(allExisting);

    if (apptTimeInput) apptTimeInput.value = "";
    if (apptPatientInput) apptPatientInput.value = "";
    if (apptPhoneInput) apptPhoneInput.value = "";

    showToast("Запись успешно добавлена", "success");
    renderAll();
  });
}

// ===== DASHBOARD PRO: score + no-show + timeline + doctor load =====
function getTodayAppointmentsFiltered() {
  const todayISO = formatDateISO(new Date());
  const doctorFilter = dashDoctorFilter?.value || "";
  const all = getAppointments();

  return all.filter((a) => {
    if (a.date !== todayISO) return false;
    if (doctorFilter && String(a.doctorId) !== doctorFilter) return false;
    return true;
  });
}

function setApptField(apptId, patch) {
  const all = getAppointments();
  const idx = all.findIndex((a) => a.id === apptId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], ...patch };
  setAppointments(all);
  return true;
}

function computeClinicHealthScore() {
  const all = getAppointments();
  if (!all.length) return { score: 100, noShowRate: 0 };

  const done = all.filter((a) => a.statusVisit === "done").length;
  const noShow = all.filter((a) => a.statusVisit === "no_show").length;
  const scheduled = all.filter((a) => a.statusVisit === "scheduled").length;

  const paidLike = all.filter((a) => a.statusPayment !== "unpaid").length;

  // no-show rate по завершённым/назначенным
  const denom = Math.max(1, done + noShow + scheduled);
  const noShowRate = noShow / denom;

  // базовые штрафы
  let score = 100;

  // штраф за no-show
  score -= Math.round(noShowRate * 55);

  // штраф за неоплаты
  const unpaidRate = 1 - paidLike / Math.max(1, all.length);
  score -= Math.round(unpaidRate * 25);

  // лёгкий бонус за дисциплину "done"
  const doneRate = done / Math.max(1, denom);
  score += Math.round(doneRate * 6);

  score = Math.max(0, Math.min(100, score));
  return { score, noShowRate };
}

function renderTimelineForToday(appts) {
  if (!dashTimelineBody) return;

  const map = new Map(); // "HH:MM" -> appointment
  appts.forEach((a) => map.set(a.time, a));

  const doctors = getDoctors();
  const services = getServices();

  const wrap = document.createElement("div");
  wrap.className = "timeline";

  for (let t = start; t <= end; t += step) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    const key = `${hh}:${mm}`;

    const row = document.createElement("div");
    row.className = "timeline-row";

    const a = map.get(key);

    if (!a) {
      row.innerHTML = `
        <div class="timeline-left">
          <div class="timeline-time">${key}</div>
          <div class="timeline-badge timeline-badge--free">Свободно</div>
        </div>
        <div class="timeline-right">
          <span class="mini-hint">—</span>
        </div>
      `;
    } else {
      const doctor = doctors.find((d) => d.id === a.doctorId);
      const service = services.find((s) => s.id === a.serviceId);
      row.innerHTML = `
        <div class="timeline-left">
          <div class="timeline-time">${key}</div>
          <div class="timeline-badge">${a.patientName} • ${
        doctor ? doctor.name : "-"
      }</div>
        </div>
        <div class="timeline-right">
          <button class="status-pill status-visit-${
            a.statusVisit
          }" type="button" data-role="visit">${visitLabel(
        a.statusVisit
      )}</button>
          <button class="status-pill status-pay-${
            a.statusPayment
          }" type="button" data-role="pay">${paymentLabel(
        a.statusPayment
      )}</button>
          <button class="table-action-btn" type="button" data-role="jump" title="Открыть в Записях">↗</button>
        </div>
      `;

      row
        .querySelector('[data-role="visit"]')
        ?.addEventListener("click", () => {
          setApptField(a.id, { statusVisit: nextVisitStatus(a.statusVisit) });
          showToast("Статус визита изменён", "info");
          renderAll();
        });

      row.querySelector('[data-role="pay"]')?.addEventListener("click", () => {
        setApptField(a.id, {
          statusPayment: nextPaymentStatus(a.statusPayment),
        });
        showToast("Статус оплаты изменён", "info");
        renderAll();
      });

      row.querySelector('[data-role="jump"]')?.addEventListener("click", () => {
        // перейти в Записи, проставить диапазон на сегодня, поставить поиск по пациенту
        navButtons.forEach((b) => b.classList.remove("active"));
        document
          .querySelector('.nav-btn[data-view="appointments"]')
          ?.classList.add("active");

        views.forEach((v) => v.classList.remove("view--active"));
        document
          .getElementById("view-appointments")
          ?.classList.add("view--active");

        pageTitle.textContent = "Записи";
        pageSubtitle.textContent = "Создание и управление записями на приём";

        const todayISO = formatDateISO(new Date());
        if (rangeFromInput) rangeFromInput.value = todayISO;
        if (rangeToInput) rangeToInput.value = todayISO;
        if (rangeSearchInput) rangeSearchInput.value = a.patientName;

        renderAppointmentsTable();

        // подсветить: просто тост
        showToast("Открыто в «Записях» (фильтры обновлены)", "success");
      });
    }

    wrap.appendChild(row);
  }

  dashTimelineBody.innerHTML = "";
  dashTimelineBody.appendChild(wrap);
}

function getRangeFilteredAppointments() {
  const from = rangeFromInput?.value || "";
  const to = rangeToInput?.value || "";
  const doctorFilter = rangeDoctorSelect?.value || "";
  const searchQuery = safeLower(rangeSearchInput?.value).trim();
  const all = getAppointments();

  return all.filter((a) => {
    if (from && a.date < from) return false;
    if (to && a.date > to) return false;
    if (doctorFilter && String(a.doctorId) !== doctorFilter) return false;
    if (searchQuery) {
      const text = safeLower(`${a.patientName} ${a.phone || ""}`);
      if (!text.includes(searchQuery)) return false;
    }
    return true;
  });
}

function renderDoctorLoadForRange() {
  if (!dashDoctorLoadBody) return;

  const doctors = getDoctors().filter((d) => d.active);
  const rangeAppts = getRangeFilteredAppointments();

  // считаем загрузку по доктору (кол-во записей)
  const totals = new Map();
  doctors.forEach((d) => totals.set(d.id, 0));
  rangeAppts.forEach((a) => {
    totals.set(a.doctorId, (totals.get(a.doctorId) || 0) + 1);
  });

  const max = Math.max(1, ...Array.from(totals.values()));

  const grid = document.createElement("div");
  grid.className = "doctor-load-grid";

  doctors.forEach((d) => {
    const count = totals.get(d.id) || 0;
    const pct = Math.round((count / max) * 100);

    const card = document.createElement("div");
    card.className = "doctor-load-card";
    card.innerHTML = `
      <div class="doctor-load-title">
        <h3>${d.name}</h3>
        <span>${count} запис.</span>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="load-note">
        ${
          pct >= 85
            ? "Высокая загрузка — подумайте о перераспределении."
            : pct >= 45
            ? "Нормальная загрузка."
            : "Низкая загрузка — можно добавить слоты/маркетинг."
        }
      </div>
    `;
    grid.appendChild(card);
  });

  dashDoctorLoadBody.innerHTML = "";
  dashDoctorLoadBody.appendChild(grid);
}

function renderDashboard() {
  const doctors = getDoctors();
  const services = getServices();
  const todayAppts = getTodayAppointmentsFiltered();

  // KPI базовые
  const total = todayAppts.length;
  const done = todayAppts.filter((a) => a.statusVisit === "done").length;
  const revenue = todayAppts
    .filter(isRevenueAppt)
    .reduce((acc, a) => acc + (a.price || 0), 0);

  if (kpiTodayTotal) kpiTodayTotal.textContent = String(total);
  if (kpiTodayDone) kpiTodayDone.textContent = String(done);
  if (kpiTodayRevenue) kpiTodayRevenue.textContent = moneyUZS(revenue);

  // KPI PRO (если есть элементы в HTML)
  const { score, noShowRate } = computeClinicHealthScore();
  if (kpiHealthScore) kpiHealthScore.textContent = `${score}/100`;
  if (kpiNoShowRate)
    kpiNoShowRate.textContent = `${Math.round(noShowRate * 100)}%`;

  // Таблица сегодня
  if (dashboardTodayBody) {
    dashboardTodayBody.innerHTML = "";

    todayAppts
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((a) => {
        const tr = document.createElement("tr");
        const doctor = doctors.find((d) => d.id === a.doctorId);
        const service = services.find((s) => s.id === a.serviceId);

        tr.innerHTML = `
          <td>${a.time}</td>
          <td>${doctor ? doctor.name : "-"}</td>
          <td>${a.patientName}</td>
          <td>${a.phone || ""}</td>
          <td>${service ? service.name : ""}</td>
          <td class="col-amount">${moneyUZS(a.price || 0)}</td>
          <td>
            <button class="status-pill status-visit-${
              a.statusVisit
            }" data-role="visit" type="button" title="Нажмите, чтобы сменить статус">
              ${visitLabel(a.statusVisit)}
            </button>
          </td>
          <td>
            <button class="status-pill status-pay-${
              a.statusPayment
            }" data-role="pay" type="button" title="Нажмите, чтобы сменить оплату">
              ${paymentLabel(a.statusPayment)}
            </button>
          </td>
        `;

        tr.querySelector('[data-role="visit"]')?.addEventListener(
          "click",
          () => {
            setApptField(a.id, { statusVisit: nextVisitStatus(a.statusVisit) });
            showToast("Статус визита изменён", "info");
            renderAll();
          }
        );

        tr.querySelector('[data-role="pay"]')?.addEventListener("click", () => {
          setApptField(a.id, {
            statusPayment: nextPaymentStatus(a.statusPayment),
          });
          showToast("Статус оплаты изменён", "info");
          renderAll();
        });

        dashboardTodayBody.appendChild(tr);
      });
  }

  // PRO: таймлайн дня (если блок существует)


  // PRO: загрузка врачей по диапазону из “Записей”
  renderDoctorLoadForRange();
}

if (dashDoctorFilter)
  dashDoctorFilter.addEventListener("change", renderDashboard);

// ===== ВСЕ ЗАПИСИ (ТАБЛИЦА) =====
function renderAppointmentsTable() {
  if (!allAppointmentsBody) return;

  const doctors = getDoctors();
  const services = getServices();
  const filtered = getRangeFilteredAppointments();

  allAppointmentsBody.innerHTML = "";
  filtered
    .slice()
    .sort((a, b) =>
      a.date === b.date
        ? a.time.localeCompare(b.time)
        : a.date.localeCompare(b.date)
    )
    .forEach((a) => {
      const doctor = doctors.find((d) => d.id === a.doctorId);
      const service = services.find((s) => s.id === a.serviceId);
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${a.date}</td>
        <td>${a.time}</td>
        <td>${doctor ? doctor.name : "-"}</td>
        <td>${a.patientName}</td>
        <td>${a.phone || ""}</td>
        <td>${service ? service.name : ""}</td>
        <td class="col-amount">${moneyUZS(a.price || 0)}</td>
        <td>
          <button class="status-pill status-visit-${
            a.statusVisit
          }" data-role="visit" type="button" title="Нажмите, чтобы сменить статус">
            ${visitLabel(a.statusVisit)}
          </button>
        </td>
        <td>
          <button class="status-pill status-pay-${
            a.statusPayment
          }" data-role="pay" type="button" title="Нажмите, чтобы сменить оплату">
            ${paymentLabel(a.statusPayment)}
          </button>
        </td>
        <td class="col-actions">
          <button class="table-action-btn" data-action="edit" type="button" title="Редактировать">✏️</button>
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить">🗑</button>
        </td>
      `;

      tr.querySelector('[data-action="edit"]')?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          openEditApptModal(a.id);
        }
      );

      tr.querySelector('[data-action="delete"]')?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          deleteAppointment(a.id);
        }
      );

      tr.querySelector('[data-role="visit"]')?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          setApptField(a.id, { statusVisit: nextVisitStatus(a.statusVisit) });
          showToast("Статус визита изменён", "info");
          renderAll();
        }
      );

      tr.querySelector('[data-role="pay"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        setApptField(a.id, {
          statusPayment: nextPaymentStatus(a.statusPayment),
        });
        showToast("Статус оплаты изменён", "info");
        renderAll();
      });

      allAppointmentsBody.appendChild(tr);
    });

  // обновим doctor load на дашборде, если он активен
  renderDoctorLoadForRange();
}

if (rangeFromInput)
  rangeFromInput.addEventListener("change", renderAppointmentsTable);
if (rangeToInput)
  rangeToInput.addEventListener("change", renderAppointmentsTable);
if (rangeDoctorSelect)
  rangeDoctorSelect.addEventListener("change", renderAppointmentsTable);
if (rangeSearchInput)
  rangeSearchInput.addEventListener("input", renderAppointmentsTable);

// CSV экспорт
function exportRangeCsv() {
  const doctors = getDoctors();
  const services = getServices();
  const filtered = getRangeFilteredAppointments();

  if (!filtered.length) {
    showToast("Нет записей для выгрузки за выбранный период", "error");
    return;
  }

  const rows = [];
  rows.push([
    "Дата",
    "Время",
    "Врач",
    "Пациент",
    "Телефон",
    "Услуга",
    "Сумма",
    "Визит",
    "Оплата",
    "Метод оплаты",
  ]);

  filtered
    .slice()
    .sort((a, b) =>
      a.date === b.date
        ? a.time.localeCompare(b.time)
        : a.date.localeCompare(b.date)
    )
    .forEach((a) => {
      const doctor = doctors.find((d) => d.id === a.doctorId);
      const service = services.find((s) => s.id === a.serviceId);
      rows.push([
        a.date,
        a.time,
        doctor ? doctor.name : "",
        a.patientName,
        a.phone || "",
        service ? service.name : "",
        a.price || 0,
        visitLabel(a.statusVisit),
        paymentLabel(a.statusPayment),
        a.paymentMethod,
      ]);
    });

  const from = rangeFromInput?.value || "from";
  const to = rangeToInput?.value || "to";

  const csvContent =
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const val = cell == null ? "" : String(cell);
            if (val.includes(";") || val.includes('"') || val.includes("\n"))
              return `"${val.replace(/"/g, '""')}"`;
            return val;
          })
          .join(";")
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kamilovs_clinic_range_${from}_to_${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("CSV-файл выгружен", "success");
}
if (exportRangeCsvBtn)
  exportRangeCsvBtn.addEventListener("click", exportRangeCsv);

// ===== РЕДАКТИРОВАНИЕ ЗАПИСИ =====
function openEditApptModal(id) {
  const all = getAppointments();
  const appt = all.find((a) => a.id === id);
  if (!appt) return;

  currentEditApptId = id;
  refreshSelectsOnly();

  editApptDateInput.value = appt.date;
  editApptTimeInput.value = appt.time;
  editApptDoctorSelect.value = String(appt.doctorId);
  editApptPatientInput.value = appt.patientName;
  editApptPhoneInput.value = appt.phone || "";
  editApptServiceSelect.value = String(appt.serviceId);
  editApptPriceInput.value = appt.price || 0;
  editApptStatusVisitSelect.value = appt.statusVisit || "scheduled";
  editApptStatusPaymentSelect.value = appt.statusPayment || "unpaid";
  editApptPaymentMethodSelect.value = appt.paymentMethod || "none";

  editApptModalBackdrop.classList.remove("hidden");
}

function closeEditApptModal() {
  currentEditApptId = null;
  editApptModalBackdrop.classList.add("hidden");
}

function deleteAppointment(id) {
  if (!confirm("Удалить эту запись?")) return;

  const all = getAppointments();
  setAppointments(all.filter((a) => a.id !== id));

  showToast("Запись удалена", "info");
  if (currentEditApptId === id) closeEditApptModal();
  renderAll();
}

if (editApptForm) {
  editApptForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentEditApptId) return;

    const all = getAppointments();
    const idx = all.findIndex((a) => a.id === currentEditApptId);
    if (idx === -1) return;

    const updated = { ...all[idx] };

    updated.date = editApptDateInput.value;
    updated.time = editApptTimeInput.value;
    updated.doctorId = Number(editApptDoctorSelect.value);
    updated.patientName = normalizeName(editApptPatientInput.value);
    updated.phone = normalizePhone(editApptPhoneInput.value);
    updated.serviceId = Number(editApptServiceSelect.value);
    updated.price = toNumber(editApptPriceInput.value || 0);
    updated.statusVisit = editApptStatusVisitSelect.value;
    updated.statusPayment = editApptStatusPaymentSelect.value;
    updated.paymentMethod = editApptPaymentMethodSelect.value;

    if (
      !updated.date ||
      !updated.time ||
      !updated.doctorId ||
      !updated.patientName ||
      !updated.serviceId
    ) {
      showToast("Заполните все обязательные поля", "error");
      return;
    }

    if (
      hasSlotConflict(
        all,
        { date: updated.date, time: updated.time, doctorId: updated.doctorId },
        currentEditApptId
      )
    ) {
      showToast("Конфликт: у врача уже есть запись на это время", "error");
      return;
    }

    all[idx] = updated;
    setAppointments(all);

    showToast("Запись обновлена", "success");
    closeEditApptModal();
    renderAll();
  });
}

if (editApptCancelBtn)
  editApptCancelBtn.addEventListener("click", closeEditApptModal);
if (editApptModalBackdrop) {
  editApptModalBackdrop.addEventListener("click", (e) => {
    if (e.target === editApptModalBackdrop) closeEditApptModal();
  });
}

// ===== ВРАЧИ (CRUD) =====
function renderDoctors() {
  if (!doctorsTableBody) return;
  const doctors = getDoctors();

  doctorsTableBody.innerHTML = "";
  doctors
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.name}</td>
        <td>${d.speciality || "-"}</td>
        <td class="col-amount">${toNumber(d.percent, 0)}</td>
        <td>${d.active ? "Да" : "Нет"}</td>
        <td class="col-actions">
          <button class="table-action-btn" data-action="edit" type="button" title="Редактировать">✏️</button>
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить">🗑</button>
        </td>
      `;

      tr.querySelector('[data-action="edit"]')?.addEventListener("click", () =>
        openDoctorModal(d.id)
      );
      tr.querySelector('[data-action="delete"]')?.addEventListener(
        "click",
        () => deleteDoctor(d.id)
      );

      doctorsTableBody.appendChild(tr);
    });
}

function openDoctorModal(id = null) {
  const doctors = getDoctors();
  currentDoctorId = id;

  if (id) {
    const doc = doctors.find((d) => d.id === id);
    if (!doc) return;

    doctorModalTitle.textContent = "Редактирование врача";
    doctorNameInput.value = doc.name;
    doctorSpecialityInput.value = doc.speciality || "";
    doctorPercentInput.value = doc.percent || 0;
    doctorActiveSelect.value = doc.active ? "true" : "false";
  } else {
    doctorModalTitle.textContent = "Новый врач";
    doctorNameInput.value = "";
    doctorSpecialityInput.value = "";
    doctorPercentInput.value = 40;
    doctorActiveSelect.value = "true";
  }

  doctorModalBackdrop.classList.remove("hidden");
}

function closeDoctorModal() {
  currentDoctorId = null;
  doctorModalBackdrop.classList.add("hidden");
}

function deleteDoctor(id) {
  if (
    !confirm("Удалить этого врача? Записи останутся, но без привязки к врачу.")
  )
    return;

  setDoctors(getDoctors().filter((d) => d.id !== id));
  refreshSelectsOnly();
  renderAll();
  showToast("Врач удалён", "info");
}

if (addDoctorBtn)
  addDoctorBtn.addEventListener("click", () => openDoctorModal(null));
if (doctorCancelBtn)
  doctorCancelBtn.addEventListener("click", closeDoctorModal);
if (doctorModalBackdrop) {
  doctorModalBackdrop.addEventListener("click", (e) => {
    if (e.target === doctorModalBackdrop) closeDoctorModal();
  });
}

if (doctorForm) {
  doctorForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = normalizeName(doctorNameInput.value);
    const speciality = normalizeName(doctorSpecialityInput.value);
    const percent = Math.min(
      100,
      Math.max(0, toNumber(doctorPercentInput.value || 0))
    );
    const active = doctorActiveSelect.value === "true";

    if (!name) {
      showToast("Имя врача обязательно", "error");
      return;
    }

    const doctors = getDoctors();

    if (currentDoctorId) {
      const idx = doctors.findIndex((d) => d.id === currentDoctorId);
      if (idx !== -1)
        doctors[idx] = { ...doctors[idx], name, speciality, percent, active };
      showToast("Врач обновлён", "success");
    } else {
      doctors.push({
        id: Date.now(),
        name,
        speciality,
        percent,
        active,
        createdAt: new Date().toISOString(),
      });
      showToast("Врач добавлен", "success");
    }

    setDoctors(doctors);
    refreshSelectsOnly();
    renderAll();
    closeDoctorModal();
  });
}

// ===== УСЛУГИ (CRUD) =====
function renderServices() {
  if (!servicesTableBody) return;
  const services = getServices();

  servicesTableBody.innerHTML = "";
  services
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${s.category || "-"}</td>
        <td class="col-amount">${moneyUZS(s.price || 0)}</td>
        <td>${s.active ? "Да" : "Нет"}</td>
        <td class="col-actions">
          <button class="table-action-btn" data-action="edit" type="button" title="Редактировать">✏️</button>
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить">🗑</button>
        </td>
      `;

      tr.querySelector('[data-action="edit"]')?.addEventListener("click", () =>
        openServiceModal(s.id)
      );
      tr.querySelector('[data-action="delete"]')?.addEventListener(
        "click",
        () => deleteService(s.id)
      );

      servicesTableBody.appendChild(tr);
    });
}

function openServiceModal(id = null) {
  const services = getServices();
  currentServiceId = id;

  if (id) {
    const srv = services.find((s) => s.id === id);
    if (!srv) return;

    serviceModalTitle.textContent = "Редактирование услуги";
    serviceNameInput.value = srv.name;
    serviceCategoryInput.value = srv.category || "";
    servicePriceInput.value = srv.price || 0;
    serviceActiveSelect.value = srv.active ? "true" : "false";
  } else {
    serviceModalTitle.textContent = "Новая услуга";
    serviceNameInput.value = "";
    serviceCategoryInput.value = "";
    servicePriceInput.value = 0;
    serviceActiveSelect.value = "true";
  }

  serviceModalBackdrop.classList.remove("hidden");
}

function closeServiceModal() {
  currentServiceId = null;
  serviceModalBackdrop.classList.add("hidden");
}

function deleteService(id) {
  if (
    !confirm(
      "Удалить эту услугу? Записи останутся, но будут без привязанной услуги."
    )
  )
    return;

  setServices(getServices().filter((s) => s.id !== id));
  refreshSelectsOnly();
  renderAll();
  showToast("Услуга удалена", "info");
}

if (addServiceBtn)
  addServiceBtn.addEventListener("click", () => openServiceModal(null));
if (serviceCancelBtn)
  serviceCancelBtn.addEventListener("click", closeServiceModal);
if (serviceModalBackdrop) {
  serviceModalBackdrop.addEventListener("click", (e) => {
    if (e.target === serviceModalBackdrop) closeServiceModal();
  });
}

if (serviceForm) {
  serviceForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = normalizeName(serviceNameInput.value);
    const category = normalizeName(serviceCategoryInput.value);
    const price = Math.max(0, toNumber(servicePriceInput.value || 0));
    const active = serviceActiveSelect.value === "true";

    if (!name) {
      showToast("Название услуги обязательно", "error");
      return;
    }

    const services = getServices();

    if (currentServiceId) {
      const idx = services.findIndex((s) => s.id === currentServiceId);
      if (idx !== -1)
        services[idx] = { ...services[idx], name, category, price, active };
      showToast("Услуга обновлена", "success");
    } else {
      services.push({
        id: Date.now(),
        name,
        category,
        price,
        active,
        createdAt: new Date().toISOString(),
      });
      showToast("Услуга добавлена", "success");
    }

    setServices(services);
    refreshSelectsOnly();
    renderAll();
    closeServiceModal();
  });
}

// ===== ПАЦИЕНТЫ: summary + risk + archive/delete =====
function patientKeyFromAppt(a) {
  const name = normalizeName(a.patientName || "");
  const phone = normalizePhone(a.phone || "");
  return `${safeLower(name)}|${phone}`;
}

function computePatientRisk(patientAppts) {
  // риск по no_show и неоплатам + давность
  const total = patientAppts.length;
  if (!total) return { level: "low", label: "Low", score: 0 };

  const noShow = patientAppts.filter((a) => a.statusVisit === "no_show").length;
  const unpaid = patientAppts.filter(
    (a) => a.statusPayment === "unpaid"
  ).length;

  const noShowRate = noShow / Math.max(1, total);
  const unpaidRate = unpaid / Math.max(1, total);

  let score = 0;
  score += noShowRate * 70;
  score += unpaidRate * 30;

  // последняя дата (чем свежее — тем точнее риск)
  const last = patientAppts
    .slice()
    .sort((a, b) =>
      a.date === b.date
        ? a.time.localeCompare(b.time)
        : a.date.localeCompare(b.date)
    )
    .pop();
  if (last) {
    const days = Math.floor(
      (new Date(formatDateISO(new Date())).getTime() -
        new Date(last.date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (days > 120) score *= 0.7;
  }

  score = Math.max(0, Math.min(100, score));

  if (score >= 55)
    return { level: "high", label: "High", score: Math.round(score) };
  if (score >= 25)
    return { level: "med", label: "Med", score: Math.round(score) };
  return { level: "low", label: "Low", score: Math.round(score) };
}

function buildPatientsSummary() {
  const appts = getAppointments();
  const archived = getArchivedPatientsSet();
  const map = new Map();

  appts.forEach((a) => {
    const name = normalizeName(a.patientName || "");
    const phone = normalizePhone(a.phone || "");
    const key = `${safeLower(name)}|${phone}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name,
        phone,
        visitsDone: 0,
        revenue: 0,
        archived: archived.has(key),
        risk: { level: "low", label: "Low", score: 0 },
      });
    }
    const item = map.get(key);
    if (a.statusVisit === "done") item.visitsDone += 1;
    if (isRevenueAppt(a)) item.revenue += a.price || 0;
  });

  // дополним риски
  const all = getAppointments();
  for (const p of map.values()) {
    const patientAppts = all.filter((a) => patientKeyFromAppt(a) === p.key);
    p.risk = computePatientRisk(patientAppts);
  }

  return Array.from(map.values());
}

function renderPatients() {
  if (!patientsTableBody) return;

  const searchQuery = safeLower(patientsSearchInput?.value).trim();
  const mode = patientsArchiveMode?.value || "active"; // active | all | archived
  const list = buildPatientsSummary();

  const filtered = list.filter((p) => {
    if (mode === "active" && p.archived) return false;
    if (mode === "archived" && !p.archived) return false;

    if (!searchQuery) return true;
    const text = safeLower(`${p.name} ${p.phone}`);
    return text.includes(searchQuery);
  });

  patientsTableBody.innerHTML = "";
  filtered
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .forEach((p) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${p.name || "-"}</td>
        <td>${p.phone || "-"}</td>
        <td>${p.visitsDone}</td>
        <td class="col-amount">${moneyUZS(p.revenue)}</td>
        <td class="col-actions">
          <span class="risk-pill risk-${p.risk.level}" title="Риск: ${
        p.risk.score
      }/100">
            Risk: ${p.risk.label}
          </span>
          ${
            p.archived
              ? `<button class="table-action-btn" data-action="restore" type="button" title="Восстановить">↩️</button>`
              : `<button class="table-action-btn" data-action="archive" type="button" title="Архивировать">🗄</button>`
          }
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить навсегда">🗑</button>
        </td>
      `;

      tr.addEventListener("click", () => openPatientModal(p.key));

      tr.querySelector('[data-action="archive"]')?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          archivePatientByKey(p.key);
        }
      );

      tr.querySelector('[data-action="restore"]')?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          restorePatientByKey(p.key);
        }
      );

      tr.querySelector('[data-action="delete"]')?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          deletePatientByKey(p.key);
        }
      );

      patientsTableBody.appendChild(tr);
    });
}

function deletePatientByKey(patientKey) {
  const list = buildPatientsSummary();
  const target = list.find((x) => x.key === patientKey);

  const label = target
    ? `${target.name}${target.phone ? " — " + target.phone : ""}`
    : "этого пациента";

  if (!confirm(`Удалить пациента: ${label}?\nБудут удалены все его записи.`))
    return;

  const before = getAppointments();
  const after = before.filter((a) => patientKeyFromAppt(a) !== patientKey);
  setAppointments(after);

  // убрать из архива тоже
  restorePatientKey(patientKey);

  if (currentPatientKey === patientKey) closePatientModal();

  showToast("Пациент и все его записи удалены", "info");
  renderAll();
}

function archivePatientByKey(patientKey) {
  const list = buildPatientsSummary();
  const target = list.find((x) => x.key === patientKey);

  const label = target
    ? `${target.name}${target.phone ? " — " + target.phone : ""}`
    : "этого пациента";

  if (
    !confirm(
      `Архивировать пациента: ${label}?\nЗаписи останутся, пациент будет скрыт из списка.`
    )
  )
    return;

  archivePatientKey(patientKey);

  if (currentPatientKey === patientKey) closePatientModal();

  showToast("Пациент отправлен в архив", "info");
  renderPatients();
}

function restorePatientByKey(patientKey) {
  restorePatientKey(patientKey);
  showToast("Пациент восстановлен из архива", "success");
  renderPatients();
}

function openPatientModal(patientKey) {
  currentPatientKey = patientKey;

  const list = buildPatientsSummary();
  const target = list.find((x) => x.key === patientKey);
  const title = target
    ? `${target.name}${target.phone ? " — " + target.phone : ""}`
    : "История пациента";
  if (patientModalTitle) patientModalTitle.textContent = title;

  const appts = getAppointments().filter(
    (a) => patientKeyFromAppt(a) === patientKey
  );

  appts.sort((a, b) =>
    a.date === b.date
      ? a.time.localeCompare(b.time)
      : a.date.localeCompare(b.date)
  );

  if (!patientHistoryBody) return;
  patientHistoryBody.innerHTML = "";
  if (appts.length === 0) {
    patientHistoryBody.textContent = "Записей не найдено.";
  } else {
    const doctors = getDoctors();
    const services = getServices();

    appts.forEach((a) => {
      const div = document.createElement("div");
      div.className = "patient-history-item";

      const doctor = doctors.find((d) => d.id === a.doctorId);
      const service = services.find((s) => s.id === a.serviceId);

      div.innerHTML = `
        <span><strong>${a.date}</strong> ${a.time}</span>
        <span>Врач: ${doctor ? doctor.name : "-"}</span>
        <span>Услуга: ${service ? service.name : ""}</span>
        <span>Сумма: ${moneyUZS(a.price || 0)}</span>
        <span>Визит: ${visitLabel(a.statusVisit)}</span>
        <span>Оплата: ${paymentLabel(a.statusPayment)}</span>
      `;
      patientHistoryBody.appendChild(div);
    });
  }

  patientModalBackdrop?.classList.remove("hidden");
}

function closePatientModal() {
  currentPatientKey = null;
  patientModalBackdrop?.classList.add("hidden");
}

if (patientsSearchInput)
  patientsSearchInput.addEventListener("input", renderPatients);
if (patientsArchiveMode)
  patientsArchiveMode.addEventListener("change", renderPatients);
if (patientModalClose)
  patientModalClose.addEventListener("click", closePatientModal);
if (patientModalBackdrop) {
  patientModalBackdrop.addEventListener("click", (e) => {
    if (e.target === patientModalBackdrop) closePatientModal();
  });
}

// ===== ОТЧЁТЫ: ДЕНЬ =====
function renderReportsDay() {
  if (!reportDateInput) return;

  const dateISO = reportDateInput.value;
  const all = getAppointments();
  const doctors = getDoctors();

  const forDay = all.filter((a) => a.date === dateISO && isRevenueAppt(a));

  const totals = new Map();
  forDay.forEach((a) =>
    totals.set(a.doctorId, (totals.get(a.doctorId) || 0) + (a.price || 0))
  );

  if (reportDoctorTotals) {
    reportDoctorTotals.innerHTML = "";
    if (!forDay.length) {
      const li = document.createElement("li");
      li.textContent = "Нет данных за выбранную дату";
      reportDoctorTotals.appendChild(li);
    } else {
      Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([doctorId, sum]) => {
          const doctor = doctors.find((d) => d.id === Number(doctorId));
          const li = document.createElement("li");
          li.textContent = `${doctor ? doctor.name : "Врач"} — ${moneyUZS(
            sum
          )}`;
          reportDoctorTotals.appendChild(li);
        });
    }
  }

  if (reportClinicTotal) {
    const clinicTotal = forDay.reduce((acc, a) => acc + (a.price || 0), 0);
    reportClinicTotal.textContent = moneyUZS(clinicTotal);
  }
}
if (reportDateInput)
  reportDateInput.addEventListener("change", renderReportsDay);

// ===== ОТЧЁТЫ: МЕСЯЦ И ГОД =====
function renderReportsMonthYear() {
  const all = getAppointments();
  const doctors = getDoctors();

  const monthValue = reportMonthInput?.value || "";
  const yearValue = reportYearInput?.value || "";

  const monthAppts = monthValue
    ? all.filter((a) => a.date.startsWith(monthValue) && isRevenueAppt(a))
    : [];
  const monthTotals = new Map();
  monthAppts.forEach((a) =>
    monthTotals.set(
      a.doctorId,
      (monthTotals.get(a.doctorId) || 0) + (a.price || 0)
    )
  );

  if (reportMonthDoctorTotals) {
    reportMonthDoctorTotals.innerHTML = "";
    if (!monthAppts.length) {
      const li = document.createElement("li");
      li.textContent = "Нет данных за выбранный месяц";
      reportMonthDoctorTotals.appendChild(li);
    } else {
      Array.from(monthTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([doctorId, sum]) => {
          const doctor = doctors.find((d) => d.id === Number(doctorId));
          const li = document.createElement("li");
          li.textContent = `${doctor ? doctor.name : "Врач"} — ${moneyUZS(
            sum
          )}`;
          reportMonthDoctorTotals.appendChild(li);
        });
    }
  }
  if (reportMonthClinicTotal) {
    const clinicTotal = monthAppts.reduce((acc, a) => acc + (a.price || 0), 0);
    reportMonthClinicTotal.textContent = moneyUZS(clinicTotal);
  }

  const yearAppts = yearValue
    ? all.filter(
        (a) => a.date.slice(0, 4) === String(yearValue) && isRevenueAppt(a)
      )
    : [];
  const yearTotals = new Map();
  yearAppts.forEach((a) =>
    yearTotals.set(
      a.doctorId,
      (yearTotals.get(a.doctorId) || 0) + (a.price || 0)
    )
  );

  if (reportYearDoctorTotals) {
    reportYearDoctorTotals.innerHTML = "";
    if (!yearAppts.length) {
      const li = document.createElement("li");
      li.textContent = "Нет данных за выбранный год";
      reportYearDoctorTotals.appendChild(li);
    } else {
      Array.from(yearTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([doctorId, sum]) => {
          const doctor = doctors.find((d) => d.id === Number(doctorId));
          const li = document.createElement("li");
          li.textContent = `${doctor ? doctor.name : "Врач"} — ${moneyUZS(
            sum
          )}`;
          reportYearDoctorTotals.appendChild(li);
        });
    }
  }
  if (reportYearClinicTotal) {
    const clinicTotal = yearAppts.reduce((acc, a) => acc + (a.price || 0), 0);
    reportYearClinicTotal.textContent = moneyUZS(clinicTotal);
  }
}
if (reportMonthInput)
  reportMonthInput.addEventListener("change", renderReportsMonthYear);
if (reportYearInput)
  reportYearInput.addEventListener("change", renderReportsMonthYear);

// ===== ESC закрывает модалки =====
function closeAnyModalOnEsc(e) {
  if (e.key !== "Escape") return;

  const modals = [
    { el: editApptModalBackdrop, close: closeEditApptModal },
    { el: doctorModalBackdrop, close: closeDoctorModal },
    { el: serviceModalBackdrop, close: closeServiceModal },
    { el: patientModalBackdrop, close: closePatientModal },
  ];

  for (const m of modals) {
    if (m.el && !m.el.classList.contains("hidden")) {
      m.close();
      break;
    }
  }
}
document.addEventListener("keydown", closeAnyModalOnEsc);

// ===== СТАРТ =====
document.addEventListener("DOMContentLoaded", checkAuthOnLoad);


