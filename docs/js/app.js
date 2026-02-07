// ===============================
// Kamilovs Clinic CRM — app.js (Pro) — FIXED FULL
// ===============================

// ===== НАСТРОЙКИ / КОНСТАНТЫ =====
const LOGIN_KEY = "crm_logged_in_v1";
const AUTH_TOKEN_KEY = "crm_auth_token_v1";
const STORAGE_PATIENTS_ARCHIVE = "crm_patients_archived_v1";

const BRAND_THEME = {
  accent: "#22d3ee",
  accent2: "#6366f1",
};

// ====== API CONFIG (safe) ======
function normalizeApiBase(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let out = s.replace(/\s+/g, "").replace(/\/+$/, "");
  out = out.replace(/\/api$/i, "");
  out = out.replace(/\/api\/api$/i, "");
  return out;
}

const DEFAULT_API_BASE = "https://kamilovs-crm.onrender.com";
const API_BASE = normalizeApiBase(
  (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
    localStorage.getItem("crm_api_base") ||
    DEFAULT_API_BASE
);

// ====== AUTH TOKEN HELPERS ======
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

// ===== ПОМОЩНИКИ (общие) =====
function applyBrandTheme() {
  document.documentElement.style.setProperty("--accent", BRAND_THEME.accent);
  document.documentElement.style.setProperty("--accent-2", BRAND_THEME.accent2);
}
applyBrandTheme();

function formatDateISO(date) {
  // ЛОКАЛЬНАЯ дата YYYY-MM-DD (без UTC-сдвига)
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

function moneyUZS(n) {
  const val = Math.max(0, toNumber(n, 0));
  return `${val.toLocaleString("ru-RU")} UZS`;
}

// ====== API HELPERS ======
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

async function apiHealth() {
  try {
    const r = await apiFetch("/health", { timeoutMs: 7000 });
    if (!r) return false;
    if (r.ok === true) return true;
    if (typeof r.status === "string" && r.status.toLowerCase().includes("alive"))
      return true;
    return false;
  } catch {
    return false;
  }
}

// ===== DEMO =====
const DEMO_USER = { username: "admin", password: "samandar014" };

const DEMO_DOCTORS = [
  { id: "1", name: "Д-р Ахмедов", speciality: "Терапевт", percent: 40, active: true },
  { id: "2", name: "Д-р Камилов", speciality: "УЗИ", percent: 35, active: true },
  { id: "3", name: "Д-р Саидова", speciality: "Кардиолог", percent: 45, active: true },
];

const DEMO_SERVICES = [
  { id: "1", name: "Первичная консультация", category: "Консультации", price: 200000, active: true },
  { id: "2", name: "УЗИ брюшной полости", category: "УЗИ", price: 300000, active: true },
  { id: "3", name: "Контрольный приём", category: "Консультации", price: 150000, active: true },
];

// ===== STATE =====
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

// ====== NORMALIZE (API -> UI) ======
function normalizeDoctor(d) {
  if (!d) return null;
  return {
    id: String(d.id ?? ""),
    name: d.name ?? d.full_name ?? "",
    speciality: d.speciality ?? d.specialty ?? "",
    percent: toNumber(d.percent, 0),
    // ✅ ВАЖНО: если active нет/NULL — считаем активным
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
    // ✅ ВАЖНО: если active нет/NULL — считаем активным
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

// ===== API METHODS =====
const api = {
  getDoctors: () => apiFetch("/api/doctors"),
  createDoctor: (payload) => apiFetch("/api/doctors", { method: "POST", body: payload }),
  updateDoctor: (id, payload) => apiFetch(`/api/doctors/${id}`, { method: "PUT", body: payload }),
  deleteDoctor: (id) => apiFetch(`/api/doctors/${id}`, { method: "DELETE" }),

  getServices: () => apiFetch("/api/services"),
  createService: (payload) => apiFetch("/api/services", { method: "POST", body: payload }),
  updateService: (id, payload) => apiFetch(`/api/services/${id}`, { method: "PUT", body: payload }),
  deleteService: (id) => apiFetch(`/api/services/${id}`, { method: "DELETE" }),

  getAppointments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/appointments${qs ? `?${qs}` : ""}`);
  },
  createAppointment: (payload) => apiFetch("/api/appointments", { method: "POST", body: payload }),
  updateAppointment: (id, payload) => apiFetch(`/api/appointments/${id}`, { method: "PUT", body: payload }),
  deleteAppointment: (id) => apiFetch(`/api/appointments/${id}`, { method: "DELETE" }),
};

// ===== ARCHIVE =====
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
  try {
    localStorage.setItem(STORAGE_PATIENTS_ARCHIVE, JSON.stringify(Array.from(set.values())));
  } catch (e) {
    console.warn("archive local save failed", e);
  }
}

// ===== DATA ACCESS =====
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

// ===== BUSINESS RULES =====
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

// ===== DOM =====
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

const dashDoctorFilter = document.getElementById("dashDoctorFilter");
const dashboardTodayBody = document.getElementById("dashboardTodayBody");
const kpiTodayTotal = document.getElementById("kpiTodayTotal");
const kpiTodayDone = document.getElementById("kpiTodayDone");
const kpiTodayRevenue = document.getElementById("kpiTodayRevenue");

const kpiHealthScore = document.getElementById("kpiHealthScore");
const kpiNoShowRate = document.getElementById("kpiNoShowRate");
const dashTimelineBody = document.getElementById("dashTimelineBody");
const dashDoctorLoadBody = document.getElementById("dashDoctorLoadBody");

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

// Остальные блоки (patients/reports/edit modal) — если у тебя они есть в HTML,
// этот файл будет работать. Если нет — просто будут null и ничего не сломают.
const patientsSearchInput = document.getElementById("patientsSearch");
const patientsTableBody = document.getElementById("patientsTableBody");
const patientModalBackdrop = document.getElementById("patientModalBackdrop");
const patientModalTitle = document.getElementById("patientModalTitle");
const patientHistoryBody = document.getElementById("patientHistoryBody");
const patientModalClose = document.getElementById("patientModalClose");
const patientsArchiveMode = document.getElementById("patientsArchiveMode");

const reportDateInput = document.getElementById("reportDate");
const reportDoctorTotals = document.getElementById("reportDoctorTotals");
const reportClinicTotal = document.getElementById("reportClinicTotal");
const reportMonthInput = document.getElementById("reportMonth");
const reportYearInput = document.getElementById("reportYear");
const reportMonthDoctorTotals = document.getElementById("reportMonthDoctorTotals");
const reportMonthClinicTotal = document.getElementById("reportMonthClinicTotal");
const reportYearDoctorTotals = document.getElementById("reportYearDoctorTotals");
const reportYearClinicTotal = document.getElementById("reportYearClinicTotal");

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

// ===== АЛИАСЫ =====
const doctorSelect = apptDoctorSelect;
const serviceSelect = apptServiceSelect;

// ===== LOGIN =====
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

// ===== SELECTS (FIXED ACTIVE FILTER) =====
function fillDoctorSelect(selectEl, doctors, includeAll = false) {
  if (!selectEl) return;

  const prev = selectEl.value;
  selectEl.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = includeAll ? "Все" : "Выберите врача";
  selectEl.appendChild(ph);

  (Array.isArray(doctors) ? doctors : [])
    .filter((d) => d && d.active !== false) // ✅ null/undefined => активен
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
    .filter((s) => {
      if (!s) return false;
      if (!onlyActive) return true;
      return s.active !== false; // ✅ null/undefined => активен
    })
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

// ===== BOOTSTRAP (API OR DEMO) =====
async function bootstrapData() {
  state.archivedPatients = loadArchivedPatientsSetLocal();

  // сначала попробуем API
  const okHealth = await apiHealth();

  if (okHealth) {
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
      showToast(`Ошибка загрузки данных: ${e.message}`, "error");
    }
  } else {
    // health не ок — покажем демо, чтобы UI не был пустым
    showToast("Сервер недоступен. Включён DEMO режим.", "error");
  }

  // DEMO fallback
  setDoctors(DEMO_DOCTORS.map(normalizeDoctor).filter(Boolean));
  setServices(DEMO_SERVICES.map(normalizeService).filter(Boolean));
  setAppointments([]);
  return { mode: "demo", ok: false };
}

// ===== INIT AFTER LOGIN =====
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
    reportMonthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }
  if (reportYearInput) reportYearInput.value = String(today.getFullYear());

  refreshSelectsOnly();
  renderAll();

  bootstrapData().then((result) => {
    state.ready = !!(result && result.mode === "api");
    refreshSelectsOnly();

    const services = getServices().filter((s) => s.active !== false);
    if (services.length && apptServiceSelect && apptPriceInput) {
      if (!String(apptServiceSelect.value || "").trim()) {
        apptServiceSelect.value = String(services[0].id);
      }
      const selected =
        services.find((s) => String(s.id) === String(apptServiceSelect.value)) || services[0];
      apptPriceInput.value = selected.price;
    }

    renderAll();
    if (result?.mode === "api") showToast("Данные загружены", "success");
  });
}

function renderAll() {
  renderDashboard?.();
  renderAppointmentsTable?.();
  renderDoctors?.();
  renderServices?.();
  renderPatients?.();
  renderReportsDay?.();
  renderReportsMonthYear?.();
}

// ===== NAV =====
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
        pageSubtitle.textContent = "Краткая сводка по клинике и быстрый доступ к основным действиям";
        renderDashboard?.();
      } else if (view === "appointments") {
        pageTitle.textContent = "Записи";
        pageSubtitle.textContent = "Создание и управление записями на приём";
        renderAppointmentsTable?.();
      } else if (view === "doctors") {
        pageTitle.textContent = "Врачи";
        pageSubtitle.textContent = "Справочник врачей и их процент";
        renderDoctors?.();
      } else if (view === "services") {
        pageTitle.textContent = "Услуги";
        pageSubtitle.textContent = "Справочник услуг и цен";
        renderServices?.();
      } else if (view === "patients") {
        pageTitle.textContent = "Пациенты";
        pageSubtitle.textContent = "История визитов, риск и выручка по каждому пациенту";
        renderPatients?.();
      } else if (view === "reports") {
        pageTitle.textContent = "Отчёты";
        pageSubtitle.textContent = "День, месяц и год: выручка по врачам и по клинике";
        renderReportsDay?.();
        renderReportsMonthYear?.();
      }
    });
  });
}

// ===== PRICE AUTO (string ids) =====
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

// ===== CREATE APPOINTMENT =====
if (apptForm) {
  apptForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const date = (apptDateInput?.value || "").trim();
    const time = (apptTimeInput?.value || "").trim();
    const doctorId = String(doctorSelect?.value || "").trim();
    const patientName = normalizeName(apptPatientInput?.value || "");
    const phone = normalizePhone(apptPhoneInput?.value || "");
    const serviceId = String(serviceSelect?.value || "").trim();
    const price = toNumber(apptPriceInput?.value || 0);
    const statusVisit = apptStatusVisitSelect?.value || "scheduled";
    const statusPayment = apptStatusPaymentSelect?.value || "unpaid";
    const paymentMethod = apptPaymentMethodSelect?.value || "none";

    if (!date) return showToast("Выберите дату", "error");
    if (!time) return showToast("Выберите время", "error");
    if (!doctorId) return showToast("Выберите врача", "error");
    if (!patientName) return showToast("Введите пациента", "error");
    if (!serviceId) return showToast("Выберите услугу", "error");

    const allExisting = getAppointments();
    if (hasSlotConflict(allExisting, { date, time, doctorId })) {
      showToast("На это время у врача уже есть запись", "error");
      return;
    }

    const payloadApi = {
      date,
      time,
      doctorId,
      serviceId,
      patientName,
      phone,
      price,
      statusVisit,
      statusPayment,
      paymentMethod,
    };

    try {
      const created = await api.createAppointment(payloadApi);
      const normalized = normalizeAppointment(created) || {
        id: String(created?.id ?? Date.now()),
        ...payloadApi,
      };

      setAppointments([...getAppointments(), normalized]);

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

// ===== DOCTORS TABLE + CRUD =====
function doctorToApiPayload(payload) {
  return {
    name: payload.name,
    speciality: payload.speciality || "",
    percent: Number(payload.percent ?? 0),
    active: !!payload.active,
  };
}

function renderDoctors() {
  // 1) селекты
  refreshSelectsOnly();

  // 2) таблица
  if (!doctorsTableBody) return;

  const doctors = getDoctors();
  doctorsTableBody.innerHTML = "";

  doctors
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"))
    .forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.name || "-"}</td>
        <td>${d.speciality || "-"}</td>
        <td>${toNumber(d.percent, 0)}%</td>
        <td>${d.active !== false ? "Да" : "Нет"}</td>
        <td class="col-actions">
          <button class="table-action-btn" data-action="edit" type="button" title="Редактировать">✏️</button>
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить">🗑</button>
        </td>
      `;
      tr.querySelector('[data-action="edit"]')?.addEventListener("click", () => openDoctorModal(d.id));
      tr.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
        await deleteDoctor(d.id);
      });
      doctorsTableBody.appendChild(tr);
    });
}

function openDoctorModal(id = null) {
  const doctors = getDoctors();
  currentDoctorId = id;

  if (id) {
    const doc = doctors.find((d) => String(d.id) === String(id));
    if (!doc) return;

    doctorModalTitle.textContent = "Редактирование врача";
    doctorNameInput.value = doc.name || "";
    doctorSpecialityInput.value = doc.speciality || "";
    doctorPercentInput.value = doc.percent || 0;
    doctorActiveSelect.value = doc.active !== false ? "true" : "false";
  } else {
    doctorModalTitle.textContent = "Новый врач";
    doctorNameInput.value = "";
    doctorSpecialityInput.value = "";
    doctorPercentInput.value = 40;
    doctorActiveSelect.value = "true";
  }

  doctorModalBackdrop?.classList.remove("hidden");
}

function closeDoctorModal() {
  currentDoctorId = null;
  doctorModalBackdrop?.classList.add("hidden");
}

async function deleteDoctor(id) {
  if (!confirm("Удалить этого врача? Записи останутся, но без привязки к врачу.")) return;
  try {
    await api.deleteDoctor(id);
    setDoctors(getDoctors().filter((d) => String(d.id) !== String(id)));
    renderDoctors();
    renderAll();
    showToast("Врач удалён", "info");
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка удаления врача", "error");
  }
}

if (addDoctorBtn) addDoctorBtn.addEventListener("click", () => openDoctorModal(null));
if (doctorCancelBtn) doctorCancelBtn.addEventListener("click", closeDoctorModal);
doctorModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === doctorModalBackdrop) closeDoctorModal();
});

doctorForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = normalizeName(doctorNameInput.value);
  const speciality = normalizeName(doctorSpecialityInput.value);
  const percent = Math.min(100, Math.max(0, toNumber(doctorPercentInput.value || 0)));
  const active = doctorActiveSelect.value === "true";

  if (!name) return showToast("Имя врача обязательно", "error");

  try {
    const payload = { name, speciality, percent, active };
    const payloadApi = doctorToApiPayload(payload);

    if (currentDoctorId) {
      const updatedApi = await api.updateDoctor(currentDoctorId, payloadApi);
      const doctors = getDoctors().slice();
      const idx = doctors.findIndex((d) => String(d.id) === String(currentDoctorId));
      if (idx !== -1) {
        doctors[idx] = normalizeDoctor(updatedApi) || { ...doctors[idx], ...payload };
      }
      setDoctors(doctors);
      showToast("Врач обновлён", "success");
    } else {
      const createdApi = await api.createDoctor(payloadApi);
      setDoctors([...getDoctors(), normalizeDoctor(createdApi)].filter(Boolean));
      showToast("Врач добавлен", "success");
    }

    closeDoctorModal();
    renderDoctors();
    renderAll();
  } catch (e2) {
    console.error(e2);
    showToast(e2.message || "Ошибка сохранения врача", "error");
  }
});

// ===== SERVICES (TABLE + CRUD) =====
function serviceToApiPayload(payload) {
  return {
    name: payload.name,
    category: payload.category || "",
    price: Number(payload.price ?? 0),
    active: !!payload.active,
  };
}

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
        <td>${s.active !== false ? "Да" : "Нет"}</td>
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
    serviceNameInput.value = srv.name || "";
    serviceCategoryInput.value = srv.category || "";
    servicePriceInput.value = srv.price || 0;
    serviceActiveSelect.value = srv.active !== false ? "true" : "false";
  } else {
    serviceModalTitle.textContent = "Новая услуга";
    serviceNameInput.value = "";
    serviceCategoryInput.value = "";
    servicePriceInput.value = 0;
    serviceActiveSelect.value = "true";
  }

  serviceModalBackdrop?.classList.remove("hidden");
}

function closeServiceModal() {
  currentServiceId = null;
  serviceModalBackdrop?.classList.add("hidden");
}

async function deleteService(id) {
  if (!confirm("Удалить эту услугу? Записи останутся, но будут без привязанной услуги.")) return;
  try {
    await api.deleteService(id);
    setServices(getServices().filter((s) => String(s.id) !== String(id)));
    refreshSelectsOnly();
    renderServices();
    renderAll();
    showToast("Услуга удалена", "info");
  } catch (e) {
    console.error(e);
    showToast(e.message || "Ошибка удаления услуги", "error");
  }
}

if (addServiceBtn) addServiceBtn.addEventListener("click", () => openServiceModal(null));
if (serviceCancelBtn) serviceCancelBtn.addEventListener("click", closeServiceModal);
serviceModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === serviceModalBackdrop) closeServiceModal();
});

serviceForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = normalizeName(serviceNameInput.value);
  const category = normalizeName(serviceCategoryInput.value);
  const price = Math.max(0, toNumber(servicePriceInput.value || 0));
  const active = serviceActiveSelect.value === "true";

  if (!name) return showToast("Название услуги обязательно", "error");

  try {
    const payload = { name, category, price, active };
    const payloadApi = serviceToApiPayload(payload);

    if (currentServiceId) {
      const updatedApi = await api.updateService(currentServiceId, payloadApi);
      const services = getServices().slice();
      const idx = services.findIndex((s) => String(s.id) === String(currentServiceId));
      if (idx !== -1) {
        services[idx] = normalizeService(updatedApi) || { ...services[idx], ...payload };
      }
      setServices(services);
      showToast("Услуга обновлена", "success");
    } else {
      const createdApi = await api.createService(payloadApi);
      setServices([...getServices(), normalizeService(createdApi)].filter(Boolean));
      showToast("Услуга добавлена", "success");
    }

    closeServiceModal();
    refreshSelectsOnly();
    renderServices();
    renderAll();
  } catch (e2) {
    console.error(e2);
    showToast(e2.message || "Ошибка сохранения услуги", "error");
  }
});

// ======= PLACEHOLDERS =======
// Чтобы не падало, если у тебя в этом файле ещё нет этих функций:
function renderDashboard() {}
function renderAppointmentsTable() {}
function renderPatients() {}
function renderReportsDay() {}
function renderReportsMonthYear() {}

// ===== ESC закрывает модалки =====
function closeAnyModalOnEsc(e) {
  if (e.key !== "Escape") return;

  const modals = [
    { el: editApptModalBackdrop, close: () => (editApptModalBackdrop?.classList.add("hidden"), (currentEditApptId = null)) },
    { el: doctorModalBackdrop, close: closeDoctorModal },
    { el: serviceModalBackdrop, close: closeServiceModal },
    { el: patientModalBackdrop, close: () => patientModalBackdrop?.classList.add("hidden") },
  ];

  for (const m of modals) {
    if (m.el && !m.el.classList.contains("hidden")) {
      m.close();
      break;
    }
  }
}
document.addEventListener("keydown", closeAnyModalOnEsc);

// ===== START =====
document.addEventListener("DOMContentLoaded", checkAuthOnLoad);
