import type { UserRole } from "@/types/roles";

// Shape of the user returned by the API (mirrors the backend toPublicUser
// mapper). password_hash is never sent.
export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};
