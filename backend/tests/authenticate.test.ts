/**
 * Testes críticos — autenticação JWT (middleware/authenticate.ts).
 * JWT expirado ou com assinatura inválida deve retornar 401.
 */

import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

vi.mock("../src/lib/redis", () => ({
  redis: {},
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));

import { authenticate } from "../src/middleware/authenticate";

function mockResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown,
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

function requestWithToken(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
}

const claims = {
  sub: "user-1",
  tenantId: "tenant-1",
  role: "teacher",
  email: "prof@escola.com",
};

describe("authenticate middleware", () => {
  it("aceita JWT válido e popula req.tenant", () => {
    const token = jwt.sign(claims, process.env.JWT_SECRET!, { expiresIn: "15m" });
    const req = requestWithToken(token);
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenant).toMatchObject({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "teacher",
    });
  });

  it("retorna 401 para JWT expirado", () => {
    const token = jwt.sign(claims, process.env.JWT_SECRET!, { expiresIn: "-10s" });
    const req = requestWithToken(token);
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("invalid_token");
  });

  it("retorna 401 para JWT assinado com outro secret", () => {
    const token = jwt.sign(claims, "outro-secret", { expiresIn: "15m" });
    const req = requestWithToken(token);
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("retorna 401 sem header Authorization", () => {
    const req = requestWithToken();
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
