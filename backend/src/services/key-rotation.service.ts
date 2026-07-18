/**
 * KeyRotationService — Rotação de DEK por tenant.
 *
 * Fluxo (ver .claude/security.md — "Rotação de Chaves"):
 *   1. Decifra a DEK atual com a MASTER_KEY.
 *   2. Gera nova DEK (32 bytes).
 *   3. Re-cifra TODOS os facial_embeddings do tenant com a nova DEK.
 *   4. Atualiza tenant_keys (nova DEK cifrada, key_version + 1).
 *   5. Invalida o cache de DEK na engine (DELETE /cache/dek/{tenant_id}).
 *
 * Passos 3–4 rodam numa única transação: rotação é tudo-ou-nada.
 * InvalidTag em qualquer decifragem ABORTA a rotação inteira (nunca
 * silenciar — embedding adulterado é incidente de segurança).
 */

import { BaseService } from "./base.service";
import { NotFoundError } from "../utils/errors";
import { generateKey, aesGcmEncrypt, aesGcmDecrypt } from "../utils/crypto";
import { config } from "../lib/config";
import { engineInvalidateDek } from "../lib/faceEngine";

export interface RotateDekOutput {
  tenantId: string;
  keyVersion: number;
  embeddingsRotated: number;
}

class KeyRotationService extends BaseService {
  async rotateTenantDek(tenantId: string): Promise<RotateDekOutput> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const keys = await this.prisma.tenantKeys.findUnique({ where: { tenantId } });
    if (!keys) throw new NotFoundError("Tenant encryption keys not found");

    const masterKey = Buffer.from(config.masterKey, "hex");

    // Decifra DEK atual — InvalidTag aqui indica MASTER_KEY errada ou
    // tenant_keys adulterada: propaga e aborta
    const currentDek = aesGcmDecrypt(
      masterKey,
      Buffer.from(keys.dekIv),
      Buffer.from(keys.dekTag),
      Buffer.from(keys.dekCt)
    );

    // Nova DEK cifrada com MASTER_KEY (IV único)
    const newDek = generateKey(32);
    const newDekEncrypted = aesGcmEncrypt(masterKey, newDek);
    const newKeyVersion = keys.keyVersion + 1;

    // Re-cifra todos os embeddings do tenant fora da transação (CPU-bound),
    // persiste tudo numa única transação (all-or-nothing)
    const embeddings = await this.prisma.facialEmbedding.findMany({
      where: { tenantId },
      select: { id: true, embeddingIv: true, embeddingTag: true, embeddingCt: true },
    });

    const reEncrypted = embeddings.map((row) => {
      // InvalidTag propaga: embedding que não decifra com a DEK atual é
      // corrupção/adulteração — rotação inteira é abortada
      const plaintext = aesGcmDecrypt(
        currentDek,
        Buffer.from(row.embeddingIv),
        Buffer.from(row.embeddingTag),
        Buffer.from(row.embeddingCt)
      );
      const encrypted = aesGcmEncrypt(newDek, plaintext);
      return { id: row.id, ...encrypted };
    });

    await this.prisma.$transaction([
      this.prisma.tenantKeys.update({
        where: { tenantId },
        data: {
          dekCt: new Uint8Array(newDekEncrypted.ciphertext),
          dekIv: new Uint8Array(newDekEncrypted.iv),
          dekTag: new Uint8Array(newDekEncrypted.tag),
          keyVersion: newKeyVersion,
        },
      }),
      ...reEncrypted.map((row) =>
        this.prisma.facialEmbedding.update({
          where: { id: row.id },
          data: {
            embeddingIv: new Uint8Array(row.iv),
            embeddingTag: new Uint8Array(row.tag),
            embeddingCt: new Uint8Array(row.ciphertext),
            keyVersion: newKeyVersion,
          },
        })
      ),
    ]);

    // DEK antiga em cache na engine deixaria embeddings ilegíveis (InvalidTag)
    // até o TTL de 1h — invalidação imediata é obrigatória
    try {
      await engineInvalidateDek(tenantId);
    } catch (error) {
      this.logger.warn(
        { tenantId, error },
        "Failed to invalidate engine DEK cache — engine will refresh within TTL"
      );
    }

    this.logger.info(
      { tenantId, keyVersion: newKeyVersion, embeddingsRotated: reEncrypted.length },
      "Tenant DEK rotated"
    );

    return {
      tenantId,
      keyVersion: newKeyVersion,
      embeddingsRotated: reEncrypted.length,
    };
  }
}

export const keyRotationService = new KeyRotationService();
