/**
 * Política de identificação do aluno.
 *
 * Cada instituição decide o que registra no cadastro (CPF, matrícula interna
 * ou os dois) e o que o aluno digita no totem antes da biometria. As duas
 * escolhas são independentes — é comum registrar CPF na secretaria e pedir só
 * a matrícula no totem —, mas o totem nunca pode pedir um identificador que a
 * instituição não registra: `resolve()` corrige combinações impossíveis em vez
 * de deixar o totem sem caminho de cadastro.
 */

/** O que a secretaria registra no cadastro do aluno. */
export type StudentIdentification = "cpf" | "enrollment_code" | "both";

/** O que o aluno digita no totem. `any` aceita CPF ou matrícula. */
export type TotemIdentification = "cpf" | "enrollment_code" | "any";

export interface IdentificationPolicy {
  studentIdentification: StudentIdentification;
  totemIdentification: TotemIdentification;
  validateCpf: boolean;
}

export const STUDENT_IDENTIFICATION_VALUES = [
  "cpf",
  "enrollment_code",
  "both",
] as const satisfies readonly StudentIdentification[];

export const TOTEM_IDENTIFICATION_VALUES = [
  "cpf",
  "enrollment_code",
  "any",
] as const satisfies readonly TotemIdentification[];

/** Comportamento histórico: CPF no cadastro, CPF no totem, validação ligada. */
export const DEFAULT_IDENTIFICATION: IdentificationPolicy = {
  studentIdentification: "cpf",
  totemIdentification: "cpf",
  validateCpf: true,
};

/** O cadastro exige CPF do aluno. */
export function registersCpf(mode: StudentIdentification): boolean {
  return mode === "cpf" || mode === "both";
}

/** O cadastro exige matrícula interna do aluno. */
export function registersEnrollmentCode(mode: StudentIdentification): boolean {
  return mode === "enrollment_code" || mode === "both";
}

/**
 * Resolve a política efetiva a partir das configurações do tenant, ajustando
 * o modo do totem ao que é realmente registrado.
 */
export function resolveIdentification(settings: {
  studentIdentification?: string | null;
  totemIdentification?: string | null;
  validateCpf?: boolean | null;
} | null): IdentificationPolicy {
  const studentIdentification = (STUDENT_IDENTIFICATION_VALUES as readonly string[]).includes(
    settings?.studentIdentification ?? ""
  )
    ? (settings!.studentIdentification as StudentIdentification)
    : DEFAULT_IDENTIFICATION.studentIdentification;

  let totemIdentification = (TOTEM_IDENTIFICATION_VALUES as readonly string[]).includes(
    settings?.totemIdentification ?? ""
  )
    ? (settings!.totemIdentification as TotemIdentification)
    : DEFAULT_IDENTIFICATION.totemIdentification;

  // O totem não pode pedir o que não é registrado
  if (!registersCpf(studentIdentification) && totemIdentification !== "enrollment_code") {
    totemIdentification = "enrollment_code";
  }
  if (!registersEnrollmentCode(studentIdentification) && totemIdentification !== "cpf") {
    totemIdentification = "cpf";
  }

  return {
    studentIdentification,
    totemIdentification,
    validateCpf: settings?.validateCpf ?? DEFAULT_IDENTIFICATION.validateCpf,
  };
}

/** Rótulo do identificador pedido no totem — usado em mensagens de erro. */
export function totemIdentifierLabel(mode: TotemIdentification): string {
  if (mode === "cpf") return "CPF";
  if (mode === "enrollment_code") return "matrícula";
  return "CPF ou matrícula";
}
