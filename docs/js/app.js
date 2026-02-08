// ===============================
// Kamilovs Clinic CRM — app.js (Pro) — STABLE FULL
// NO DEMO • AUTO API_BASE • WORKING NAV • TOAST FIX • GH PAGES SAFE
// ===============================

/* =========================
   SETTINGS / CONSTANTS
========================= */
const LOGIN_KEY = "crm_logged_in_v1";
const AUTH_TOKEN_KEY = "crm_auth_token_v1";
const AUTH_USER_KEY = "crm_auth_user_v1"; // {username, role}
const STORAGE_PATIENTS_ARCHIVE = "crm_patients_archived_v1";

const BRAND_THEME = { accent: "#22d3ee", accent2: "#6366f1" };

// AUTO API_BASE (локально -> localhost, иначе -> Render)
const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://kamilovs-crm.onrender.com";

/* =========================
   AUTH (local users for now)
========================= */
const LOCAL_USERS = [
  { username: "admin", password: "samandar014", role: "admin" },
  { username: "manager", password: "manager014", role: "manager" },
  { username: "doctor", password: "doctor014", role: "doctor" },
];

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}
function setAuthUser(user) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}
function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

/* =========================
   UI HELPERS
========================= */
function applyBrandTheme() {
  document.documentElement.style.setProperty("--accent", BRAND_THEME.accent);
  document.documentElement.style.setProperty("--accent-2", BRAND_THEME.accent2);
}
applyBrandTheme();

function formatDateISO(date) {
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

function moneyUZS(n) {
  const val = Math.max(0, toNumber(n, 0));
  return `${val.toLocaleString("ru-RU")} UZS`;
}

/* =========================
   TOAST (NO [object Object])
========================= */
const toastContainer = document.getElementById("toastContainer");

function toToastText(x) {
  if (x == null) return "Ошибка";
  if (typeof x === "string") return x;
  if (x instanceof Error) return x.message || "Ошибка";
  if (typeof x?.message === "string") return x.message;
  if (typeof x?.error === "string") return x.error;
  if (typeof x?.error?.message === "string") return x.error.message;
  if (typeof x?.error?.details === "string") return x.error.details;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function showToast(message, type = "info") {
  if (!toastContainer) return;
  const text = toToastText(message);

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-dot"></div><div>${text}</div>`;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--visible"));

  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

/* =========================
   API HELPERS
========================= */
function extractApiErrorMessage(data, status) {
  if (!data) return `API error ${status}`;
  if (typeof data === "string") return data;

  if (typeof data.detail === "string") return data.detail;
  if (typeof data.message === "string") return data.message;
  if (typeof data.title === "string") return data.title;

  if (typeof data.error === "string") return data.error;

  if (data.error && typeof data.error === "object") {
    if (typeof data.error.message === "string") return data.error.message;
    if (typeof data.error.details === "string") return data.error.details;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return `API error ${status}`;
  }
}

async function apiFetch(
  path,
  { method = "GET", body, headers = {}, timeoutMs = 12000 } = {},
) {
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

    const text = await res.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) throw new Error(extractApiErrorMessage(data, res.status));

    // ok:false but HTTP 200
    if (data && typeof data === "object" && data.ok === false) {
      throw new Error(extractApiErrorMessage(data, res.status));
    }

    // unwrap {ok:true,data:...}
    if (data && typeof data === "object" && data.ok === true && "data" in data) {
      return data.data;
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
    return !!r;
  } catch {
    return false;
  }
}

/* =========================
   API METHODS
========================= */
const api = {
  getDoctors: () => apiFetch("/api/doctors"),
  createDoctor: (payload) => apiFetch("/api/doctors", { method: "POST", body: payload }),
  updateDoctor: (id, payload) => apiFetch(`/api/doctors/${id}`, { method: "PUT", body: payload }),
  deleteDoctor: (id) => apiFetch(`/api/doctors/${id}`, { method: "DELETE" }),

  getServices: () => apiFetch("/api/services"),
  createService: (payload) => apiFetch("/api/services", { method: "POST", body: payload }),
  updateService: (id, payload) => apiFetch(`/api/services/${id}`, { method: "PUT", body: payload }),
  deleteService: (id) => apiFetch(`/api/services/${id}`, { method: "DELETE" }),

  getAppointments: () => apiFetch("/api/appointments"),
  createAppointment: (payload) => apiFetch("/api/appointments", { method: "POST", body: payload }),
  updateAppointment: (id, payload) => apiFetch(`/api/appointments/${id}`, { method: "PUT", body: payload }),
  deleteAppointment: (id) => apiFetch(`/api/appointments/${id}`, { method: "DELETE" }),
};

/* =========================
   ARCHIVE (local)
========================= */
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

/* =========================
   STATE
========================= */
const state = {
  doctors: [],
  services: [],
  appointments: [],
  archivedPatients: new Set(),
  ready: false,
};

function setDoctors(list) {
  state.doctors = Array.isArray(list) ? list : [];
}
function setServices(list) {
  state.services = Array.isArray(list) ? list : [];
}
function setAppointments(list) {
  state.appointments = Array.isArray(list) ? list : [];
}
function getDoctors() {
  return state.doctors;
}
function getServices() {
  return state.services;
}
function getAppointments() {
  return state.appointments;
}

/* =========================
   NORMALIZE (API -> UI)
========================= */
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
    doctorName: a.doctor_name ?? "",
    serviceName: a.service_name ?? "",
  };
}

/* =========================
   BUSINESS RULES
========================= */
function hasSlotConflict(all, { date, time, doctorId }, excludeId = null) {
  return (Array.isArray(all) ? all : []).some(
    (a) =>
      a.date === date &&
      a.time === time &&
      String(a.doctorId) === String(doctorId) &&
      (excludeId == null || String(a.id) !== String(excludeId)),
  );
}

/* =========================
   DOM
========================= */
const loginScreen = document.getElementById("loginScreen");
const mainScreen = document.getElementById("mainScreen");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const todayDateEl = document.getElementById("todayDate");

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

// tables
const doctorsTableBody = document.getElementById("doctorsTableBody");
const servicesTableBody = document.getElementById("servicesTableBody");
const allAppointmentsBody = document.getElementById("allAppointmentsBody");

// modals
const addDoctorBtn = document.getElementById("addDoctorBtn");
const doctorModalBackdrop = document.getElementById("doctorModalBackdrop");
const doctorModalTitle = document.getElementById("doctorModalTitle");
const doctorForm = document.getElementById("doctorForm");
const doctorNameInput = document.getElementById("doctorName");
const doctorSpecialityInput = document.getElementById("doctorSpeciality");
const doctorPercentInput = document.getElementById("doctorPercent");
const doctorActiveSelect = document.getElementById("doctorActive");
const doctorCancelBtn = document.getElementById("doctorCancelBtn");

const addServiceBtn = document.getElementById("addServiceBtn");
const serviceModalBackdrop = document.getElementById("serviceModalBackdrop");
const serviceModalTitle = document.getElementById("serviceModalTitle");
const serviceForm = document.getElementById("serviceForm");
const serviceNameInput = document.getElementById("serviceName");
const serviceCategoryInput = document.getElementById("serviceCategory");
const servicePriceInput = document.getElementById("servicePrice");
const serviceActiveSelect = document.getElementById("serviceActive");
const serviceCancelBtn = document.getElementById("serviceCancelBtn");

/* =========================
   LOGIN (FIX overlay clicks)
========================= */
function showLogin() {
  if (loginScreen) {
    loginScreen.classList.remove("hidden");
    loginScreen.style.display = "";
    loginScreen.style.pointerEvents = "auto";
  }
  if (mainScreen) {
    mainScreen.classList.add("hidden");
    mainScreen.style.display = "none";
    mainScreen.style.pointerEvents = "none";
  }
}

function showMain() {
  if (loginScreen) {
    loginScreen.classList.add("hidden");
    loginScreen.style.display = "none";
    loginScreen.style.pointerEvents = "none";
  }
  if (mainScreen) {
    mainScreen.classList.remove("hidden");
    mainScreen.style.display = "";
    mainScreen.style.pointerEvents = "auto";
  }
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

  const found = LOCAL_USERS.find((x) => x.username === u && x.password === p);
  if (found) {
    localStorage.setItem(LOGIN_KEY, "1");
    setAuthUser({ username: found.username, role: found.role });
    if (loginError) loginError.textContent = "";
    showMain();
    showToast(`Вход выполнен (${found.role})`, "success");
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
    localStorage.removeItem(AUTH_USER_KEY);
    showLogin();
    showToast("Вы вышли из CRM", "info");
  });
}

/* =========================
   NAV (WORKING)
========================= */
const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

function setActiveView(view) {
  navButtons.forEach((b) => b.classList.remove("active"));
  const btn = Array.from(navButtons).find((b) => b.getAttribute("data-view") === view);
  if (btn) btn.classList.add("active");

  views.forEach((v) => v.classList.remove("view--active"));
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) viewEl.classList.add("view--active");

  if (pageTitle && pageSubtitle) {
    const map = {
      dashboard: ["Дашборд", "Сводка по клинике"],
      appointments: ["Записи", "Создание и управление записями"],
      doctors: ["Врачи", "Справочник врачей"],
      services: ["Услуги", "Справочник услуг"],
      patients: ["Пациенты", "История пациентов"],
      reports: ["Отчёты", "Отчёты по клинике"],
    };
    const pair = map[view] || ["Kamilovs CRM", ""];
    pageTitle.textContent = pair[0];
    pageSubtitle.textContent = pair[1];
  }

  if (view === "dashboard") renderDashboard?.();
  if (view === "appointments") renderAppointmentsTable?.();
  if (view === "doctors") renderDoctors?.();
  if (view === "services") renderServices?.();
  if (view === "patients") renderPatients?.();
  if (view === "reports") {
    renderReportsDay?.();
    renderReportsMonthYear?.();
  }
}

function bindNav() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view) return;
      setActiveView(view);
    });
  });

  const active = document.querySelector(".nav-btn.active")?.getAttribute("data-view");
  setActiveView(active || "dashboard");
}

/* =========================
   SELECTS
========================= */
function fillDoctorSelect(selectEl, doctors, includeAll = false) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = includeAll ? "Все" : "Выберите врача";
  selectEl.appendChild(ph);

  (Array.isArray(doctors) ? doctors : [])
    .filter((d) => d && d.active !== false)
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
      return s.active !== false;
    })
    .forEach((srv) => {
      const option = document.createElement("option");
      option.value = String(srv.id);
      option.textContent = `${srv.name || "Без названия"} (${toNumber(srv.price, 0).toLocaleString("ru-RU")} UZS)`;
      selectEl.appendChild(option);
    });

  if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) {
    selectEl.value = prev;
  } else {
    selectEl.value = "";
  }
}

function refreshSelectsOnly() {
  fillDoctorSelect(apptDoctorSelect, getDoctors());
  fillServiceSelect(apptServiceSelect, getServices());
}

/* =========================
   BOOTSTRAP (API ONLY)
========================= */
async function bootstrapData() {
  state.archivedPatients = loadArchivedPatientsSetLocal();

  const okHealth = await apiHealth();
  if (!okHealth) {
    showToast("Сервер недоступен. Проверь Render.", "error");
    setDoctors([]);
    setServices([]);
    setAppointments([]);
    return { ok: false };
  }

  const [doctorsRaw, servicesRaw, apptsRaw] = await Promise.all([
    api.getDoctors(),
    api.getServices(),
    api.getAppointments(),
  ]);

  setDoctors((Array.isArray(doctorsRaw) ? doctorsRaw : []).map(normalizeDoctor).filter(Boolean));
  setServices((Array.isArray(servicesRaw) ? servicesRaw : []).map(normalizeService).filter(Boolean));
  setAppointments((Array.isArray(apptsRaw) ? apptsRaw : []).map(normalizeAppointment).filter(Boolean));

  return { ok: true };
}

/* =========================
   INIT AFTER LOGIN
========================= */
let _afterLoginInitialized = false;

function initAfterLoginOnce() {
  if (_afterLoginInitialized) return;
  _afterLoginInitialized = true;

  bindNav();

  const today = new Date();
  const todayISO = formatDateISO(today);

  if (todayDateEl) todayDateEl.textContent = today.toLocaleDateString("ru-RU");
  if (apptDateInput) apptDateInput.value = todayISO;
  if (rangeFromInput) rangeFromInput.value = todayISO;
  if (rangeToInput) rangeToInput.value = todayISO;

  bootstrapData()
    .then((result) => {
      state.ready = !!result?.ok;
      refreshSelectsOnly();
      renderAll();
      if (result?.ok) showToast("Данные загружены", "success");
    })
    .catch((e) => {
      console.error(e);
      showToast(e, "error");
    });
}

function renderAll() {
  renderDoctors();
  renderServices();
  renderAppointmentsTable();
  renderDashboard?.();
  renderPatients?.();
  renderReportsDay?.();
  renderReportsMonthYear?.();
}

/* =========================
   AUTO PRICE
========================= */
function bindServicePrice(selectEl, priceEl) {
  if (!selectEl || !priceEl) return;
  selectEl.addEventListener("change", () => {
    const id = String(selectEl.value || "");
    const service = getServices().find((s) => String(s.id) === id);
    if (service) priceEl.value = String(Math.trunc(toNumber(service.price, 0)));
  });
}
bindServicePrice(apptServiceSelect, apptPriceInput);

/* =========================
   CREATE APPOINTMENT
========================= */
if (apptForm) {
  apptForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const date = (apptDateInput?.value || "").trim();
    const time = (apptTimeInput?.value || "").trim();
    const doctorId = String(apptDoctorSelect?.value || "").trim();
    const patientName = normalizeName(apptPatientInput?.value || "");
    const phone = normalizePhone(apptPhoneInput?.value || "");
    const serviceIdStr = String(apptServiceSelect?.value || "").trim();

    const serviceId = Number(serviceIdStr); // DB uses int/bigint
    const price = Math.trunc(Math.max(0, toNumber(apptPriceInput?.value || 0)));

    const statusVisit = (apptStatusVisitSelect?.value || "scheduled").trim();
    const statusPayment = (apptStatusPaymentSelect?.value || "unpaid").trim();
    const paymentMethod = (apptPaymentMethodSelect?.value || "none").trim();

    if (!date) return showToast("Выберите дату", "error");
    if (!time) return showToast("Выберите время", "error");
    if (!doctorId) return showToast("Выберите врача", "error");
    if (!patientName) return showToast("Введите пациента", "error");
    if (!serviceIdStr || !Number.isFinite(serviceId)) return showToast("Выберите услугу", "error");

    if (hasSlotConflict(getAppointments(), { date, time, doctorId })) {
      return showToast("На это время у врача уже есть запись", "error");
    }

    const payloadApi = {
      date,
      time,
      doctorId,
      serviceId: Number(serviceId),
      patientName,
      phone,
      price,
      statusVisit,
      statusPayment,
      paymentMethod,
      note: "",
    };

    try {
      const created = await api.createAppointment(payloadApi);
      const normalized = normalizeAppointment(created);
      if (normalized) setAppointments([...getAppointments(), normalized]);

      if (apptTimeInput) apptTimeInput.value = "";
      if (apptPatientInput) apptPatientInput.value = "";
      if (apptPhoneInput) apptPhoneInput.value = "";

      showToast("Запись успешно добавлена", "success");
      renderAppointmentsTable();
      renderDashboard?.();
    } catch (err) {
      console.error(err);
      showToast(err, "error");
    }
  });
}

/* =========================
   DOCTORS CRUD
========================= */
let currentDoctorId = null;

function doctorToApiPayload(payload) {
  return {
    name: payload.name,
    speciality: payload.speciality || "",
    percent: Number(payload.percent ?? 0),
    active: !!payload.active,
  };
}

function renderDoctors() {
  refreshSelectsOnly();
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
      tr.querySelector('[data-action="delete"]')?.addEventListener("click", async () => deleteDoctor(d.id));
      doctorsTableBody.appendChild(tr);
    });
}

function openDoctorModal(id = null) {
  currentDoctorId = id;
  const doc = id ? getDoctors().find((d) => String(d.id) === String(id)) : null;

  if (doctorModalTitle) doctorModalTitle.textContent = id ? "Редактирование врача" : "Новый врач";
  if (doctorNameInput) doctorNameInput.value = doc?.name || "";
  if (doctorSpecialityInput) doctorSpecialityInput.value = doc?.speciality || "";
  if (doctorPercentInput) doctorPercentInput.value = String(doc?.percent ?? 40);
  if (doctorActiveSelect) doctorActiveSelect.value = doc?.active !== false ? "true" : "false";

  doctorModalBackdrop?.classList.remove("hidden");
}

function closeDoctorModal() {
  currentDoctorId = null;
  doctorModalBackdrop?.classList.add("hidden");
}

async function deleteDoctor(id) {
  if (!confirm("Удалить этого врача?")) return;
  try {
    await api.deleteDoctor(id);
    setDoctors(getDoctors().filter((d) => String(d.id) !== String(id)));
    renderAll();
    showToast("Врач удалён", "info");
  } catch (e) {
    console.error(e);
    showToast(e, "error");
  }
}

if (addDoctorBtn) addDoctorBtn.addEventListener("click", () => openDoctorModal(null));
if (doctorCancelBtn) doctorCancelBtn.addEventListener("click", closeDoctorModal);
doctorModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === doctorModalBackdrop) closeDoctorModal();
});

doctorForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = normalizeName(doctorNameInput?.value || "");
  const speciality = normalizeName(doctorSpecialityInput?.value || "");
  const percent = Math.min(100, Math.max(0, toNumber(doctorPercentInput?.value || 0)));
  const active = (doctorActiveSelect?.value || "true") === "true";

  if (!name) return showToast("Имя врача обязательно", "error");

  try {
    const payloadApi = doctorToApiPayload({ name, speciality, percent, active });

    if (currentDoctorId) {
      const updatedApi = await api.updateDoctor(currentDoctorId, payloadApi);
      const doctors = getDoctors().slice();
      const idx = doctors.findIndex((d) => String(d.id) === String(currentDoctorId));
      if (idx !== -1) doctors[idx] = normalizeDoctor(updatedApi) || doctors[idx];
      setDoctors(doctors);
      showToast("Врач обновлён", "success");
    } else {
      const createdApi = await api.createDoctor(payloadApi);
      setDoctors([...getDoctors(), normalizeDoctor(createdApi)].filter(Boolean));
      showToast("Врач добавлен", "success");
    }

    closeDoctorModal();
    renderAll();
  } catch (e2) {
    console.error(e2);
    showToast(e2, "error");
  }
});

/* =========================
   SERVICES CRUD
========================= */
let currentServiceId = null;

function serviceToApiPayload(payload) {
  return {
    name: payload.name,
    category: payload.category || "",
    price: Math.trunc(Math.max(0, Number(payload.price ?? 0))),
    active: !!payload.active,
  };
}

function renderServices() {
  refreshSelectsOnly();
  if (!servicesTableBody) return;
  const services = getServices();

  servicesTableBody.innerHTML = "";
  services
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"))
    .forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.name || "-"}</td>
        <td>${s.category || "-"}</td>
        <td class="col-amount">${moneyUZS(s.price || 0)}</td>
        <td>${s.active !== false ? "Да" : "Нет"}</td>
        <td class="col-actions">
          <button class="table-action-btn" data-action="edit" type="button" title="Редактировать">✏️</button>
          <button class="table-action-btn" data-action="delete" type="button" title="Удалить">🗑</button>
        </td>
      `;
      tr.querySelector('[data-action="edit"]')?.addEventListener("click", () => openServiceModal(s.id));
      tr.querySelector('[data-action="delete"]')?.addEventListener("click", async () => deleteService(s.id));
      servicesTableBody.appendChild(tr);
    });
}

function openServiceModal(id = null) {
  currentServiceId = id;
  const srv = id != null ? getServices().find((s) => String(s.id) === String(id)) : null;

  if (serviceModalTitle) serviceModalTitle.textContent = id ? "Редактирование услуги" : "Новая услуга";
  if (serviceNameInput) serviceNameInput.value = srv?.name || "";
  if (serviceCategoryInput) serviceCategoryInput.value = srv?.category || "";
  if (servicePriceInput) servicePriceInput.value = String(srv?.price ?? 0);
  if (serviceActiveSelect) serviceActiveSelect.value = srv?.active !== false ? "true" : "false";

  serviceModalBackdrop?.classList.remove("hidden");
}

function closeServiceModal() {
  currentServiceId = null;
  serviceModalBackdrop?.classList.add("hidden");
}

async function deleteService(id) {
  if (!confirm("Удалить эту услугу?")) return;
  try {
    await api.deleteService(id);
    setServices(getServices().filter((s) => String(s.id) !== String(id)));
    renderAll();
    showToast("Услуга удалена", "info");
  } catch (e) {
    console.error(e);
    showToast(e, "error");
  }
}

if (addServiceBtn) addServiceBtn.addEventListener("click", () => openServiceModal(null));
if (serviceCancelBtn) serviceCancelBtn.addEventListener("click", closeServiceModal);
serviceModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === serviceModalBackdrop) closeServiceModal();
});

serviceForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = normalizeName(serviceNameInput?.value || "");
  const category = normalizeName(serviceCategoryInput?.value || "");
  const price = Math.trunc(Math.max(0, toNumber(servicePriceInput?.value || 0)));
  const active = (serviceActiveSelect?.value || "true") === "true";

  if (!name) return showToast("Название услуги обязательно", "error");

  try {
    const payloadApi = serviceToApiPayload({ name, category, price, active });

    if (currentServiceId) {
      const updatedApi = await api.updateService(currentServiceId, payloadApi);
      const services = getServices().slice();
      const idx = services.findIndex((s) => String(s.id) === String(currentServiceId));
      if (idx !== -1) services[idx] = normalizeService(updatedApi) || services[idx];
      setServices(services);
      showToast("Услуга обновлена", "success");
    } else {
      const createdApi = await api.createService(payloadApi);
      setServices([...getServices(), normalizeService(createdApi)].filter(Boolean));
      showToast("Услуга добавлена", "success");
    }

    closeServiceModal();
    renderAll();
  } catch (e2) {
    console.error(e2);
    showToast(e2, "error");
  }
});

/* =========================
   APPOINTMENTS TABLE (simple)
========================= */
function renderAppointmentsTable() {
  if (!allAppointmentsBody) return;

  const appts = getAppointments().slice().sort((a, b) => {
    const ad = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    return ad;
  });

  allAppointmentsBody.innerHTML = "";

  appts.forEach((a) => {
    const doc = getDoctors().find((d) => String(d.id) === String(a.doctorId));
    const srv = getServices().find((s) => String(s.id) === String(a.serviceId));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.date || "-"}</td>
      <td>${a.time || "-"}</td>
      <td>${doc?.name || a.doctorName || "-"}</td>
      <td>${a.patientName || "-"}</td>
      <td>${a.phone || "-"}</td>
      <td>${srv?.name || a.serviceName || "-"}</td>
      <td class="col-amount">${moneyUZS(a.price || 0)}</td>
      <td>${a.statusVisit || "-"}</td>
      <td>${a.statusPayment || "-"}</td>
      <td>${a.paymentMethod || "-"}</td>
    `;
    allAppointmentsBody.appendChild(tr);
  });
}

/* =========================
   PLACEHOLDERS (safe)
========================= */
function renderDashboard() {}
function renderPatients() {}
function renderReportsDay() {}
function renderReportsMonthYear() {}

/* =========================
   ESC closes modals
========================= */
function closeAnyModalOnEsc(e) {
  if (e.key !== "Escape") return;

  const modals = [
    { el: doctorModalBackdrop, close: closeDoctorModal },
    { el: serviceModalBackdrop, close: closeServiceModal },
  ];

  for (const m of modals) {
    if (m.el && !m.el.classList.contains("hidden")) {
      m.close();
      break;
    }
  }
}
document.addEventListener("keydown", closeAnyModalOnEsc);

/* =========================
   START
========================= */
document.addEventListener("DOMContentLoaded", checkAuthOnLoad);
