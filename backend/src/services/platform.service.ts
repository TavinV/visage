/**
 * PlatformService — números da plataforma inteira (somente super_admin).
 *
 * É o equivalente do DashboardService para quem opera o SaaS: em vez de
 * "como vai a minha escola", responde "como vai a base de clientes e a
 * engine que atende todas elas".
 *
 * DIFERENÇA CRÍTICA para o resto do backend: aqui NÃO existe filtro por
 * tenantId — é a única visão agregada da plataforma, e por isso a rota que
 * a expõe é protegida por requireSuperAdmin. Nenhum dado pessoal de aluno
 * entra nesta resposta: só contagens, médias e nomes de instituição.
 *
 * As séries são agrupadas no fuso da plataforma (PLATFORM_TIMEZONE) — as
 * instituições podem estar em fusos diferentes, mas um gráfico único precisa
 * de um relógio único, senão os dias se sobrepõem.
 */

import { Prisma } from "@prisma/client";
import { BaseService } from "./base.service";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface PlatformTenantSummary {
  total: number;
  active: number;
  trial: number;
  suspended: number;
  cancelled: number;
  /** Criadas dentro da janela consultada. */
  newInPeriod: number;
  /** Mesmo intervalo imediatamente anterior — base da seta de tendência. */
  previousNewInPeriod: number;
  byStatus: Array<{ status: string; count: number }>;
  byPlan: Array<{
    planId: string;
    planName: string;
    priceMonthly: number;
    isActive: boolean;
    tenants: number;
    /** Receita mensal recorrente das instituições pagantes deste plano. */
    mrr: number;
  }>;
  /** Curva de crescimento: criadas no dia + acumulado da base. */
  daily: Array<{ date: string; created: number; cumulative: number }>;
}

export interface PlatformRevenue {
  /** Soma da mensalidade dos planos das instituições ativas. */
  mrr: number;
  /** Receita ainda em teste — vira MRR quando o período de teste converte. */
  trialMrr: number;
  /** Receita média por instituição pagante. */
  arpa: number;
}

export interface PlatformUsage {
  users: number;
  students: number;
  teachers: number;
  classes: number;
  devices: number;
  devicesOnline: number;
  openSessions: number;
  sessionsInPeriod: number;
  studentsWithBiometrics: number;
  biometricCoveragePercent: number;
}

export interface PlatformRecognitionSummary {
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
  previous: {
    total: number;
    fraudRatePercent: number;
    avgProcessingMs: number | null;
  };
}

export interface PlatformDailyPoint {
  /** YYYY-MM-DD no fuso da plataforma. */
  date: string;
  total: number;
  identified: number;
  notIdentified: number;
  fraud: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
  p95ProcessingMs: number | null;
  /** Instituições distintas que usaram a engine no dia. */
  activeTenants: number;
}

export interface PlatformTenantActivity {
  tenantId: string;
  name: string;
  status: string;
  planName: string;
  total: number;
  identified: number;
  fraud: number;
  fraudRatePercent: number;
  avgProcessingMs: number | null;
}

export interface PlatformOverviewOutput {
  range: { days: number; from: Date; to: Date; timezone: string };
  tenants: PlatformTenantSummary;
  revenue: PlatformRevenue;
  usage: PlatformUsage;
  recognition: PlatformRecognitionSummary;
  daily: PlatformDailyPoint[];
  hourly: Array<{ hour: number; total: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  /** Instituições que mais usaram a engine na janela. */
  topTenants: PlatformTenantActivity[];
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

interface PlatformDailyRow extends RecognitionAggRow {
  day: string;
  active_tenants: number;
}

/** Relógio único dos gráficos globais — as instituições têm o seu próprio. */
const PLATFORM_TIMEZONE = "America/Sao_Paulo";
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const FRAUD_STATUS = "liveness_failed";
/** Instituições que geram receita recorrente hoje. */
const PAYING_STATUS = "active";
const TOP_TENANTS_LIMIT = 8;

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function round(value: number | null, decimals = 0): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

class PlatformService extends BaseService {
  /**
   * GET /admin/overview?days=14
   */
  async overview(days: number): Promise<PlatformOverviewOutput> {
    const windowDays = Math.min(Math.max(Math.trunc(days) || 14, 1), 90);
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const previousFrom = new Date(from.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const onlineSince = new Date(to.getTime() - ONLINE_WINDOW_MS);

    const [
      tenants,
      usage,
      recognition,
      previous,
      daily,
      hourly,
      statusBreakdown,
      topTenants,
      sessionsInPeriod,
    ] = await Promise.all([
      this.loadTenants(from, to, previousFrom),
      this.loadUsage(onlineSince),
      this.loadRecognitionAgg(from, to),
      this.loadRecognitionAgg(previousFrom, from),
      this.loadDaily(from, to),
      this.loadHourly(from, to),
      this.loadStatusBreakdown(from, to),
      this.loadTopTenants(from, to),
      this.prisma.classSession.count({ where: { startedAt: { gte: from } } }),
    ]);

    return {
      range: { days: windowDays, from, to, timezone: PLATFORM_TIMEZONE },
      tenants: tenants.summary,
      revenue: tenants.revenue,
      usage: { ...usage, sessionsInPeriod },
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
      daily: this.fillDays(daily, from, to),
      hourly,
      statusBreakdown,
      topTenants,
    };
  }

  // ── Base de clientes ───────────────────────────────────────────────────────

  private async loadTenants(
    from: Date,
    to: Date,
    previousFrom: Date
  ): Promise<{ summary: PlatformTenantSummary; revenue: PlatformRevenue }> {
    const [byStatusRows, plans, createdRows, createdBefore, newInPeriod, previousNew] =
      await Promise.all([
        this.prisma.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.plan.findMany({
          select: {
            id: true,
            name: true,
            priceMonthly: true,
            isActive: true,
            tenants: { select: { status: true } },
          },
          orderBy: { priceMonthly: "asc" },
        }),
        this.prisma.$queryRaw<Array<{ day: string; created: number }>>(Prisma.sql`
          SELECT
            to_char(("createdAt" AT TIME ZONE ${PLATFORM_TIMEZONE})::date, 'YYYY-MM-DD') AS day,
            COUNT(*)::int                                                                AS created
          FROM "tenants"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          GROUP BY 1
          ORDER BY 1
        `),
        this.prisma.tenant.count({ where: { createdAt: { lt: from } } }),
        this.prisma.tenant.count({ where: { createdAt: { gte: from, lt: to } } }),
        this.prisma.tenant.count({ where: { createdAt: { gte: previousFrom, lt: from } } }),
      ]);

    const countByStatus = new Map(byStatusRows.map((r) => [r.status, r._count._all]));
    const total = byStatusRows.reduce((sum, r) => sum + r._count._all, 0);

    const byPlan = plans.map((plan) => {
      const price = Number(plan.priceMonthly);
      const paying = plan.tenants.filter((t) => t.status === PAYING_STATUS).length;
      return {
        planId: plan.id,
        planName: plan.name,
        priceMonthly: price,
        isActive: plan.isActive,
        tenants: plan.tenants.length,
        mrr: money(price * paying),
      };
    });

    const mrr = money(byPlan.reduce((sum, p) => sum + p.mrr, 0));
    const trialMrr = money(
      plans.reduce(
        (sum, plan) =>
          sum +
          Number(plan.priceMonthly) * plan.tenants.filter((t) => t.status === "trial").length,
        0
      )
    );
    const payingTenants = countByStatus.get(PAYING_STATUS) ?? 0;

    // Acumulado começa na base que já existia antes da janela — sem isso a
    // curva de crescimento "renasce do zero" a cada troca de período
    let running = createdBefore;
    const createdByDay = new Map(createdRows.map((r) => [r.day, r.created]));
    const daily = this.eachDay(from, to).map((date) => {
      const created = createdByDay.get(date) ?? 0;
      running += created;
      return { date, created, cumulative: running };
    });

    return {
      summary: {
        total,
        active: countByStatus.get("active") ?? 0,
        trial: countByStatus.get("trial") ?? 0,
        suspended: countByStatus.get("suspended") ?? 0,
        cancelled: countByStatus.get("cancelled") ?? 0,
        newInPeriod,
        previousNewInPeriod: previousNew,
        byStatus: byStatusRows
          .map((r) => ({ status: r.status, count: r._count._all }))
          .sort((a, b) => b.count - a.count),
        byPlan,
        daily,
      },
      revenue: {
        mrr,
        trialMrr,
        arpa: payingTenants > 0 ? money(mrr / payingTenants) : 0,
      },
    };
  }

  // ── Uso da plataforma ──────────────────────────────────────────────────────

  private async loadUsage(onlineSince: Date): Promise<Omit<PlatformUsage, "sessionsInPeriod">> {
    const [users, students, teachers, classes, devices, devicesOnline, openSessions, withBiometrics] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: "student", status: "active" } }),
        this.prisma.user.count({ where: { role: "teacher", status: "active" } }),
        this.prisma.class.count(),
        this.prisma.device.count({ where: { isActive: true } }),
        this.prisma.device.count({
          where: { isActive: true, lastSeenAt: { gte: onlineSince } },
        }),
        this.prisma.classSession.count({ where: { status: "open" } }),
        this.prisma.user.count({
          where: { role: "student", status: "active", facialStatus: "registered" },
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

  // ── Engine ─────────────────────────────────────────────────────────────────

  private async loadRecognitionAgg(from: Date, to: Date): Promise<RecognitionAggRow> {
    const rows = await this.prisma.$queryRaw<RecognitionAggRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int                                                          AS total,
        COUNT(*) FILTER (WHERE "status" = 'identified')::int                   AS identified,
        COUNT(*) FILTER (WHERE "status" = 'not_identified')::int               AS not_identified,
        COUNT(*) FILTER (WHERE "status" = ${FRAUD_STATUS})::int                AS fraud,
        AVG("processingMs")::float8                                            AS avg_ms,
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY "processingMs"))::float8  AS p95_ms,
        AVG("confidence")::float8                                              AS avg_confidence,
        AVG("livenessScore")::float8                                           AS avg_liveness
      FROM "recognition_logs"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
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

  private async loadDaily(from: Date, to: Date): Promise<PlatformDailyRow[]> {
    return this.prisma.$queryRaw<PlatformDailyRow[]>(Prisma.sql`
      SELECT
        to_char(("createdAt" AT TIME ZONE ${PLATFORM_TIMEZONE})::date, 'YYYY-MM-DD') AS day,
        COUNT(*)::int                                                                AS total,
        COUNT(*) FILTER (WHERE "status" = 'identified')::int                         AS identified,
        COUNT(*) FILTER (WHERE "status" = 'not_identified')::int                     AS not_identified,
        COUNT(*) FILTER (WHERE "status" = ${FRAUD_STATUS})::int                      AS fraud,
        AVG("processingMs")::float8                                                  AS avg_ms,
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY "processingMs"))::float8        AS p95_ms,
        AVG("confidence")::float8                                                    AS avg_confidence,
        AVG("livenessScore")::float8                                                 AS avg_liveness,
        COUNT(DISTINCT "tenantId")::int                                              AS active_tenants
      FROM "recognition_logs"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
      ORDER BY 1
    `);
  }

  private async loadHourly(
    from: Date,
    to: Date
  ): Promise<Array<{ hour: number; total: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ hour: number; total: number }>>(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE ${PLATFORM_TIMEZONE}))::int AS hour,
        COUNT(*)::int                                                           AS total
      FROM "recognition_logs"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
    `);

    const byHour = new Map(rows.map((r) => [r.hour, r.total]));
    return Array.from({ length: 24 }, (_, hour) => ({ hour, total: byHour.get(hour) ?? 0 }));
  }

  private async loadStatusBreakdown(
    from: Date,
    to: Date
  ): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.recognitionLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });

    return rows
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  private async loadTopTenants(from: Date, to: Date): Promise<PlatformTenantActivity[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        tenant_id: string;
        total: number;
        identified: number;
        fraud: number;
        avg_ms: number | null;
      }>
    >(Prisma.sql`
      SELECT
        "tenantId"                                              AS tenant_id,
        COUNT(*)::int                                           AS total,
        COUNT(*) FILTER (WHERE "status" = 'identified')::int    AS identified,
        COUNT(*) FILTER (WHERE "status" = ${FRAUD_STATUS})::int AS fraud,
        AVG("processingMs")::float8                             AS avg_ms
      FROM "recognition_logs"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT ${TOP_TENANTS_LIMIT}
    `);

    if (rows.length === 0) return [];

    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: rows.map((r) => r.tenant_id) } },
      select: { id: true, name: true, status: true, plan: { select: { name: true } } },
    });
    const byId = new Map(tenants.map((t) => [t.id, t]));

    return rows.map((row) => {
      const tenant = byId.get(row.tenant_id);
      return {
        tenantId: row.tenant_id,
        name: tenant?.name ?? "Instituição removida",
        status: tenant?.status ?? "cancelled",
        planName: tenant?.plan?.name ?? "—",
        total: row.total,
        identified: row.identified,
        fraud: row.fraud,
        fraudRatePercent: percent(row.fraud, row.total),
        avgProcessingMs: round(row.avg_ms),
      };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Dias da janela no fuso da plataforma, sem repetição e em ordem. */
  private eachDay(from: Date, to: Date): string[] {
    const format = new Intl.DateTimeFormat("en-CA", {
      timeZone: PLATFORM_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const days: string[] = [];
    for (
      let cursor = new Date(from.getTime());
      cursor <= to;
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const key = format.format(cursor);
      if (days[days.length - 1] !== key) days.push(key);
    }
    return days;
  }

  /** Completa dias sem nenhum evento — sem isso o gráfico "encolhe" o tempo. */
  private fillDays(rows: PlatformDailyRow[], from: Date, to: Date): PlatformDailyPoint[] {
    const byDay = new Map(rows.map((r) => [r.day, r]));

    return this.eachDay(from, to).map((date) => {
      const row = byDay.get(date);
      return {
        date,
        total: row?.total ?? 0,
        identified: row?.identified ?? 0,
        notIdentified: row?.not_identified ?? 0,
        fraud: row?.fraud ?? 0,
        fraudRatePercent: percent(row?.fraud ?? 0, row?.total ?? 0),
        avgProcessingMs: round(row?.avg_ms ?? null),
        p95ProcessingMs: round(row?.p95_ms ?? null),
        activeTenants: row?.active_tenants ?? 0,
      };
    });
  }
}

export const platformService = new PlatformService();
