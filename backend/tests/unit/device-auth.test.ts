/**
 * Autenticação do totem por X-Device-Key (middleware/deviceAuth.ts).
 *
 * A chave do totem é o que separa um tablet da escola de qualquer celular na
 * calçada. Dois contratos aqui são inegociáveis:
 *   1. a chave em texto puro NUNCA vai para o banco — a busca é pelo SHA-256;
 *   2. totem de instituição suspensa não registra presença.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const mocks = vi.hoisted(() => ({
  prisma: {
    device: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
  redis: {
    get: vi.fn(async () => null as string | null),
    setEx: vi.fn(async () => "OK"),
  },
  setActor: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: mocks.prisma, disconnectPrisma: vi.fn() }));
vi.mock("../../src/lib/redis", () => ({
  redis: mocks.redis,
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));
vi.mock("../../src/lib/requestContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/requestContext")>();
  return { ...actual, setActor: mocks.setActor };
});

import { deviceAuth } from "../../src/middleware/deviceAuth";

const API_KEY = "chave-do-totem-sala-12";
const API_KEY_HASH = crypto.createHash("sha256").update(API_KEY).digest("hex");

const DEVICE = {
  id: "device-1",
  tenantId: "tenant-a",
  locationId: "sala-12",
  deviceFingerprint: "fp-abc",
  label: "Totem da sala 12",
  isActive: true,
};

function mockRequest(apiKey?: string): Request {
  return { headers: apiKey ? { "x-device-key": apiKey } : {} } as unknown as Request;
}

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

/** deviceAuth é síncrono por fora e assíncrono por dentro — espera o desfecho. */
function run(req: Request, res: Response): Promise<{ nextCalled: boolean }> {
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

    deviceAuth(req, res, next);
  });
}

describe("deviceAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
    mocks.prisma.device.findFirst.mockResolvedValue(DEVICE);
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "active" });
  });

  it("rejeita requisição sem o header X-Device-Key", async () => {
    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("unauthorized");
    expect(mocks.prisma.device.findFirst).not.toHaveBeenCalled();
  });

  it("busca o totem pelo SHA-256 — a chave em texto puro nunca chega ao banco", async () => {
    await run(mockRequest(API_KEY), mockResponse());

    const args = mocks.prisma.device.findFirst.mock.calls[0][0] as any;
    expect(args.where.apiKeyHash).toBe(API_KEY_HASH);
    // A garantia real: o valor digitado não aparece em lugar nenhum da query
    expect(JSON.stringify(args)).not.toContain(API_KEY);
  });

  it("rejeita chave que não corresponde a nenhum totem", async () => {
    mocks.prisma.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    const { nextCalled } = await run(mockRequest("chave-inventada"), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("rejeita totem desativado no painel", async () => {
    mocks.prisma.device.findFirst.mockResolvedValue({ ...DEVICE, isActive: false });

    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(API_KEY), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("rejeita header presente mas vazio", async () => {
    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(""), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe("deviceAuth — status da instituição", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
    mocks.prisma.device.findFirst.mockResolvedValue(DEVICE);
  });

  it("deixa passar instituição ativa", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "active" });

    const { nextCalled } = await run(mockRequest(API_KEY), mockResponse());
    expect(nextCalled).toBe(true);
  });

  it("deixa passar instituição em trial", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "trial" });

    const { nextCalled } = await run(mockRequest(API_KEY), mockResponse());
    expect(nextCalled).toBe(true);
  });

  it("bloqueia totem de instituição suspensa", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "suspended" });

    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(API_KEY), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toContain("suspended");
  });

  it("bloqueia quando a instituição não existe mais", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(API_KEY), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("status vindo do cache dispensa a consulta ao banco", async () => {
    mocks.redis.get.mockResolvedValue("active");

    const { nextCalled } = await run(mockRequest(API_KEY), mockResponse());

    expect(nextCalled).toBe(true);
    expect(mocks.prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("cacheia o status por 60s depois de consultar o banco", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ status: "active" });

    await run(mockRequest(API_KEY), mockResponse());

    expect(mocks.redis.setEx).toHaveBeenCalledWith("tenant:status:tenant-a", 60, "active");
  });

  it("suspensão em cache bloqueia sem ir ao banco", async () => {
    mocks.redis.get.mockResolvedValue("cancelled");

    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(API_KEY), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(mocks.prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});

describe("deviceAuth — contexto propagado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue("active");
    mocks.prisma.device.findFirst.mockResolvedValue(DEVICE);
  });

  it("popula req.device com o totem autenticado", async () => {
    const req = mockRequest(API_KEY);
    await run(req, mockResponse());

    expect(req.device).toEqual({
      deviceId: "device-1",
      tenantId: "tenant-a",
      locationId: "sala-12",
      deviceFingerprint: "fp-abc",
    });
  });

  it("popula req.tenant no mesmo formato do JWT, com role 'device'", async () => {
    // Os services leem req.tenant.tenantId sem saber se veio de JWT ou totem.
    const req = mockRequest(API_KEY);
    await run(req, mockResponse());

    expect(req.tenant).toEqual({
      tenantId: "tenant-a",
      userId: "device-1",
      role: "device",
      email: "",
    });
  });

  it("totem sem sala fica com locationId indefinido, não nulo", async () => {
    mocks.prisma.device.findFirst.mockResolvedValue({ ...DEVICE, locationId: null });

    const req = mockRequest(API_KEY);
    await run(req, mockResponse());

    expect(req.device?.locationId).toBeUndefined();
  });

  it("registra o ator da auditoria como 'device', com o rótulo do totem", async () => {
    await run(mockRequest(API_KEY), mockResponse());

    expect(mocks.setActor).toHaveBeenCalledWith({
      actorType: "device",
      tenantId: "tenant-a",
      deviceId: "device-1",
      userName: "Totem da sala 12",
    });
  });

  it("totem sem rótulo entra na trilha pelo fingerprint", async () => {
    mocks.prisma.device.findFirst.mockResolvedValue({ ...DEVICE, label: null });

    await run(mockRequest(API_KEY), mockResponse());

    expect(mocks.setActor).toHaveBeenCalledWith(
      expect.objectContaining({ userName: "fp-abc" })
    );
  });
});

describe("deviceAuth — falha de infraestrutura", () => {
  it("erro no banco vira 500, nunca um next() silencioso", async () => {
    vi.clearAllMocks();
    mocks.redis.get.mockResolvedValue(null);
    mocks.prisma.device.findFirst.mockRejectedValue(new Error("conexão perdida"));

    const res = mockResponse();
    const { nextCalled } = await run(mockRequest(API_KEY), res);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe("internal_error");
  });
});
