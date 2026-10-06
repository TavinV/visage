-- ============================================================================
-- Áudio nos totens.
--
-- A instituição decide se os totens falam (orientação do rosto no cadastro,
-- confirmação de cadastro e de exclusão da biometria) e com qual voz.
--
-- Desligado por padrão: totens existentes continuam exatamente como estão,
-- só com os bipes de sucesso/erro.
-- ============================================================================

ALTER TABLE "tenant_settings"
  ADD COLUMN "totemAudioEnabled" BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "totemVoice"        VARCHAR(20) NOT NULL DEFAULT 'telma';
