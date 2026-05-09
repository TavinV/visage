/**
 * Crypto utilities — Geração de chaves e IVs
 */

import { randomBytes } from "crypto";

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
