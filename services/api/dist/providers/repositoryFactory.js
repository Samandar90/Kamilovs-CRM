"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRepositories = void 0;
const env_1 = require("../config/env");
const appointmentsRepository_1 = require("../repositories/appointmentsRepository");
const cashRegisterRepository_1 = require("../repositories/cashRegisterRepository");
const doctorsRepository_1 = require("../repositories/doctorsRepository");
const expensesRepository_1 = require("../repositories/expensesRepository");
const invoicesRepository_1 = require("../repositories/invoicesRepository");
const patientsRepository_1 = require("../repositories/patientsRepository");
const paymentsRepository_1 = require("../repositories/paymentsRepository");
const reportsRepository_1 = require("../repositories/reportsRepository");
const servicesRepository_1 = require("../repositories/servicesRepository");
const nursesRepository_1 = require("../repositories/nursesRepository");
const usersRepository_1 = require("../repositories/usersRepository");
const PostgresAppointmentsRepository_1 = require("../repositories/postgres/PostgresAppointmentsRepository");
const PostgresCashRegisterRepository_1 = require("../repositories/postgres/PostgresCashRegisterRepository");
const PostgresDoctorsRepository_1 = require("../repositories/postgres/PostgresDoctorsRepository");
const PostgresExpensesRepository_1 = require("../repositories/postgres/PostgresExpensesRepository");
const PostgresInvoicesRepository_1 = require("../repositories/postgres/PostgresInvoicesRepository");
const PostgresPatientsRepository_1 = require("../repositories/postgres/PostgresPatientsRepository");
const PostgresPaymentsRepository_1 = require("../repositories/postgres/PostgresPaymentsRepository");
const PostgresReportsRepository_1 = require("../repositories/postgres/PostgresReportsRepository");
const PostgresServicesRepository_1 = require("../repositories/postgres/PostgresServicesRepository");
const PostgresNursesRepository_1 = require("../repositories/postgres/PostgresNursesRepository");
const PostgresUsersRepository_1 = require("../repositories/postgres/PostgresUsersRepository");
const createRepositories = () => {
    if (env_1.env.dataProvider === "postgres") {
        return {
            patients: new PostgresPatientsRepository_1.PostgresPatientsRepository(),
            doctors: new PostgresDoctorsRepository_1.PostgresDoctorsRepository(),
            services: new PostgresServicesRepository_1.PostgresServicesRepository(),
            appointments: new PostgresAppointmentsRepository_1.PostgresAppointmentsRepository(),
            invoices: new PostgresInvoicesRepository_1.PostgresInvoicesRepository(),
            payments: new PostgresPaymentsRepository_1.PostgresPaymentsRepository(),
            expenses: new PostgresExpensesRepository_1.PostgresExpensesRepository(),
            cashRegister: new PostgresCashRegisterRepository_1.PostgresCashRegisterRepository(),
            reports: new PostgresReportsRepository_1.PostgresReportsRepository(),
            users: new PostgresUsersRepository_1.PostgresUsersRepository(),
            nurses: new PostgresNursesRepository_1.PostgresNursesRepository(),
        };
    }
    return {
        patients: new patientsRepository_1.MockPatientsRepository(),
        doctors: new doctorsRepository_1.MockDoctorsRepository(),
        services: new servicesRepository_1.MockServicesRepository(),
        appointments: new appointmentsRepository_1.MockAppointmentsRepository(),
        invoices: new invoicesRepository_1.MockInvoicesRepository(),
        payments: new paymentsRepository_1.MockPaymentsRepository(),
        expenses: new expensesRepository_1.MockExpensesRepository(),
        cashRegister: new cashRegisterRepository_1.MockCashRegisterRepository(),
        reports: new reportsRepository_1.MockReportsRepository(),
        users: new usersRepository_1.MockUsersRepository(),
        nurses: new nursesRepository_1.MockNursesRepository(),
    };
};
exports.createRepositories = createRepositories;
