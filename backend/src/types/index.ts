/**
 * Types — Interfaces e tipos compartilhados do backend
 */

import { z } from "zod";

// ── Branded primitive: Email ───────────────────────────────────────────────
declare const __emailBrand: unique symbol;
export type Email = string & { readonly [__emailBrand]: void };

export const EmailSchema = z
  .string({ required_error: "E-mail é obrigatório" })
  .email("Endereço de e-mail inválido")
  .transform((v) => v.toLowerCase().trim() as Email);

// ── Branded primitive: CPF ─────────────────────────────────────────────────
declare const __cpfBrand: unique symbol;
export type CPF = string & { readonly [__cpfBrand]: void };

function calcCPFDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += Number(digits[i]) * (length + 1 - i);
  }
  const rem = (sum * 10) % 11;
  return rem >= 10 ? 0 : rem;
}

export function isValidCPF(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // todos os dígitos iguais
  return (
    calcCPFDigit(digits, 9) === Number(digits[9]) &&
    calcCPFDigit(digits, 10) === Number(digits[10])
  );
}

export const CPFSchema = z
  .string({ required_error: "CPF é obrigatório" })
  .refine(isValidCPF, "CPF inválido")
  .transform((v) => v.replace(/\D/g, "") as CPF);

// ── Branded primitive: DatabaseURI ────────────────────────────────────────
declare const __urieBrand: unique symbol;
export type DatabaseURI = string & { readonly [__urieBrand]: void };

export const DatabaseURISchema = z
  .string()
  .url("URI de banco inválida")
  .startsWith("postgresql://", "URI deve começar com postgresql://")
  .transform((v) => v as DatabaseURI);

// ── Contexto de tenant extraído do JWT ────────────────────────────────────

export interface TenantContext {
  tenantId: number;
  userId: number;
  role: "super_admin" | "admin" | "manager" | "teacher" | "student";
  email: string;
}

export interface JWTPayload {
  sub: number; // user_id
  tenantId: number;
  role: string;
  email: string;
  iat: number;
  exp: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
}

export interface HttpError extends Error {
  status: number;
  code: string;
}
