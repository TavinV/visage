-- ============================================================================
-- Disciplinas, calibração por totem, fotos de perfil e checkout individual
--
-- Backfill: toda turma existente precisa de uma disciplina. Cada curso ganha
-- uma disciplina espelho (mesmo nome) que herda o totalClassesPlanned das
-- suas turmas e a lista de professores que já lecionavam nelas. A secretaria
-- desmembra depois pelo painel.
-- ============================================================================

-- ── Curso: duração da aula (secretaria) ─────────────────────────────────────
ALTER TABLE "courses"
  ADD COLUMN "lessonDuration"     INTEGER     NOT NULL DEFAULT 50,
  ADD COLUMN "lessonDurationUnit" VARCHAR(10) NOT NULL DEFAULT 'minutes';

-- ── Disciplinas ─────────────────────────────────────────────────────────────
CREATE TABLE "subjects" (
    "id"                  TEXT         NOT NULL,
    "tenantId"            TEXT         NOT NULL,
    "courseId"            TEXT         NOT NULL,
    "name"                VARCHAR(200) NOT NULL,
    "code"                VARCHAR(30),
    "lessonsPerSession"   INTEGER      NOT NULL DEFAULT 1,
    "totalLessonsPlanned" INTEGER      NOT NULL DEFAULT 0,
    "isActive"            BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMPTZ  NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subjects_courseId_name_key" ON "subjects"("courseId", "name");
CREATE INDEX "subjects_tenantId_courseId_idx" ON "subjects"("tenantId", "courseId");

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Professores habilitados por disciplina (N:N) ────────────────────────────
CREATE TABLE "subject_teachers" (
    "subjectId"  TEXT        NOT NULL,
    "userId"     TEXT        NOT NULL,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_teachers_pkey" PRIMARY KEY ("subjectId", "userId")
);

CREATE INDEX "subject_teachers_userId_idx" ON "subject_teachers"("userId");

ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Turma → disciplina ──────────────────────────────────────────────────────
ALTER TABLE "classes" ADD COLUMN "subjectId" TEXT;

-- Backfill 1: uma disciplina espelho por curso que já tem turmas
INSERT INTO "subjects" ("id", "tenantId", "courseId", "name", "lessonsPerSession", "totalLessonsPlanned", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    c."tenantId",
    c."id",
    c."name",
    1,
    COALESCE(MAX(cl."totalClassesPlanned"), 0),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "courses" c
JOIN "classes" cl ON cl."courseId" = c."id"
GROUP BY c."id", c."tenantId", c."name";

-- Backfill 2: aponta cada turma para a disciplina espelho do seu curso
UPDATE "classes" cl
SET "subjectId" = s."id"
FROM "subjects" s
WHERE s."courseId" = cl."courseId"
  AND cl."subjectId" IS NULL;

-- Backfill 3: professores que já lecionavam viram professores da disciplina
INSERT INTO "subject_teachers" ("subjectId", "userId", "assignedAt")
SELECT DISTINCT cl."subjectId", cl."teacherId", CURRENT_TIMESTAMP
FROM "classes" cl
WHERE cl."subjectId" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "classes" ALTER COLUMN "subjectId" SET NOT NULL;

CREATE INDEX "classes_tenantId_subjectId_idx" ON "classes"("tenantId", "subjectId");

ALTER TABLE "classes" ADD CONSTRAINT "classes_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A carga horária passou a viver na disciplina
ALTER TABLE "classes" DROP COLUMN "totalClassesPlanned";

-- ── Chamada: duração congelada e fechamento automático ──────────────────────
ALTER TABLE "class_sessions"
  ADD COLUMN "lessonDurationMin" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "scheduledEndsAt"   TIMESTAMPTZ,
  ADD COLUMN "autoClosed"        BOOLEAN NOT NULL DEFAULT false;

-- Sessões abertas ganham um prazo a partir do que já se sabe delas
UPDATE "class_sessions"
SET "scheduledEndsAt" = "startedAt" + ("classesWorth" * INTERVAL '50 minutes')
WHERE "status" = 'open';

CREATE INDEX "class_sessions_status_scheduledEndsAt_idx"
  ON "class_sessions"("status", "scheduledEndsAt");

-- ── Checkout individual: quando o professor liberou a saída ─────────────────
ALTER TABLE "attendance_records" ADD COLUMN "checkoutReleasedAt" TIMESTAMPTZ;

-- ── Calibração por totem (NULL = herda do tenant) ───────────────────────────
ALTER TABLE "devices"
  ADD COLUMN "recognitionThreshold" DOUBLE PRECISION,
  ADD COLUMN "livenessThreshold"    DOUBLE PRECISION,
  ADD COLUMN "livenessEnabled"      BOOLEAN,
  ADD COLUMN "calibratedAt"         TIMESTAMPTZ,
  ADD COLUMN "calibrationSourceId"  VARCHAR(36);

-- ── Fotos de perfil ─────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "photoPath"      VARCHAR(500),
  ADD COLUMN "photoUpdatedAt" TIMESTAMPTZ;

ALTER TABLE "tenants"
  ADD COLUMN "logoPath"      VARCHAR(500),
  ADD COLUMN "logoUpdatedAt" TIMESTAMPTZ;
