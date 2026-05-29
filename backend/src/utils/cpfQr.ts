/**
 * Utilitários de QR Code de consentimento baseado em CPF.
 *
 * O QR code é um payload AES-256-GCM do CPF do aluno cifrado com QR_SECRET_KEY.
 * Layout do buffer: iv(12) | tag(16) | ciphertext(n) → base64url
 *
 * Regras de segurança:
 * - IV gerado com randomBytes(12) por operação — nunca reutilizado
 * - InvalidTag jamais é silenciado — re-lançado como ValidationError
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { config } from "../lib/config";
import { ValidationError } from "./errors";

const IV_SIZE = 12;
const TAG_SIZE = 16;

// ---------------------------------------------------------------------------
// Normalização de documentos
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// QR Code
// ---------------------------------------------------------------------------

function getQrKey(): Buffer {
  const hex = config.qrSecretKey;
  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error("QR_SECRET_KEY deve ter 64 caracteres hexadecimais (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

interface QrPayload {
  t: string; // tenantId
  c: string; // CPF normalizado
}

/**
 * Gera o payload criptografado para o QR code do aluno.
 * @param tenantId  ID do tenant
 * @param cpf       CPF normalizado (apenas dígitos)
 * @returns string base64url — conteúdo do QR code
 */
export function generateCpfQrPayload(tenantId: string, cpf: string): string {
  const key = getQrKey();
  const iv = randomBytes(IV_SIZE);

  const plaintext = JSON.stringify({ t: tenantId, c: cpf } satisfies QrPayload);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

/**
 * Decifra o payload do QR code e retorna tenantId + CPF.
 * Lança ValidationError se o payload for inválido ou adulterado.
 */
export function decodeCpfQrPayload(encoded: string): { tenantId: string; cpf: string } {
  const key = getQrKey();

  let buf: Buffer;
  try {
    buf = Buffer.from(encoded, "base64url");
  } catch {
    throw new ValidationError("QR code inválido");
  }

  if (buf.length < IV_SIZE + TAG_SIZE + 1) {
    throw new ValidationError("QR code inválido");
  }

  const iv = buf.subarray(0, IV_SIZE);
  const tag = buf.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const ct = buf.subarray(IV_SIZE + TAG_SIZE);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let plaintext: string;
  try {
    plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (err: unknown) {
    // InvalidTag: QR adulterado ou corrompido — não silenciar
    throw new ValidationError(
      `QR code inválido ou adulterado: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new ValidationError("QR code inválido");
  }

  const p = parsed as Partial<QrPayload>;
  if (typeof p?.t !== "string" || typeof p?.c !== "string") {
    throw new ValidationError("QR code inválido");
  }

  return { tenantId: p.t, cpf: p.c };
}
