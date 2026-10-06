/**
 * Helpers de payload facial — DEK cifrada do tenant + candidatos cifrados.
 *
 * Usado pelo warm cache (abertura de chamada), pelo hot path de
 * reconhecimento e pelo fluxo de enrollment. Embeddings NUNCA são
 * decifrados aqui — trafegam cifrados até a engine.
 *
 * RULE LGPD: apenas usuários com facial_status = 'registered' entram como
 * candidatos. Usuários com consentimento revogado ('revoked') jamais são
 * elegíveis para reconhecimento. A única exceção é getCandidatesForUser, que
 * não reconhece ninguém: confere o rosto do próprio titular antes de apagar.
 */

import { prisma } from "../lib/prisma";
import { NotFoundError } from "../utils/errors";
import { EncryptedDekPayload, EncryptedCandidate } from "../lib/faceEngine";

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Carrega a DEK cifrada do tenant (tenant_keys) no formato aceito pela engine.
 */
export async function getTenantDekPayload(tenantId: string): Promise<EncryptedDekPayload> {
  const keys = await prisma.tenantKeys.findUnique({ where: { tenantId } });
  if (!keys) throw new NotFoundError("Tenant encryption keys not found");

  return {
    dekCt: toHex(keys.dekCt),
    dekIv: toHex(keys.dekIv),
    dekTag: toHex(keys.dekTag),
    keyVersion: keys.keyVersion,
  };
}

interface EmbeddingRow {
  userId: string;
  embeddingIv: Uint8Array;
  embeddingTag: Uint8Array;
  embeddingCt: Uint8Array;
  keyVersion: number;
}

function toCandidates(rows: EmbeddingRow[]): EncryptedCandidate[] {
  return rows.map((row) => ({
    person_id: row.userId,
    embedding_iv: toHex(row.embeddingIv),
    embedding_tag: toHex(row.embeddingTag),
    embedding_ct: toHex(row.embeddingCt),
    key_version: row.keyVersion,
  }));
}

const EMBEDDING_SELECT = {
  userId: true,
  embeddingIv: true,
  embeddingTag: true,
  embeddingCt: true,
  keyVersion: true,
} as const;

/**
 * Candidatos matriculados em uma turma com biometria registrada.
 */
export async function getCandidatesForClass(
  tenantId: string,
  classId: string
): Promise<EncryptedCandidate[]> {
  const rows = await prisma.facialEmbedding.findMany({
    where: {
      tenantId,
      user: {
        tenantId,
        facialStatus: "registered",
        classEnrollments: { some: { classId } },
      },
    },
    select: EMBEDDING_SELECT,
  });
  return toCandidates(rows);
}

/**
 * Embedding(s) de um único aluno, para a verificação 1:1 que antecede a
 * exclusão da biometria pelo próprio titular no totem.
 *
 * Sem o filtro facial_status='registered' de propósito: aqui não se decide
 * quem entra na chamada, e sim se o rosto diante do totem é o do DONO dos
 * dados que vão ser apagados — inclusive de um cadastro anterior que continua
 * guardado enquanto um recadastro ficou pela metade ('consent_given').
 */
export async function getCandidatesForUser(
  tenantId: string,
  userId: string
): Promise<EncryptedCandidate[]> {
  const rows = await prisma.facialEmbedding.findMany({
    where: { tenantId, userId, user: { tenantId } },
    select: EMBEDDING_SELECT,
  });
  return toCandidates(rows);
}

/**
 * Candidatos para pré-presença: alunos de turmas vinculadas à localização
 * do totem. Sem localização, cai para todos os registrados do tenant.
 */
export async function getCandidatesForLocation(
  tenantId: string,
  locationId?: string
): Promise<EncryptedCandidate[]> {
  const rows = await prisma.facialEmbedding.findMany({
    where: {
      tenantId,
      user: {
        tenantId,
        facialStatus: "registered",
        ...(locationId && {
          classEnrollments: { some: { class: { tenantId, locationId } } },
        }),
      },
    },
    select: EMBEDDING_SELECT,
  });
  return toCandidates(rows);
}
