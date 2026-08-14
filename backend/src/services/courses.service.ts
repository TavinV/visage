/**
 * CoursesService
 * Gerencia cursos por tenant e período acadêmico.
 *
 * O curso carrega a duração de uma aula (minutos ou horas, escolha da
 * secretaria) — na prática é padrão institucional, então todas as disciplinas
 * do curso herdam esse valor. É a base do fechamento automático da chamada e
 * do cálculo de aulas no checkout individual.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { lessonDurationToMinutes } from "./subjects.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export type LessonDurationUnit = "minutes" | "hours";

export interface CreateCourseInput {
  tenantId: string;
  academicPeriodId: string;
  name: string;
  /** Quantas aulas cabem num dia letivo do curso. */
  lessonsPerDay?: number;
  lessonDuration?: number;
  lessonDurationUnit?: LessonDurationUnit;
}

export interface UpdateCourseInput {
  name?: string;
  academicPeriodId?: string;
  lessonsPerDay?: number;
  lessonDuration?: number;
  lessonDurationUnit?: LessonDurationUnit;
}

export interface CourseOutput {
  id: string;
  tenantId: string;
  academicPeriodId: string;
  periodName?: string;
  name: string;
  /** Quantas aulas cabem num dia letivo. */
  lessonsPerDay: number;
  /** Duração de uma aula na unidade escolhida pela secretaria. */
  lessonDuration: number;
  lessonDurationUnit: LessonDurationUnit;
  /** Mesmo valor normalizado em minutos — o que o backend usa em cálculos. */
  lessonDurationMin: number;
  subjectCount?: number;
  createdAt: Date;
}

export interface ListCoursesParams extends ListParams {
  tenantId: string;
  academicPeriodId?: string;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

class CoursesService extends BaseService {
  private static readonly SORT_FIELDS = ["name", "createdAt", "academicPeriodId"] as const;

  /**
   * Lista cursos de um tenant.
   */
  async list(params: ListCoursesParams): Promise<PaginatedResult<CourseOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, CoursesService.SORT_FIELDS) ??
      { createdAt: "desc" };
    const searchOr = this.buildSearchFilter(params.search, ["name"]);

    const where = {
      tenantId: params.tenantId,
      ...(params.academicPeriodId && { academicPeriodId: params.academicPeriodId }),
      ...(searchOr && { OR: searchOr }),
    };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        take,
        skip,
        orderBy,
        include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
      }),
      this.prisma.course.count({ where }),
    ]);

    return this.buildPaginatedResult(
      courses.map((c) => this.toOutput(c)),
      total,
      page,
      limit
    );
  }

  /**
   * Obtém um curso pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<CourseOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
    });
    if (!course) throw new NotFoundError("Course not found");
    return this.toOutput(course);
  }

  /**
   * Cria um novo curso.
   */
  async create(input: CreateCourseInput): Promise<CourseOutput> {
    // Validar que o tenant existe
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    // Validar que o período acadêmico existe e pertence ao tenant
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: input.academicPeriodId, tenantId: input.tenantId },
    });
    if (!period) throw new NotFoundError("Academic period not found in this tenant");

    const duration = this.validateDuration(input.lessonDuration, input.lessonDurationUnit);

    const course = await this.prisma.course.create({
      data: {
        tenantId: input.tenantId,
        academicPeriodId: input.academicPeriodId,
        name: input.name,
        ...(input.lessonsPerDay !== undefined && { lessonsPerDay: input.lessonsPerDay }),
        lessonDuration: duration.value,
        lessonDurationUnit: duration.unit,
      },
      include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
    });

    this.logger.info({ courseId: course.id, tenantId: input.tenantId }, "Course created");
    return this.toOutput(course);
  }

  /**
   * Duração da aula precisa render um valor operável em minutos: uma aula de
   * 0 min quebraria o cálculo de aulas do checkout, e acima de 8h não é aula.
   */
  private validateDuration(
    value: number | undefined,
    unit: LessonDurationUnit | undefined
  ): { value: number; unit: LessonDurationUnit } {
    const resolvedUnit: LessonDurationUnit = unit ?? "minutes";
    const resolvedValue = value ?? (resolvedUnit === "hours" ? 1 : 50);
    const minutes = lessonDurationToMinutes(resolvedValue, resolvedUnit);

    if (minutes < 5 || minutes > 480) {
      throw new ValidationError(
        "A duração da aula deve ficar entre 5 minutos e 8 horas",
        "INVALID_LESSON_DURATION"
      );
    }
    return { value: resolvedValue, unit: resolvedUnit };
  }

  /**
   * Atualiza um curso.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateCourseInput
  ): Promise<CourseOutput> {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
    });
    if (!course) throw new NotFoundError("Course not found");

    // Se academicPeriodId foi alterado, validar que existe e pertence ao tenant
    if (input.academicPeriodId && input.academicPeriodId !== course.academicPeriodId) {
      const period = await this.prisma.academicPeriod.findFirst({
        where: { id: input.academicPeriodId, tenantId },
      });
      if (!period) throw new NotFoundError("Academic period not found in this tenant");
    }

    // Duração é validada como par: mudar só a unidade sem o valor
    // transformaria "50 minutos" em "50 horas"
    const durationChanged =
      input.lessonDuration !== undefined || input.lessonDurationUnit !== undefined;
    const duration = durationChanged
      ? this.validateDuration(
          input.lessonDuration ?? course.lessonDuration,
          input.lessonDurationUnit ?? (course.lessonDurationUnit as LessonDurationUnit)
        )
      : null;

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.academicPeriodId && { academicPeriodId: input.academicPeriodId }),
        ...(input.lessonsPerDay !== undefined && { lessonsPerDay: input.lessonsPerDay }),
        ...(duration && {
          lessonDuration: duration.value,
          lessonDurationUnit: duration.unit,
        }),
      },
      include: { _count: { select: { subjects: true } }, academicPeriod: { select: { name: true } } },
    });

    this.logger.info({ courseId: id, tenantId }, "Course updated");
    return this.toOutput(updated);
  }

  /**
   * Deleta um curso.
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
      select: { id: true, _count: { select: { classes: true } } },
    });
    if (!course) throw new NotFoundError("Course not found");

    // As disciplinas caem em cascata com o curso, mas as turmas seguram a
    // disciplina (RESTRICT) — falharia no banco com erro cru de FK
    if (course._count.classes > 0) {
      throw new ValidationError(
        `Este curso tem ${course._count.classes} turma(s) vinculada(s). Remova as turmas antes de excluir.`,
        "COURSE_HAS_CLASSES"
      );
    }

    await this.prisma.course.delete({ where: { id } });
    this.logger.info({ courseId: id, tenantId }, "Course deleted");
  }

  private toOutput(course: any): CourseOutput {
    const unit = (course.lessonDurationUnit ?? "minutes") as LessonDurationUnit;
    const value = course.lessonDuration ?? 50;
    return {
      id: course.id,
      tenantId: course.tenantId,
      academicPeriodId: course.academicPeriodId,
      name: course.name,
      periodName: course.academicPeriod?.name,
      lessonsPerDay: course.lessonsPerDay ?? 4,
      lessonDuration: value,
      lessonDurationUnit: unit,
      lessonDurationMin: lessonDurationToMinutes(value, unit),
      subjectCount: course._count?.subjects,
      createdAt: course.createdAt,
    };
  }
}

export const coursesService = new CoursesService();
