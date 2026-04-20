import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UsersFilters,
} from "./userTypes";

export interface IUsersRepository {
  findAll(filters?: UsersFilters): Promise<User[]>;
  findById(id: number): Promise<User | null>;
  /** Логин: только активные пользователи (совпадает с SQL в Postgres). */
  findByUsername(username: string): Promise<User | null>;
  /** Проверка уникальности username при создании/смене (включая неактивные записи). */
  findByUsernameIncludingInactive(username: string): Promise<User | null>;
  /**
   * Активный пользователь с ролью doctor, привязанный к профилю врача (1 аккаунт на врача).
   */
  findActiveDoctorUserIdByDoctorProfile(
    doctorId: number,
    excludeUserId?: number
  ): Promise<number | null>;
  create(data: CreateUserInput): Promise<User>;
  update(id: number, data: UpdateUserInput): Promise<User | null>;
  delete(id: number): Promise<boolean>;
  toggleActive(id: number): Promise<User | null>;
  updatePassword(id: number, passwordHash: string): Promise<User | null>;
  updateSecurityState(
    id: number,
    patch: Partial<{
      lastLoginAt: string | null;
      failedLoginAttempts: number;
      lockedUntil: string | null;
    }>
  ): Promise<User | null>;
}
