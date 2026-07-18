"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Tenant, User } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { adminNav, tenantNav } from "./nav";

const roleLabels: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  manager: "Coordenação",
  teacher: "Professor",
  student: "Aluno",
};

interface AppShellProps {
  /** Ícones não serializam entre server e client — a navegação é resolvida aqui. */
  variant: "admin" | "tenant";
  children: React.ReactNode;
}

export function AppShell({ variant, children }: AppShellProps) {
  const sections = variant === "admin" ? adminNav : tenantNav;
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Nome da instituição na sidebar: o login não retorna o tenant, então o
  // perfil fornece o tenantId e a rota de tenants libera o próprio tenant.
  const profile = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api.get<{ data: User }>("/users/me/profile"),
    enabled: variant === "tenant",
    staleTime: Infinity,
  });
  const tenantId = profile.data?.data.tenantId;
  const tenant = useQuery({
    queryKey: ["my-tenant", tenantId],
    queryFn: () => api.get<{ data: Tenant }>(`/tenants/${tenantId}`),
    enabled: variant === "tenant" && !!tenantId,
    staleTime: Infinity,
  });
  const institutionName =
    variant === "tenant" ? tenant.data?.data.name : "Administração da plataforma";

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || (user && item.roles.includes(user.role))
      ),
    }))
    .filter((section) => section.items.length > 0);

  const activeItem = visibleSections
    .flatMap((s) => s.items)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    // rota mais específica vence (ex.: /dashboard/users sobre /dashboard)
    .sort((a, b) => b.href.length - a.href.length)[0];

  const homeHref = sections[0]?.items[0]?.href ?? "/";

  const sidebar = (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-flauzino-navy-900 px-4 py-6 text-white shadow-fl-lg">
      <div className="px-2 pb-4">
        <Link href={homeHref} className="text-white">
          <Logo variant="lockup" size={30} className="text-white" />
        </Link>
      </div>

      {institutionName && (
        <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <Building2 size={15} strokeWidth={1.75} className="shrink-0 text-flauzino-accent-500" />
          <span className="truncate text-xs font-medium text-white/80" title={institutionName}>
            {institutionName}
          </span>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <div className="px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = activeItem?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-flauzino-accent-600 text-white shadow-fl-sm"
                      : "text-[#c4cede] hover:bg-white/5 hover:text-white"
                  )}
                >
                  <item.icon
                    size={17}
                    strokeWidth={1.75}
                    className={cn(
                      "transition-colors duration-150",
                      !active && "text-white/50 group-hover:text-flauzino-accent-500"
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-4 flex items-center gap-2.5 border-t border-white/10 pt-4">
        {user && <Avatar name={user.name} size="sm" className="bg-flauzino-accent-600" />}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">{user?.name}</p>
          <p className="truncate text-[11px] text-white/50">
            {user ? roleLabels[user.role] ?? user.role : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          title="Sair"
          aria-label="Sair"
          className="rounded-lg p-2 text-[#c4cede] transition-colors hover:bg-white/5 hover:text-flauzino-accent-500 focus-visible:outline-none focus-visible:shadow-fl-focus"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-flauzino-slate-50 text-flauzino-slate-700">
      {/* Sidebar fixa em telas médias+ */}
      <div className="hidden md:block">{sidebar}</div>

      {/* Sidebar móvel */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-flauzino-navy-900/55"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-flauzino-slate-200 bg-white px-5 shadow-fl-xs md:px-7">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Abrir menu"
            className="rounded-lg border border-flauzino-slate-200 p-2 text-flauzino-slate-500 transition-colors hover:border-flauzino-accent-500 hover:text-flauzino-accent-600 md:hidden"
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
          {activeItem && (
            <span className="hidden h-9 w-9 items-center justify-center rounded-lg bg-flauzino-accent-50 text-flauzino-accent-600 sm:flex">
              <activeItem.icon size={17} strokeWidth={1.75} />
            </span>
          )}
          <p className="min-w-0 truncate text-lg font-semibold tracking-tight text-flauzino-navy-900">
            {activeItem?.label ?? "Console"}
          </p>
        </header>
        <main className="flex-1 overflow-y-auto p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
