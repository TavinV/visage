"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, refreshSession, tokenStore } from "./api";
import type { AuthTokens, AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  /** true enquanto restaura a sessão do localStorage no primeiro load. */
  restoring: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  const clearSession = useCallback(() => {
    tokenStore.setAccess(null);
    tokenStore.setRefresh(null);
    tokenStore.setStoredUser(null);
    setUser(null);
  }, []);

  // Restaura a sessão: se há refreshToken salvo, troca por um access token novo.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const refreshToken = tokenStore.getRefresh();
      const storedUser = tokenStore.getStoredUser<AuthUser>();
      if (!refreshToken || !storedUser) {
        setRestoring(false);
        return;
      }
      // refreshSession é deduplicado no módulo — seguro sob StrictMode,
      // que monta o provider duas vezes em desenvolvimento.
      const ok = await refreshSession();
      if (cancelled) return;
      if (ok) setUser(storedUser);
      else clearSession();
      setRestoring(false);
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Quando o refresh automático do api client falha, derruba a sessão.
  useEffect(() => {
    tokenStore.setSessionExpiredHandler(() => {
      clearSession();
      router.replace("/login");
    });
    return () => tokenStore.setSessionExpiredHandler(null);
  }, [clearSession, router]);

  const login = useCallback(
    async (email: string, password: string, remember = true): Promise<AuthUser> => {
      const res = await api.post<{ data: AuthTokens }>("/auth/login", { email, password });
      tokenStore.setAccess(res.data.accessToken);
      tokenStore.setRefresh(res.data.refreshToken, remember);
      tokenStore.setStoredUser(res.data.user);
      setUser(res.data.user);
      return res.data.user;
    },
    []
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { refreshToken });
      } catch {
        // sessão já inválida no servidor — segue com a limpeza local
      }
    }
    clearSession();
    router.replace("/login");
  }, [clearSession, router]);

  const value = useMemo(
    () => ({ user, restoring, login, logout }),
    [user, restoring, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
