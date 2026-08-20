/**
 * Normalização e validação de documentos do aluno (CPF/CNPJ).
 *
 * Usado no cadastro do painel e na identificação do aluno no totem — a
 * instituição escolhe em tenant_settings se registra CPF, matrícula ou ambos
 * (ver utils/identification.ts).
 */

/** Remove pontos, hífens e barras — armazena CPF/CNPJ apenas com dígitos */
export function normalizeDocument(doc: string): string {
  return doc.replace(/[.\-/]/g, "");
}

/** Valida CPF normalizado (11 dígitos) com verificação matemática dos dígitos verificadores */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  // Rejeitar sequências homogêneas (00000000000, 11111111111, ...)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let remainder = sum % 11;
  if ((remainder < 2 ? 0 : 11 - remainder) !== parseInt(cpf[9])) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  remainder = sum % 11;
  return (remainder < 2 ? 0 : 11 - remainder) === parseInt(cpf[10]);
}

/** Valida CNPJ normalizado (14 dígitos numéricos) */
export function isValidCnpj(cnpj: string): boolean {
  return /^\d{14}$/.test(cnpj);
}
