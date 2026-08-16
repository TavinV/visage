"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CreditCard,
  ScanFace,
  Activity,
  ShieldAlert,
  Gauge,
  BarChart3,
  Users,
  MonitorSmartphone,
  GraduationCap,
  TrendingUp,
  Fingerprint,
  CalendarClock,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import type { EngineHealth, PlatformOverview } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Skeleton,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Button,
  Select,
  Badge,
} from "@/components/ui";
import { TenantStatusBadge } from "@/components/app/badges";
import {
  BarsChart,
  ChartLegend,
  DonutChart,
  ProgressBar,
  Sparkline,
  TrendChart,
  chartColors,
  paletteColor,
} from "@/components/app/charts";
import { MiniStat, StatCard, TrendPill, variation } from "@/components/app/stats";

const RANGE_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "14", label: "Últimos 14 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

/** "2026-08-15" → "15/08" sem passar por Date (evita virar o dia no fuso). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

const statusLabels: Record<string, string> = {
  identified: "Reconhecidos",
  not_identified: "Não identificados",
  liveness_failed: "Vivacidade reprovada",
  no_face_detected: "Sem rosto na imagem",
  multiple_faces_detected: "Mais de um rosto",
};

const statusColors: Record<string, string> = {
  identified: chartColors.success,
  not_identified: chartColors.warning,
  liveness_failed: chartColors.danger,
  no_face_detected: chartColors.slate,
  multiple_faces_detected: chartColors.accentSoft,
};

const tenantStatusLabels: Record<string, string> = {
  active: "Ativas",
  trial: "Em teste",
  suspended: "Suspensas",
  cancelled: "Canceladas",
};

const tenantStatusColors: Record<string, string> = {
  active: chartColors.success,
  trial: chartColors.warning,
  suspended: chartColors.danger,
  cancelled: chartColors.slate,
};

/** Nomes técnicos dos modelos da engine em linguagem de produto. */
const modelLabels: Record<string, string> = {
  detector: "Detector de rosto",
  embedder: "Extrator de biometria",
  liveness_v1: "Vivacidade (camada 1)",
  liveness_v2: "Vivacidade (camada 2)",
  calibration: "Calibração de totem",
  calibration_recognition: "Calibração — reconhecimento",
};

export default function AdminOverviewPage() {
  const [days, setDays] = useState("14");

  const overview = useQuery({
    queryKey: ["platform-overview", days],
    queryFn: () => api.get<{ data: PlatformOverview }>(`/admin/overview${qs({ days })}`),
    // O console fica aberto o dia todo; sem refresh a tela envelhece
    refetchInterval: 60_000,
  });

  const health = useQuery({
    queryKey: ["engine-health"],
    queryFn: () => api.get<{ data: EngineHealth }>("/admin/health"),
    retry: false,
    refetchInterval: 60_000,
  });

  const data = overview.data?.data;
  const loading = overview.isPending;
  const daily = data?.daily ?? [];
  const labels = daily.map((d) => shortDate(d.date));

  const recognition = data?.recognition;
  const volumeVariation = variation(
    recognition?.total ?? null,
    recognition?.previous.total ?? null
  );
  const speedVariation = variation(
    recognition?.avgProcessingMs ?? null,
    recognition?.previous.avgProcessingMs ?? null
  );
  const fraudVariation = variation(
    recognition?.fraudRatePercent ?? null,
    recognition?.previous.fraudRatePercent ?? null
  );
  const growthVariation = variation(
    data?.tenants.newInPeriod ?? null,
    data?.tenants.previousNewInPeriod ?? null
  );

  const growthSeries = [
    {
      key: "cumulative",
      label: "Base acumulada",
      color: chartColors.accent,
      area: true,
      values: (data?.tenants.daily ?? []).map((d) => d.cumulative),
    },
  ];

  const volumeSeries = [
    {
      key: "identified",
      label: "Reconhecidos",
      color: chartColors.success,
      area: true,
      values: daily.map((d) => d.identified),
    },
    {
      key: "notIdentified",
      label: "Não identificados",
      color: chartColors.warning,
      values: daily.map((d) => d.notIdentified),
    },
    {
      key: "fraud",
      label: "Tentativas de fraude",
      color: chartColors.danger,
      values: daily.map((d) => d.fraud),
    },
  ];

  const speedSeries = [
    {
      key: "avg",
      label: "Média",
      color: chartColors.accent,
      area: true,
      values: daily.map((d) => d.avgProcessingMs),
    },
    {
      key: "p95",
      label: "95% mais lentos",
      color: chartColors.slate,
      dashed: true,
      values: daily.map((d) => d.p95ProcessingMs),
    },
  ];

  const activeTenantsSeries = [
    {
      key: "activeTenants",
      label: "Instituições usando a engine",
      color: chartColors.accent,
      area: true,
      values: daily.map((d) => d.activeTenants),
    },
  ];

  const plans = data?.tenants.byPlan ?? [];
  const revenuePlans = plans.filter((p) => p.mrr > 0);
  const engineModels = Object.entries(health.data?.data.models ?? {});
  const engineOk = health.isSuccess && health.data?.data.status === "ok";

  return (
    <div>
      <PageHeader
        title="Visão geral da plataforma"
        description="Base de clientes, receita recorrente e uso da engine em todas as instituições."
        actions={
          <Select
            aria-label="Período"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={RANGE_OPTIONS}
            className="w-48"
          />
        }
      />

      {overview.isError && (
        <Card className="mb-6 p-5">
          <p className="text-sm text-flauzino-danger-600">{friendlyError(overview.error)}</p>
        </Card>
      )}

      {/* Indicadores do período */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Instituições ativas"
          value={String(data?.tenants.active ?? 0)}
          hint={`${data?.tenants.trial ?? 0} em teste · ${data?.tenants.newInPeriod ?? 0} nova(s) no período`}
          icon={<Building2 size={18} strokeWidth={1.75} />}
          loading={loading}
          trend={<TrendPill value={growthVariation} />}
          chart={<Sparkline values={(data?.tenants.daily ?? []).map((d) => d.cumulative)} />}
          href="/admin/tenants"
        />
        <StatCard
          label="Receita recorrente"
          value={formatCurrency(data?.revenue.mrr ?? 0)}
          hint={`${formatCurrency(data?.revenue.arpa ?? 0)} por instituição · ${formatCurrency(data?.revenue.trialMrr ?? 0)} em teste`}
          icon={<CreditCard size={18} strokeWidth={1.75} />}
          loading={loading}
          href="/admin/plans"
        />
        <StatCard
          label="Reconhecimentos"
          value={(recognition?.total ?? 0).toLocaleString("pt-BR")}
          hint={`${formatPercent(recognition?.identificationRatePercent, 0)} identificados`}
          icon={<ScanFace size={18} strokeWidth={1.75} />}
          loading={loading}
          trend={<TrendPill value={volumeVariation} />}
          chart={<Sparkline values={daily.map((d) => d.total)} />}
          href="/admin/logs"
        />
        <StatCard
          label="Índice de fraude"
          value={formatPercent(recognition?.fraudRatePercent, 1)}
          hint={`${recognition?.fraud ?? 0} tentativa(s) barrada(s) pela vivacidade`}
          icon={<ShieldAlert size={18} strokeWidth={1.75} />}
          loading={loading}
          trend={<TrendPill value={fraudVariation} lowerIsBetter />}
          chart={<Sparkline values={daily.map((d) => d.fraud)} color={chartColors.danger} />}
          href="/admin/logs"
        />
      </div>

      {/* Contadores da base */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <MiniStat
          label="Instituições"
          value={String(data?.tenants.total ?? 0)}
          icon={<Building2 size={17} strokeWidth={1.75} />}
          href="/admin/tenants"
        />
        <MiniStat
          label="Alunos ativos"
          value={(data?.usage.students ?? 0).toLocaleString("pt-BR")}
          icon={<Users size={17} strokeWidth={1.75} />}
        />
        <MiniStat
          label="Professores"
          value={(data?.usage.teachers ?? 0).toLocaleString("pt-BR")}
          icon={<GraduationCap size={17} strokeWidth={1.75} />}
        />
        <MiniStat
          label="Totens online"
          value={`${data?.usage.devicesOnline ?? 0}/${data?.usage.devices ?? 0}`}
          icon={<MonitorSmartphone size={17} strokeWidth={1.75} />}
        />
        <MiniStat
          label="Chamadas abertas"
          value={String(data?.usage.openSessions ?? 0)}
          icon={<ScanFace size={17} strokeWidth={1.75} />}
        />
        <MiniStat
          label="Chamadas no período"
          value={(data?.usage.sessionsInPeriod ?? 0).toLocaleString("pt-BR")}
          icon={<CalendarClock size={17} strokeWidth={1.75} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Crescimento da base"
            description="Instituições cadastradas acumuladas ao longo do período."
            icon={<TrendingUp size={18} strokeWidth={1.75} />}
            actions={
              <Link href="/admin/tenants">
                <Button variant="secondary" size="sm">Ver instituições</Button>
              </Link>
            }
          />
          <CardBody>
            <TrendChart
              labels={(data?.tenants.daily ?? []).map((d) => shortDate(d.date))}
              series={growthSeries}
              emptyMessage="Nenhuma instituição cadastrada."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Receita recorrente por plano"
            description="Mensalidade somada das instituições ativas em cada plano."
            icon={<CreditCard size={18} strokeWidth={1.75} />}
            actions={
              <Link href="/admin/plans">
                <Button variant="secondary" size="sm">Gerenciar planos</Button>
              </Link>
            }
          />
          <CardBody>
            {loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : revenuePlans.length === 0 ? (
              <p className="py-8 text-center text-sm text-flauzino-slate-400">
                Nenhuma instituição pagante ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {revenuePlans.map((plan, index) => (
                  <li key={plan.planId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] font-medium text-flauzino-navy-900">
                        {plan.planName}
                        <span className="ml-2 text-xs font-normal text-flauzino-slate-500">
                          {formatCurrency(plan.priceMonthly)}/mês
                        </span>
                      </span>
                      <span className="shrink-0 font-mono-ds text-[13px] font-semibold text-flauzino-navy-900">
                        {formatCurrency(plan.mrr)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={
                          data && data.revenue.mrr > 0 ? (plan.mrr / data.revenue.mrr) * 100 : 0
                        }
                        color={paletteColor(index)}
                      />
                    </div>
                    <p className="mt-1 text-xs text-flauzino-slate-500">
                      {plan.tenants} instituição(ões) no plano
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Volume de reconhecimento"
            description="Passagens pelos totens de toda a plataforma, por resultado."
            icon={<ScanFace size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-3">
            <ChartLegend series={volumeSeries} />
            <TrendChart labels={labels} series={volumeSeries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Velocidade da engine"
            description="Tempo de processamento por imagem — a tracejada mostra os casos mais lentos."
            icon={<Gauge size={18} strokeWidth={1.75} />}
            actions={<TrendPill value={speedVariation} lowerIsBetter />}
          />
          <CardBody className="flex flex-col gap-3">
            <ChartLegend series={speedSeries} />
            <TrendChart
              labels={labels}
              series={speedSeries}
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Instituições usando a engine"
            description="Quantas instituições distintas registraram passagens em cada dia."
            icon={<Building2 size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            <TrendChart
              labels={labels}
              series={activeTenantsSeries}
              emptyMessage="Nenhuma instituição usou a engine no período."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Movimento por hora"
            description="Quando os totens são usados — base para dimensionar a engine."
            icon={<BarChart3 size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            <BarsChart
              bars={(data?.hourly ?? []).map((h) => ({
                label: String(h.hour).padStart(2, "0"),
                value: h.total,
                hint: `${String(h.hour).padStart(2, "0")}h — ${h.total} passagem(ns)`,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Situação da base"
            description="Distribuição das instituições por status do contrato."
            icon={<Building2 size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-5">
            <DonutChart
              slices={(data?.tenants.byStatus ?? []).map((s) => ({
                label: tenantStatusLabels[s.status] ?? s.status,
                value: s.count,
                color: tenantStatusColors[s.status] ?? chartColors.slate,
              }))}
              centerValue={String(data?.tenants.total ?? 0)}
              centerLabel="instituições"
            />
            <div className="border-t border-flauzino-slate-200 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-flauzino-slate-500">
                  Cobertura biométrica da plataforma
                </span>
                <span className="font-mono-ds text-sm font-semibold text-flauzino-navy-900">
                  {formatPercent(data?.usage.biometricCoveragePercent, 0)}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar value={data?.usage.biometricCoveragePercent ?? 0} />
              </div>
              <p className="mt-2 text-xs text-flauzino-slate-500">
                {(data?.usage.studentsWithBiometrics ?? 0).toLocaleString("pt-BR")} de{" "}
                {(data?.usage.students ?? 0).toLocaleString("pt-BR")} alunos ativos já
                cadastraram o rosto.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Resultado das passagens"
            description="Distribuição dos eventos registrados no período."
            icon={<Fingerprint size={18} strokeWidth={1.75} />}
            actions={
              <Link href="/admin/logs">
                <Button variant="secondary" size="sm">Ver logs</Button>
              </Link>
            }
          />
          <CardBody className="flex flex-col gap-5">
            <DonutChart
              slices={(data?.statusBreakdown ?? []).map((s) => ({
                label: statusLabels[s.status] ?? s.status,
                value: s.count,
                color: statusColors[s.status] ?? chartColors.slate,
              }))}
              centerValue={(recognition?.total ?? 0).toLocaleString("pt-BR")}
              centerLabel="passagens"
              formatValue={(v) => v.toLocaleString("pt-BR")}
            />
            <div className="grid grid-cols-2 gap-4 border-t border-flauzino-slate-200 pt-4">
              <div>
                <p className="text-xs text-flauzino-slate-500">Confiança média</p>
                <p className="font-mono-ds text-sm font-semibold text-flauzino-navy-900">
                  {recognition?.avgConfidence != null
                    ? formatPercent(recognition.avgConfidence * 100, 1)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-flauzino-slate-500">Vivacidade média</p>
                <p className="font-mono-ds text-sm font-semibold text-flauzino-navy-900">
                  {recognition?.avgLivenessScore != null
                    ? recognition.avgLivenessScore.toFixed(2).replace(".", ",")
                    : "—"}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Engine */}
      <Card className="mt-5">
        <CardHeader
          title="Engine de reconhecimento"
          description="Modelos carregados no serviço que atende todas as instituições."
          icon={<Activity size={18} strokeWidth={1.75} />}
          actions={
            <div className="flex items-center gap-3">
              {health.isPending ? (
                <Skeleton className="h-6 w-24" />
              ) : engineOk ? (
                <Badge variant="success" dot>Operacional</Badge>
              ) : (
                <Badge variant="danger" dot>Indisponível</Badge>
              )}
              <Link href="/admin/engine">
                <Button variant="secondary" size="sm">Detalhes</Button>
              </Link>
            </div>
          }
        />
        <CardBody>
          {health.isError ? (
            <p className="text-sm text-flauzino-danger-600">{friendlyError(health.error)}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {engineModels.map(([key, loaded]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-flauzino-slate-200 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-flauzino-navy-900">
                      {modelLabels[key] ?? key}
                    </span>
                    <span className="font-mono-ds text-[11px] text-flauzino-slate-400">{key}</span>
                  </span>
                  <Badge variant={loaded ? "success" : "danger"} dot>
                    {loaded ? "Carregado" : "Ausente"}
                  </Badge>
                </div>
              ))}
              {!health.isPending && engineModels.length === 0 && (
                <p className="text-sm text-flauzino-slate-500">
                  A engine respondeu sem detalhar os modelos.
                </p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Instituições mais ativas */}
      <Card className="mt-5">
        <CardHeader
          title="Instituições mais ativas"
          description="Quem mais usou a engine no período — e com que qualidade."
          icon={<Building2 size={18} strokeWidth={1.75} />}
          actions={
            <Link href="/admin/tenants">
              <Button variant="secondary" size="sm">Ver todas</Button>
            </Link>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Instituição</Th>
              <Th>Plano</Th>
              <Th>Status</Th>
              <Th>Passagens</Th>
              <Th>Identificados</Th>
              <Th>Fraude</Th>
              <Th>Velocidade média</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
              loading={loading}
              error={overview.error ? friendlyError(overview.error) : null}
              empty={data?.topTenants.length === 0}
              emptyTitle="Nenhuma passagem registrada no período."
              emptyDescription="Os totens das instituições ainda não enviaram reconhecimentos."
            />
            {data?.topTenants.map((tenant) => (
              <Tr key={tenant.tenantId}>
                <Td className="font-medium text-flauzino-navy-900">{tenant.name}</Td>
                <Td className="text-flauzino-slate-500">{tenant.planName}</Td>
                <Td><TenantStatusBadge status={tenant.status} /></Td>
                <Td className="font-mono-ds text-xs">
                  {tenant.total.toLocaleString("pt-BR")}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {formatPercent(
                    tenant.total > 0 ? (tenant.identified / tenant.total) * 100 : null,
                    0
                  )}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {tenant.fraud > 0 ? (
                    <span className="text-flauzino-danger-600">
                      {tenant.fraud} ({formatPercent(tenant.fraudRatePercent, 1)})
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {tenant.avgProcessingMs != null ? `${tenant.avgProcessingMs} ms` : "—"}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
