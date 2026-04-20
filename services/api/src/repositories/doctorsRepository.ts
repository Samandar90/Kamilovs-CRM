import type { IDoctorsRepository } from "./interfaces/IDoctorsRepository";
import type {
  Doctor,
  DoctorCreateInput,
  DoctorUpdateInput,
} from "./interfaces/coreTypes";
import { type DoctorRecord, getMockDb, nextId } from "./mockDatabase";
export type { Doctor, DoctorCreateInput, DoctorUpdateInput };

const toDoctor = (row: DoctorRecord): Doctor => {
  const serviceIds = getMockDb()
    .doctorServices.filter((item) => item.doctorId === row.id)
    .map((item) => item.serviceId);
  return { ...row, serviceIds };
};

export class MockDoctorsRepository implements IDoctorsRepository {
  async findAll(): Promise<Doctor[]> {
    return [...getMockDb().doctors]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toDoctor);
  }

  async findById(id: number): Promise<Doctor | null> {
    const doctor = getMockDb().doctors.find((item) => item.id === id);
    return doctor ? toDoctor(doctor) : null;
  }

  async create(payload: DoctorCreateInput): Promise<Doctor> {
    const { serviceIds = [], ...doctorData } = payload;
    const created: DoctorRecord = {
      id: nextId(),
      createdAt: new Date().toISOString(),
      ...doctorData,
    };
    const db = getMockDb();
    db.doctors.push(created);
    db.doctorServices = db.doctorServices.filter((item) => item.doctorId !== created.id);
    serviceIds.forEach((serviceId) => {
      db.doctorServices.push({ doctorId: created.id, serviceId });
    });
    return toDoctor(created);
  }

  async update(id: number, payload: DoctorUpdateInput): Promise<Doctor | null> {
    const db = getMockDb();
    const idx = db.doctors.findIndex((item) => item.id === id);
    if (idx < 0) return null;
    const { serviceIds, ...doctorData } = payload;
    db.doctors[idx] = { ...db.doctors[idx], ...doctorData };
    if (serviceIds !== undefined) {
      db.doctorServices = db.doctorServices.filter((item) => item.doctorId !== id);
      serviceIds.forEach((serviceId) => {
        db.doctorServices.push({ doctorId: id, serviceId });
      });
    }
    return toDoctor(db.doctors[idx]);
  }

  async delete(id: number): Promise<boolean> {
    const db = getMockDb();
    const idx = db.doctors.findIndex((item) => item.id === id);
    if (idx < 0) return false;
    db.doctors[idx] = { ...db.doctors[idx], active: false };
    return true;
  }
}
