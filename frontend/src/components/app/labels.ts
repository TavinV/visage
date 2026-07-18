import type { LucideIcon } from "lucide-react";
import { ShieldCheck, ClipboardList, Presentation, GraduationCap } from "lucide-react";

export interface RoleOption {
  value: "admin" | "manager" | "teacher" | "student";
  label: string;
  description: string;
  icon: LucideIcon;
}

// "Cargo" na UI (não "papel") — preferência do produto
export const roleOptions: RoleOption[] = [
  {
    value: "admin",
    label: "Administrador",
    description: "Gerencia tudo na instituição",
    icon: ShieldCheck,
  },
  {
    value: "manager",
    label: "Coordenação",
    description: "Relatórios e auditoria",
    icon: ClipboardList,
  },
  {
    value: "teacher",
    label: "Professor",
    description: "Acompanha suas turmas",
    icon: Presentation,
  },
  {
    value: "student",
    label: "Aluno",
    description: "Presença pelo totem",
    icon: GraduationCap,
  },
];

export const roleLabel = (role: string) =>
  roleOptions.find((r) => r.value === role)?.label ?? role;
