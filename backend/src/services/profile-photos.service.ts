/**
 * ProfilePhotosService — foto de perfil de usuários e logo da instituição.
 *
 * Armazenamento em disco, no mesmo padrão dos fraud frames
 * (PROFILE_PHOTOS_STORAGE_PATH). Diferente dos frames, estas imagens NÃO têm
 * expiração — em deploy sem volume persistente (Railway/nixpacks) elas se
 * perdem no redeploy e o usuário reenvia.
 *
 * LGPD: alunos não têm foto de perfil. O rosto do aluno existe apenas como
 * embedding cifrado, nunca como imagem recuperável — abrir exceção aqui
 * criaria um acervo de fotos de menores fora do envelope de criptografia.
 *
 * O JPEG chega em base64 já redimensionado pelo navegador; o teto de tamanho
 * é a última barreira contra payload bombing.
 */

import fs from "fs/promises";
import path from "path";
import { createReadStream, type ReadStream } from "fs";
import { BaseService } from "./base.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { config } from "../lib/config";
import { auditService } from "./audit.service";

// ── Limites ──────────────────────────────────────────────────────────────────

const MAX_PHOTO_BYTES = 512 * 1024; // 512KB — sobra para um JPEG 512×512
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export type PhotoOwner = "user" | "tenant";

export interface PhotoUploadResult {
  updatedAt: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class ProfilePhotosService extends BaseService {
  /**
   * Foto de perfil de um usuário. O próprio usuário envia a sua; admin e
   * manager podem enviar a de outros da instituição.
   */
  async setUserPhoto(
    tenantId: string,
    userId: string,
    imageB64: string
  ): Promise<PhotoUploadResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, name: true, role: true, photoPath: true },
    });
    if (!user) throw new NotFoundError("Usuário não encontrado nesta instituição");

    if (user.role === "student") {
      throw new ValidationError(
        "Alunos não têm foto de perfil — o rosto do aluno só existe como biometria cifrada",
        "STUDENT_PHOTO_NOT_ALLOWED"
      );
    }

    const { buffer, extension } = this.decodeImage(imageB64);
    const relativePath = path.posix.join(tenantId, "users", `${userId}.${extension}`);
    await this.writeFile(relativePath, buffer);

    // Trocar de formato (jpg → png) deixaria o arquivo antigo órfão no disco
    if (user.photoPath && user.photoPath !== relativePath) {
      await this.removeFile(user.photoPath);
    }

    const photoUpdatedAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { photoPath: relativePath, photoUpdatedAt },
    });

    auditService.record({
      action: "user.photo_updated",
      tenantId,
      targetId: userId,
      targetLabel: user.name,
      // A imagem em si nunca entra na trilha — só o fato e o tamanho
      metadata: { bytes: buffer.length, format: extension },
    });

    this.logger.info({ tenantId, userId, bytes: buffer.length }, "User profile photo updated");
    return { updatedAt: photoUpdatedAt };
  }

  /**
   * Logo da instituição — enviada pelo admin do tenant.
   */
  async setTenantLogo(tenantId: string, imageB64: string): Promise<PhotoUploadResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, logoPath: true },
    });
    if (!tenant) throw new NotFoundError("Instituição não encontrada");

    const { buffer, extension } = this.decodeImage(imageB64);
    const relativePath = path.posix.join(tenantId, `logo.${extension}`);
    await this.writeFile(relativePath, buffer);

    if (tenant.logoPath && tenant.logoPath !== relativePath) {
      await this.removeFile(tenant.logoPath);
    }

    const logoUpdatedAt = new Date();
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoPath: relativePath, logoUpdatedAt },
    });

    auditService.record({
      action: "settings.logo_updated",
      tenantId,
      targetId: tenantId,
      metadata: { bytes: buffer.length, format: extension },
    });

    this.logger.info({ tenantId, bytes: buffer.length }, "Tenant logo updated");
    return { updatedAt: logoUpdatedAt };
  }

  async deleteUserPhoto(tenantId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, name: true, photoPath: true },
    });
    if (!user) throw new NotFoundError("Usuário não encontrado nesta instituição");
    if (!user.photoPath) return;

    await this.removeFile(user.photoPath);
    await this.prisma.user.update({
      where: { id: userId },
      data: { photoPath: null, photoUpdatedAt: null },
    });

    auditService.record({
      action: "user.photo_removed",
      tenantId,
      targetId: userId,
      targetLabel: user.name,
    });

    this.logger.info({ tenantId, userId }, "User profile photo removed");
  }

  async deleteTenantLogo(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, logoPath: true },
    });
    if (!tenant) throw new NotFoundError("Instituição não encontrada");
    if (!tenant.logoPath) return;

    await this.removeFile(tenant.logoPath);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoPath: null, logoUpdatedAt: null },
    });
    this.logger.info({ tenantId }, "Tenant logo removed");
  }

  /**
   * Stream do arquivo para a rota de download.
   *
   * O deploy sem volume persistente perde os arquivos mas mantém o caminho no
   * banco: um path registrado sem arquivo em disco vira 404, não 500.
   */
  async getUserPhotoStream(
    tenantId: string,
    userId: string
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { photoPath: true },
    });
    if (!user?.photoPath) throw new NotFoundError("Este usuário não tem foto de perfil");
    return this.openFile(user.photoPath);
  }

  async getTenantLogoStream(
    tenantId: string
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPath: true },
    });
    if (!tenant?.logoPath) throw new NotFoundError("Esta instituição não tem logo");
    return this.openFile(tenant.logoPath);
  }

  // ── Helpers de disco ────────────────────────────────────────────────────────

  /**
   * Resolve um caminho relativo do banco contra a raiz de armazenamento,
   * rejeitando qualquer coisa que escape dela (path traversal).
   */
  private resolveSafe(relativePath: string): string {
    const root = path.resolve(config.profilePhotosStoragePath);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new ValidationError("Caminho de arquivo inválido", "INVALID_PHOTO_PATH");
    }
    return resolved;
  }

  private async writeFile(relativePath: string, buffer: Buffer): Promise<void> {
    const absolute = this.resolveSafe(relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
  }

  /** Remoção best-effort: arquivo já ausente não é erro. */
  private async removeFile(relativePath: string): Promise<void> {
    try {
      await fs.unlink(this.resolveSafe(relativePath));
    } catch (error) {
      this.logger.warn({ relativePath, error }, "Failed to remove profile photo file");
    }
  }

  private async openFile(
    relativePath: string
  ): Promise<{ stream: ReadStream; contentType: string }> {
    const absolute = this.resolveSafe(relativePath);
    try {
      await fs.access(absolute);
    } catch {
      throw new NotFoundError(
        "Arquivo da imagem não está mais disponível no servidor — envie novamente"
      );
    }
    const contentType = absolute.endsWith(".png") ? "image/png" : "image/jpeg";
    return { stream: createReadStream(absolute), contentType };
  }

  /**
   * Decodifica o base64 e confere o formato pelos magic bytes — o
   * Content-Type declarado pelo cliente não é confiável.
   */
  private decodeImage(imageB64: string): { buffer: Buffer; extension: "jpg" | "png" } {
    const stripped = imageB64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(stripped, "base64");

    if (buffer.length === 0) {
      throw new ValidationError("Imagem vazia ou base64 inválido", "INVALID_IMAGE");
    }
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw new ValidationError(
        `A imagem excede ${Math.round(MAX_PHOTO_BYTES / 1024)}KB`,
        "IMAGE_TOO_LARGE"
      );
    }

    if (JPEG_MAGIC.every((byte, i) => buffer[i] === byte)) {
      return { buffer, extension: "jpg" };
    }
    if (PNG_MAGIC.every((byte, i) => buffer[i] === byte)) {
      return { buffer, extension: "png" };
    }
    throw new ValidationError("A imagem precisa ser JPEG ou PNG", "UNSUPPORTED_IMAGE_FORMAT");
  }
}

export const profilePhotosService = new ProfilePhotosService();
