/**
 * Autorização por perfil e por status da instituição
 * (middleware/authenticate.ts — requireRole, requireSuperAdmin, validateTenantActive).
 *
 * `authenticate` já tem testes próprios (JWT expirado, assinatura inválida).
 * Aqui cobre-se o que vem DEPOIS de saber quem é: o que essa pessoa pode fazer,
 * e se a instituição dela ainda está em dia.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const mocks = vi.hoisted(() => ({
  redis: {
    get: vi.fn(async () => null as string | null),
    setEx: vi.fn(async () => "OK"),
  },
  prisma: {
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock("../../src/lib/redis", () => ({
  redis: mocks.redis,
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));
vi.mock("../../src/lib/prisma", () => ({ prisma: mocks.prisma, disconnectPrisma: vi.fn() }));

import {
  requireRole,
  requireSuperAdmin,
  validateTenantActive,
} from "../../src/middleware/authenticate";

function mockResponse() {
  const res = {
    statusCode: 0,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

function requestAs(role?: string): Request {
  return {
    tenant: role
      ? { tenantId: "tenant-a", userId: "user-1", role, email: "quem@escola.com" }
      : undefined,
  } as unknown as Request;
}

describe("requireRole", () => {
  it("deixa passar quem está na lista", () => {
    const res = mockResponse();
    const next = vi.fn();

    requireRole("admin", "manager")(requestAs("admin"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("bloqueia com 403 quem não está na lista", () => {
    const res = mockResponse();
    const next = vi.fn();

    requireRole("admin")(requestAs("teacher"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("responde 401 quando não há contexto de usuário", () => {
    // Rota que esqueceu de rodar `authenticate` antes: não pode virar 403
    // (que sugeriria identidade conhecida) nem passar reto.
    const res = mockResponse();
    const next = vi.fn();

    requireRole("admin")(requestAs(undefined), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("lista vazia bloqueia todo mundo", () => {
    const res = mockResponse();
    const next = vi.fn();

    requireRole()(requestAs("admin"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("não confunde perfis com nome parecido", () => {
    const res = mockResponse();
    const next = vi.fn();

    requireRole("admin")(requestAs("super_admin"), res, next);

    // super_admin NÃO herda admin implicitamente — quem quer os dois, lista os dois
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("aceita o perfil 'device' quando a rota o inclui", () => {
    const res = mockResponse();
    const next = vi.fn();

    requireRole("device")(requestAs("device"), res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireSuperAdmin", () => {
  it("deixa passar o super admin", () => {
    const res = mockResponse();
    const next = vi.fn();

    requireSuperAdmin(requestAs("super_admin"), res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("bloqueia o admin da instituição", () => {
    // A separação que impede um admin de escola de mexer em outras escolas.
    const res = mockResponse();
    const next = vi.fn();

    requireSuperAdmin(requestAs("admin"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("bloqueia professor, coordenador e totem", () => {
    for (const role of ["teacher", "manager", "device"]) {
      const res = mockResponse();
      const next = vi.fn();

      requireSuperAdmin(requestAs(role), res, next);

      expect(next, role).not.toHaveBeenCalled();
      expect(res.statusCode, role).toBe(403);
    }
  });
});

/** validateTenantActive é síncrono por fora e assíncrono por dentro. */
function runTenantCheck(req: Request, res: Response): Promise<{ nextCalled: boolean }> {
  return new Promise((resolve) => {
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
      resolve({ nextCalled });
    };

    const originalJson = res.json.bind(res);
    (res as any).json = (payload: unknown) => {
      const out = originalJson(payload);
      resolve({ nextCalled });
      return out;
    };

    validateTenantActive(req, res, next);
  });
}

describe("validateTenantActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "active" });
  });

  it("deixa passar instituição ativa e cacheia o status por 60s", async () => {
    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(true);
    expect(mocks.redis.setEx).toHaveBeenCalledWith("tenant:status:tenant-a", 60, "active");
  });

  it("bloqueia instituição suspensa, dizendo o status na mensagem", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "suspended" });

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toContain("suspended");
  });

  it("bloqueia instituição cancelada", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "cancelled" });

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("bloqueia quando a instituição não existe mais", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("responde 401 sem contexto de usuário", async () => {
    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs(undefined), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("status ativo em cache dispensa a consulta ao banco", async () => {
    mocks.redis.get.mockResolvedValue("active");

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(true);
    expect(mocks.prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("status suspenso em cache bloqueia sem ir ao banco", async () => {
    mocks.redis.get.mockResolvedValue("suspended");

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(mocks.prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("erro de infraestrutura vira 500, nunca liberação silenciosa", async () => {
    mocks.redis.get.mockRejectedValue(new Error("redis fora do ar"));

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(500);
  });

  /**
   * DIVERGÊNCIA CONHECIDA (ver .claude/testing.md §4.1):
   * o console rejeita instituição em `trial`, enquanto `deviceAuth` a aceita —
   * o totem de uma escola em avaliação funciona e o painel dela não.
   * O teste congela o comportamento de hoje para que a correção seja
   * deliberada, e não um efeito colateral.
   */
  it("hoje bloqueia instituição em trial (divergente do totem, que aceita)", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "trial" });

    const res = mockResponse();
    const { nextCalled } = await runTenantCheck(requestAs("admin"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toContain("trial");
  });
});
