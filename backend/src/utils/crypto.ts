/**
 * Crypto utilities — Geração de chaves, IVs e AES-256-GCM
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

export const MASTER_KEY_SIZE = 32; // 256 bits
export const DEK_SIZE = 32; // 256 bits
export const IV_SIZE = 12; // 96 bits (12 bytes)
export const TAG_SIZE = 16; // 128 bits (16 bytes)

/**
 * Gera uma chave aleatória de tamanho especificado
 */
export function generateKey(size: number = DEK_SIZE): Buffer {
  return randomBytes(size);
}

/**
 * Gera um IV aleatório (nunca reutilizar)
 */
export function generateIV(): Buffer {
  return randomBytes(IV_SIZE);
}

/**
 * Valida se uma string é um hex válido de tamanho esperado
 */
export function isValidHex(value: string, expectedBytes: number): boolean {
  return /^[a-f0-9]*$/i.test(value) && value.length === expectedBytes * 2;
}

export interface GcmCiphertext {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

/**
 * Cifra um payload com AES-256-GCM. IV único gerado por operação.
 */
export function aesGcmEncrypt(key: Buffer, plaintext: Buffer): GcmCiphertext {
  const iv = generateIV();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

/**
 * Decifra um payload AES-256-GCM.
 *
 * ⚠️ Tag GCM inválida (dados adulterados) faz `decipher.final()` lançar —
 * esse erro NUNCA deve ser capturado silenciosamente. Sempre deixar propagar
 * para o caller (upstream loga e responde 4xx/5xx).
 */
export function aesGcmDecrypt(
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer
): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
