import bcrypt from "bcrypt";

const DEFAULT_SALT_ROUNDS = 10;

export const hashPassword = async (
  plainTextPassword: string,
  saltRounds = DEFAULT_SALT_ROUNDS
): Promise<string> => {
  return bcrypt.hash(plainTextPassword, saltRounds);
};

export const hashPasswordSync = (
  plainTextPassword: string,
  saltRounds = DEFAULT_SALT_ROUNDS
): string => {
  return bcrypt.hashSync(plainTextPassword, saltRounds);
};

export const verifyPassword = async (
  plainTextPassword: string,
  persistedPassword: string
): Promise<boolean> => {
  if (!persistedPassword) {
    return false;
  }
  return bcrypt.compare(plainTextPassword, persistedPassword);
};
