export interface INursesRepository {
  findDoctorIdByUserId(userId: number): Promise<number | null>;
  upsert(userId: number, doctorId: number): Promise<void>;
  deleteByUserId(userId: number): Promise<void>;
}
