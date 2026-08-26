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
    tokenStore.setStoredUser(null);
    setUser(null);
  }, []);

  // Restaura a sessão: o refresh token vive num cookie httpOnly, invisível
  // aqui — a única forma de saber se ainda é válido é tentar trocá-lo. O
  // perfil salvo em localStorage só serve de sinal para não bater no backend
  // em toda página pública (landing, login) sem sessão nenhuma.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const storedUser = tokenStore.getStoredUser<AuthUser>();
      if (!storedUser) {
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
      // O backend seta access_token + refresh_token como cookies httpOnly no
      // Set-Cookie da resposta — o client só recebe o perfil do usuário.
      const res = await api.post<{ data: Pick<AuthTokens, "user"> }>("/auth/login", {
        email,
        password,
        remember,
      });
      tokenStore.setStoredUser(res.data.user);
      setUser(res.data.user);
      return res.data.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      // Sem body: o backend lê o refresh token do cookie httpOnly.
      await api.post("/auth/logout");
    } catch {
      // sessão já inválida no servidor — segue com a limpeza local
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
