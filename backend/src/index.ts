/**
 * Server Entry Point
 */

import "dotenv/config";
import { createApp } from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { disconnectPrisma, prisma } from "./lib/prisma";
import { bootstrapSuperAdmin } from "./services/admin.service";

async function bootstrap() {
  try {
    // Validar configuração
    config; // Apenas acessar para validar (validateConfig é chamado na importação)

    logger.info("Starting VisageX Backend Server...");

    // Conectar Redis
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
      await bootstrapSuperAdmin(config.superAdminEmail, config.superAdminPassword, config.superAdminName);
    } catch (error) {
      logger.warn({ error }, "Super admin bootstrap skipped or failed");
    }

    // Criar e iniciar app
    const app = createApp();
    const port = config.port;

    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(
        `Environment: ${config.nodeEnv}, Debug: ${config.debug}`
      );
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
