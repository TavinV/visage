/**
 * DashboardService — números da tela inicial da instituição.
 *
 * Junta em uma única resposta o que hoje estava espalhado por várias telas:
 * volume de reconhecimento, velocidade da engine, índice de fraude ao longo do
 * tempo, presença consolidada, cobertura biométrica e desempenho por totem.
 *
 * As séries são agrupadas no FUSO DA INSTITUIÇÃO (tenants.timezone): um dia
 * letivo que começa 19h em São Paulo não pode aparecer partido em dois dias no
 * gráfico porque o banco guarda UTC.
 *
 * Todas as queries filtram por tenantId — inclusive as raw, onde o filtro é
 * parâmetro do template do Prisma (nunca concatenação de string).
 */

import { Prisma } from "@prisma/client";
import { BaseService } from "./base.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface DashboardTotals {
  users: number;
  students: number;
  teachers: number;
  classes: number;
  devices: number;
  /** Totens com heartbeat nos últimos 5 minutos. */
  devicesOnline: number;
  openSessions: number;
  sessionsToday: number;
  studentsWithBiometrics: number;
  /** Alunos com biometria ÷ alunos ativos. */
  biometricCoveragePercent: number;
}

export interface DashboardRecognitionSummary {
  total: number;
  identified: number;
  notIdentified: number;
  /** Tentativas barradas pela vivacidade (foto, vídeo, tela, máscara). */
  fraud: number;
  identificationRatePercent: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
  p95ProcessingMs: number | null;
  avgConfidence: number | null;
  avgLivenessScore: number | null;
  /** Intervalo imediatamente anterior, de mesmo tamanho — base das tendências. */
  previous: {
    total: number;
    fraudRatePercent: number;
    avgProcessingMs: number | null;
  };
}

export interface DashboardDailyPoint {
  /** YYYY-MM-DD no fuso da instituição. */
  date: string;
  total: number;
  identified: number;
  notIdentified: number;
  fraud: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
  p95ProcessingMs: number | null;
}

export interface DashboardAttendancePoint {
  date: string;
  present: number;
  absent: number;
  attendanceRatePercent: number;
}

export interface DashboardDeviceStat {
  deviceId: string;
  label: string;
  locationName?: string;
  total: number;
  fraud: number;
  avgProcessingMs: number | null;
  lastSeenAt?: Date;
  isOnline: boolean;
}

export interface DashboardOverviewOutput {
  range: { days: number; from: Date; to: Date; timezone: string };
  totals: DashboardTotals;
  recognition: DashboardRecognitionSummary;
  daily: DashboardDailyPoint[];
  /** Movimento por hora do dia — mostra os picos de entrada e saída. */
  hourly: Array<{ hour: number; total: number }>;
  attendance: {
    present: number;
    absent: number;
    attendanceRatePercent: number;
    sessionsClosed: number;
    daily: DashboardAttendancePoint[];
  };
  devices: DashboardDeviceStat[];
  statusBreakdown: Array<{ status: string; count: number }>;
}

// ── Linhas cruas ─────────────────────────────────────────────────────────────

interface RecognitionAggRow {
  total: number;
  identified: number;
  not_identified: number;
  fraud: number;
  avg_ms: number | null;
  p95_ms: number | null;
  avg_confidence: number | null;
  avg_liveness: number | null;
}

interface DailyRow extends RecognitionAggRow {
  day: string;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const PRESENT_STATUSES = ["present", "manual", "early_checkout"];

/** Vivacidade reprovada é o que o produto chama de tentativa de fraude. */
const FRAUD_STATUS = "liveness_failed";

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function round(value: number | null, decimals = 0): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

class DashboardService extends BaseService {
  /**
   * GET /dashboard/overview?days=14
   */
  async overview(tenantId: string, days: number): Promise<DashboardOverviewOutput> {
    const windowDays = Math.min(Math.max(Math.trunc(days) || 14, 1), 90);
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);
    // Intervalo anterior de mesmo tamanho — sem ele os cards não têm com o
    // que comparar e a seta de tendência viraria enfeite
    const previousFrom = new Date(from.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone || "America/Sao_Paulo";
    const onlineSince = new Date(to.getTime() - ONLINE_WINDOW_MS);

    const [
      totals,
      recognition,
      previous,
      daily,
      hourly,
      statusBreakdown,
      attendanceTotals,
      attendanceDaily,
      sessionsToday,
      devices,
    ] = await Promise.all([
      this.loadTotals(tenantId, onlineSince),
      this.loadRecognitionAgg(tenantId, from, to),
      this.loadRecognitionAgg(tenantId, previousFrom, from),
      this.loadDaily(tenantId, from, to, timezone),
      this.loadHourly(tenantId, from, to, timezone),
      this.loadStatusBreakdown(tenantId, from, to),
      this.loadAttendanceTotals(tenantId, from),
      this.loadAttendanceDaily(tenantId, from, timezone),
      this.loadSessionsToday(tenantId, timezone),
      this.loadDeviceStats(tenantId, from, to, onlineSince),
    ]);

    return {
      range: { days: windowDays, from, to, timezone },
      totals: { ...totals, sessionsToday },
      recognition: {
        total: recognition.total,
        identified: recognition.identified,
        notIdentified: recognition.not_identified,
        fraud: recognition.fraud,
        identificationRatePercent: percent(recognition.identified, recognition.total),
        fraudRatePercent: percent(recognition.fraud, recognition.total),
        avgProcessingMs: round(recognition.avg_ms),
        p95ProcessingMs: round(recognition.p95_ms),
        avgConfidence: round(recognition.avg_confidence, 3),
        avgLivenessScore: round(recognition.avg_liveness, 3),
        previous: {
          total: previous.total,
          fraudRatePercent: percent(previous.fraud, previous.total),
          avgProcessingMs: round(previous.avg_ms),
        },
      },
      daily: this.fillDays(daily, from, to, timezone),
      hourly,
      attendance: {
        present: attendanceTotals.present,
        absent: attendanceTotals.absent,
        attendanceRatePercent: percent(
          attendanceTotals.present,
          attendanceTotals.present + attendanceTotals.absent
        ),
        sessionsClosed: attendanceTotals.sessionsClosed,
        daily: attendanceDaily,
      },
      devices,
      statusBreakdown,
    };
  }

  // ── Contadores ─────────────────────────────────────────────────────────────

  private async loadTotals(
    tenantId: string,
    onlineSince: Date
  ): Promise<Omit<DashboardTotals, "sessionsToday">> {
    const [users, students, teachers, classes, devices, devicesOnline, openSessions, withBiometrics] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.user.count({ where: { tenantId, role: "student", status: "active" } }),
        this.prisma.user.count({ where: { tenantId, role: "teacher", status: "active" } }),
        this.prisma.class.count({ where: { tenantId } }),
        this.prisma.device.count({ where: { tenantId, isActive: true } }),
        this.prisma.device.count({
          where: { tenantId, isActive: true, lastSeenAt: { gte: onlineSince } },
        }),
        this.prisma.classSession.count({ where: { tenantId, status: "open" } }),
        this.prisma.user.count({
          where: { tenantId, role: "student", status: "active", facialStatus: "registered" },
        }),
      ]);

    return {
      users,
      students,
      teachers,
      classes,
      devices,
      devicesOnline,
      openSessions,
      studentsWithBiometrics: withBiometrics,
      biometricCoveragePercent: percent(withBiometrics, students),
    };
  }

  private async loadSessionsToday(tenantId: string, timezone: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM "class_sessions"
      WHERE "tenantId" = ${tenantId}
        AND ("startedAt" AT TIME ZONE ${timezone})::date = (NOW() AT TIME ZONE ${timezone})::date
    `);
    return rows[0]?.total ?? 0;
  }

  // ── Reconhecimento ─────────────────────────────────────────────────────────

  private async loadRecognitionAgg(
    tenantId: string,
    from: Date,
    to: Date
  ): Promise<RecognitionAggRow> {
    const rows = await this.prisma.$queryRaw<RecognitionAggRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int                                                        AS total,
        COUNT(*) FILTER (WHERE "status" = 'identified')::int                 AS identified,
        COUNT(*) FILTER (WHERE "status" = 'not_identified')::int             AS not_identified,
        COUNT(*) FILTER (WHERE "status" = ${FRAUD_STATUS})::int              AS fraud,
        AVG("processingMs")::float8                                          AS avg_ms,
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY "processingMs"))::float8 AS p95_ms,
        AVG("confidence")::float8                                            AS avg_confidence,
        AVG("livenessScore")::float8                                         AS avg_liveness
      FROM "recognition_logs"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
    `);

    return (
      rows[0] ?? {
        total: 0,
        identified: 0,
        not_identified: 0,
        fraud: 0,
        avg_ms: null,
        p95_ms: null,
        avg_confidence: null,
        avg_liveness: null,
      }
    );
  }

  private async loadDaily(
    tenantId: string,
    from: Date,
    to: Date,
    timezone: string
  ): Promise<DailyRow[]> {
    return this.prisma.$queryRaw<DailyRow[]>(Prisma.sql`
      SELECT
        to_char(("createdAt" AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD')  AS day,
        COUNT(*)::int                                                        AS total,
        COUNT(*) FILTER (WHERE "status" = 'identified')::int                 AS identified,
        COUNT(*) FILTER (WHERE "status" = 'not_identified')::int             AS not_identified,
        COUNT(*) FILTER (WHERE "status" = ${FRAUD_STATUS})::int              AS fraud,
        AVG("processingMs")::float8                                          AS avg_ms,
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY "processingMs"))::float8 AS p95_ms,
        AVG("confidence")::float8                                            AS avg_confidence,
        AVG("livenessScore")::float8                                         AS avg_liveness
      FROM "recognition_logs"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY 1
      ORDER BY 1
    `);
  }

  private async loadHourly(
    tenantId: string,
    from: Date,
    to: Date,
    timezone: string
  ): Promise<Array<{ hour: number; total: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ hour: number; total: number }>>(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE ${timezone}))::int AS hour,
        COUNT(*)::int                                                  AS total
      FROM "recognition_logs"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY 1
    `);

    // As 24 horas sempre presentes: buraco no meio do gráfico é ruído visual
    const byHour = new Map(rows.map((r) => [r.hour, r.total]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: byHour.get(hour) ?? 0,
    }));
  }

  private async loadStatusBreakdown(
    tenantId: string,
    from: Date,
    to: Date
  ): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.recognitionLog.groupBy({
      by: ["status"],
      where: { tenantId, createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });

    return rows
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  // ── Presença ───────────────────────────────────────────────────────────────

  private async loadAttendanceTotals(
    tenantId: string,
    from: Date
  ): Promise<{ present: number; absent: number; sessionsClosed: number }> {
    const [present, absent, sessionsClosed] = await this.prisma.$transaction([
      this.prisma.attendanceRecord.count({
        where: {
          tenantId,
          status: { in: PRESENT_STATUSES },
          classSession: { startedAt: { gte: from } },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          tenantId,
          status: "absent",
          classSession: { startedAt: { gte: from } },
        },
      }),
      this.prisma.classSession.count({
        where: { tenantId, status: "closed", startedAt: { gte: from } },
      }),
    ]);

    return { present, absent, sessionsClosed };
  }

  private async loadAttendanceDaily(
    tenantId: string,
    from: Date,
    timezone: string
  ): Promise<DashboardAttendancePoint[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: string; present: number; absent: number }>
    >(Prisma.sql`
      SELECT
        to_char((cs."startedAt" AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD')      AS day,
        COUNT(*) FILTER (WHERE ar."status" IN (${Prisma.join(PRESENT_STATUSES)}))::int AS present,
        COUNT(*) FILTER (WHERE ar."status" = 'absent')::int                          AS absent
      FROM "attendance_records" ar
      JOIN "class_sessions" cs ON cs."id" = ar."classSessionId"
      WHERE ar."tenantId" = ${tenantId}
        AND cs."startedAt" >= ${from}
      GROUP BY 1
      ORDER BY 1
    `);

    return rows.map((r) => ({
      date: r.day,
      present: r.present,
      absent: r.absent,
      attendanceRatePercent: percent(r.present, r.present + r.absent),
    }));
  }

  // ── Totens ─────────────────────────────────────────────────────────────────

  private async loadDeviceStats(
    tenantId: string,
    from: Date,
    to: Date,
    onlineSince: Date
  ): Promise<DashboardDeviceStat[]> {
    const [rows, devices] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ device_id: string | null; total: number; fraud: number; avg_ms: number | null }>
      >(Prisma.sql`
        SELECT
          "deviceId"                                              AS device_id,
          COUNT(*)::int                                           AS total,
          COUNT(*) FILTER (WHERE "status" = ${FRAUD_STATUS})::int AS fraud,
          AVG("processingMs")::float8                             AS avg_ms
        FROM "recognition_logs"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
          AND "deviceId" IS NOT NULL
        GROUP BY 1
      `),
      this.prisma.device.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          label: true,
          lastSeenAt: true,
          location: { select: { name: true } },
        },
      }),
    ]);

    const statsById = new Map(rows.map((r) => [r.device_id as string, r]));

    return devices
      .map((device) => {
        const stat = statsById.get(device.id);
        return {
          deviceId: device.id,
          label: device.label ?? "Totem sem nome",
          locationName: device.location?.name,
          total: stat?.total ?? 0,
          fraud: stat?.fraud ?? 0,
          avgProcessingMs: round(stat?.avg_ms ?? null),
          lastSeenAt: device.lastSeenAt ?? undefined,
          isOnline: device.lastSeenAt != null && device.lastSeenAt >= onlineSince,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Completa os dias sem nenhum reconhecimento. Sem isso, um fim de semana
   * some do gráfico e a linha "encolhe" o tempo, sugerindo uma continuidade
   * que não existiu.
   */
  private fillDays(
    rows: DailyRow[],
    from: Date,
    to: Date,
    timezone: string
  ): DashboardDailyPoint[] {
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const days: DashboardDailyPoint[] = [];

    const dayKey = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    for (
      let cursor = new Date(from.getTime());
      cursor <= to;
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const key = dayKey(cursor);
      if (days.some((d) => d.date === key)) continue;

      const row = byDay.get(key);
      days.push({
        date: key,
        total: row?.total ?? 0,
        identified: row?.identified ?? 0,
        notIdentified: row?.not_identified ?? 0,
        fraud: row?.fraud ?? 0,
        fraudRatePercent: percent(row?.fraud ?? 0, row?.total ?? 0),
        avgProcessingMs: round(row?.avg_ms ?? null),
        p95ProcessingMs: round(row?.p95_ms ?? null),
      });
    }

    return days;
  }
}

export const dashboardService = new DashboardService();
