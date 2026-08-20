/**
 * Setup de testes — variáveis de ambiente mínimas para importar lib/config.
 * Nenhum valor aqui é usado contra serviços reais (Prisma/Redis são mockados).
 */

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/Visage_test";
process.env.MASTER_KEY = "a".repeat(64);
process.env.JWT_SECRET = "test-jwt-secret";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
process.env.SUPER_ADMIN_EMAIL = "test@Visage.local";
process.env.SUPER_ADMIN_PASSWORD = "TestPassword123!";
process.env.ENGINE_API_KEY = "test-engine-key";
process.env.LOG_LEVEL = "silent";
