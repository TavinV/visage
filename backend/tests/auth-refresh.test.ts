/**
 * Testes críticos — rotação de refresh token (auth.service.ts).
 * Reutilizar um refresh token já rotacionado deve retornar 401.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "../src/utils/errors";

// Redis fake baseado em Map — comportamento de setEx/get/del preservado
const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
    prisma: {
      user: { findFirst: vi.fn() },
    },
  };
});

vi.mock("../src/lib/redis", () => ({
  redis: mocks.redis,
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: mocks.prisma,
  disconnectPrisma: vi.fn(),
}));

import { authService } from "../src/services/auth.service";

describe("refresh token rotation", () => {
  beforeEach(() => {
    mocks.store.clear();
  });

  it("troca refresh token válido e invalida o anterior", async () => {
    mocks.store.set(
      "rtoken:token-original",
      JSON.stringify({ userId: "u1", tenantId: "t1", role: "teacher", email: "a@b.c" })
    );

    const result = await authService.refresh("token-original");

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).not.toBe("token-original");
    // Token antigo removido do Redis (rotação)
    expect(mocks.store.has("rtoken:token-original")).toBe(false);
    expect(mocks.store.has(`rtoken:${result.refreshToken}`)).toBe(true);
  });

  it("reutilizar refresh token já rotacionado retorna 401", async () => {
    mocks.store.set(
      "rtoken:token-original",
      JSON.stringify({ userId: "u1", tenantId: "t1", role: "teacher", email: "a@b.c" })
    );

    await authService.refresh("token-original");

    // Replay do token consumido — deve ser rejeitado
    await expect(authService.refresh("token-original")).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("refresh token desconhecido retorna 401", async () => {
    await expect(authService.refresh("nunca-existiu")).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});
