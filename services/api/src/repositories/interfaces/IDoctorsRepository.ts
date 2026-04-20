import type { Doctor, DoctorCreateInput, DoctorUpdateInput } from "./coreTypes";

export interface IDoctorsRepository {
  findAll(): Promise<Doctor[]>;
  findById(id: number): Promise<Doctor | null>;
  create(data: DoctorCreateInput): Promise<Doctor>;
  update(id: number, data: DoctorUpdateInput): Promise<Doctor | null>;
  delete(id: number): Promise<boolean>;
}
