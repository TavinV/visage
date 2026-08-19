-- Duração de aula deixa de ser só do curso e passa a ser por turma-disciplina:
-- a mesma disciplina pode durar tempos diferentes em turmas diferentes.

-- 1. Nova coluna, ainda opcional, pra poder fazer o backfill antes de travar NOT NULL.
ALTER TABLE "class_subjects" ADD COLUMN "lessonDurationMin" INTEGER;

-- 2. Backfill: parte da duração hoje configurada no curso da turma, convertida pra minutos.
UPDATE "class_subjects" cs
SET "lessonDurationMin" = GREATEST(1, ROUND(
  c."lessonDuration" * CASE WHEN c."lessonDurationUnit" = 'hours' THEN 60 ELSE 1 END
))
FROM "classes" cl
JOIN "courses" c ON c.id = cl."courseId"
WHERE cl.id = cs."classId";

-- 3. Trava a coluna depois do backfill.
ALTER TABLE "class_subjects" ALTER COLUMN "lessonDurationMin" SET NOT NULL;
ALTER TABLE "class_subjects" ALTER COLUMN "lessonDurationMin" SET DEFAULT 50;

-- 4. Disciplina (subjects) não guarda mais carga padrão — cada turma decide a
--    sua própria em class_subjects, sem herdar nada do catálogo.
ALTER TABLE "subjects" DROP COLUMN "defaultLessonsPerSession";
ALTER TABLE "subjects" DROP COLUMN "defaultTotalLessonsPlanned";
