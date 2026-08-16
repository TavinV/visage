-- ============================================================================
-- Identificação do aluno configurável por instituição.
--
-- Escola que não quer registrar CPF passa a poder trabalhar só com a matrícula
-- interna, e o que o aluno digita no totem deixa de ser necessariamente o CPF.
-- A validação dos dígitos verificadores vira opcional (bases legadas têm CPF
-- digitado errado que a instituição não quer bloquear).
--
-- Defaults preservam o comportamento atual: CPF registrado, CPF no totem,
-- validação ligada.
-- ============================================================================

ALTER TABLE "tenant_settings"
  ADD COLUMN "studentIdentification" VARCHAR(20) NOT NULL DEFAULT 'cpf',
  ADD COLUMN "totemIdentification"   VARCHAR(20) NOT NULL DEFAULT 'cpf',
  ADD COLUMN "validateCpf"           BOOLEAN     NOT NULL DEFAULT true;

-- Busca do aluno pela matrícula no totem
CREATE INDEX "users_tenantId_enrollmentCode_idx" ON "users"("tenantId", "enrollmentCode");
