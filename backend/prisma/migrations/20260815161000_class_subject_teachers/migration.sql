-- ============================================================================
-- Uma disciplina da turma passa a ter VÁRIOS professores.
--
-- Motivação: numa faculdade a mesma disciplina é dividida entre docentes
-- (teoria e laboratório, revezamento por bimestre, professor e monitor), e
-- todos precisam poder abrir a chamada dela.
--
-- class_subjects."teacherId" continua existindo como RESPONSÁVEL — é o nome
-- que sai em relatórios e o padrão ao abrir a chamada. A nova tabela guarda o
-- time completo, com o responsável marcado como isPrimary.
--
-- O backfill copia o professor atual de cada disciplina, então nada muda de
-- comportamento até a secretaria alocar mais gente.
--
-- Também entram os padrões de carga do currículo, usados ao aplicar a grade
-- do curso em todas as turmas de uma vez.
-- ============================================================================

CREATE TABLE "class_subject_teachers" (
    "classSubjectId" TEXT        NOT NULL,
    "teacherId"      TEXT        NOT NULL,
    "isPrimary"      BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_subject_teachers_pkey" PRIMARY KEY ("classSubjectId", "teacherId")
);

CREATE INDEX "class_subject_teachers_teacherId_idx" ON "class_subject_teachers"("teacherId");

ALTER TABLE "class_subject_teachers" ADD CONSTRAINT "class_subject_teachers_classSubjectId_fkey"
  FOREIGN KEY ("classSubjectId") REFERENCES "class_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subject_teachers" ADD CONSTRAINT "class_subject_teachers_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: o professor que já respondia pela disciplina vira o responsável
INSERT INTO "class_subject_teachers" ("classSubjectId", "teacherId", "isPrimary")
SELECT cs."id", cs."teacherId", true
FROM "class_subjects" cs
ON CONFLICT DO NOTHING;

-- ── Carga padrão do currículo ───────────────────────────────────────────────
ALTER TABLE "subjects"
  ADD COLUMN "defaultLessonsPerSession"   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "defaultTotalLessonsPlanned" INTEGER NOT NULL DEFAULT 0;

-- Herda o que as turmas já praticam: a moda da carga por disciplina é um
-- ponto de partida melhor do que 1 aula / 0 previstas
UPDATE "subjects" s
SET "defaultLessonsPerSession" = agg."lessonsPerSession",
    "defaultTotalLessonsPlanned" = agg."totalLessonsPlanned"
FROM (
  SELECT DISTINCT ON (cs."subjectId")
         cs."subjectId",
         cs."lessonsPerSession",
         cs."totalLessonsPlanned"
  FROM "class_subjects" cs
  GROUP BY cs."subjectId", cs."lessonsPerSession", cs."totalLessonsPlanned"
  ORDER BY cs."subjectId", COUNT(*) DESC
) agg
WHERE agg."subjectId" = s."id";
