"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMockDb = exports.nextId = exports.ensureMockSeedData = void 0;
const password_1 = require("../utils/password");
const nowIso = () => new Date().toISOString();
const createId = () => Date.now() + Math.floor(Math.random() * 1000);
const mockDb = {
    patients: [],
    doctors: [],
    services: [],
    doctorServices: [],
    appointments: [],
    invoices: [],
    invoiceItems: [],
    payments: [],
    expenses: [],
    cashRegisterShifts: [],
    cashRegisterEntries: [],
    users: [],
    nurses: [],
};
let seeded = false;
/** Только первый вход в режиме mock; клинические сущности — пустые до действий пользователя. */
const ensureMockSeedData = () => {
    if (seeded)
        return;
    seeded = true;
    const createdAt = nowIso();
    mockDb.users = [
        {
            id: createId(),
            username: "admin",
            password: (0, password_1.hashPasswordSync)("admin123"),
            fullName: "Administrator",
            role: "superadmin",
            isActive: true,
            lastLoginAt: null,
            failedLoginAttempts: 0,
            lockedUntil: null,
            doctorId: null,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
        },
    ];
};
exports.ensureMockSeedData = ensureMockSeedData;
const nextId = () => createId();
exports.nextId = nextId;
const getMockDb = () => mockDb;
exports.getMockDb = getMockDb;
