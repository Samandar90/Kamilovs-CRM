"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.services = void 0;
const appointmentsService_1 = require("../services/appointmentsService");
const authService_1 = require("../services/authService");
const cashRegisterService_1 = require("../services/cashRegisterService");
const doctorsService_1 = require("../services/doctorsService");
const expensesService_1 = require("../services/expensesService");
const invoicesService_1 = require("../services/invoicesService");
const patientsService_1 = require("../services/patientsService");
const paymentsService_1 = require("../services/paymentsService");
const reportsService_1 = require("../services/reportsService");
const servicesService_1 = require("../services/servicesService");
const aiService_1 = require("../services/aiService");
const aiAssistantService_1 = require("../services/aiAssistantService");
const aiRecommendationsService_1 = require("../services/aiRecommendationsService");
const usersService_1 = require("../services/usersService");
const repositories_1 = require("./repositories");
exports.services = {
    patients: new patientsService_1.PatientsService(repositories_1.repositories.patients, repositories_1.repositories.appointments),
    doctors: new doctorsService_1.DoctorsService(repositories_1.repositories.doctors, repositories_1.repositories.services),
    services: new servicesService_1.ServicesService(repositories_1.repositories.services),
    appointments: new appointmentsService_1.AppointmentsService(repositories_1.repositories.appointments),
    invoices: new invoicesService_1.InvoicesService(repositories_1.repositories.invoices, repositories_1.repositories.services),
    payments: new paymentsService_1.PaymentsService(repositories_1.repositories.payments, repositories_1.repositories.cashRegister),
    expenses: new expensesService_1.ExpensesService(repositories_1.repositories.expenses),
    cashRegister: new cashRegisterService_1.CashRegisterService(repositories_1.repositories.cashRegister),
    reports: new reportsService_1.ReportsService(repositories_1.repositories.reports),
    users: new usersService_1.UsersService(repositories_1.repositories.users, repositories_1.repositories.doctors, repositories_1.repositories.nurses),
    auth: new authService_1.AuthService(repositories_1.repositories.users, repositories_1.repositories.nurses),
    aiAssistant: new aiAssistantService_1.AIAssistantService(),
    aiService: new aiService_1.AIService(repositories_1.repositories.users),
    aiRecommendations: new aiRecommendationsService_1.AIRecommendationsService(repositories_1.repositories.reports),
};
