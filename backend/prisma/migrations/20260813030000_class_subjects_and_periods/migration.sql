-- ============================================================================
-- Turma passa a ter VÁRIAS disciplinas, cada uma com seu professor e carga.
--
-- Antes:  Class → 1 Subject, Subject → N professores, carga na Subject.
-- Agora:  Class → N ClassSubject(disciplina + professor + carga).
--
-- Backfill: cada turma existente vira uma turma com exatamente uma disciplina,
-- herdando o professor que já respondia por ela e a carga que estava na
-- disciplina. Chamadas e frequência acumulada são reapontadas para o novo
-- vínculo, sem perder histórico.
-- ============================================================================

-- ── Curso: quantas aulas cabem num dia ──────────────────────────────────────
ALTER TABLE "courses" ADD COLUMN "lessonsPerDay" INTEGER NOT NULL DEFAULT 4;

-- ── Turma × disciplina ──────────────────────────────────────────────────────
CREATE TABLE "class_subjects" (
    "id"                  TEXT        NOT NULL,
    "tenantId"            TEXT        NOT NULL,
    "classId"             TEXT        NOT NULL,
    "subjectId"           TEXT        NOT NULL,
    "teacherId"           TEXT        NOT NULL,
    "lessonsPerSession"   INTEGER     NOT NULL DEFAULT 1,
    "totalLessonsPlanned" INTEGER     NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMPTZ NOT NULL,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_subjects_classId_subjectId_key" ON "class_subjects"("classId", "subjectId");
CREATE INDEX "class_subjects_tenantId_teacherId_idx" ON "class_subjects"("tenantId", "teacherId");

ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill 1: a dupla (turma, disciplina) que já existia implicitamente
INSERT INTO "class_subjects" ("id", "tenantId", "classId", "subjectId", "teacherId", "lessonsPerSession", "totalLessonsPlanned", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    cl."tenantId",
    cl."id",
    cl."subjectId",
    cl."teacherId",
    s."lessonsPerSession",
    s."totalLessonsPlanned",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "classes" cl
JOIN "subjects" s ON s."id" = cl."subjectId";

-- ── Chamada passa a pertencer à disciplina da turma ─────────────────────────
ALTER TABLE "class_sessions" ADD COLUMN "classSubjectId" TEXT;

UPDATE "class_sessions" cs
SET "classSubjectId" = csub."id"
FROM "class_subjects" csub
WHERE csub."classId" = cs."classId";

-- Sessão órfã (turma apagada por cascata em algum momento) não tem para onde
-- ir; sem isso o SET NOT NULL abaixo falharia
DELETE FROM "class_sessions" WHERE "classSubjectId" IS NULL;

ALTER TABLE "class_sessions" ALTER COLUMN "classSubjectId" SET NOT NULL;

ALTER TABLE "class_sessions" DROP CONSTRAINT IF EXISTS "class_sessions_classId_fkey";
ALTER TABLE "class_sessions" DROP COLUMN "classId";

ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_classSubjectId_fkey"
  FOREIGN KEY ("classSubjectId") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "class_sessions_classSubjectId_idx" ON "class_sessions"("classSubjectId");

-- ── Frequência acumulada passa a ser por disciplina ─────────────────────────
ALTER TABLE "student_class_summary" ADD COLUMN "classSubjectId" TEXT;

UPDATE "student_class_summary" scs
SET "classSubjectId" = csub."id"
FROM "class_subjects" csub
WHERE csub."classId" = scs."classId";

DELETE FROM "student_class_summary" WHERE "classSubjectId" IS NULL;

ALTER TABLE "student_class_summary" DROP CONSTRAINT IF EXISTS "student_class_summary_pkey";
ALTER TABLE "student_class_summary" DROP CONSTRAINT IF EXISTS "student_class_summary_classId_fkey";
ALTER TABLE "student_class_summary" DROP COLUMN "classId";

ALTER TABLE "student_class_summary" ALTER COLUMN "classSubjectId" SET NOT NULL;
ALTER TABLE "student_class_summary" ADD CONSTRAINT "student_class_summary_pkey"
  PRIMARY KEY ("classSubjectId", "userId");
ALTER TABLE "student_class_summary" ADD CONSTRAINT "student_class_summary_classSubjectId_fkey"
  FOREIGN KEY ("classSubjectId") REFERENCES "class_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Turma deixa de ter disciplina e professor próprios ──────────────────────
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_subjectId_fkey";
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_teacherId_fkey";
DROP INDEX IF EXISTS "classes_tenantId_subjectId_idx";
ALTER TABLE "classes" DROP COLUMN "subjectId";
ALTER TABLE "classes" DROP COLUMN "teacherId";

CREATE INDEX "classes_tenantId_courseId_idx" ON "classes"("tenantId", "courseId");

-- ── Disciplina vira catálogo: sem professores, sem carga ────────────────────
DROP TABLE IF EXISTS "subject_teachers";

ALTER TABLE "subjects" DROP COLUMN "lessonsPerSession";
ALTER TABLE "subjects" DROP COLUMN "totalLessonsPlanned";
