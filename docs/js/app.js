// ===============================
// Kamilovs Clinic CRM — app.js (Pro)
// ===============================

// ===== НАСТРОЙКИ / КОНСТАНТЫ =====
// localStorage оставляем только для настроек/сессии (не для данных)
const LOGIN_KEY = "crm_logged_in_v1";

// (опционально) токен авторизации, если подключишь login через API
const AUTH_TOKEN_KEY = "crm_auth_token_v1";

// ====== ARCHIVE (local fallback) ======
const STORAGE_PATIENTS_ARCHIVE = "crm_patients_archived_v1";

// White-label: акценты (можно менять — продавать “под клинику”)
const BRAND_THEME = {
  accent: "#22d3ee",
  accent2: "#6366f1",
};

// ====== API CONFIG (safe) ======
// В проде: база БЕЗ /api, пример: https://kamilovs-crm.onrender.com
// localStorage.setItem("crm_api_base","https://kamilovs-crm.onrender.com")

function normalizeApiBase(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  let out = s.replace(/\s+/g, "").replace(/\/+$/, "");

  // если кто-то вставил .../api — убираем /api (ниже мы сами добавляем /api/*)
  out = out.replace(/\/api$/i, "");

  // если кто-то вставил .../api/api — подчистим
  out = out.replace(/\/api\/api$/i, "");

  return out;
}

const DEFAULT_API_BASE = "https://kamilovs-crm.onrender.com";

const API_BASE = normalizeApiBase(
  (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
    localStorage.getItem("crm_api_base") ||
    DEFAULT_API_BASE
);

// ====== AUTH TOKEN HELPERS (на будущее, если будет API login) ======
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

// ===== ПОМОЩНИКИ (общие) =====
function applyBrandTheme() {
  document.documentElement.style.setProperty("--accent", BRAND_THEME.accent);
  document.documentElement.style.setProperty("--accent-2", BRAND_THEME.accent2);
}
applyBrandTheme();

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

// ====== API HELPERS (one entry point) ======
async function apiFetch(
  path,
  { method = "GET", body, headers = {}, timeoutMs = 12000 } = {}
) {
  if (!API_BASE) throw new Error("API_BASE не настроен");

  const p = String(path || "");
  const safePath = p.startsWith("/") ? p : `/${p}`;
  const url = `${API_BASE}${safePath}`;

  const token = getAuthToken();

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body != null ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();

    let data = null;
    if (text) {
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } else {
        // иногда сервер отдаёт текст/HTML — пробуем распарсить, иначе оставим строку
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
    }

    if (!res.ok) {
      const msg =
        (data && (data.detail || data.message || data.error || data.title)) ||
        (typeof data === "string" ? data : "") ||
        `API error ${res.status}`;
      throw new Error(msg);
    }

    return data;
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("Таймаут запроса к API");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// optional: health check (для bootstrap)
async function apiHealth() {
  try {
    const r = await apiFetch("/health", { timeoutMs: 7000 });
    // у тебя health возвращает: { ok:true, status:"server is alive", dbTime:"..." }
    if (!r) return false;
    if (r.ok === true) return true;
    if (typeof r.status === "string" && r.status.toLowerCase().includes("alive")) return true;
    return false;
  } catch {
    return false;
  }
}

// ===== DEMO (fallback) =====
const DEMO_USER = { username: "admin", password: "samandar014" };

const DEMO_DOCTORS = [
  { id: 1, name: "Д-р Ахмедов", speciality: "Терапевт", percent: 40, active: true },
  { id: 2, name: "Д-р Камилов", speciality: "УЗИ", percent: 35, active: true },
  { id: 3, name: "Д-р Саидова", speciality: "Кардиолог", percent: 45, active: true },
];

const DEMO_SERVICES = [
  { id: 1, name: "Первичная консультация", category: "Консультации", price: 200000, active: true },
  { id: 2, name: "УЗИ брюшной полости", category: "УЗИ", price: 300000, active: true },
  { id: 3, name: "Контрольный приём", category: "Консультации", price: 150000, active: true },
];

// ====== APP STATE ======
const state = {
  doctors: [],
  services: [],
  appointments: [],
  archivedPatients: new Set(),
  ready: false,
};

let currentEditApptId = null;
let currentDoctorId = null;
let currentServiceId = null;
let currentPatientKey = null;

// ====== НОРМАЛИЗАЦИЯ (чтобы фронт всегда работал с показать/сохранить) ======
function normalizeDoctor(d) {
  if (!d) return null;
  return {
    id: String(d.id ?? ""),
    name: d.name ?? d.full_name ?? "",
    speciality: d.speciality ?? d.specialty ?? "",
    percent: toNumber(d.percent, 0),
    active: d.active !== false,
  };
}

function normalizeService(s) {
  if (!s) return null;
  return {
    id: String(s.id ?? ""),
    name: s.name ?? "",
    category: s.category ?? "",
    price: toNumber(s.price, 0),
    active: s.active !== false,
  };
}

function normalizeAppointment(a) {
  if (!a) return null;
  return {
    id: String(a.id ?? ""),
    date: a.date ?? "",
    time: a.time ?? "",
    doctorId: String(a.doctorId ?? a.doctor_id ?? ""),
    serviceId: String(a.serviceId ?? a.service_id ?? ""),
    patientName: a.patientName ?? a.patient_name ?? "",
    phone: a.phone ?? "",
    price: toNumber(a.price, 0),
    statusVisit: a.statusVisit ?? a.status_visit ?? "scheduled",
    statusPayment: a.statusPayment ?? a.status_payment ?? "unpaid",
    paymentMethod: a.paymentMethod ?? a.payment_method ?? "none",
    note: a.note ?? "",
  };
}

// ====== API METHODS (ВАЖНО: /api/*) ======
const api = {
  // Doctors
  getDoctors: () => apiFetch("/api/doctors"),
  createDoctor: (payload) => apiFetch("/api/doctors", { method: "POST", body: payload }),
  updateDoctor: (id, payload) => apiFetch(`/api/doctors/${id}`, { method: "PUT", body: payload }),
  deleteDoctor: (id) => apiFetch(`/api/doctors/${id}`, { method: "DELETE" }),

  // Services
  getServices: () => apiFetch("/api/services"),
  createService: (payload) => apiFetch("/api/services", { method: "POST", body: payload }),
  updateService: (id, payload) => apiFetch(`/api/services/${id}`, { method: "PUT", body: payload }),
  deleteService: (id) => apiFetch(`/api/services/${id}`, { method: "DELETE" }),

  // Appointments
  getAppointments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/appointments${qs ? `?${qs}` : ""}`);
  },
  createAppointment: (payload) => apiFetch("/api/appointments", { method: "POST", body: payload }),
  updateAppointment: (id, payload) => apiFetch(`/api/appointments/${id}`, { method: "PUT", body: payload }),
  deleteAppointment: (id) => apiFetch(`/api/appointments/${id}`, { method: "DELETE" }),
};

// ====== ARCHIVE (сейчас local fallback, позже подключим API) ======
function loadArchivedPatientsSetLocal() {
  const raw = localStorage.getItem(STORAGE_PATIENTS_ARCHIVE);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveArchivedPatientsSetLocal(set) {
  localStorage.setItem(STORAGE_PATIENTS_ARCHIVE, JSON.stringify(Array.from(set.values())));
}
function archivePatientKey(patientKey) {
  state.archivedPatients.add(patientKey);
  saveArchivedPatientsSetLocal(state.archivedPatients);
}
function restorePatientKey(patientKey) {
  state.archivedPatients.delete(patientKey);
  saveArchivedPatientsSetLocal(state.archivedPatients);
}
function isArchivedPatient(patientKey) {
  return state.archivedPatients.has(patientKey);
}

// ====== DATA ACCESS (теперь через state, а не localStorage) ======
function getDoctors() {
  return state.doctors;
}
function setDoctors(list) {
  state.doctors = Array.isArray(list) ? list : [];
}

function getServices() {
  return state.services;
}
function setServices(list) {
  state.services = Array.isArray(list) ? list : [];
}

function getAppointments() {
  return state.appointments;
}
function setAppointments(list) {
  state.appointments = Array.isArray(list) ? list : [];
}

// ====== BUSINESS RULES ======
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
  return (Array.isArray(all) ? all : []).some(
    (a) =>
      a.date === date &&
      a.time === time &&
      String(a.doctorId) === String(doctorId) &&
      (excludeId == null || String(a.id) !== String(excludeId))
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
const reportMonthDoctorTotals = document.getElementById("reportMonthDoctorTotals");
const reportMonthClinicTotal = document.getElementById("reportMonthClinicTotal");
const reportYearDoctorTotals = document.getElementById("reportYearDoctorTotals");
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
const editApptStatusVisitSelect = document.getElementById("editApptStatusVisit");
const editApptStatusPaymentSelect = document.getElementById("editApptStatusPayment");
const editApptPaymentMethodSelect = document.getElementById("editApptPaymentMethod");
const editApptCancelBtn = document.getElementById("editApptCancelBtn");

// ===== АЛИАСЫ (чтобы нигде не было doctorSelect is not defined) =====
const doctorSelect = apptDoctorSelect;
const serviceSelect = apptServiceSelect;

// ===== ЛОГИН / ЛОГАУТ =====
function showLogin() {
  loginScreen?.classList.remove("hidden");
  mainScreen?.classList.add("hidden");
}
function showMain() {
  loginScreen?.classList.add("hidden");
  mainScreen?.classList.remove("hidden");
}

// ВАЖНО: initAfterLoginOnce() мы подключим в следующей части (bootstrap + загрузка данных)
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
  // пока DEMO login, позже легко поменяем на api.login()
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
    // localStorage.removeItem(AUTH_TOKEN_KEY);
    showLogin();
    showToast("Вы вышли из CRM", "info");
  });
}

// ===== СЕЛЕКТЫ =====
function fillDoctorSelect(selectEl, doctors, includeAll = false) {
  if (!selectEl) return;

  const prev = selectEl.value;
  selectEl.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = includeAll ? "Все" : "Выберите врача";
  selectEl.appendChild(ph);

  (Array.isArray(doctors) ? doctors : [])
    .filter((d) => d && d.active)
    .forEach((doc) => {
      const option = document.createElement("option");
      option.value = String(doc.id);
      option.textContent = doc.name || "Без имени";
      selectEl.appendChild(option);
    });

  if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) {
    selectEl.value = prev;
  } else {
    selectEl.value = "";
  }
}

function fillServiceSelect(selectEl, services, onlyActive = true) {
  if (!selectEl) return;

  const prev = selectEl.value;
  selectEl.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Выберите услугу";
  selectEl.appendChild(ph);

  (Array.isArray(services) ? services : [])
    .filter((s) => s && (onlyActive ? s.active : true))
    .forEach((srv) => {
      const option = document.createElement("option");
      option.value = String(srv.id);
      const price = toNumber(srv.price, 0);
      option.textContent = `${srv.name || "Без названия"} (${price.toLocaleString("ru-RU")} UZS)`;
      selectEl.appendChild(option);
    });

  if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) {
    selectEl.value = prev;
  } else {
    selectEl.value = "";
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

// ===== API BOOTSTRAP =====
async function bootstrapData() {
  state.archivedPatients = loadArchivedPatientsSetLocal();

  if (!API_BASE) {
    setDoctors([]);
    setServices([]);
    setAppointments([]);
    showToast("API_BASE не настроен. Укажи адрес сервера.", "error");
    return { mode: "no_api_base", ok: false };
  }

  const okHealth = await apiHealth();
  if (!okHealth) {
    setDoctors([]);
    setServices([]);
    setAppointments([]);
    showToast("Сервер недоступен (/health). Проверь Render.", "error");
    return { mode: "offline", ok: false };
  }

  try {
    const [doctorsRaw, servicesRaw, apptsRaw] = await Promise.all([
      api.getDoctors(),
      api.getServices(),
      api.getAppointments(),
    ]);

    const doctors = (Array.isArray(doctorsRaw) ? doctorsRaw : [])
      .map(normalizeDoctor)
      .filter(Boolean);

    const services = (Array.isArray(servicesRaw) ? servicesRaw : [])
      .map(normalizeService)
      .filter(Boolean);

    const appointments = (Array.isArray(apptsRaw) ? apptsRaw : [])
      .map(normalizeAppointment)
      .filter(Boolean);

    setDoctors(doctors);
    setServices(services);
    setAppointments(appointments);

    return { mode: "api", ok: true };
  } catch (e) {
    console.error(e);
    setDoctors([]);
    setServices([]);
    setAppointments([]);
    showToast(`Ошибка загрузки данных: ${e.message}`, "error");
    return { mode: "api_error", ok: false, error: e };
  }
}


// ===== ИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЛОГИНА (ОДИН РАЗ) =====
let _afterLoginInitialized = false;
let _bootstrapPromise = null;

function initAfterLoginOnce() {
  // повторные заходы — просто перерендер
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
    reportMonthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }
  if (reportYearInput) reportYearInput.value = String(today.getFullYear());

  // 1) быстрый UI (может быть пустым до загрузки)
  refreshSelectsOnly();
  renderAll();

  // 2) грузим реальные данные
  _bootstrapPromise = bootstrapData().then((result) => {
    state.ready = !!(result && result.ok);
    refreshSelectsOnly();

    // автоустановка цены только если услуга ещё не выбрана
    const services = getServices().filter((s) => s.active);
    if (services.length && apptServiceSelect && apptPriceInput) {
      if (!String(apptServiceSelect.value || "").trim()) {
        apptServiceSelect.value = String(services[0].id);
      }
      const selected =
        services.find((s) => String(s.id) === String(apptServiceSelect.value)) || services[0];
      apptPriceInput.value = selected.price;
    }

    renderAll();

    if (result?.ok) showToast("Данные загружены", "success");
    else showToast("Данные не загрузились (проверь сервер)", "error");
  });
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

// ===== АВТОПОДСТАНОВКА ЦЕНЫ (FIX: ids строковые) =====
function bindServicePrice(selectEl, priceEl) {
  if (!selectEl || !priceEl) return;
  selectEl.addEventListener("change", () => {
    const services = getServices();
    const id = String(selectEl.value || "");
    const service = services.find((s) => String(s.id) === id);
    if (service) priceEl.value = service.price;
  });
}
bindServicePrice(apptServiceSelect, apptPriceInput);
bindServicePrice(editApptServiceSelect, editApptPriceInput);

// ===== СОЗДАНИЕ ЗАПИСИ (API) =====
if (apptForm) {
  apptForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const date = (apptDateInput?.value || "").trim();
    const time = (apptTimeInput?.value || "").trim();
    const doctorId = String(doctorSelect?.value || "").trim(); // UUID строка
    const patientName = normalizeName(apptPatientInput?.value || "");
    const phone = normalizePhone(apptPhoneInput?.value || "");
    const serviceId = String(serviceSelect?.value || "").trim(); // обычно число строкой
    const price = toNumber(apptPriceInput?.value || 0);

    const statusVisit = apptStatusVisitSelect?.value || "scheduled";
    const statusPayment = apptStatusPaymentSelect?.value || "unpaid";
    const paymentMethod = apptPaymentMethodSelect?.value || "none";

    if (!date) return showToast("Выберите дату", "error");
    if (!time) return showToast("Выберите время", "error");
    if (!doctorId) return showToast("Выберите врача", "error");
    if (!patientName) return showToast("Введите пациента", "error");
    if (!serviceId) return showToast("Выберите услугу", "error");

    // локальная проверка конфликта (серверную позже тоже сделаем)
    const allExisting = getAppointments();
    if (hasSlotConflict(allExisting, { date, time, doctorId })) {
      showToast("На это время у врача уже есть запись", "error");
      return;
    }

    // backend принимает camelCase и snake_case — отправляем чистый camelCase
    const payloadApi = {
      date,
      time,
      doctorId,          // UUID строка
      serviceId,         // число строкой ок
      patientName,
      phone,
      price,
      statusVisit,
      statusPayment,
      paymentMethod,
    };

    try {
      let created = null;

      // только через API (DEMO fallback можно вернуть позже, но сейчас лучше “истина одна”)
      created = await api.createAppointment(payloadApi);

      // приводим ответ сервера к нашему локальному виду через normalizeAppointment()
      // normalizeAppointment() у тебя уже есть в первом “идеальном” куске
      const normalized = normalizeAppointment(created) || {
        id: String(created?.id ?? Date.now()),
        ...payloadApi,
      };

      setAppointments([...getAppointments(), normalized]);

      // очистка формы
      if (apptTimeInput) apptTimeInput.value = "";
      if (apptPatientInput) apptPatientInput.value = "";
      if (apptPhoneInput) apptPhoneInput.value = "";

      showToast("Запись успешно добавлена", "success");
      renderAll();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Ошибка создания записи", "error");
    }
  });
}

// ===== DASHBOARD PRO: score + no-show + timeline + doctor load =====
function getTodayAppointmentsFiltered() {
  const todayISO = formatDateISO(new Date());
  const doctorFilter = String(dashDoctorFilter?.value || "").trim();
  const all = getAppointments();

  return all.filter((a) => {
    if (a.date !== todayISO) return false;
    if (doctorFilter && String(a.doctorId) !== doctorFilter) return false;
    return true;
  });
}

// ✅ редактирование одного поля (key/value)
async function setApptField(apptId, key, value) {
  // 1) обновим локально для мгновенного UI
  const all = getAppointments();
  const i = all.findIndex((a) => String(a.id) === String(apptId));
  if (i === -1) return;

  all[i] = { ...all[i], [key]: value };
  setAppointments(all);
  renderAll();

  // 2) отправим PATCH/PUT на сервер (у нас PUT, но частичный апдейт ок)
  const patchMap = {
    date: "date",
    time: "time",
    doctorId: "doctorId",           // ✅ оставляем camelCase — backend поддерживает
    serviceId: "serviceId",
    patientName: "patientName",
    phone: "phone",
    price: "price",
    statusVisit: "statusVisit",
    statusPayment: "statusPayment",
    paymentMethod: "paymentMethod",
    note: "note",
  };

  const serverKey = patchMap[key];
  if (!serverKey) return;

  try {
    const patch = { [serverKey]: value };

    // ВАЖНО: UUID врача НЕ конвертируем в Number
    if (key === "serviceId") patch[serverKey] = String(value);
    if (key === "doctorId") patch[serverKey] = String(value);

    const saved = await api.updateAppointment(apptId, patch);

    // синхронизируем ответ сервера (и приводим к локальному виду)
    const j = getAppointments().findIndex((a) => String(a.id) === String(apptId));
    if (j !== -1 && saved && typeof saved === "object") {
      const merged = normalizeAppointment(saved) || getAppointments()[j];
      const arr = getAppointments();
      arr[j] = { ...arr[j], ...merged };
      setAppointments(arr);
      renderAll();
    }
  } catch (e) {
    console.error(e);
  }
}

// ✅ отдельная функция для PATCH-обновления (единый путь)
async function setApptPatch(apptId, patch) {
  const all = getAppointments();
  const idx = all.findIndex((a) => String(a.id) === String(apptId));
  if (idx === -1) return false;

  const updated = { ...all[idx], ...patch };

  try {
    // отправляем patch как есть (camelCase), backend примет
    const server = await api.updateAppointment(apptId, patch);

    all[idx] =
      server && typeof server === "object"
        ? (normalizeAppointment(server) || updated)
        : updated;

    setAppointments(all);
    return true;
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка обновления записи", "error");
    return false;
  }
}

function computeClinicHealthScore() {
  const all = getAppointments();
  if (!all.length) return { score: 100, noShowRate: 0 };

  const done = all.filter((a) => a.statusVisit === "done").length;
  const noShow = all.filter((a) => a.statusVisit === "no_show").length;
  const scheduled = all.filter((a) => a.statusVisit === "scheduled").length;

  const paidLike = all.filter((a) => a.statusPayment !== "unpaid").length;

  const denom = Math.max(1, done + noShow + scheduled);
  const noShowRate = noShow / denom;

  let score = 100;
  score -= Math.round(noShowRate * 55);

  const unpaidRate = 1 - paidLike / Math.max(1, all.length);
  score -= Math.round(unpaidRate * 25);

  const doneRate = done / Math.max(1, denom);
  score += Math.round(doneRate * 6);

  score = Math.max(0, Math.min(100, score));
  return { score, noShowRate };
}

// таймлайн: по умолчанию 08:00—20:00, шаг 30 минут
const TIMELINE_START_MIN = 8 * 60;
const TIMELINE_END_MIN = 20 * 60;
const TIMELINE_STEP_MIN = 30;

function renderTimelineForToday(appts) {
  if (!dashTimelineBody) return;

  const map = new Map(); // "HH:MM" -> appointment
  appts.forEach((a) => map.set(a.time, a));

  const doctors = getDoctors();
  const services = getServices();

  const wrap = document.createElement("div");
  wrap.className = "timeline";

  for (let t = TIMELINE_START_MIN; t <= TIMELINE_END_MIN; t += TIMELINE_STEP_MIN) {
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
      const doctor = doctors.find((d) => String(d.id) === String(a.doctorId));
      const service = services.find((s) => String(s.id) === String(a.serviceId));

      row.innerHTML = `
        <div class="timeline-left">
          <div class="timeline-time">${key}</div>
          <div class="timeline-badge">${a.patientName} • ${doctor ? doctor.name : "-"}</div>
        </div>
        <div class="timeline-right">
          <button class="status-pill status-visit-${a.statusVisit}" type="button" data-role="visit">${visitLabel(a.statusVisit)}</button>
          <button class="status-pill status-pay-${a.statusPayment}" type="button" data-role="pay">${paymentLabel(a.statusPayment)}</button>
          <button class="table-action-btn" type="button" data-role="jump" title="Открыть в Записях">↗</button>
        </div>
      `;

      row.querySelector('[data-role="visit"]')?.addEventListener("click", async () => {
        const ok = await setApptPatch(a.id, { statusVisit: nextVisitStatus(a.statusVisit) });
        if (ok) {
          showToast("Статус визита изменён", "info");
          renderAll();
        }
      });

      row.querySelector('[data-role="pay"]')?.addEventListener("click", async () => {
        const ok = await setApptPatch(a.id, { statusPayment: nextPaymentStatus(a.statusPayment) });
        if (ok) {
          showToast("Статус оплаты изменён", "info");
          renderAll();
        }
      });

      row.querySelector('[data-role="jump"]')?.addEventListener("click", () => {
        navButtons.forEach((b) => b.classList.remove("active"));
        document.querySelector('.nav-btn[data-view="appointments"]')?.classList.add("active");

        views.forEach((v) => v.classList.remove("view--active"));
        document.getElementById("view-appointments")?.classList.add("view--active");

        pageTitle.textContent = "Записи";
        pageSubtitle.textContent = "Создание и управление записями на приём";

        const todayISO = formatDateISO(new Date());
        if (rangeFromInput) rangeFromInput.value = todayISO;
        if (rangeToInput) rangeToInput.value = todayISO;
        if (rangeSearchInput) rangeSearchInput.value = a.patientName;

        renderAppointmentsTable();
        showToast("Открыто в «Записях» (фильтры обновлены)", "success");
      });
    }

    wrap.appendChild(row);
  }

  dashTimelineBody.innerHTML = "";
  dashTimelineBody.appendChild(wrap);
}

function getRangeFilteredAppointments() {
  const from = (rangeFromInput?.value || "").trim();
  const to = (rangeToInput?.value || "").trim();
  const doctorFilter = String(rangeDoctorSelect?.value || "").trim();
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

  const totals = new Map();
  doctors.forEach((d) => totals.set(String(d.id), 0));

  rangeAppts.forEach((a) => {
    const did = String(a.doctorId || "");
    if (!did) return;
    totals.set(did, (totals.get(did) || 0) + 1);
  });

  const max = Math.max(1, ...Array.from(totals.values()));

  const grid = document.createElement("div");
  grid.className = "doctor-load-grid";

  doctors.forEach((d) => {
    const did = String(d.id);
    const count = totals.get(did) || 0;
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

  const total = todayAppts.length;
  const done = todayAppts.filter((a) => a.statusVisit === "done").length;
  const revenue = todayAppts
    .filter(isRevenueAppt)
    .reduce((acc, a) => acc + (a.price || 0), 0);

  if (kpiTodayTotal) kpiTodayTotal.textContent = String(total);
  if (kpiTodayDone) kpiTodayDone.textContent = String(done);
  if (kpiTodayRevenue) kpiTodayRevenue.textContent = moneyUZS(revenue);

  const { score, noShowRate } = computeClinicHealthScore();
  if (kpiHealthScore) kpiHealthScore.textContent = `${score}/100`;
  if (kpiNoShowRate)
    kpiNoShowRate.textContent = `${Math.round(noShowRate * 100)}%`;

  if (dashboardTodayBody) {
    dashboardTodayBody.innerHTML = "";

    todayAppts
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((a) => {
        const tr = document.createElement("tr");
        const doctor = doctors.find((d) => String(d.id) === String(a.doctorId));
        const service = services.find(
          (s) => String(s.id) === String(a.serviceId),
        );

        tr.innerHTML = `
          <td>${a.time}</td>
          <td>${doctor ? doctor.name : "-"}</td>
          <td>${a.patientName}</td>
          <td>${a.phone || ""}</td>
          <td>${service ? service.name : ""}</td>
          <td class="col-amount">${moneyUZS(a.price || 0)}</td>
          <td>
            <button class="status-pill status-visit-${a.statusVisit}" data-role="visit" type="button" title="Нажмите, чтобы сменить статус">
              ${visitLabel(a.statusVisit)}
            </button>
          </td>
          <td>
            <button class="status-pill status-pay-${a.statusPayment}" data-role="pay" type="button" title="Нажмите, чтобы сменить оплату">
              ${paymentLabel(a.statusPayment)}
            </button>
          </td>
        `;

        tr.querySelector('[data-role="visit"]')?.addEventListener(
          "click",
          async () => {
            const ok = await setApptPatch(a.id, {
              statusVisit: nextVisitStatus(a.statusVisit),
            });
            if (ok) {
              showToast("Статус визита изменён", "info");
              renderAll();
            }
          },
        );

        tr.querySelector('[data-role="pay"]')?.addEventListener(
          "click",
          async () => {
            const ok = await setApptPatch(a.id, {
              statusPayment: nextPaymentStatus(a.statusPayment),
            });
            if (ok) {
              showToast("Статус оплаты изменён", "info");
              renderAll();
            }
          },
        );

        dashboardTodayBody.appendChild(tr);
      });
  }

  // PRO: таймлайн дня (если блок существует)
  renderTimelineForToday(todayAppts);

  // PRO: загрузка врачей по диапазону
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
        : a.date.localeCompare(b.date),
    )
    .forEach((a) => {
      const doctor = doctors.find((d) => String(d.id) === String(a.doctorId));
      const service = services.find(
        (s) => String(s.id) === String(a.serviceId),
      );
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
          <button class="status-pill status-visit-${a.statusVisit}" data-role="visit" type="button" title="Нажмите, чтобы сменить статус">
            ${visitLabel(a.statusVisit)}
          </button>
        </td>
        <td>
          <button class="status-pill status-pay-${a.statusPayment}" data-role="pay" type="button" title="Нажмите, чтобы сменить оплату">
            ${paymentLabel(a.statusPayment)}
          </button>
        </td>
        <td class="col-actions">
          <button class="table-action-btn" data-action="edit" type="button" title="Редактировать">✏️</button>
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить">🗑</button>
        </td>
      `;

      tr.querySelector('[data-action="edit"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditApptModal(a.id);
      });

      tr.querySelector('[data-action="delete"]')?.addEventListener(
        "click",
        async (e) => {
          e.stopPropagation();
          await deleteAppointment(a.id);
        },
      );

      tr.querySelector('[data-role="visit"]')?.addEventListener(
        "click",
        async (e) => {
          e.stopPropagation();
          const ok = await setApptPatch(a.id, {
            statusVisit: nextVisitStatus(a.statusVisit),
          });
          if (ok) {
            showToast("Статус визита изменён", "info");
            renderAll();
          }
        },
      );

      tr.querySelector('[data-role="pay"]')?.addEventListener(
        "click",
        async (e) => {
          e.stopPropagation();
          const ok = await setApptPatch(a.id, {
            statusPayment: nextPaymentStatus(a.statusPayment),
          });
          if (ok) {
            showToast("Статус оплаты изменён", "info");
            renderAll();
          }
        },
      );

      allAppointmentsBody.appendChild(tr);
    });

  renderDoctorLoadForRange();
}

if (rangeFromInput) rangeFromInput.addEventListener("change", renderAppointmentsTable);
if (rangeToInput) rangeToInput.addEventListener("change", renderAppointmentsTable);
if (rangeDoctorSelect) rangeDoctorSelect.addEventListener("change", renderAppointmentsTable);
if (rangeSearchInput) rangeSearchInput.addEventListener("input", renderAppointmentsTable);

// CSV экспорт (остаётся фронтовым)
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
        : a.date.localeCompare(b.date),
    )
    .forEach((a) => {
      const doctor = doctors.find((d) => String(d.id) === String(a.doctorId));
      const service = services.find(
        (s) => String(s.id) === String(a.serviceId),
      );
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
          .join(";"),
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
if (exportRangeCsvBtn) exportRangeCsvBtn.addEventListener("click", exportRangeCsv);

// ===== РЕДАКТИРОВАНИЕ ЗАПИСИ =====
function openEditApptModal(id) {
  const all = getAppointments();
  const appt = all.find((a) => String(a.id) === String(id));
  if (!appt) return;

  currentEditApptId = appt.id;
  refreshSelectsOnly();

  editApptDateInput.value = appt.date;
  editApptTimeInput.value = appt.time;
  editApptDoctorSelect.value = String(appt.doctorId || "");
  editApptPatientInput.value = appt.patientName;
  editApptPhoneInput.value = appt.phone || "";
  editApptServiceSelect.value = String(appt.serviceId || "");
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

async function deleteAppointment(id) {
  if (!confirm("Удалить эту запись?")) return;

  try {
    await api.deleteAppointment(id);

    const all = getAppointments();
    setAppointments(all.filter((a) => String(a.id) !== String(id)));

    showToast("Запись удалена", "info");
    if (String(currentEditApptId) === String(id)) closeEditApptModal();
    renderAll();
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка удаления записи", "error");
  }
}

if (editApptForm) {
  editApptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEditApptId) return;

    const all = getAppointments();
    const idx = all.findIndex((a) => String(a.id) === String(currentEditApptId));
    if (idx === -1) return;

    const updated = { ...all[idx] };

    updated.date = (editApptDateInput.value || "").trim();
    updated.time = (editApptTimeInput.value || "").trim();
    updated.doctorId = String(editApptDoctorSelect.value || "").trim(); // UUID строка
    updated.patientName = normalizeName(editApptPatientInput.value);
    updated.phone = normalizePhone(editApptPhoneInput.value);
    updated.serviceId = String(editApptServiceSelect.value || "").trim();
    updated.price = toNumber(editApptPriceInput.value || 0);
    updated.statusVisit = editApptStatusVisitSelect.value;
    updated.statusPayment = editApptStatusPaymentSelect.value;
    updated.paymentMethod = editApptPaymentMethodSelect.value;

    if (!updated.date || !updated.time || !updated.doctorId || !updated.patientName || !updated.serviceId) {
      showToast("Заполните все обязательные поля", "error");
      return;
    }

    if (
      hasSlotConflict(
        all,
        { date: updated.date, time: updated.time, doctorId: updated.doctorId },
        currentEditApptId,
      )
    ) {
      showToast("Конфликт: у врача уже есть запись на это время", "error");
      return;
    }

    try {
      const patch = {
        date: updated.date,
        time: updated.time,
        doctorId: updated.doctorId,
        patientName: updated.patientName,
        phone: updated.phone,
        serviceId: updated.serviceId,
        price: updated.price,
        statusVisit: updated.statusVisit,
        statusPayment: updated.statusPayment,
        paymentMethod: updated.paymentMethod,
      };

      const ok = await setApptPatch(currentEditApptId, patch);
      if (!ok) return;

      showToast("Запись обновлена", "success");
      closeEditApptModal();
      renderAll();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Ошибка обновления записи", "error");
    }
  });
}

if (editApptCancelBtn) editApptCancelBtn.addEventListener("click", closeEditApptModal);

if (editApptModalBackdrop) {
  editApptModalBackdrop.addEventListener("click", (e) => {
    if (e.target === editApptModalBackdrop) closeEditApptModal();
  });
}

// ===== NORMALIZERS: Doctor / Service (API <-> UI) =====
function doctorToApiPayload(payload) {
  return {
    name: payload.name,
    speciality: payload.speciality || "",
    percent: Number(payload.percent ?? 0),
    active: !!payload.active,
  };
}
function doctorFromApi(d, fallback = {}) {
  if (!d || typeof d !== "object") return { ...fallback };
  return {
    id: d.id ?? fallback.id,
    name: d.name ?? fallback.name,
    speciality: d.speciality ?? fallback.speciality ?? "",
    percent: d.percent ?? fallback.percent ?? 0,
    active: d.active ?? fallback.active ?? true,
    createdAt: d.created_at ?? d.createdAt ?? fallback.createdAt ?? null,
    updatedAt: d.updated_at ?? d.updatedAt ?? fallback.updatedAt ?? null,
  };
}

function serviceToApiPayload(payload) {
  return {
    name: payload.name,
    category: payload.category || "",
    price: Number(payload.price ?? 0),
    active: !!payload.active,
  };
}
function serviceFromApi(s, fallback = {}) {
  if (!s || typeof s !== "object") return { ...fallback };
  return {
    id: s.id ?? fallback.id,
    name: s.name ?? fallback.name,
    category: s.category ?? fallback.category ?? "",
    price: s.price ?? fallback.price ?? 0,
    active: s.active ?? fallback.active ?? true,
    createdAt: s.created_at ?? s.createdAt ?? fallback.createdAt ?? null,
    updatedAt: s.updated_at ?? s.updatedAt ?? fallback.updatedAt ?? null,
  };
}

// ===== ВРАЧИ (CRUD) =====
function renderDoctors() {
  // таблица врачей рендерится в другом месте (если у тебя есть полноценный renderDoctors ниже — оставь его)
  // здесь ничего не ломаем. Селекты врачей обновляются через refreshSelectsOnly()
  refreshSelectsOnly();
}

function openDoctorModal(id = null) {
  const doctors = getDoctors();
  currentDoctorId = id;

  if (id) {
    const doc = doctors.find((d) => String(d.id) === String(id));
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

async function deleteDoctor(id) {
  if (!confirm("Удалить этого врача? Записи останутся, но без привязки к врачу.")) return;

  try {
    await api.deleteDoctor(id);

    setDoctors(getDoctors().filter((d) => String(d.id) !== String(id)));
    refreshSelectsOnly();
    renderAll();
    showToast("Врач удалён", "info");
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка удаления врача", "error");
  }
}

if (addDoctorBtn) addDoctorBtn.addEventListener("click", () => openDoctorModal(null));
if (doctorCancelBtn) doctorCancelBtn.addEventListener("click", closeDoctorModal);

if (doctorModalBackdrop) {
  doctorModalBackdrop.addEventListener("click", (e) => {
    if (e.target === doctorModalBackdrop) closeDoctorModal();
  });
}

if (doctorForm) {
  doctorForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = normalizeName(doctorNameInput.value);
    const speciality = normalizeName(doctorSpecialityInput.value);
    const percent = Math.min(100, Math.max(0, toNumber(doctorPercentInput.value || 0)));
    const active = doctorActiveSelect.value === "true";

    if (!name) {
      showToast("Имя врача обязательно", "error");
      return;
    }

    try {
      const payload = { name, speciality, percent, active };
      const payloadApi = doctorToApiPayload(payload);

      if (currentDoctorId) {
        // update
        const updatedApi = await api.updateDoctor(currentDoctorId, payloadApi);

        const doctors = getDoctors().slice();
        const idx = doctors.findIndex((d) => String(d.id) === String(currentDoctorId));
        if (idx !== -1) {
          const fallback = { ...doctors[idx], ...payload };
          doctors[idx] = updatedApi ? doctorFromApi(updatedApi, fallback) : fallback;
        }
        setDoctors(doctors);

        showToast("Врач обновлён", "success");
      } else {
        // create
        const createdApi = await api.createDoctor(payloadApi);

        const doctors = getDoctors().slice();
        const fallback = {
          id: String(Date.now()),
          ...payload,
          createdAt: new Date().toISOString(),
        };
        doctors.push(createdApi ? doctorFromApi(createdApi, fallback) : fallback);
        setDoctors(doctors);

        showToast("Врач добавлен", "success");
      }

      refreshSelectsOnly();
      renderAll();
      closeDoctorModal();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Ошибка сохранения врача", "error");
    }
  });
}

// ===== УСЛУГИ (CRUD) =====
function renderServices() {
  if (!servicesTableBody) return;
  const services = getServices();

  servicesTableBody.innerHTML = "";
  services
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"))
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

      tr.querySelector('[data-action="edit"]')?.addEventListener("click", () => openServiceModal(s.id));
      tr.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
        await deleteService(s.id);
      });

      servicesTableBody.appendChild(tr);
    });
}

function openServiceModal(id = null) {
  const services = getServices();
  currentServiceId = id;

  if (id != null) {
    const srv = services.find((s) => String(s.id) === String(id));
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

async function deleteService(id) {
  if (!confirm("Удалить эту услугу? Записи останутся, но будут без привязанной услуги.")) return;

  try {
    await api.deleteService(id);

    setServices(getServices().filter((s) => String(s.id) !== String(id)));
    refreshSelectsOnly();
    renderAll();
    showToast("Услуга удалена", "info");
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка удаления услуги", "error");
  }
}

if (addServiceBtn) addServiceBtn.addEventListener("click", () => openServiceModal(null));
if (serviceCancelBtn) serviceCancelBtn.addEventListener("click", closeServiceModal);

if (serviceModalBackdrop) {
  serviceModalBackdrop.addEventListener("click", (e) => {
    if (e.target === serviceModalBackdrop) closeServiceModal();
  });
}

if (serviceForm) {
  serviceForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = normalizeName(serviceNameInput.value);
    const category = normalizeName(serviceCategoryInput.value);
    const price = Math.max(0, toNumber(servicePriceInput.value || 0));
    const active = serviceActiveSelect.value === "true";

    if (!name) {
      showToast("Название услуги обязательно", "error");
      return;
    }

    try {
      const payload = { name, category, price, active };
      const payloadApi = serviceToApiPayload(payload);

      if (currentServiceId) {
        const updatedApi = await api.updateService(currentServiceId, payloadApi);

        const services = getServices().slice();
        const idx = services.findIndex((s) => String(s.id) === String(currentServiceId));
        if (idx !== -1) {
          const fallback = { ...services[idx], ...payload };
          services[idx] = updatedApi ? serviceFromApi(updatedApi, fallback) : fallback;
        }
        setServices(services);

        showToast("Услуга обновлена", "success");
      } else {
        const createdApi = await api.createService(payloadApi);

        const services = getServices().slice();
        const fallback = {
          id: String(Date.now()),
          ...payload,
          createdAt: new Date().toISOString(),
        };
        services.push(createdApi ? serviceFromApi(createdApi, fallback) : fallback);
        setServices(services);

        showToast("Услуга добавлена", "success");
      }

      refreshSelectsOnly();
      renderAll();
      closeServiceModal();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Ошибка сохранения услуги", "error");
    }
  });
}

// ===== ПАЦИЕНТЫ: summary + risk + archive/delete (API-ready) =====
function getArchivedSet() {
  if (state && state.archivedPatients instanceof Set) return state.archivedPatients;
  return new Set();
}
function persistArchivedSet(set) {
  state.archivedPatients = set;
  saveArchivedPatientsSetLocal(set);
}
function archivePatientKeyUnified(patientKey) {
  const set = getArchivedSet();
  set.add(patientKey);
  persistArchivedSet(set);
}
function restorePatientKeyUnified(patientKey) {
  const set = getArchivedSet();
  set.delete(patientKey);
  persistArchivedSet(set);
}
function isArchivedPatientUnified(patientKey) {
  return getArchivedSet().has(patientKey);
}

function patientKeyFromAppt(a) {
  const name = normalizeName(a.patientName || "");
  const phone = normalizePhone(a.phone || "");
  return `${safeLower(name)}|${phone}`;
}

function computePatientRisk(patientAppts) {
  const total = patientAppts.length;
  if (!total) return { level: "low", label: "Low", score: 0 };

  const noShow = patientAppts.filter((a) => a.statusVisit === "no_show").length;
  const unpaid = patientAppts.filter((a) => a.statusPayment === "unpaid").length;

  const noShowRate = noShow / Math.max(1, total);
  const unpaidRate = unpaid / Math.max(1, total);

  let score = 0;
  score += noShowRate * 70;
  score += unpaidRate * 30;

  const last = patientAppts
    .slice()
    .sort((a, b) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
    )
    .pop();

  if (last) {
    const todayISO = formatDateISO(new Date());
    const days = Math.floor(
      (new Date(todayISO).getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (days > 120) score *= 0.7;
  }

  score = Math.max(0, Math.min(100, score));

  if (score >= 55) return { level: "high", label: "High", score: Math.round(score) };
  if (score >= 25) return { level: "med", label: "Med", score: Math.round(score) };
  return { level: "low", label: "Low", score: Math.round(score) };
}

function buildPatientsSummary() {
  const appts = getAppointments();
  const archived = getArchivedSet();
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

  for (const p of map.values()) {
    const patientAppts = appts.filter((a) => patientKeyFromAppt(a) === p.key);
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
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"))
    .forEach((p) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${p.name || "-"}</td>
        <td>${p.phone || "-"}</td>
        <td>${p.visitsDone}</td>
        <td class="col-amount">${moneyUZS(p.revenue)}</td>
        <td class="col-actions">
          <span class="risk-pill risk-${p.risk.level}" title="Риск: ${p.risk.score}/100">
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

      tr.querySelector('[data-action="archive"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        archivePatientByKey(p.key);
      });

      tr.querySelector('[data-action="restore"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        restorePatientByKey(p.key);
      });

      tr.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deletePatientByKey(p.key);
      });

      patientsTableBody.appendChild(tr);
    });
}

async function deletePatientByKey(patientKey) {
  const list = buildPatientsSummary();
  const target = list.find((x) => x.key === patientKey);

  const label = target ? `${target.name}${target.phone ? " — " + target.phone : ""}` : "этого пациента";
  if (!confirm(`Удалить пациента: ${label}?\nБудут удалены все его записи.`)) return;

  const before = getAppointments();
  const patientAppts = before.filter((a) => patientKeyFromAppt(a) === patientKey);

  try {
    if (patientAppts.length) {
      await Promise.all(patientAppts.map((a) => api.deleteAppointment(a.id)));
    }

    const after = before.filter((a) => patientKeyFromAppt(a) !== patientKey);
    setAppointments(after);

    restorePatientKeyUnified(patientKey);

    if (currentPatientKey === patientKey) closePatientModal();

    showToast("Пациент и все его записи удалены", "info");
    renderAll();
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка удаления пациента", "error");
  }
}

function archivePatientByKey(patientKey) {
  const list = buildPatientsSummary();
  const target = list.find((x) => x.key === patientKey);

  const label = target ? `${target.name}${target.phone ? " — " + target.phone : ""}` : "этого пациента";

  if (!confirm(`Архивировать пациента: ${label}?\nЗаписи останутся, пациент будет скрыт из списка.`)) return;

  archivePatientKeyUnified(patientKey);

  if (currentPatientKey === patientKey) closePatientModal();

  showToast("Пациент отправлен в архив", "info");
  renderPatients();
}

function restorePatientByKey(patientKey) {
  restorePatientKeyUnified(patientKey);
  showToast("Пациент восстановлен из архива", "success");
  renderPatients();
}

function openPatientModal(patientKey) {
  currentPatientKey = patientKey;

  const list = buildPatientsSummary();
  const target = list.find((x) => x.key === patientKey);
  const title = target ? `${target.name}${target.phone ? " — " + target.phone : ""}` : "История пациента";
  if (patientModalTitle) patientModalTitle.textContent = title;

  const appts = getAppointments().filter((a) => patientKeyFromAppt(a) === patientKey);

  appts.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
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

      const doctor = doctors.find((d) => String(d.id) === String(a.doctorId));
      const service = services.find((s) => String(s.id) === String(a.serviceId));

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

if (patientsSearchInput) patientsSearchInput.addEventListener("input", renderPatients);
if (patientsArchiveMode) patientsArchiveMode.addEventListener("change", renderPatients);
if (patientModalClose) patientModalClose.addEventListener("click", closePatientModal);

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
  forDay.forEach((a) => {
    const did = String(a.doctorId || "");
    totals.set(did, (totals.get(did) || 0) + (a.price || 0));
  });

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
          const doctor = doctors.find((d) => String(d.id) === String(doctorId));
          const li = document.createElement("li");
          li.textContent = `${doctor ? doctor.name : "Врач"} — ${moneyUZS(sum)}`;
          reportDoctorTotals.appendChild(li);
        });
    }
  }

  if (reportClinicTotal) {
    const clinicTotal = forDay.reduce((acc, a) => acc + (a.price || 0), 0);
    reportClinicTotal.textContent = moneyUZS(clinicTotal);
  }
}
if (reportDateInput) reportDateInput.addEventListener("change", renderReportsDay);

// ===== ОТЧЁТЫ: МЕСЯЦ И ГОД =====
function renderReportsMonthYear() {
  const all = getAppointments();
  const doctors = getDoctors();

  const monthValue = reportMonthInput?.value || "";
  const yearValue = reportYearInput?.value || "";

  const monthAppts = monthValue
    ? all.filter((a) => String(a.date || "").startsWith(monthValue) && isRevenueAppt(a))
    : [];

  const monthTotals = new Map();
  monthAppts.forEach((a) => {
    const did = String(a.doctorId || "");
    monthTotals.set(did, (monthTotals.get(did) || 0) + (a.price || 0));
  });

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
          const doctor = doctors.find((d) => String(d.id) === String(doctorId));
          const li = document.createElement("li");
          li.textContent = `${doctor ? doctor.name : "Врач"} — ${moneyUZS(sum)}`;
          reportMonthDoctorTotals.appendChild(li);
        });
    }
  }
  if (reportMonthClinicTotal) {
    const clinicTotal = monthAppts.reduce((acc, a) => acc + (a.price || 0), 0);
    reportMonthClinicTotal.textContent = moneyUZS(clinicTotal);
  }

  const yearAppts = yearValue
    ? all.filter((a) => String(a.date || "").slice(0, 4) === String(yearValue) && isRevenueAppt(a))
    : [];

  const yearTotals = new Map();
  yearAppts.forEach((a) => {
    const did = String(a.doctorId || "");
    yearTotals.set(did, (yearTotals.get(did) || 0) + (a.price || 0));
  });

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
          const doctor = doctors.find((d) => String(d.id) === String(doctorId));
          const li = document.createElement("li");
          li.textContent = `${doctor ? doctor.name : "Врач"} — ${moneyUZS(sum)}`;
          reportYearDoctorTotals.appendChild(li);
        });
    }
  }
  if (reportYearClinicTotal) {
    const clinicTotal = yearAppts.reduce((acc, a) => acc + (a.price || 0), 0);
    reportYearClinicTotal.textContent = moneyUZS(clinicTotal);
  }
}
if (reportMonthInput) reportMonthInput.addEventListener("change", renderReportsMonthYear);
if (reportYearInput) reportYearInput.addEventListener("change", renderReportsMonthYear);

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

// безопасное сохранение архива (если вдруг у тебя выше функции нет/переопределена)
function saveArchivedPatientsSetLocal(set) {
  try {
    localStorage.setItem(
      STORAGE_PATIENTS_ARCHIVE,
      JSON.stringify(Array.from(set.values())),
    );
  } catch (e) {
    console.warn("archive local save failed", e);
  }
}

// ===== СТАРТ =====
document.addEventListener("DOMContentLoaded", checkAuthOnLoad);
