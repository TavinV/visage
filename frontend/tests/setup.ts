/**
 * Setup dos testes do frontend.
 *
 * - Fuso e locale fixos: a formatação é toda pt-BR e as asserções de data
 *   quebrariam numa máquina em outro fuso (o CI roda em UTC).
 * - Storages limpos entre testes: o token store persiste em local/sessionStorage
 *   e vazaria estado de um caso para o outro.
 */

import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});
