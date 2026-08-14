/**
 * ReportsService
 * Relatórios de frequência agregados a partir de student_class_summary
 * e attendance_records. Sempre filtrado por tenantId.
 *
 * A frequência é POR DISCIPLINA da turma: o aluno pode ter 90% em Matemática
 * e 40% em Física no mesmo 3ºA, e reprovar só em Física.
 *
 * O denominador é o total de aulas previstas no período (definido pela
 * secretaria), não o número de chamadas que já aconteceram. Quem assistiu 2
 * de 40 aulas previstas tem 5%, não 33% — é assim que a instituição calcula.
 *
 * student_class_summary não possui tenant_id próprio — o isolamento é
 * garantido filtrando pelo vínculo turma×disciplina do tenant.
 */

import { BaseService } from "./base.service";
import { NotFoundError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface FrequencyReportStudent {
  userId: string;
  name: string;
  attended: number;
  absent: number;
  /** Presenças ÷ aulas previstas no período. */
  frequencyPercent: number;
  /** Presenças ÷ aulas que já aconteceram — o parcial do que ocorreu. */
  partialPercent: number;
}

export interface FrequencyReportOutput {
  classSubjectId: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherName: string;
  periodId?: string;
  periodName?: string;
  /** Aulas previstas no período — denominador da frequência. */
  totalClassesPlanned: number;
  /** Aulas já lançadas (soma do que as chamadas encerradas valeram). */
  lessonsSoFar: number;
  students: FrequencyReportStudent[];
}

export interface StudentClassSummaryOutput {
  classSubjectId: string;
  classId: string;
  /** "3º A — Matemática" */
  name: string;
  className: string;
  subjectName: string;
  attended: number;
  absent: number;
  frequencyPercent: number;
  totalClassesPlanned: number;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

/**
 * Frequência sobre o total previsto no período. Sem total configurado, cai
 * para o parcial (do que já ocorreu) — melhor que dividir por zero e mostrar
 * 0% para uma turma inteira.
 */
function frequencyOf(attended: number, absent: number, planned: number): number {
  const denominator = planned > 0 ? planned : attended + absent;
  if (denominator === 0) return 0;
  return Math.round((attended / denominator) * 10000) / 100;
}

function partialOf(attended: number, absent: number): number {
  const total = attended + absent;
  if (total === 0) return 0;
  return Math.round((attended / total) * 10000) / 100;
}

class ReportsService extends BaseService {
  /**
   * GET /attendance/reports/frequency?class_subject_id
   * Frequência agregada de uma disciplina de uma turma.
   */
  async frequencyByClassSubject(
    tenantId: string,
    classSubjectId: string
  ): Promise<FrequencyReportOutput> {
    const classSubject = await this.prisma.classSubject.findFirst({
      where: { id: classSubjectId, tenantId },
      select: {
        id: true,
        classId: true,
        totalLessonsPlanned: true,
        subject: { select: { name: true } },
        teacher: { select: { name: true } },
        class: {
          select: {
            name: true,
            course: {
              select: {
                academicPeriodId: true,
                academicPeriod: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!classSubject) {
      throw new NotFoundError("Disciplina da turma não encontrada nesta instituição");
    }

    const summaries = await this.prisma.studentClassSummary.findMany({
      where: { classSubjectId },
      select: { userId: true, classesAttended: true, classesAbsent: true },
    });

    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: summaries.map((s) => s.userId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    // Quanto já foi lançado: o maior (presenças + faltas) entre os alunos.
    // Quem entrou na turma depois tem menos, e a turma não pode encolher por
    // causa dele.
    const lessonsSoFar = summaries.reduce(
      (max, s) => Math.max(max, s.classesAttended + s.classesAbsent),
      0
    );
    const planned = classSubject.totalLessonsPlanned;

    return {
      classSubjectId: classSubject.id,
      classId: classSubject.classId,
      className: classSubject.class.name,
      subjectName: classSubject.subject.name,
      teacherName: classSubject.teacher.name,
      periodId: classSubject.class.course.academicPeriodId,
      periodName: classSubject.class.course.academicPeriod?.name,
      totalClassesPlanned: planned,
      lessonsSoFar,
      students: summaries
        .map((s) => ({
          userId: s.userId,
          name: nameById.get(s.userId) ?? "—",
          attended: s.classesAttended,
          absent: s.classesAbsent,
          frequencyPercent: frequencyOf(s.classesAttended, s.classesAbsent, planned),
          partialPercent: partialOf(s.classesAttended, s.classesAbsent),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Frequência de TODAS as disciplinas de uma turma — a visão que o professor
   * abre a partir da turma.
   */
  async frequencyByClass(
    tenantId: string,
    classId: string
  ): Promise<FrequencyReportOutput[]> {
    const classSubjects = await this.prisma.classSubject.findMany({
      where: { classId, tenantId },
      select: { id: true },
      orderBy: { subject: { name: "asc" } },
    });

    return Promise.all(
      classSubjects.map((cs) => this.frequencyByClassSubject(tenantId, cs.id))
    );
  }

  /**
   * GET /attendance/reports/student/:id
   * Histórico completo de presenças do aluno (todas as disciplinas).
   */
  async studentHistory(tenantId: string, studentId: string): Promise<object[]> {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Student not found in this tenant");

    return this.prisma.attendanceRecord.findMany({
      where: { tenantId, userId: studentId },
      select: {
        id: true,
        status: true,
        recognizedAt: true,
        checkedOutAt: true,
        wasPreAttendance: true,
        classSession: {
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            classesWorth: true,
            classSubject: {
              select: {
                id: true,
                subject: { select: { name: true } },
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { classSession: { startedAt: "desc" } },
    });
  }

  /**
   * GET /attendance/reports/student/:id/summary
   * Agregado por disciplina: aulas assistidas, faltas e % de frequência.
   */
  async studentSummary(
    tenantId: string,
    studentId: string
  ): Promise<StudentClassSummaryOutput[]> {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Student not found in this tenant");

    const summaries = await this.prisma.studentClassSummary.findMany({
      where: { userId: studentId, classSubject: { tenantId } },
      select: {
        classSubjectId: true,
        classesAttended: true,
        classesAbsent: true,
        classSubject: {
          select: {
            classId: true,
            totalLessonsPlanned: true,
            subject: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
      },
    });

    return summaries
      .map((s) => ({
        classSubjectId: s.classSubjectId,
        classId: s.classSubject.classId,
        name: `${s.classSubject.class.name} — ${s.classSubject.subject.name}`,
        className: s.classSubject.class.name,
        subjectName: s.classSubject.subject.name,
        attended: s.classesAttended,
        absent: s.classesAbsent,
        frequencyPercent: frequencyOf(
          s.classesAttended,
          s.classesAbsent,
          s.classSubject.totalLessonsPlanned
        ),
        totalClassesPlanned: s.classSubject.totalLessonsPlanned,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const reportsService = new ReportsService();
