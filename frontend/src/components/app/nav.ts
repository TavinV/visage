import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  CalendarRange,
  BookOpen,
  GraduationCap,
  MapPin,
  MonitorSmartphone,
  ScanFace,
  BarChart3,
  ShieldCheck,
  Settings,
  Building2,
  CreditCard,
  Activity,
  KeyRound,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles que enxergam o item; ausente = todos os roles do console. */
  roles?: Role[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const tenantNav: NavSection[] = [
  {
    label: "Visão geral",
    items: [{ href: "/dashboard", label: "Painel", icon: LayoutDashboard }],
  },
  {
    label: "Pessoas",
    items: [{ href: "/dashboard/users", label: "Usuários", icon: Users, roles: ["admin"] }],
  },
  {
    label: "Estrutura acadêmica",
    items: [
      { href: "/dashboard/periods", label: "Períodos", icon: CalendarRange, roles: ["admin"] },
      { href: "/dashboard/courses", label: "Cursos", icon: BookOpen, roles: ["admin", "teacher"] },
      { href: "/dashboard/classes", label: "Turmas", icon: GraduationCap, roles: ["admin", "teacher"] },
      { href: "/dashboard/locations", label: "Salas de aula", icon: MapPin, roles: ["admin", "teacher"] },
      { href: "/dashboard/devices", label: "Dispositivos", icon: MonitorSmartphone, roles: ["admin"] },
    ],
  },
  {
    label: "Presença",
    items: [
      { href: "/dashboard/sessions", label: "Chamadas", icon: ScanFace, roles: ["admin", "teacher"] },
      { href: "/dashboard/reports", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/dashboard/audit", label: "Auditoria", icon: ShieldCheck, roles: ["admin", "manager"] },
      { href: "/dashboard/settings", label: "Configurações", icon: Settings, roles: ["admin"] },
    ],
  },
];

export const adminNav: NavSection[] = [
  {
    label: "Visão geral",
    items: [{ href: "/admin", label: "Painel", icon: LayoutDashboard }],
  },
  {
    label: "Plataforma",
    items: [
      { href: "/admin/tenants", label: "Instituições", icon: Building2 },
      { href: "/admin/plans", label: "Planos", icon: CreditCard },
    ],
  },
  {
    label: "Monitoramento",
    items: [
      { href: "/admin/logs", label: "Logs de reconhecimento", icon: ScanFace },
      { href: "/admin/engine", label: "Saúde da engine", icon: Activity },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/admin/account", label: "Conta", icon: KeyRound }],
  },
];
