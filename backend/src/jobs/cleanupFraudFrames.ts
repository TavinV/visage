/**
 * Job de limpeza de fraud frames — diário às 03:00 (hora local do servidor).
 *
 * Para cada tenant:
 *   - Varre ./fraud_frames/{tenant_id}/{YYYY-MM-DD}/ e deleta arquivos com
 *     idade > fraud_retention_hours (tenant_settings, default 24h).
 *   - Atualiza recognition_logs (fraud_frame_exists=false, path=NULL).
 *   - Falha em um tenant NÃO interrompe os demais (erros agregados).
 *
 * Resultado registrado em audit_cleanup_logs (files_deleted, bytes_freed,
 * tenants_processed, error_message).
 *
 * Implementado com setTimeout encadeado (sem node-cron — nenhum scheduler
 * existe no package.json e uma dependência extra não se justifica no MVP).
 */

import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { config } from "../lib/config";

interface TenantCleanupResult {
  filesDeleted: number;
  bytesFreed: number;
}

async function cleanupTenantFrames(
  tenantId: string,
  retentionHours: number
): Promise<TenantCleanupResult> {
  const result: TenantCleanupResult = { filesDeleted: 0, bytesFreed: 0 };
  const cutoffMs = Date.now() - retentionHours * 60 * 60 * 1000;
  const tenantDir = path.join(config.fraudFramesStoragePath, tenantId);

  let dateDirs: string[];
  try {
    dateDirs = await fs.readdir(tenantDir);
  } catch {
    // Diretório inexistente = nenhum frame salvo para o tenant
    return result;
  }

  for (const dateDir of dateDirs) {
    const dirPath = path.join(tenantDir, dateDir);
    let files: string[];
    try {
      files = await fs.readdir(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtimeMs < cutoffMs) {
          await fs.unlink(filePath);
          result.filesDeleted++;
          result.bytesFreed += stat.size;
        }
      } catch (error) {
        logger.warn({ tenantId, filePath, error }, "Failed to delete fraud frame file");
      }
    }

    // Remove diretórios de data vazios
    try {
      const remaining = await fs.readdir(dirPath);
      if (remaining.length === 0) await fs.rmdir(dirPath);
    } catch {
      /* diretório em uso — ignorar */
    }
  }

  // Sincroniza o banco: logs mais antigos que a retenção perdem o frame
  const cutoffDate = new Date(cutoffMs);
  await prisma.recognitionLog.updateMany({
    where: { tenantId, fraudFrameExists: true, createdAt: { lt: cutoffDate } },
    data: { fraudFrameExists: false, fraudFramePath: null },
  });

  return result;
}

/**
 * Executa uma varredura completa de limpeza. Exportado para permitir
 * execução manual (scripts) e testes.
 */
export async function runFraudFrameCleanup(): Promise<void> {
  const startedAt = Date.now();
  let filesDeleted = 0;
  let bytesFreed = 0;
  let tenantsProcessed = 0;
  const errors: string[] = [];

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, settings: { select: { fraudRetentionHours: true } } },
    });

    for (const tenant of tenants) {
      try {
        const retention = tenant.settings?.fraudRetentionHours ?? config.fraudRetentionHours;
        const result = await cleanupTenantFrames(tenant.id, retention);
        filesDeleted += result.filesDeleted;
        bytesFreed += result.bytesFreed;
        tenantsProcessed++;
      } catch (error) {
        // Falha parcial não interrompe os demais tenants
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`tenant ${tenant.id}: ${message}`);
        logger.error({ tenantId: tenant.id, error }, "Fraud frame cleanup failed for tenant");
      }
    }

    await prisma.auditCleanupLog.create({
      data: {
        filesDeleted,
        bytesFreed: BigInt(bytesFreed),
        tenantsProcessed,
        errorMessage: errors.length > 0 ? errors.join("; ") : null,
      },
    });

    logger.info(
      {
        filesDeleted,
        bytesFreed,
        tenantsProcessed,
        errors: errors.length,
        durationMs: Date.now() - startedAt,
      },
      "Fraud frame cleanup completed"
    );
  } catch (error) {
    logger.error({ error }, "Fraud frame cleanup job crashed");
    try {
      await prisma.auditCleanupLog.create({
        data: {
          filesDeleted,
          bytesFreed: BigInt(bytesFreed),
          tenantsProcessed,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    } catch {
      /* banco indisponível — apenas logado acima */
    }
  }
}

/** Milissegundos até a próxima ocorrência de HH:MM local. */
function msUntilNext(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * Agenda a execução diária às 03:00. Chamar uma única vez no bootstrap.
 */
export function startFraudFrameCleanupJob(): void {
  const schedule = (): void => {
    const delay = msUntilNext(3, 0);
    const timer = setTimeout(async () => {
      await runFraudFrameCleanup();
      schedule(); // re-agenda para o próximo dia
    }, delay);
    timer.unref(); // não segura o processo vivo

    logger.info(
      { nextRunInMinutes: Math.round(delay / 60000) },
      "Fraud frame cleanup job scheduled (daily 03:00)"
    );
  };

  schedule();
}
