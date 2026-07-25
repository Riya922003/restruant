"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { AuthUser, LoginResponse } from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, if a token exists, hydrate the user from /me. A stale or
  // invalid token clears itself via the 401 handling in apiFetch.
  useEffect(() => {
    let active = true;
    async function hydrate() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.get<AuthUser>("/auth/me");
        if (active) setUser(me);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    hydrate();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<LoginResponse>("/auth/login", { email, password });
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore network errors on logout; we clear the client session regardless.
    }
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
