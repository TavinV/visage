/**
 * ClassSessionsService
 * Gerencia sessões de chamada por turma.
 *
 * A chamada é aberta pelo PROFESSOR (ou pela administração), que escolhe
 * apenas DUAS coisas: a sala e a hora real em que a aula começou. Quanto a
 * chamada vale em aulas vem da disciplina (secretaria), nunca do professor.
 *
 * A hora de início é informada porque o professor pode abrir a chamada 40
 * minutos depois de a aula ter começado — e o fechamento automático e o
 * cálculo de aulas do checkout precisam do horário verdadeiro.
 *
 * Side-effects:
 *   - Abertura: warm cache da engine (embeddings dos candidatos) e
 *     consolidação de pré-presenças válidas em attendance_records.
 *   - Fechamento: ausentes consolidados, student_class_summary atualizado
 *     respeitando overrides por aluno (classesCounted), evento SSE.
 *   - Cancelamento: sessão encerrada SEM consolidar nada.
 */

import { BaseService, ListParams, PaginatedResult } from "./base.service";
import { NotFoundError, ValidationError } from "../utils/errors";
import { engineWarmCache } from "../lib/faceEngine";
import { getTenantDekPayload, getCandidatesForClass } from "./facial-payload";
import { lessonDurationToMinutes } from "./subjects.service";
import { sseService } from "./sse.service";
import { auditService } from "./audit.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateClassSessionInput {
  tenantId: string;
  /** A chamada é de uma disciplina da turma, não da turma inteira. */
  classSubjectId: string;
  teacherId: string;
  createdById: string;
  /** Sala onde a aula vai acontecer — default: sala padrão da turma. */
  locationId?: string;
  /**
   * Hora real de início da aula. Default: agora. Aceita passado (chamada
   * aberta com atraso), nunca futuro.
   */
  startedAt?: Date;
}

export interface UpdateClassSessionInput {
  status?: "open" | "closed";
  /** Correção da hora de início — recalcula o prazo de fechamento. */
  startedAt?: Date;
}

export interface ClassSessionOutput {
  id: string;
  tenantId: string;
  classSubjectId: string;
  classId: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  teacherId: string;
  teacherName?: string;
  createdById: string;
  locationId?: string;
  locationName?: string;
  startedAt: Date;
  endedAt?: Date;
  status: string;
  /** Derivado da disciplina, congelado na abertura. */
  classesWorth: number;
  lessonDurationMin: number;
  /** startedAt + classesWorth × lessonDurationMin. */
  scheduledEndsAt?: Date;
  autoClosed: boolean;
  createdAt: Date;
}

export interface ListClassSessionsParams extends ListParams {
  tenantId: string;
  /** Todas as chamadas da turma, de qualquer disciplina. */
  classId?: string;
  /** Chamadas de uma disciplina específica da turma. */
  classSubjectId?: string;
  status?: "open" | "closed" | "cancelled";
  /** Professor vê apenas as próprias sessões. */
  teacherId?: string;
}

export interface RollcallStudent {
  userId: string;
  name: string;
  enrollmentCode?: string;
  facialStatus: string;
  /** 'present' | 'absent' | 'pending' (sem registro ainda). */
  status: string;
  /** Como a presença entrou: 'facial' | 'pre' | 'manual' | null. */
  source: "facial" | "pre" | "manual" | null;
  recognizedAt?: Date;
  confidence?: number;
  /** Aulas que este aluno conta nesta sessão (efetivo, já com override). */
  classesCounted: number;
  adjusted: boolean;
  /** Checkout individual: professor liberou a saída deste aluno. */
  checkoutReleased: boolean;
  checkoutReleasedAt?: Date;
  /** Preenchido quando o totem reconheceu a saída. */
  checkedOutAt?: Date;
}

export interface RollcallOutput {
  session: ClassSessionOutput;
  students: RollcallStudent[];
  stats: { present: number; absent: number; pending: number; facial: number; manual: number };
}

export interface SessionFrameOutput {
  id: string;
  status: string;
  livenessScore?: number;
  deviceId?: string;
  createdAt: Date;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

const ATTENDED_STATUSES = new Set(["present", "manual", "early_checkout"]);

/**
 * Quantas aulas o aluno efetivamente cumpriu ao sair antes do fim.
 *
 * Conta aulas INTEIRAS a partir da hora real de início da aula — por isso o
 * professor informa esse horário ao abrir a chamada. Numa aula de 4 × 50min
 * iniciada às 19:00, sair às 20:45 são 105 minutos: 2 aulas cheias, e os 5
 * minutos da terceira não contam.
 */
export function lessonsCompletedOnCheckout(
  startedAt: Date,
  checkedOutAt: Date,
  lessonDurationMin: number,
  classesWorth: number
): number {
  const elapsedMin = (checkedOutAt.getTime() - startedAt.getTime()) / 60_000;
  if (elapsedMin <= 0) return 0;
  const completed = Math.floor(elapsedMin / Math.max(1, lessonDurationMin));
  return Math.max(0, Math.min(completed, classesWorth));
}

/** Abrir uma chamada com início mais de 12h atrás é erro de digitação. */
const MAX_BACKDATE_HOURS = 12;

class ClassSessionsService extends BaseService {
  private static readonly SORT_FIELDS = ["startedAt", "createdAt", "status"] as const;

  private static readonly INCLUDE = {
    classSubject: {
      select: {
        classId: true,
        subjectId: true,
        subject: { select: { name: true } },
        class: { select: { name: true, locationId: true } },
      },
    },
    teacher: { select: { name: true } },
    location: { select: { name: true } },
  } as const;

  /**
   * Lista sessões de chamada de um tenant (professor: apenas as suas).
   */
  async list(params: ListClassSessionsParams): Promise<PaginatedResult<ClassSessionOutput>> {
    const { take, skip, page, limit } = this.buildPagination(params);
    const orderBy =
      this.buildOrderBy(params.sortBy, params.sortOrder, ClassSessionsService.SORT_FIELDS) ??
      { startedAt: "desc" };

    const where = {
      tenantId: params.tenantId,
      ...(params.classSubjectId && { classSubjectId: params.classSubjectId }),
      ...(params.classId && { classSubject: { classId: params.classId } }),
      ...(params.status && { status: params.status }),
      // Quem divide a disciplina vê o histórico dela inteiro, não só as
      // chamadas que abriu — é a mesma turma, a mesma frequência
      ...(params.teacherId && {
        OR: [
          { teacherId: params.teacherId },
          { classSubject: { teachers: { some: { teacherId: params.teacherId } } } },
        ],
      }),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.classSession.findMany({
        where,
        take,
        skip,
        orderBy,
        include: ClassSessionsService.INCLUDE,
      }),
      this.prisma.classSession.count({ where }),
    ]);

    return this.buildPaginatedResult(
      sessions.map((s) => this.toOutput(s)),
      total,
      page,
      limit
    );
  }

  /**
   * O professor está alocado na disciplina desta sessão?
   *
   * Vale tanto para quem abriu a chamada quanto para quem divide a disciplina
   * na turma — foi a secretaria que alocou os dois, então os dois respondem
   * pela chamada (encerrar, ajustar presença, liberar saída).
   */
  async isAssignedTeacher(
    sessionId: string,
    tenantId: string,
    userId: string
  ): Promise<boolean> {
    const found = await this.prisma.classSession.findFirst({
      where: {
        id: sessionId,
        tenantId,
        OR: [
          { teacherId: userId },
          { classSubject: { teachers: { some: { teacherId: userId } } } },
        ],
      },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Obtém uma sessão de chamada pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
      include: ClassSessionsService.INCLUDE,
    });
    if (!session) throw new NotFoundError("Class session not found");
    return this.toOutput(session);
  }

  /**
   * Cria uma nova sessão de chamada para uma DISCIPLINA de uma turma.
   *
   * Regras:
   *   - Só o professor daquela disciplina naquela turma abre (admin passa).
   *   - A mesma disciplina não pode ter duas chamadas abertas na turma.
   *   - A sala efetiva (escolhida ou padrão da turma) não pode estar ocupada
   *     por outra chamada aberta.
   *   - A aula precisa cair dentro do período acadêmico do curso.
   *   - Quanto a chamada vale e quanto tempo dura vêm do vínculo turma×
   *     disciplina e do curso, congelados na sessão: reconfigurar a grade
   *     depois não pode reescrever o histórico de uma aula que já aconteceu.
   */
  async create(input: CreateClassSessionInput): Promise<ClassSessionOutput> {
    const classSubject = await this.prisma.classSubject.findFirst({
      where: { id: input.classSubjectId, tenantId: input.tenantId },
      include: {
        subject: { select: { name: true } },
        teachers: { select: { teacherId: true } },
        class: {
          select: {
            id: true,
            name: true,
            locationId: true,
            course: {
              select: {
                lessonDuration: true,
                lessonDurationUnit: true,
                academicPeriod: {
                  select: { name: true, startsAt: true, endsAt: true, isActive: true },
                },
              },
            },
          },
        },
      },
    });
    if (!classSubject) {
      throw new NotFoundError("Disciplina da turma não encontrada nesta instituição");
    }

    const teacher = await this.prisma.user.findFirst({
      where: { id: input.teacherId, tenantId: input.tenantId },
      select: { id: true, name: true, role: true },
    });
    if (!teacher) throw new NotFoundError("Teacher not found in this tenant");
    if (teacher.role !== "teacher" && teacher.role !== "admin") {
      throw new ValidationError(
        "Apenas professores podem ser responsáveis por uma chamada",
        "NOT_A_TEACHER"
      );
    }

    // Professor abre a chamada de disciplina em que está alocado — o time
    // inclui o responsável. Admin do tenant opera qualquer uma (cobre
    // substituição sem precisar remexer na grade).
    const allowedTeachers = classSubject.teachers.length
      ? classSubject.teachers.map((t) => t.teacherId)
      : [classSubject.teacherId];
    if (teacher.role === "teacher" && !allowedTeachers.includes(teacher.id)) {
      throw new ValidationError(
        `${teacher.name} não leciona ${classSubject.subject.name} nesta turma`,
        "TEACHER_NOT_IN_SUBJECT"
      );
    }

    // Sala escolhida (se houver) precisa existir e estar ativa no tenant
    if (input.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: input.locationId, tenantId: input.tenantId, isActive: true },
      });
      if (!location) throw new NotFoundError("Sala não encontrada ou inativa");
    }

    // Duas chamadas abertas da MESMA disciplina duplicariam a presença;
    // disciplinas diferentes da turma podem coexistir (turnos distintos)
    const openForSubject = await this.prisma.classSession.findFirst({
      where: {
        tenantId: input.tenantId,
        classSubjectId: input.classSubjectId,
        status: "open",
      },
      select: { id: true },
    });
    if (openForSubject) {
      throw new ValidationError(
        `${classSubject.subject.name} já tem uma chamada aberta nesta turma. Encerre ou cancele antes de abrir outra.`,
        "CLASS_SESSION_ALREADY_OPEN"
      );
    }

    // A sala efetiva não pode estar ocupada por outra chamada aberta
    const effectiveLocationId = input.locationId ?? classSubject.class.locationId ?? undefined;
    if (effectiveLocationId) {
      const busy = await this.findOpenSessionAtLocation(input.tenantId, effectiveLocationId);
      if (busy) {
        throw new ValidationError(
          "Esta sala já está com uma chamada em andamento. Escolha outra sala ou aguarde.",
          "LOCATION_BUSY"
        );
      }
    }

    const startedAt = this.resolveStartedAt(input.startedAt);
    this.assertWithinAcademicPeriod(startedAt, classSubject.class.course.academicPeriod);

    const classesWorth = classSubject.lessonsPerSession;
    const lessonDurationMin = lessonDurationToMinutes(
      classSubject.class.course.lessonDuration,
      classSubject.class.course.lessonDurationUnit
    );
    const scheduledEndsAt = this.computeScheduledEnd(
      startedAt,
      classesWorth,
      lessonDurationMin
    );

    // Uma aula que já teria terminado não abre chamada — o job fecharia na
    // primeira varredura e o professor nem entenderia o que houve
    if (scheduledEndsAt.getTime() <= Date.now()) {
      throw new ValidationError(
        `Com início às ${startedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}, esta chamada já teria encerrado. Confira a hora informada.`,
        "SESSION_ALREADY_ENDED"
      );
    }

    const session = await this.prisma.classSession.create({
      data: {
        tenantId: input.tenantId,
        classSubjectId: input.classSubjectId,
        teacherId: input.teacherId,
        createdById: input.createdById,
        locationId: input.locationId ?? classSubject.class.locationId ?? null,
        status: "open",
        startedAt,
        classesWorth,
        lessonDurationMin,
        scheduledEndsAt,
      },
      include: ClassSessionsService.INCLUDE,
    });

    auditService.record({
      action: "session.opened",
      tenantId: input.tenantId,
      targetId: session.id,
      targetLabel: this.sessionLabel(session),
      afterState: {
        status: "open",
        startedAt: startedAt.toISOString(),
        scheduledEndsAt: scheduledEndsAt.toISOString(),
        classesWorth,
      },
      details: `Chamada aberta para ${this.sessionLabel(session)}`,
      metadata: {
        classSubjectId: input.classSubjectId,
        teacherId: input.teacherId,
        locationId: session.locationId ?? undefined,
      },
    });

    this.logger.info(
      {
        sessionId: session.id,
        classSubjectId: input.classSubjectId,
        tenantId: input.tenantId,
      },
      "Class session created"
    );

    // Side-effects de abertura — não podem falhar a criação da sessão
    const classId = classSubject.class.id;
    await this.warmEngineCache(input.tenantId, classId);
    await this.consolidatePreAttendances(
      input.tenantId,
      session.id,
      classId,
      session.locationId ?? undefined
    );

    return this.toOutput(session);
  }

  /**
   * A aula precisa cair dentro do ano letivo do curso. Sem isso, uma data
   * digitada errada (ano anterior, próximo semestre) entraria na frequência
   * de um período que já foi fechado.
   */
  private assertWithinAcademicPeriod(
    startedAt: Date,
    period: { name: string; startsAt: Date; endsAt: Date; isActive: boolean }
  ): void {
    if (!period.isActive) {
      throw new ValidationError(
        `O período ${period.name} está encerrado — não é possível abrir chamadas nele`,
        "PERIOD_INACTIVE"
      );
    }

    // startsAt/endsAt são @db.Date (meia-noite UTC). O dia final conta
    // inteiro, então a comparação vai até o fim dele.
    const dayStart = new Date(startedAt);
    dayStart.setHours(0, 0, 0, 0);
    const periodStart = new Date(period.startsAt);
    const periodEnd = new Date(period.endsAt);

    const asDay = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const localDay = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, "0")}-${String(startedAt.getDate()).padStart(2, "0")}`;

    if (localDay < asDay(periodStart) || localDay > asDay(periodEnd)) {
      const fmt = (d: Date) => asDay(d).split("-").reverse().join("/");
      throw new ValidationError(
        `A aula está fora do período ${period.name} (${fmt(periodStart)} a ${fmt(periodEnd)})`,
        "OUTSIDE_ACADEMIC_PERIOD"
      );
    }
  }

  /**
   * Valida a hora de início informada pelo professor. Passado é esperado
   * (chamada aberta com atraso); futuro nunca, e um atraso maior que
   * MAX_BACKDATE_HOURS é erro de digitação, não uma aula real.
   */
  private resolveStartedAt(startedAt?: Date): Date {
    if (!startedAt) return new Date();

    const now = Date.now();
    // Tolerância de 1 min absorve relógio do cliente adiantado
    if (startedAt.getTime() > now + 60_000) {
      throw new ValidationError(
        "A hora de início não pode estar no futuro",
        "START_TIME_IN_FUTURE"
      );
    }
    if (startedAt.getTime() < now - MAX_BACKDATE_HOURS * 60 * 60 * 1000) {
      throw new ValidationError(
        `A hora de início não pode estar mais de ${MAX_BACKDATE_HOURS} horas no passado`,
        "START_TIME_TOO_OLD"
      );
    }
    return startedAt;
  }

  /** Fim previsto: início + aulas × duração da aula. */
  private computeScheduledEnd(
    startedAt: Date,
    classesWorth: number,
    lessonDurationMin: number
  ): Date {
    return new Date(startedAt.getTime() + classesWorth * lessonDurationMin * 60_000);
  }

  /** Sessão aberta cuja sala efetiva (escolhida ou herdada da turma) é esta. */
  private async findOpenSessionAtLocation(tenantId: string, locationId: string) {
    return this.prisma.classSession.findFirst({
      where: {
        tenantId,
        status: "open",
        OR: [{ locationId }, { locationId: null, classSubject: { class: { locationId } } }],
      },
      select: { id: true },
    });
  }

  /**
   * Aquece o cache da engine com os embeddings cifrados dos candidatos da
   * turma, eliminando cache miss no pico de chegada dos alunos.
   */
  private async warmEngineCache(tenantId: string, classId: string): Promise<void> {
    try {
      const [dek, candidates] = await Promise.all([
        getTenantDekPayload(tenantId),
        getCandidatesForClass(tenantId, classId),
      ]);

      if (candidates.length === 0) {
        this.logger.info({ tenantId, classId }, "No registered candidates — warm cache skipped");
        return;
      }

      const result = await engineWarmCache({ tenantId, dek, candidates });
      this.logger.info(
        { tenantId, classId, warmed: result.warmed },
        "Engine cache warmed for class session"
      );
    } catch (error) {
      this.logger.warn({ tenantId, classId, error }, "Engine warm cache failed (non-fatal)");
    }
  }

  /**
   * Consolida pré-presenças válidas (não consolidadas e dentro da janela)
   * em attendance_records no momento da abertura da chamada.
   */
  private async consolidatePreAttendances(
    tenantId: string,
    sessionId: string,
    classId: string,
    sessionLocationId?: string
  ): Promise<void> {
    try {
      const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
      if (!settings?.preAttendanceEnabled) return;

      const pending = await this.prisma.preAttendance.findMany({
        where: {
          tenantId,
          consolidated: false,
          expires_at: { gt: new Date() },
          ...(sessionLocationId && { locationId: sessionLocationId }),
          user: { tenantId, classEnrollments: { some: { classId } } },
        },
      });

      if (pending.length === 0) return;

      await this.prisma.$transaction([
        this.prisma.attendanceRecord.createMany({
          data: pending.map((pre) => ({
            tenantId,
            classSessionId: sessionId,
            userId: pre.userId,
            status: "present",
            recognizedAt: pre.recognizedAt,
            confidence: pre.confidence,
            livenessScore: pre.livenessScore,
            wasPreAttendance: true,
          })),
          skipDuplicates: true,
        }),
        this.prisma.preAttendance.updateMany({
          where: { id: { in: pending.map((pre) => pre.id) }, tenantId },
          data: { consolidated: true },
        }),
      ]);

      this.logger.info(
        { tenantId, sessionId, consolidated: pending.length },
        "Pre-attendances consolidated into session"
      );
    } catch (error) {
      this.logger.warn({ tenantId, sessionId, error }, "Pre-attendance consolidation failed (non-fatal)");
    }
  }

  /**
   * Atualiza uma sessão de chamada.
   *
   * classesWorth não é editável: quem define o peso da aula é a secretaria,
   * pela disciplina. Corrigir a hora de início recalcula o prazo automático.
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateClassSessionInput
  ): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
    });
    if (!session) throw new NotFoundError("Class session not found");

    // Fechamento via PATCH segue o mesmo caminho de consolidação do close()
    if (input.status === "closed" && session.status === "open") {
      return this.close(id, tenantId);
    }

    let startedAt: Date | undefined;
    let scheduledEndsAt: Date | undefined;
    if (input.startedAt) {
      if (session.status !== "open") {
        throw new ValidationError(
          "A hora de início só pode ser corrigida enquanto a chamada está aberta",
          "SESSION_NOT_OPEN"
        );
      }
      startedAt = this.resolveStartedAt(input.startedAt);
      scheduledEndsAt = this.computeScheduledEnd(
        startedAt,
        session.classesWorth,
        session.lessonDurationMin
      );
    }

    const updated = await this.prisma.classSession.update({
      where: { id },
      data: {
        ...(input.status && { status: input.status }),
        ...(startedAt && { startedAt, scheduledEndsAt }),
      },
      include: ClassSessionsService.INCLUDE,
    });

    // Corrigir a hora de início desloca a janela inteira da aula e, com ela,
    // quem entra como presente — mudança que precisa de rastro
    auditService.recordChange({
      action: "session.updated",
      tenantId,
      targetId: id,
      targetLabel: this.sessionLabel(updated),
      before: session,
      after: updated,
      fields: ["status", "startedAt", "scheduledEndsAt"],
    });

    this.logger.info({ sessionId: id, tenantId }, "Class session updated");
    return this.findById(id, tenantId);
  }

  /**
   * Cancela uma chamada aberta por engano: encerra a sessão SEM consolidar
   * ausências nem tocar no student_class_summary. Presenças já registradas
   * ficam no histórico da sessão cancelada, mas não contam.
   */
  async cancel(id: string, tenantId: string): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
      include: {
        classSubject: {
          select: {
            classId: true,
            // subject/class name só para rotular o evento de auditoria
            subject: { select: { name: true } },
            class: { select: { name: true, locationId: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundError("Class session not found");
    if (session.status !== "open") {
      throw new ValidationError("Apenas chamadas abertas podem ser canceladas", "SESSION_NOT_OPEN");
    }

    await this.prisma.classSession.update({
      where: { id },
      data: { status: "cancelled", endedAt: new Date() },
    });

    await this.broadcastSessionEnd(
      tenantId,
      id,
      session.locationId ?? session.classSubject.class.locationId ?? undefined
    );

    // Cancelar descarta a chamada sem consolidar faltas: o histórico de
    // frequência daquela aula simplesmente não existe. Evento de atenção.
    auditService.record({
      action: "session.cancelled",
      tenantId,
      targetId: id,
      targetLabel: this.sessionLabel(session),
      beforeState: { status: "open" },
      afterState: { status: "cancelled" },
      changedFields: ["status"],
      details: "Chamada cancelada — presenças registradas não contam para a frequência",
    });

    this.logger.info({ sessionId: id, tenantId }, "Class session cancelled");
    return this.findById(id, tenantId);
  }

  /**
   * Fecha uma sessão de chamada.
   *
   * Consolidação:
   *   1. Matriculados sem attendance_record viram 'absent'.
   *   2. student_class_summary respeita o override por aluno: presente conta
   *      classesCounted ?? classesWorth; o restante da sessão vira falta.
   *   3. Evento SSE 'session_closed' para painel e totens da sala.
   */
  async close(
    id: string,
    tenantId: string,
    opts: { auto?: boolean } = {}
  ): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
      include: {
        classSubject: {
          select: {
            classId: true,
            // subject/class name só para rotular o evento de auditoria
            subject: { select: { name: true } },
            class: { select: { name: true, locationId: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundError("Class session not found");

    if (session.status !== "open") {
      throw new ValidationError("Session is not open");
    }

    // No fechamento automático o fim é o prazo previsto, não o instante em
    // que o job rodou — a varredura tem até 1 min de atraso e isso não pode
    // vazar para o histórico da aula.
    const endedAt = opts.auto ? (session.scheduledEndsAt ?? new Date()) : new Date();

    await this.prisma.classSession.update({
      where: { id },
      data: { status: "closed", endedAt, autoClosed: opts.auto ?? false },
    });

    await this.consolidateClosedSession(
      tenantId,
      id,
      session.classSubjectId,
      session.classSubject.classId,
      session.classesWorth,
      session.locationId ?? session.classSubject.class.locationId ?? undefined
    );

    // O fechamento automático nasce do job, sem requisição HTTP: o ator sai
    // como "sistema" e a chave distingue as duas origens no filtro
    auditService.record({
      action: opts.auto ? "session.auto_closed" : "session.closed",
      tenantId,
      targetId: id,
      targetLabel: this.sessionLabel(session),
      beforeState: { status: "open" },
      afterState: { status: "closed", endedAt: endedAt.toISOString() },
      changedFields: ["status", "endedAt"],
      details: opts.auto
        ? "Chamada encerrada automaticamente ao fim do horário previsto; ausentes consolidados"
        : "Chamada encerrada; ausentes consolidados",
      ...(opts.auto && { actor: { type: "system" as const, name: "Fechamento automático" } }),
    });

    this.logger.info({ sessionId: id, tenantId, auto: opts.auto ?? false }, "Class session closed");
    return this.findById(id, tenantId);
  }

  /**
   * Fecha todas as chamadas cujo prazo (scheduledEndsAt) já venceu.
   * Chamada pelo job periódico; uma falha isolada não interrompe as demais.
   *
   * Retorna quantas sessões foram encerradas.
   */
  async closeExpiredSessions(now: Date = new Date()): Promise<number> {
    const expired = await this.prisma.classSession.findMany({
      where: { status: "open", scheduledEndsAt: { not: null, lte: now } },
      select: { id: true, tenantId: true, scheduledEndsAt: true },
    });

    let closed = 0;
    for (const session of expired) {
      try {
        await this.close(session.id, session.tenantId, { auto: true });
        closed++;
      } catch (error) {
        this.logger.error(
          { sessionId: session.id, tenantId: session.tenantId, error },
          "Auto-close failed for session"
        );
      }
    }
    return closed;
  }

  /**
   * Consolida ausências e atualiza os contadores agregados por aluno.
   */
  private async consolidateClosedSession(
    tenantId: string,
    sessionId: string,
    classSubjectId: string,
    classId: string,
    classesWorth: number,
    effectiveLocationId?: string
  ): Promise<void> {
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: { classId, class: { tenantId } },
      select: { userId: true },
    });
    const enrolledIds = enrollments.map((e) => e.userId);

    if (enrolledIds.length > 0) {
      // Matriculados sem registro na sessão → 'absent' (idempotente)
      const withRecord = await this.prisma.attendanceRecord.findMany({
        where: { tenantId, classSessionId: sessionId },
        select: { userId: true, status: true, classesCounted: true },
      });
      const recordedIds = new Set(withRecord.map((r) => r.userId));
      const absentees = enrolledIds.filter((userId) => !recordedIds.has(userId));

      if (absentees.length > 0) {
        await this.prisma.attendanceRecord.createMany({
          data: absentees.map((userId) => ({
            tenantId,
            classSessionId: sessionId,
            userId,
            status: "absent",
          })),
          skipDuplicates: true,
        });
      }

      // Summary respeitando o override por aluno: attended = counted efetivo,
      // absent = o que faltou para completar o valor da sessão.
      const summaryOps = enrolledIds.map((userId) => {
        const record = withRecord.find((r) => r.userId === userId);
        const attendedSession = record ? ATTENDED_STATUSES.has(record.status) : false;
        const counted = attendedSession
          ? Math.min(record?.classesCounted ?? classesWorth, classesWorth)
          : 0;
        const missed = classesWorth - counted;
        return this.prisma.studentClassSummary.upsert({
          where: { classSubjectId_userId: { classSubjectId, userId } },
          create: {
            classSubjectId,
            userId,
            classesAttended: counted,
            classesAbsent: missed,
          },
          update: {
            ...(counted > 0 && { classesAttended: { increment: counted } }),
            ...(missed > 0 && { classesAbsent: { increment: missed } }),
          },
        });
      });
      await this.prisma.$transaction(summaryOps);
    }

    await this.broadcastSessionEnd(tenantId, sessionId, effectiveLocationId);
  }

  /** Evento final para painel do professor e para os totens da sala. */
  private async broadcastSessionEnd(
    tenantId: string,
    sessionId: string,
    effectiveLocationId?: string
  ): Promise<void> {
    sseService.broadcast(sseService.sessionChannel(tenantId, sessionId), "session_closed", {
      sessionId,
      closedAt: new Date().toISOString(),
    });

    if (effectiveLocationId) {
      const devices = await this.prisma.device.findMany({
        where: { tenantId, locationId: effectiveLocationId, isActive: true },
        select: { id: true },
      });
      for (const device of devices) {
        sseService.broadcast(sseService.deviceChannel(tenantId, device.id), "session_closed", {
          sessionId,
        });
      }
    }
  }

  /**
   * Chamada completa para a tela do professor: todos os matriculados da
   * turma com o estado de presença mesclado (facial, pré-presença, manual).
   */
  async rollcall(sessionId: string, tenantId: string): Promise<RollcallOutput> {
    const session = await this.findById(sessionId, tenantId);

    const [enrollments, records] = await Promise.all([
      this.prisma.classEnrollment.findMany({
        where: { classId: session.classId, class: { tenantId } },
        select: {
          userId: true,
          user: { select: { name: true, enrollmentCode: true, facialStatus: true } },
        },
        orderBy: { user: { name: "asc" } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, classSessionId: sessionId },
        select: {
          userId: true,
          status: true,
          recognizedAt: true,
          confidence: true,
          wasPreAttendance: true,
          classesCounted: true,
          adjustedById: true,
          checkoutReleasedById: true,
          checkoutReleasedAt: true,
          checkedOutAt: true,
        },
      }),
    ]);

    const recordByUser = new Map(records.map((r) => [r.userId, r]));

    const students: RollcallStudent[] = enrollments.map((e) => {
      const record = recordByUser.get(e.userId);
      if (!record) {
        return {
          userId: e.userId,
          name: e.user.name,
          enrollmentCode: e.user.enrollmentCode ?? undefined,
          facialStatus: e.user.facialStatus,
          status: session.status === "open" ? "pending" : "absent",
          source: null,
          classesCounted: 0,
          adjusted: false,
          checkoutReleased: false,
        };
      }
      const attended = ATTENDED_STATUSES.has(record.status);
      const source: RollcallStudent["source"] = !attended
        ? record.adjustedById
          ? "manual"
          : null
        : record.adjustedById
          ? "manual"
          : record.wasPreAttendance
            ? "pre"
            : "facial";
      return {
        userId: e.userId,
        name: e.user.name,
        enrollmentCode: e.user.enrollmentCode ?? undefined,
        facialStatus: e.user.facialStatus,
        status: attended ? "present" : "absent",
        source,
        recognizedAt: record.recognizedAt ?? undefined,
        confidence: record.confidence ?? undefined,
        classesCounted: attended
          ? Math.min(record.classesCounted ?? session.classesWorth, session.classesWorth)
          : 0,
        adjusted: !!record.adjustedById,
        checkoutReleased: !!record.checkoutReleasedById,
        checkoutReleasedAt: record.checkoutReleasedAt ?? undefined,
        checkedOutAt: record.checkedOutAt ?? undefined,
      };
    });

    const stats = {
      present: students.filter((s) => s.status === "present").length,
      absent: students.filter((s) => s.status === "absent").length,
      pending: students.filter((s) => s.status === "pending").length,
      facial: students.filter((s) => s.source === "facial" || s.source === "pre").length,
      manual: students.filter((s) => s.source === "manual").length,
    };

    return { session, students, stats };
  }

  /**
   * Override manual do professor: define quantas aulas o aluno conta nesta
   * sessão (0 = ausente). Só em sessão aberta e com o recurso habilitado.
   */
  async setAttendance(
    sessionId: string,
    tenantId: string,
    userId: string,
    classesCounted: number,
    adjustedById: string
  ): Promise<RollcallStudent> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (settings && !settings.allowManualOverride) {
      throw new ValidationError(
        "O ajuste manual de presença está desativado nas configurações da instituição",
        "MANUAL_OVERRIDE_DISABLED"
      );
    }

    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true, classSubject: { select: { classId: true } }, status: true, classesWorth: true },
    });
    if (!session) throw new NotFoundError("Class session not found");
    if (session.status !== "open") {
      throw new ValidationError(
        "A chamada já foi encerrada — ajustes manuais só valem em chamadas abertas",
        "SESSION_NOT_OPEN"
      );
    }

    const enrollment = await this.prisma.classEnrollment.findFirst({
      where: { classId: session.classSubject.classId, userId, class: { tenantId } },
      select: { userId: true },
    });
    if (!enrollment) throw new NotFoundError("Aluno não está matriculado nesta turma");

    const counted = Math.max(0, Math.min(classesCounted, session.classesWorth));
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, classSessionId: sessionId, userId },
      select: { id: true, status: true, recognizedAt: true },
    });

    if (existing) {
      await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          // Presença facial preservada; só o peso muda. Sem registro facial,
          // o status manual espelha o counted.
          status:
            counted === 0
              ? "absent"
              : existing.recognizedAt
                ? existing.status === "absent"
                  ? "present"
                  : existing.status
                : "manual",
          classesCounted: counted,
          adjustedById,
          adjustedAt: new Date(),
        },
      });
    } else {
      await this.prisma.attendanceRecord.create({
        data: {
          tenantId,
          classSessionId: sessionId,
          userId,
          status: counted === 0 ? "absent" : "manual",
          classesCounted: counted,
          adjustedById,
          adjustedAt: new Date(),
        },
      });
    }

    // Sobrepor o reconhecimento facial à mão é exatamente o que uma auditoria
    // de frequência vem procurar: quem marcou presença sem o aluno passar no
    // totem, ou apagou uma presença que a engine registrou.
    const student = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    auditService.record({
      action: "attendance.manual_override",
      tenantId,
      targetId: `${sessionId}:${userId}`,
      targetLabel: student?.name,
      beforeState: existing
        ? { status: existing.status, recognizedByFace: existing.recognizedAt != null }
        : { status: "sem registro", recognizedByFace: false },
      afterState: { classesCounted: counted, of: session.classesWorth },
      changedFields: ["classesCounted", "status"],
      details: `Presença de ${student?.name ?? userId} ajustada manualmente para ${counted} de ${session.classesWorth} aula(s)`,
      metadata: { sessionId, studentId: userId },
    });

    this.logger.info(
      { sessionId, tenantId, userId, counted, adjustedById },
      "Attendance manually adjusted"
    );
    return this.rollcallStudent(sessionId, tenantId, userId);
  }

  // ── Checkout individual ─────────────────────────────────────────────────────

  /**
   * Professor libera a saída antecipada de um aluno. A liberação sozinha não
   * encerra nada: o horário de saída só é gravado quando o aluno passa no
   * totem (recognition.service), e é dali que sai a contagem de aulas.
   *
   * Liberar não altera classesCounted — o aluno pode ficar até o fim mesmo
   * liberado, e nesse caso conta a aula inteira.
   */
  async releaseCheckout(
    sessionId: string,
    tenantId: string,
    userId: string,
    releasedById: string
  ): Promise<RollcallStudent> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings?.individualCheckoutEnabled) {
      throw new ValidationError(
        "O checkout individual está desativado nas configurações da instituição",
        "INDIVIDUAL_CHECKOUT_DISABLED"
      );
    }

    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true, classSubject: { select: { classId: true } }, status: true },
    });
    if (!session) throw new NotFoundError("Class session not found");
    if (session.status !== "open") {
      throw new ValidationError(
        "A chamada já foi encerrada — não há saída para liberar",
        "SESSION_NOT_OPEN"
      );
    }

    const record = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, classSessionId: sessionId, userId },
      select: { id: true, status: true, checkedOutAt: true },
    });
    if (!record || !ATTENDED_STATUSES.has(record.status)) {
      throw new ValidationError(
        "Só é possível liberar a saída de um aluno já presente na chamada",
        "STUDENT_NOT_PRESENT"
      );
    }
    if (record.checkedOutAt) {
      throw new ValidationError("Este aluno já registrou a saída", "ALREADY_CHECKED_OUT");
    }

    await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { checkoutReleasedById: releasedById, checkoutReleasedAt: new Date() },
    });

    sseService.broadcast(sseService.sessionChannel(tenantId, sessionId), "checkout_released", {
      sessionId,
      userId,
    });

    auditService.record({
      action: "attendance.checkout_released",
      tenantId,
      targetId: `${sessionId}:${userId}`,
      targetLabel: await this.studentName(userId),
      afterState: { checkoutReleased: true },
      changedFields: ["checkoutReleased"],
      details: `Saída antecipada liberada para ${await this.studentName(userId)}`,
      metadata: { sessionId, studentId: userId },
    });

    this.logger.info(
      { sessionId, tenantId, userId, releasedById },
      "Checkout released for student"
    );
    return this.rollcallStudent(sessionId, tenantId, userId);
  }

  /**
   * Desfaz a liberação (professor liberou o aluno errado). Só antes de o
   * totem registrar a saída — depois disso o horário já é histórico.
   */
  async revokeCheckoutRelease(
    sessionId: string,
    tenantId: string,
    userId: string
  ): Promise<RollcallStudent> {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, classSessionId: sessionId, userId },
      select: { id: true, checkedOutAt: true, checkoutReleasedById: true },
    });
    if (!record) throw new NotFoundError("Registro de presença não encontrado");
    if (!record.checkoutReleasedById) {
      throw new ValidationError("Este aluno não tem saída liberada", "CHECKOUT_NOT_RELEASED");
    }
    if (record.checkedOutAt) {
      throw new ValidationError(
        "O aluno já passou no totem — a saída não pode mais ser desfeita",
        "ALREADY_CHECKED_OUT"
      );
    }

    await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { checkoutReleasedById: null, checkoutReleasedAt: null },
    });

    sseService.broadcast(sseService.sessionChannel(tenantId, sessionId), "checkout_released", {
      sessionId,
      userId,
      revoked: true,
    });

    auditService.record({
      action: "attendance.checkout_revoked",
      tenantId,
      targetId: `${sessionId}:${userId}`,
      targetLabel: await this.studentName(userId),
      beforeState: { checkoutReleased: true },
      afterState: { checkoutReleased: false },
      changedFields: ["checkoutReleased"],
      details: `Liberação de saída revogada para ${await this.studentName(userId)}`,
      metadata: { sessionId, studentId: userId },
    });

    this.logger.info({ sessionId, tenantId, userId }, "Checkout release revoked");
    return this.rollcallStudent(sessionId, tenantId, userId);
  }

  /**
   * Rótulo legível da chamada para a trilha ("Matemática — 3ºA"). Aceita tanto
   * a sessão com INCLUDE quanto a versão crua, que não tem a turma junto.
   */
  private sessionLabel(session: {
    classSubject?: { subject?: { name: string }; class?: { name: string } };
  }): string | undefined {
    const subject = session.classSubject?.subject?.name;
    const className = session.classSubject?.class?.name;
    if (subject && className) return `${subject} — ${className}`;
    return subject ?? className;
  }

  /** Nome do aluno para rotular eventos de presença. */
  private async studentName(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name;
  }

  /** Um aluno específico da chamada, já com o estado mesclado. */
  private async rollcallStudent(
    sessionId: string,
    tenantId: string,
    userId: string
  ): Promise<RollcallStudent> {
    const rollcall = await this.rollcall(sessionId, tenantId);
    const student = rollcall.students.find((s) => s.userId === userId);
    if (!student) throw new NotFoundError("Aluno não encontrado na chamada");
    return student;
  }

  /**
   * Tentativas de fraude durante a janela desta sessão — restritas aos
   * dispositivos da sala efetiva quando a sessão tem sala definida.
   */
  async listFrames(sessionId: string, tenantId: string): Promise<SessionFrameOutput[]> {
    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        classSubject: {
          select: {
            classId: true,
            // subject/class name só para rotular o evento de auditoria
            subject: { select: { name: true } },
            class: { select: { name: true, locationId: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundError("Class session not found");

    const effectiveLocationId = session.locationId ?? session.classSubject.class.locationId ?? undefined;
    let deviceIds: string[] | undefined;
    if (effectiveLocationId) {
      const devices = await this.prisma.device.findMany({
        where: { tenantId, locationId: effectiveLocationId },
        select: { id: true },
      });
      deviceIds = devices.map((d) => d.id);
    }

    const logs = await this.prisma.recognitionLog.findMany({
      where: {
        tenantId,
        fraudFrameExists: true,
        createdAt: { gte: session.startedAt, lte: session.endedAt ?? new Date() },
        ...(deviceIds && deviceIds.length > 0 && { deviceId: { in: deviceIds } }),
      },
      select: {
        id: true,
        status: true,
        livenessScore: true,
        deviceId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return logs.map((log) => ({
      id: log.id,
      status: log.status,
      livenessScore: log.livenessScore ?? undefined,
      deviceId: log.deviceId ?? undefined,
      createdAt: log.createdAt,
    }));
  }

  /** O frame pertence à janela/sala desta sessão? (gate do stream JPEG) */
  async frameBelongsToSession(
    sessionId: string,
    tenantId: string,
    recognitionLogId: string
  ): Promise<boolean> {
    const frames = await this.listFrames(sessionId, tenantId);
    return frames.some((f) => f.id === recognitionLogId);
  }

  /**
   * Lista os attendance_records de uma sessão (carga inicial do painel).
   */
  async listRecords(sessionId: string, tenantId: string): Promise<object[]> {
    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true },
    });
    if (!session) throw new NotFoundError("Class session not found");

    return this.prisma.attendanceRecord.findMany({
      where: { tenantId, classSessionId: sessionId },
      select: {
        id: true,
        userId: true,
        status: true,
        recognizedAt: true,
        checkedOutAt: true,
        checkoutReleasedAt: true,
        confidence: true,
        livenessScore: true,
        wasPreAttendance: true,
        classesCounted: true,
        user: { select: { name: true } },
      },
      orderBy: { recognizedAt: "asc" },
    });
  }

  private toOutput(session: any): ClassSessionOutput {
    return {
      id: session.id,
      tenantId: session.tenantId,
      classSubjectId: session.classSubjectId,
      classId: session.classSubject?.classId,
      className: session.classSubject?.class?.name,
      subjectId: session.classSubject?.subjectId,
      subjectName: session.classSubject?.subject?.name,
      teacherId: session.teacherId,
      teacherName: session.teacher?.name,
      createdById: session.createdById,
      locationId: session.locationId ?? undefined,
      locationName: session.location?.name,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? undefined,
      status: session.status,
      classesWorth: session.classesWorth,
      lessonDurationMin: session.lessonDurationMin,
      scheduledEndsAt: session.scheduledEndsAt ?? undefined,
      autoClosed: session.autoClosed ?? false,
      createdAt: session.createdAt,
    };
  }
}

export const classSessionsService = new ClassSessionsService();
