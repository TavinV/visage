-- Migration: add_cpf_uniqueness_and_normalize_documents
-- Normaliza CPF (users.document) e CNPJ (tenants.document) para armazenar
-- apenas dígitos (sem pontos, traços ou barras), e adiciona restrição única
-- em (tenantId, document) para usuários.

-- ============================================================================
-- 1. Normalizar documentos existentes
-- ============================================================================

-- CPF: remover pontos e hífens  →  "123.456.789-09"  ➜  "12345678909"
UPDATE "users"
SET "document" = TRANSLATE("document", '.-', '')
WHERE "document" IS NOT NULL;

-- CNPJ: remover pontos, hífens e barras  →  "12.345.678/0001-99"  ➜  "12345678000199"
UPDATE "tenants"
SET "document" = TRANSLATE("document", '.-/', '')
WHERE "document" IS NOT NULL;

-- ============================================================================
-- 2. Ajustar tamanho das colunas (após normalização — dados já cabem)
-- ============================================================================

ALTER TABLE "users" ALTER COLUMN "document" TYPE VARCHAR(11);
ALTER TABLE "tenants" ALTER COLUMN "document" TYPE VARCHAR(14);

-- ============================================================================
-- 3. Unique constraint em users(tenantId, document)
-- PostgreSQL: NULL não viola unique — múltiplos alunos sem CPF são permitidos.
-- ============================================================================

CREATE UNIQUE INDEX "users_tenantId_document_key"
ON "users"("tenantId", "document");
