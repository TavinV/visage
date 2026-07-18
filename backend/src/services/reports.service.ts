/**
 * ReportsService
 * Relatórios de frequência agregados a partir de student_class_summary
 * e attendance_records. Sempre filtrado por tenantId.
 *
 * student_class_summary não possui tenant_id próprio — o isolamento é
 * garantido filtrando pelas turmas do tenant (class.tenantId).
 */

import { BaseService } from "./base.service";
import { NotFoundError } from "../utils/errors";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface FrequencyReportStudent {
  userId: string;
  name: string;
  attended: number;
  absent: number;
  frequencyPercent: number;
}

export interface FrequencyReportOutput {
  classId: string;
  className: string;
  periodId?: string;
  totalClassesPlanned: number;
  students: FrequencyReportStudent[];
}

export interface StudentClassSummaryOutput {
  classId: string;
  name: string;
  attended: number;
  absent: number;
  frequencyPercent: number;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

function percent(attended: number, absent: number): number {
  const total = attended + absent;
  if (total === 0) return 0;
  return Math.round((attended / total) * 10000) / 100;
}

class ReportsService extends BaseService {
  /**
   * GET /attendance/reports/frequency?class_id&period_id
   * Frequência agregada por turma.
   */
  async frequencyByClass(
    tenantId: string,
    classId: string,
    periodId?: string
  ): Promise<FrequencyReportOutput> {
    const classItem = await this.prisma.class.findFirst({
      where: {
        id: classId,
        tenantId,
        ...(periodId && { course: { academicPeriodId: periodId } }),
      },
      select: { id: true, name: true, totalClassesPlanned: true, course: { select: { academicPeriodId: true } } },
    });
    if (!classItem) throw new NotFoundError("Class not found in this tenant");

    const summaries = await this.prisma.studentClassSummary.findMany({
      where: { classId, class: { tenantId } },
      select: { userId: true, classesAttended: true, classesAbsent: true },
    });

    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: summaries.map((s) => s.userId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return {
      classId: classItem.id,
      className: classItem.name,
      periodId: classItem.course.academicPeriodId,
      totalClassesPlanned: classItem.totalClassesPlanned,
      students: summaries
        .map((s) => ({
          userId: s.userId,
          name: nameById.get(s.userId) ?? "—",
          attended: s.classesAttended,
          absent: s.classesAbsent,
          frequencyPercent: percent(s.classesAttended, s.classesAbsent),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * GET /attendance/reports/student/:id
   * Histórico completo de presenças do aluno (todas as sessões/turmas).
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
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { classSession: { startedAt: "desc" } },
    });
  }

  /**
   * GET /attendance/reports/student/:id/summary
   * Agregado por turma: aulas assistidas, faltas e % de frequência.
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
      where: { userId: studentId, class: { tenantId } },
      select: {
        classId: true,
        classesAttended: true,
        classesAbsent: true,
        class: { select: { name: true } },
      },
    });

    return summaries.map((s) => ({
      classId: s.classId,
      name: s.class.name,
      attended: s.classesAttended,
      absent: s.classesAbsent,
      frequencyPercent: percent(s.classesAttended, s.classesAbsent),
    }));
  }
}

export const reportsService = new ReportsService();
