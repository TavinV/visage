"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Skeleton";
import type { Role } from "@/lib/types";

interface GuardProps {
  /** Roles autorizados neste grupo de rotas. */
  allow: Role[];
  children: ReactNode;
}

/**
 * Protege um grupo de rotas no client (os tokens não vivem em cookie,
 * então middleware do Next não enxerga a sessão). Enquanto a sessão é
 * restaurada exibe um estado de carregamento neutro.
 */
export function Guard({ allow, children }: GuardProps) {
  const { user, restoring } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (restoring) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // Senha temporária: nada de console antes da troca obrigatória
    if (user.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    if (!allow.includes(user.role)) {
      // Sessão válida no console errado — manda para o console do role
      router.replace(user.role === "super_admin" ? "/admin" : "/dashboard");
    }
  }, [user, restoring, allow, router]);

  if (restoring || !user || user.mustChangePassword || !allow.includes(user.role)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-flauzino-slate-50">
        <Logo variant="stacked" size={40} className="text-flauzino-navy-900" />
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}
