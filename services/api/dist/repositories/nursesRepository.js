"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockNursesRepository = void 0;
const mockDatabase_1 = require("./mockDatabase");
class MockNursesRepository {
    async findDoctorIdByUserId(userId) {
        const row = (0, mockDatabase_1.getMockDb)().nurses.find((n) => n.userId === userId);
        return row ? row.doctorId : null;
    }
    async upsert(userId, doctorId) {
        const db = (0, mockDatabase_1.getMockDb)();
        const idx = db.nurses.findIndex((n) => n.userId === userId);
        if (idx >= 0) {
            db.nurses[idx] = { ...db.nurses[idx], doctorId };
        }
        else {
            db.nurses.push({ id: (0, mockDatabase_1.nextId)(), userId, doctorId });
        }
    }
    async deleteByUserId(userId) {
        const db = (0, mockDatabase_1.getMockDb)();
        db.nurses = db.nurses.filter((n) => n.userId !== userId);
    }
}
exports.MockNursesRepository = MockNursesRepository;
