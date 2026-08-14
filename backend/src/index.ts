/**
 * Server Entry Point
 */

import "dotenv/config";
import { createApp } from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { disconnectPrisma, prisma } from "./lib/prisma";
import { adminService } from "./services/admin.service";
import { startFraudFrameCleanupJob } from "./jobs/cleanupFraudFrames";
import { startAutoCloseSessionsJob } from "./jobs/autoCloseSessions";

async function bootstrap() {
  try {
    // Validar configuração
    config; // Apenas acessar para validar (validateConfig é chamado na importação)

    logger.info("Starting Visage Backend Server...");

    // Conectar Redis PRIMEIRO (antes de criar a app)
    // O middleware de rate limiting precisa do Redis pronto na importação
    await connectRedis();
    logger.info("Redis connected");

    // Validar Prisma
    await prisma.$queryRaw`SELECT 1`;
    logger.info("Database connected");

    // Bootstrap super admin (via .env — SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD)
    // Executado UMA ÚNICA VEZ na inicialização.
    // Se já existe um super_admin no banco, esta função retorna sem fazer nada (idempotente).
    // Não há API endpoint para criar, deletar ou promover super_admin.
    try {
      await adminService.bootstrapSuperAdmin(
        config.superAdminEmail,
        config.superAdminPassword,
        config.superAdminName,
      );
    } catch (error) {
      logger.warn({ error }, "Super admin bootstrap skipped or failed");
    }

    // Job diário de limpeza de fraud frames (03:00)
    startFraudFrameCleanupJob();

    // Fecha chamadas cujo período (aulas × duração) já venceu
    startAutoCloseSessionsJob();

    // Criar e iniciar app (Redis e banco já estão prontos)
    const app = createApp();
    const port = config.port;

    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(`Environment: ${config.nodeEnv}, Debug: ${config.debug}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received, shutting down gracefully");
      await disconnectRedis();
      await disconnectPrisma();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("SIGINT received, shutting down gracefully");
      await disconnectRedis();
      await disconnectPrisma();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, "Failed to bootstrap server");
    process.exit(1);
  }
}

bootstrap();
