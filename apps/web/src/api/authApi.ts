import { requestJson } from "./http";
import type { AuthResponse, LoginInput, PublicUser } from "../auth/types";

export const authApi = {
  login: (input: LoginInput) =>
    requestJson<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: input,
    }),

  logout: (token?: string | null) =>
    requestJson<{ success: boolean; message: string }>("/api/auth/logout", {
      method: "POST",
      token: token ?? null,
    }),

  getMe: (token: string) =>
    requestJson<PublicUser>("/api/auth/me", {
      method: "GET",
      token,
    }),
};
