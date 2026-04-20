import type { INursesRepository } from "./interfaces/INursesRepository";
import { getMockDb, nextId } from "./mockDatabase";

type NurseRecord = { id: number; userId: number; doctorId: number };

export class MockNursesRepository implements INursesRepository {
  async findDoctorIdByUserId(userId: number): Promise<number | null> {
    const row = getMockDb().nurses.find((n) => n.userId === userId);
    return row ? row.doctorId : null;
  }

  async upsert(userId: number, doctorId: number): Promise<void> {
    const db = getMockDb();
    const idx = db.nurses.findIndex((n) => n.userId === userId);
    if (idx >= 0) {
      db.nurses[idx] = { ...db.nurses[idx], doctorId };
    } else {
      db.nurses.push({ id: nextId(), userId, doctorId });
    }
  }

  async deleteByUserId(userId: number): Promise<void> {
    const db = getMockDb();
    db.nurses = db.nurses.filter((n) => n.userId !== userId);
  }
}
