-- Trilha de auditoria completa
--
-- 1. auth_sessions: uma linha por login no console, fechada no logout/expiração.
-- 2. audit_logs ganha ator (snapshot), alvo, estado antes/depois, origem (IP/UA)
--    e vínculo com a sessão de login.
--
-- As linhas antigas de audit_logs são preservadas: as colunas novas entram como
-- NULL/DEFAULT e recebem categoria/severidade a partir da action existente.

-- ─────────────────────────────────────────────────────────────────────────────
-- AuthSession
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    -- Nullable de propósito: excluir a conta não pode apagar o registro de que
    -- houve o login. O snapshot abaixo mantém a sessão legível sem o usuário.
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL,
    "userEmail" VARCHAR(200),
    "userRole" VARCHAR(20) NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "loginAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ,
    "endReason" VARCHAR(20),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX "auth_sessions_tenantId_loginAt_idx" ON "auth_sessions"("tenantId", "loginAt" DESC);
CREATE INDEX "auth_sessions_tenantId_userId_loginAt_idx" ON "auth_sessions"("tenantId", "userId", "loginAt" DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs — expansão
-- ─────────────────────────────────────────────────────────────────────────────

-- tenantId passa a ser opcional: login falho de e-mail desconhecido não tem
-- instituição associada, e esse evento precisa ser registrado mesmo assim.
ALTER TABLE "audit_logs" ALTER COLUMN "tenantId" DROP NOT NULL;

ALTER TABLE "audit_logs"
    ADD COLUMN "actorType"     VARCHAR(20) NOT NULL DEFAULT 'user',
    ADD COLUMN "actorName"     VARCHAR(200),
    ADD COLUMN "actorEmail"    VARCHAR(200),
    ADD COLUMN "actorRole"     VARCHAR(20),
    ADD COLUMN "sessionId"     TEXT,
    ADD COLUMN "deviceId"      TEXT,
    ADD COLUMN "category"      VARCHAR(30) NOT NULL DEFAULT 'system',
    ADD COLUMN "severity"      VARCHAR(10) NOT NULL DEFAULT 'info',
    ADD COLUMN "status"        VARCHAR(10) NOT NULL DEFAULT 'success',
    ADD COLUMN "targetType"    VARCHAR(40),
    ADD COLUMN "targetId"      TEXT,
    ADD COLUMN "targetLabel"   VARCHAR(200),
    ADD COLUMN "beforeState"   JSONB,
    ADD COLUMN "afterState"    JSONB,
    ADD COLUMN "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "ipAddress"     VARCHAR(45),
    ADD COLUMN "userAgent"     VARCHAR(500),
    ADD COLUMN "requestMethod" VARCHAR(10),
    ADD COLUMN "requestPath"   VARCHAR(200),
    ADD COLUMN "metadata"      JSONB;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE SET NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL;

-- O FK antigo de userId era ON DELETE SET NULL implícito? Não: era o default
-- (NO ACTION). Excluir um usuário travaria na trilha — troca para SET NULL,
-- que preserva a linha com o snapshot do ator.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;

-- Backfill das linhas gravadas antes deste schema (as duas ações LGPD que já
-- existiam em users.service).
UPDATE "audit_logs" SET "category" = 'consent', "severity" = 'critical', "targetType" = 'user'
    WHERE "action" = 'biometric_consent_revoked';
UPDATE "audit_logs" SET "category" = 'data', "severity" = 'critical', "targetType" = 'user'
    WHERE "action" = 'user_data_erased';

-- Renomeia as ações antigas para o padrão de chave do catálogo novo
UPDATE "audit_logs" SET "action" = 'consent.revoked' WHERE "action" = 'biometric_consent_revoked';
UPDATE "audit_logs" SET "action" = 'data.erased'     WHERE "action" = 'user_data_erased';

-- Snapshot do ator para as linhas antigas, a partir do usuário ainda existente
UPDATE "audit_logs" a
   SET "actorName"  = u."name",
       "actorEmail" = u."email",
       "actorRole"  = u."role"
  FROM "users" u
 WHERE a."userId" = u."id" AND a."actorName" IS NULL;

CREATE INDEX "audit_logs_tenantId_action_createdAt_idx" ON "audit_logs"("tenantId", "action", "createdAt" DESC);
CREATE INDEX "audit_logs_tenantId_category_createdAt_idx" ON "audit_logs"("tenantId", "category", "createdAt" DESC);
CREATE INDEX "audit_logs_tenantId_userId_createdAt_idx" ON "audit_logs"("tenantId", "userId", "createdAt" DESC);
CREATE INDEX "audit_logs_sessionId_createdAt_idx" ON "audit_logs"("sessionId", "createdAt");
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt" DESC);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);
