/**
 * Testes críticos — isolamento multi-tenant nos payloads faciais
 * (facial-payload.ts, usado por warm cache e /device/recognize).
 *
 * Garante que:
 *   - toda query de candidatos leva tenantId no WHERE;
 *   - apenas usuários com facial_status='registered' são candidatos
 *     (LGPD: 'revoked' nunca entra no reconhecimento).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    facialEmbedding: { findMany: vi.fn(async () => []) },
    tenantKeys: { findUnique: vi.fn() },
  },
}));

vi.mock("../../src/lib/prisma", () => ({ prisma: mocks.prisma, disconnectPrisma: vi.fn() }));

import {
  getCandidatesForClass,
  getCandidatesForLocation,
  getTenantDekPayload,
} from "../../src/services/facial-payload";
import { NotFoundError } from "../../src/utils/errors";

describe("facial-payload — isolamento multi-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCandidatesForClass filtra por tenantId e facial_status='registered'", async () => {
    await getCandidatesForClass("tenant-a", "class-1");

    const args = mocks.prisma.facialEmbedding.findMany.mock.calls[0][0] as any;
    expect(args.where.tenantId).toBe("tenant-a");
    expect(args.where.user.tenantId).toBe("tenant-a");
    // LGPD: usuário com consentimento revogado jamais é candidato
    expect(args.where.user.facialStatus).toBe("registered");
    expect(args.where.user.classEnrollments.some.classId).toBe("class-1");
  });

  it("getCandidatesForLocation filtra por tenantId e facial_status='registered'", async () => {
    await getCandidatesForLocation("tenant-b", "location-9");

    const args = mocks.prisma.facialEmbedding.findMany.mock.calls[0][0] as any;
    expect(args.where.tenantId).toBe("tenant-b");
    expect(args.where.user.facialStatus).toBe("registered");
    expect(args.where.user.classEnrollments.some.class.locationId).toBe("location-9");
  });

  it("candidatos saem em hex com person_id = userId (nunca bytes crus)", async () => {
    mocks.prisma.facialEmbedding.findMany.mockResolvedValueOnce([
      {
        userId: "student-1",
        embeddingIv: new Uint8Array([1, 2, 3]),
        embeddingTag: new Uint8Array([4, 5]),
        embeddingCt: new Uint8Array([6]),
        keyVersion: 2,
      },
    ] as never);

    const candidates = await getCandidatesForClass("tenant-a", "class-1");

    expect(candidates).toEqual([
      {
        person_id: "student-1",
        embedding_iv: "010203",
        embedding_tag: "0405",
        embedding_ct: "06",
        key_version: 2,
      },
    ]);
  });

  it("getTenantDekPayload busca a chave do próprio tenant e retorna hex", async () => {
    mocks.prisma.tenantKeys.findUnique.mockResolvedValueOnce({
      dekCt: new Uint8Array([0xaa]),
      dekIv: new Uint8Array([0xbb]),
      dekTag: new Uint8Array([0xcc]),
      keyVersion: 3,
    });

    const dek = await getTenantDekPayload("tenant-a");

    expect(mocks.prisma.tenantKeys.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
    });
    expect(dek).toEqual({ dekCt: "aa", dekIv: "bb", dekTag: "cc", keyVersion: 3 });
  });

  it("tenant sem chaves lança NotFoundError", async () => {
    mocks.prisma.tenantKeys.findUnique.mockResolvedValueOnce(null);

    await expect(getTenantDekPayload("tenant-x")).rejects.toBeInstanceOf(NotFoundError);
  });
});
