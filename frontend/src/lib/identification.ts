/**
 * Política de identificação do aluno — espelha backend/src/utils/identification.
 *
 * O console usa isto para decidir quais campos exigir no cadastro e o totem,
 * para saber o que pedir na tela de identificação.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { StudentIdentification, TenantSettings, TotemIdentification } from "./types";

/** A instituição registra CPF do aluno. */
export function registersCpf(mode: StudentIdentification | undefined): boolean {
  return mode !== "enrollment_code";
}

/** A instituição registra matrícula interna do aluno. */
export function registersEnrollmentCode(mode: StudentIdentification | undefined): boolean {
  return mode === "enrollment_code" || mode === "both";
}

/** Rótulo do campo pedido no totem. */
export function totemIdentifierLabel(mode: TotemIdentification | undefined): string {
  if (mode === "enrollment_code") return "matrícula";
  if (mode === "any") return "CPF ou matrícula";
  return "CPF";
}

/**
 * Configurações da instituição em cache compartilhado com a tela de
 * Configurações — a mesma queryKey evita uma segunda requisição por página.
 */
export function useTenantSettings() {
  return useQuery({
    queryKey: ["tenant-settings"],
    queryFn: () => api.get<{ data: TenantSettings }>("/tenant-settings"),
    staleTime: 5 * 60 * 1000,
  });
}
