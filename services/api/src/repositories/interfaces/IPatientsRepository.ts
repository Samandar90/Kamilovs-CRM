import type {
  Patient,
  PatientCreateInput,
  PatientFilters,
  PatientUpdateInput,
} from "./coreTypes";

export interface IPatientsRepository {
  findAll(filters?: PatientFilters): Promise<Patient[]>;
  findById(id: number): Promise<Patient | null>;
  create(data: PatientCreateInput): Promise<Patient>;
  update(id: number, data: PatientUpdateInput): Promise<Patient | null>;
  delete(id: number): Promise<boolean>;
}
