"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  GraduationCap,
  MonitorSmartphone,
  ScanFace,
  BarChart3,
  ShieldAlert,
  Gauge,
  ClipboardCheck,
  Fingerprint,
  CalendarClock,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClassSession, DashboardOverview, Paginated } from "@/lib/types";
import { formatDateTime, formatLessons, formatPercent, formatTime } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Button,
  Select,
  Badge,
} from "@/components/ui";
import { SessionStatusBadge } from "@/components/app/badges";
import {
  BarsChart,
  ChartLegend,
  DonutChart,
  ProgressBar,
  Sparkline,
  TrendChart,
  chartColors,
} from "@/components/app/charts";
import { MiniStat, StatCard, TrendPill, variation } from "@/components/app/stats";

const RANGE_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "14", label: "Últimos 14 dias" },
  { value: "30", label: "Últimos 30 dias" },
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

export default function TenantOverviewPage() {
  const { user } = useAuth();
  // Manager também acompanha a operação; professor tem a visão de turma
  const canSeeOverview = user?.role === "admin" || user?.role === "manager";
  const [days, setDays] = useState("14");

  const overview = useQuery({
    queryKey: ["dashboard-overview", days],
    queryFn: () =>
      api.get<{ data: DashboardOverview }>(`/dashboard/overview${qs({ days })}`),
    enabled: canSeeOverview,
    // A tela fica aberta na secretaria o dia todo — sem refresh ela envelhece
    refetchInterval: 60_000,
  });

  const openSessions = useQuery({
    queryKey: ["class-sessions", { status: "open", limit: 6 }],
    queryFn: () =>
      api.get<Paginated<ClassSession>>(`/class-sessions${qs({ status: "open", limit: 6 })}`),
    enabled: canSeeOverview,
    refetchInterval: 60_000,
  });

  if (!canSeeOverview) {
    return (
      <div>
        <PageHeader
          title={`Bem-vindo, ${user?.name?.split(" ")[0] ?? ""}`}
          description="Acompanhe a frequência das suas turmas nos relatórios."
        />
        <Card className="max-w-xl p-6">
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-flauzino-accent-50 p-3 text-flauzino-accent-600">
              <BarChart3 size={20} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-flauzino-navy-900">
                Relatórios de frequência
              </h3>
              <p className="mt-1 text-sm text-flauzino-slate-500">
                Consulte a frequência agregada por turma e o histórico de presença
                de cada aluno.
              </p>
              <Link href="/dashboard/reports" className="mt-4 inline-block">
                <Button variant="secondary" size="sm">Abrir relatórios</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const data = overview.data?.data;
  const loading = overview.isPending;
  const daily = data?.daily ?? [];
  const labels = daily.map((d) => shortDate(d.date));

  // Presença é indexada por data para andar no mesmo eixo do reconhecimento —
  // dias sem chamada entram como lacuna, não como zero
  const attendanceByDate = new Map(
    (data?.attendance.daily ?? []).map((d) => [d.date, d])
  );

  const recognition = data?.recognition;
  const speedVariation = variation(
    recognition?.avgProcessingMs ?? null,
    recognition?.previous.avgProcessingMs ?? null
  );
  const volumeVariation = variation(
    recognition?.total ?? null,
    recognition?.previous.total ?? null
  );
  const fraudVariation = variation(
    recognition?.fraudRatePercent ?? null,
    recognition?.previous.fraudRatePercent ?? null
  );

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

  const fraudSeries = [
    {
      key: "fraudRate",
      label: "Índice de fraude",
      color: chartColors.danger,
      area: true,
      values: daily.map((d) => (d.total > 0 ? d.fraudRatePercent : null)),
    },
  ];

  const attendanceSeries = [
    {
      key: "rate",
      label: "Presença",
      color: chartColors.accent,
      area: true,
      values: daily.map((d) => attendanceByDate.get(d.date)?.attendanceRatePercent ?? null),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Operação da instituição: reconhecimento, fraude, presença e totens."
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
          label="Reconhecimentos"
          value={(recognition?.total ?? 0).toLocaleString("pt-BR")}
          hint={`${formatPercent(recognition?.identificationRatePercent, 0)} identificados`}
          icon={<ScanFace size={18} strokeWidth={1.75} />}
          loading={loading}
          trend={<TrendPill value={volumeVariation} />}
          chart={<Sparkline values={daily.map((d) => d.total)} />}
        />
        <StatCard
          label="Velocidade média"
          value={recognition?.avgProcessingMs != null ? `${recognition.avgProcessingMs} ms` : "—"}
          hint={
            recognition?.p95ProcessingMs != null
              ? `95% respondem em até ${recognition.p95ProcessingMs} ms`
              : "Tempo médio para reconhecer cada aluno"
          }
          icon={<Gauge size={18} strokeWidth={1.75} />}
          loading={loading}
          trend={<TrendPill value={speedVariation} lowerIsBetter />}
          chart={
            <Sparkline
              values={daily.map((d) => d.avgProcessingMs ?? 0)}
              color={chartColors.accent}
            />
          }
        />
        <StatCard
          label="Índice de fraude"
          value={formatPercent(recognition?.fraudRatePercent, 1)}
          hint={`${recognition?.fraud ?? 0} tentativa(s) barrada(s) pela vivacidade`}
          icon={<ShieldAlert size={18} strokeWidth={1.75} />}
          loading={loading}
          trend={<TrendPill value={fraudVariation} lowerIsBetter />}
          chart={
            <Sparkline
              values={daily.map((d) => d.fraud)}
              color={chartColors.danger}
            />
          }
        />
        <StatCard
          label="Presença registrada"
          value={formatPercent(data?.attendance.attendanceRatePercent, 1)}
          hint={`${data?.attendance.present ?? 0} presenças · ${data?.attendance.absent ?? 0} faltas em ${data?.attendance.sessionsClosed ?? 0} chamadas`}
          icon={<ClipboardCheck size={18} strokeWidth={1.75} />}
          loading={loading}
          chart={
            <Sparkline
              values={(data?.attendance.daily ?? []).map((d) => d.attendanceRatePercent)}
              color={chartColors.success}
            />
          }
        />
      </div>

      {/* Contadores da instituição — flex-wrap em vez de grid: com 5 cartões,
          um grid de 2 colunas sempre deixa o último sozinho numa fileira
          "quebrada"; com grow, ele estica pra preencher a linha em vez de
          ficar torto. */}
      <div className="mb-6 flex flex-wrap gap-4">
        <MiniStat
          label="Alunos ativos"
          value={String(data?.totals.students ?? 0)}
          icon={<Users size={17} strokeWidth={1.75} />}
          href="/dashboard/users"
          className="min-w-0 grow basis-[calc(50%-0.75rem)] lg:basis-[calc(20%-1rem)]"
        />
        <MiniStat
          label="Turmas"
          value={String(data?.totals.classes ?? 0)}
          icon={<GraduationCap size={17} strokeWidth={1.75} />}
          href="/dashboard/classes"
          className="min-w-0 grow basis-[calc(50%-0.75rem)] lg:basis-[calc(20%-1rem)]"
        />
        <MiniStat
          label="Totens online"
          value={`${data?.totals.devicesOnline ?? 0}/${data?.totals.devices ?? 0}`}
          icon={<MonitorSmartphone size={17} strokeWidth={1.75} />}
          href="/dashboard/devices"
          className="min-w-0 grow basis-[calc(50%-0.75rem)] lg:basis-[calc(20%-1rem)]"
        />
        <MiniStat
          label="Chamadas abertas"
          value={String(data?.totals.openSessions ?? 0)}
          icon={<ScanFace size={17} strokeWidth={1.75} />}
          href="/dashboard/sessions"
          className="min-w-0 grow basis-[calc(50%-0.75rem)] lg:basis-[calc(20%-1rem)]"
        />
        <MiniStat
          label="Aulas hoje"
          value={String(data?.totals.sessionsToday ?? 0)}
          icon={<CalendarClock size={17} strokeWidth={1.75} />}
          href="/dashboard/sessions"
          className="min-w-0 grow basis-[calc(50%-0.75rem)] lg:basis-[calc(20%-1rem)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Volume de reconhecimento"
            description="Passagens pelo totem por dia, separadas pelo resultado."
            icon={<ScanFace size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-3">
            <ChartLegend series={volumeSeries} />
            <TrendChart labels={labels} series={volumeSeries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Velocidade de reconhecimento"
            description="Tempo para processar cada imagem — a linha tracejada mostra os casos mais lentos."
            icon={<Gauge size={18} strokeWidth={1.75} />}
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
            title="Índice de fraude no tempo"
            description="Percentual das passagens barradas pela verificação de vivacidade."
            icon={<ShieldAlert size={18} strokeWidth={1.75} />}
            actions={
              <Link href="/dashboard/audit">
                <Button variant="secondary" size="sm">Ver auditoria</Button>
              </Link>
            }
          />
          <CardBody>
            <TrendChart
              labels={labels}
              series={fraudSeries}
              formatValue={(v) => `${v.toFixed(1).replace(".", ",")}%`}
              emptyMessage="Nenhuma tentativa de fraude no período."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Presença registrada por dia"
            description="Presenças ÷ chamadas consolidadas no dia."
            icon={<ClipboardCheck size={18} strokeWidth={1.75} />}
            actions={
              <Link href="/dashboard/reports">
                <Button variant="secondary" size="sm">Ver relatórios</Button>
              </Link>
            }
          />
          <CardBody>
            <TrendChart
              labels={labels}
              series={attendanceSeries}
              maxValue={100}
              formatValue={(v) => `${Math.round(v)}%`}
              emptyMessage="Nenhuma chamada encerrada no período."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Movimento por hora"
            description="Quando os alunos passam pelo totem — base para posicionar dispositivos."
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
            title="Resultado das passagens"
            description="Distribuição dos eventos registrados no período."
            icon={<Fingerprint size={18} strokeWidth={1.75} />}
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
            />
            <div className="border-t border-flauzino-slate-200 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-flauzino-slate-500">
                  Cobertura biométrica
                </span>
                <span className="font-mono-ds text-sm font-semibold text-flauzino-navy-900">
                  {formatPercent(data?.totals.biometricCoveragePercent, 0)}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar value={data?.totals.biometricCoveragePercent ?? 0} />
              </div>
              <p className="mt-2 text-xs text-flauzino-slate-500">
                {data?.totals.studentsWithBiometrics ?? 0} de {data?.totals.students ?? 0}{" "}
                alunos ativos já cadastraram o rosto.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Totens no período"
          description="Volume, velocidade e fraudes por dispositivo."
          icon={<MonitorSmartphone size={18} strokeWidth={1.75} />}
          actions={
            <Link href="/dashboard/devices">
              <Button variant="secondary" size="sm">Gerenciar totens</Button>
            </Link>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Totem</Th>
              <Th>Local</Th>
              <Th>Passagens</Th>
              <Th>Velocidade média</Th>
              <Th>Fraudes</Th>
              <Th>Situação</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={loading}
              error={overview.error ? friendlyError(overview.error) : null}
              empty={data?.devices.length === 0}
              emptyTitle="Nenhum totem ativo."
              emptyDescription="Cadastre um dispositivo para começar a registrar presenças."
            />
            {data?.devices.map((device) => (
              <Tr key={device.deviceId}>
                <Td>{device.label}</Td>
                <Td className="text-flauzino-slate-500">{device.locationName ?? "—"}</Td>
                <Td className="font-mono-ds text-xs">{device.total}</Td>
                <Td className="font-mono-ds text-xs">
                  {device.avgProcessingMs != null ? `${device.avgProcessingMs} ms` : "—"}
                </Td>
                <Td className="font-mono-ds text-xs">{device.fraud}</Td>
                <Td>
                  <Badge variant={device.isOnline ? "success" : "neutral"} dot>
                    {device.isOnline ? "Online" : "Offline"}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Chamadas em andamento"
          actions={
            <Link href="/dashboard/sessions">
              <Button variant="secondary" size="sm">Ver todas</Button>
            </Link>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Turma e disciplina</Th>
              <Th>Início</Th>
              <Th>Fecha às</Th>
              <Th>Vale por</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={5}
              loading={openSessions.isPending}
              error={openSessions.error ? friendlyError(openSessions.error) : null}
              empty={openSessions.data?.data.length === 0}
              emptyTitle="Nenhuma chamada aberta no momento."
              emptyDescription="Abra uma sessão em Sessões de chamada para registrar presenças."
            />
            {openSessions.data?.data.map((s) => (
              <Tr key={s.id}>
                <Td>
                  {s.className && s.subjectName
                    ? `${s.className} — ${s.subjectName}`
                    : s.id.slice(0, 8) + "…"}
                </Td>
                <Td className="font-mono-ds text-xs">{formatDateTime(s.startedAt)}</Td>
                <Td className="font-mono-ds text-xs">{formatTime(s.scheduledEndsAt)}</Td>
                <Td>{formatLessons(s.classesWorth)}</Td>
                <Td><SessionStatusBadge status={s.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
