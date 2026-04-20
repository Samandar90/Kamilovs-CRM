import type { PublicUser, User } from "../repositories/interfaces/userTypes";

export const toPublicUser = (user: User): PublicUser => {
  const { password: _password, ...publicUser } = user;
  return publicUser;
};
