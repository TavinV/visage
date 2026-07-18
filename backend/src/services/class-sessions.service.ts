/**
 * ClassSessionsService
 * Gerencia sessões de chamada por turma.
 *
 * A chamada é aberta pelo PROFESSOR (ou pela administração), em qualquer
 * sala livre — a sala escolhida (session.locationId) sobrepõe a sala padrão
 * da turma no matching do totem. Uma sala não aceita duas chamadas abertas.
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
import { sseService } from "./sse.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateClassSessionInput {
  tenantId: string;
  classId: string;
  teacherId: string;
  createdById: string;
  classesWorth?: number;
  /** Sala onde a aula vai acontecer — default: sala padrão da turma. */
  locationId?: string;
}

export interface UpdateClassSessionInput {
  status?: "open" | "closed";
  classesWorth?: number;
}

export interface ClassSessionOutput {
  id: string;
  tenantId: string;
  classId: string;
  className?: string;
  teacherId: string;
  teacherName?: string;
  createdById: string;
  locationId?: string;
  locationName?: string;
  startedAt: Date;
  endedAt?: Date;
  status: string;
  classesWorth: number;
  createdAt: Date;
}

export interface ListClassSessionsParams extends ListParams {
  tenantId: string;
  classId?: string;
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

class ClassSessionsService extends BaseService {
  private static readonly SORT_FIELDS = ["startedAt", "createdAt", "status"] as const;

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
      ...(params.classId && { classId: params.classId }),
      ...(params.status && { status: params.status }),
      ...(params.teacherId && { teacherId: params.teacherId }),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.classSession.findMany({
        where,
        take,
        skip,
        orderBy,
        include: {
          class: { select: { name: true } },
          teacher: { select: { name: true } },
          location: { select: { name: true } },
        },
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
   * Obtém uma sessão de chamada pelo ID.
   */
  async findById(id: string, tenantId: string): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
      include: {
        class: { select: { name: true } },
        teacher: { select: { name: true } },
        location: { select: { name: true } },
      },
    });
    if (!session) throw new NotFoundError("Class session not found");
    return this.toOutput(session);
  }

  /**
   * Cria uma nova sessão de chamada.
   *
   * Regras:
   *   - teacherId deve ter cargo de professor no tenant.
   *   - A turma não pode ter outra chamada aberta.
   *   - A sala efetiva (escolhida ou padrão da turma) não pode estar ocupada
   *     por outra chamada aberta.
   */
  async create(input: CreateClassSessionInput): Promise<ClassSessionOutput> {
    const classItem = await this.prisma.class.findFirst({
      where: { id: input.classId, tenantId: input.tenantId },
    });
    if (!classItem) throw new NotFoundError("Class not found in this tenant");

    const teacher = await this.prisma.user.findFirst({
      where: { id: input.teacherId, tenantId: input.tenantId },
      select: { id: true, role: true },
    });
    if (!teacher) throw new NotFoundError("Teacher not found in this tenant");
    if (teacher.role !== "teacher" && teacher.role !== "admin") {
      throw new ValidationError(
        "Apenas professores podem ser responsáveis por uma chamada",
        "NOT_A_TEACHER"
      );
    }

    // Sala escolhida (se houver) precisa existir e estar ativa no tenant
    if (input.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: input.locationId, tenantId: input.tenantId, isActive: true },
      });
      if (!location) throw new NotFoundError("Sala não encontrada ou inativa");
    }

    // Uma turma não pode ter duas chamadas abertas
    const openForClass = await this.prisma.classSession.findFirst({
      where: { tenantId: input.tenantId, classId: input.classId, status: "open" },
      select: { id: true },
    });
    if (openForClass) {
      throw new ValidationError(
        "Esta turma já possui uma chamada aberta. Encerre ou cancele antes de abrir outra.",
        "CLASS_SESSION_ALREADY_OPEN"
      );
    }

    // A sala efetiva não pode estar ocupada por outra chamada aberta
    const effectiveLocationId = input.locationId ?? classItem.locationId ?? undefined;
    if (effectiveLocationId) {
      const busy = await this.findOpenSessionAtLocation(input.tenantId, effectiveLocationId);
      if (busy) {
        throw new ValidationError(
          "Esta sala já está com uma chamada em andamento. Escolha outra sala ou aguarde.",
          "LOCATION_BUSY"
        );
      }
    }

    const session = await this.prisma.classSession.create({
      data: {
        tenantId: input.tenantId,
        classId: input.classId,
        teacherId: input.teacherId,
        createdById: input.createdById,
        locationId: input.locationId ?? classItem.locationId ?? null,
        status: "open",
        classesWorth: input.classesWorth || 1,
      },
      include: {
        class: { select: { name: true } },
        teacher: { select: { name: true } },
        location: { select: { name: true } },
      },
    });

    this.logger.info(
      { sessionId: session.id, classId: input.classId, tenantId: input.tenantId },
      "Class session created"
    );

    // Side-effects de abertura — não podem falhar a criação da sessão
    await this.warmEngineCache(input.tenantId, input.classId);
    await this.consolidatePreAttendances(
      input.tenantId,
      session.id,
      input.classId,
      session.locationId ?? undefined
    );

    return this.toOutput(session);
  }

  /** Sessão aberta cuja sala efetiva (escolhida ou herdada da turma) é esta. */
  private async findOpenSessionAtLocation(tenantId: string, locationId: string) {
    return this.prisma.classSession.findFirst({
      where: {
        tenantId,
        status: "open",
        OR: [{ locationId }, { locationId: null, class: { locationId } }],
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
      if (input.classesWorth !== undefined) {
        await this.prisma.classSession.update({
          where: { id },
          data: { classesWorth: input.classesWorth },
        });
      }
      return this.close(id, tenantId);
    }

    await this.prisma.classSession.update({
      where: { id },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.classesWorth !== undefined && { classesWorth: input.classesWorth }),
      },
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
      include: { class: { select: { locationId: true } } },
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
      session.locationId ?? session.class.locationId ?? undefined
    );

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
  async close(id: string, tenantId: string): Promise<ClassSessionOutput> {
    const session = await this.prisma.classSession.findFirst({
      where: { id, tenantId },
      include: { class: { select: { locationId: true } } },
    });
    if (!session) throw new NotFoundError("Class session not found");

    if (session.status !== "open") {
      throw new ValidationError("Session is not open");
    }

    await this.prisma.classSession.update({
      where: { id },
      data: { status: "closed", endedAt: new Date() },
    });

    await this.consolidateClosedSession(
      tenantId,
      id,
      session.classId,
      session.classesWorth,
      session.locationId ?? session.class.locationId ?? undefined
    );

    this.logger.info({ sessionId: id, tenantId }, "Class session closed");
    return this.findById(id, tenantId);
  }

  /**
   * Consolida ausências e atualiza os contadores agregados por aluno.
   */
  private async consolidateClosedSession(
    tenantId: string,
    sessionId: string,
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
          where: { classId_userId: { classId, userId } },
          create: {
            classId,
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
      select: { id: true, classId: true, status: true, classesWorth: true },
    });
    if (!session) throw new NotFoundError("Class session not found");
    if (session.status !== "open") {
      throw new ValidationError(
        "A chamada já foi encerrada — ajustes manuais só valem em chamadas abertas",
        "SESSION_NOT_OPEN"
      );
    }

    const enrollment = await this.prisma.classEnrollment.findFirst({
      where: { classId: session.classId, userId, class: { tenantId } },
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

    const rollcall = await this.rollcall(sessionId, tenantId);
    const student = rollcall.students.find((s) => s.userId === userId);
    if (!student) throw new NotFoundError("Aluno não encontrado na chamada");

    this.logger.info(
      { sessionId, tenantId, userId, counted, adjustedById },
      "Attendance manually adjusted"
    );
    return student;
  }

  /**
   * Tentativas de fraude durante a janela desta sessão — restritas aos
   * dispositivos da sala efetiva quando a sessão tem sala definida.
   */
  async listFrames(sessionId: string, tenantId: string): Promise<SessionFrameOutput[]> {
    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, tenantId },
      include: { class: { select: { locationId: true } } },
    });
    if (!session) throw new NotFoundError("Class session not found");

    const effectiveLocationId = session.locationId ?? session.class.locationId ?? undefined;
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
      classId: session.classId,
      className: session.class?.name,
      teacherId: session.teacherId,
      teacherName: session.teacher?.name,
      createdById: session.createdById,
      locationId: session.locationId ?? undefined,
      locationName: session.location?.name,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? undefined,
      status: session.status,
      classesWorth: session.classesWorth,
      createdAt: session.createdAt,
    };
  }
}

export const classSessionsService = new ClassSessionsService();
