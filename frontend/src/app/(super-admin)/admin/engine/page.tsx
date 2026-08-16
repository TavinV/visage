"use client";

import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Activity,
  Gauge,
  Layers,
  ScanFace,
  ShieldAlert,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import { friendlyError } from "@/lib/apiError";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { EngineHealth, PlatformOverview } from "@/lib/types";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Skeleton,
  EmptyState,
} from "@/components/ui";
import {
  ChartLegend,
  DonutChart,
  TrendChart,
  chartColors,
} from "@/components/app/charts";
import { StatCard } from "@/components/app/stats";

/**
 * Os modelos chegam da engine com o nome do arquivo/pesos. Traduzir aqui é o
 * que separa "liveness_v2: true" de "a segunda camada anti-spoofing está no ar":
 * quem abre esta tela quer saber o que deixa de funcionar se um deles cair.
 */
const modelInfo: Record<string, { label: string; description: string }> = {
  detector: {
    label: "Detector de rosto",
    description: "Localiza o rosto na imagem. Sem ele, nenhuma passagem é processada.",
  },
  embedder: {
    label: "Extrator de biometria",
    description: "Gera o vetor facial comparado com os cadastros.",
  },
  liveness_v1: {
    label: "Vivacidade — camada 1",
    description: "Barra fotos impressas e máscaras.",
  },
  liveness_v2: {
    label: "Vivacidade — camada 2",
    description: "Reforça a camada 1 em telas e vídeos.",
  },
  calibration: {
    label: "Calibração de totem",
    description: "Ajusta os limiares de cada dispositivo a partir de amostras reais.",
  },
  calibration_recognition: {
    label: "Calibração — reconhecimento",
    description: "Define o limiar de distância usado na comparação facial.",
  },
};

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

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/** Campos que a engine devolve além de status/models — exibidos sem virar JSON. */
function ExtraField({ label, value }: { label: string; value: unknown }) {
  const render = (v: unknown) => {
    if (typeof v === "boolean") {
      return v ? (
        <Badge variant="success" dot>Sim</Badge>
      ) : (
        <Badge variant="danger" dot>Não</Badge>
      );
    }
    if (v === null || v === undefined) return <span className="text-flauzino-slate-400">—</span>;
    return (
      <span className="font-mono-ds text-xs text-flauzino-navy-900">{String(v)}</span>
    );
  };

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="py-3">
        <p className="text-xs font-medium text-flauzino-slate-500">{label}</p>
        <dl className="mt-2 flex flex-col gap-1.5 border-l border-flauzino-slate-200 pl-3">
          {Object.entries(value as Record<string, unknown>).map(([key, nested]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <dt className="font-mono-ds text-[11px] text-flauzino-slate-500">{key}</dt>
              <dd>{render(nested)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <dt className="text-xs font-medium text-flauzino-slate-500">{label}</dt>
      <dd>{render(Array.isArray(value) ? value.join(", ") : value)}</dd>
    </div>
  );
}

export default function EnginePage() {
  const health = useQuery({
    queryKey: ["engine-health"],
    queryFn: () => api.get<{ data: EngineHealth }>("/admin/health"),
    retry: false,
    refetchInterval: 30_000,
  });

  // A saúde diz se a engine está de pé; o desempenho diz se ela está bem.
  const overview = useQuery({
    queryKey: ["platform-overview", "7"],
    queryFn: () => api.get<{ data: PlatformOverview }>(`/admin/overview${qs({ days: 7 })}`),
    refetchInterval: 60_000,
  });

  const payload = health.data?.data;
  const models = Object.entries(payload?.models ?? {});
  const loadedCount = models.filter(([, loaded]) => loaded).length;
  const engineOk = health.isSuccess && payload?.status === "ok";
  const extras = Object.entries(payload ?? {}).filter(
    ([key]) => key !== "status" && key !== "models"
  );

  const data = overview.data?.data;
  const recognition = data?.recognition;
  const daily = data?.daily ?? [];
  const labels = daily.map((d) => shortDate(d.date));

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

  return (
    <div>
      <PageHeader
        title="Saúde da engine"
        description="Modelos carregados e desempenho do serviço de reconhecimento facial."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              health.refetch();
              overview.refetch();
            }}
            loading={health.isFetching}
            iconLeft={<RefreshCw size={15} />}
          >
            Atualizar
          </Button>
        }
      />

      {/* Estado geral */}
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              className={
                engineOk
                  ? "flex h-12 w-12 items-center justify-center rounded-xl bg-flauzino-success-100 text-flauzino-success-600"
                  : "flex h-12 w-12 items-center justify-center rounded-xl bg-flauzino-slate-100 text-flauzino-slate-500"
              }
            >
              <Activity size={22} strokeWidth={1.75} />
            </span>
            <div>
              {health.isPending ? (
                <Skeleton className="h-6 w-40" />
              ) : (
                <p className="text-[15px] font-semibold text-flauzino-navy-900">
                  {engineOk
                    ? "Engine operacional"
                    : health.isError
                      ? "Engine não respondeu"
                      : "Engine respondeu com ressalvas"}
                </p>
              )}
              <p className="mt-0.5 text-xs text-flauzino-slate-500">
                {health.isError
                  ? friendlyError(health.error)
                  : `${loadedCount} de ${models.length} modelos carregados · verificada em ${formatDateTime(
                      new Date(health.dataUpdatedAt || Date.now()).toISOString()
                    )}`}
              </p>
            </div>
          </div>
          {health.isPending ? (
            <Skeleton className="h-6 w-28" />
          ) : engineOk ? (
            <Badge variant="success" dot>Operacional</Badge>
          ) : (
            <Badge variant="danger" dot>Indisponível</Badge>
          )}
        </CardBody>
      </Card>

      {/* Desempenho dos últimos 7 dias */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Passagens (7 dias)"
          value={(recognition?.total ?? 0).toLocaleString("pt-BR")}
          hint={`${formatPercent(recognition?.identificationRatePercent, 0)} identificados`}
          icon={<ScanFace size={18} strokeWidth={1.75} />}
          loading={overview.isPending}
        />
        <StatCard
          label="Velocidade média"
          value={recognition?.avgProcessingMs != null ? `${recognition.avgProcessingMs} ms` : "—"}
          hint="Tempo para processar cada imagem"
          icon={<Gauge size={18} strokeWidth={1.75} />}
          loading={overview.isPending}
        />
        <StatCard
          label="95% mais lentos"
          value={recognition?.p95ProcessingMs != null ? `${recognition.p95ProcessingMs} ms` : "—"}
          hint="Teto de tempo para 95 de cada 100 passagens"
          icon={<Gauge size={18} strokeWidth={1.75} />}
          loading={overview.isPending}
        />
        <StatCard
          label="Vivacidade reprovada"
          value={formatPercent(recognition?.fraudRatePercent, 1)}
          hint={`${recognition?.fraud ?? 0} tentativa(s) barrada(s)`}
          icon={<ShieldAlert size={18} strokeWidth={1.75} />}
          loading={overview.isPending}
        />
      </div>

      {/* Modelos */}
      <Card className="mb-5">
        <CardHeader
          title="Modelos carregados"
          description="Cada modelo é uma etapa do pipeline — se um cai, a etapa dele para."
          icon={<Layers size={18} strokeWidth={1.75} />}
          actions={
            health.isPending ? null : (
              <span className="font-mono-ds text-xs text-flauzino-slate-500">
                {loadedCount}/{models.length}
              </span>
            )
          }
        />
        <CardBody>
          {health.isPending ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : health.isError ? (
            <EmptyState
              title="A engine não respondeu."
              description={friendlyError(health.error)}
            />
          ) : models.length === 0 ? (
            <EmptyState title="A engine respondeu sem listar modelos." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {models.map(([key, loaded]) => {
                const info = modelInfo[key];
                return (
                  <div
                    key={key}
                    className="flex items-start gap-3 rounded-lg border border-flauzino-slate-200 p-4"
                  >
                    <span
                      className={
                        loaded
                          ? "mt-0.5 text-flauzino-success-600"
                          : "mt-0.5 text-flauzino-danger-600"
                      }
                    >
                      {loaded ? <CircleCheck size={18} /> : <CircleX size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[13px] font-semibold text-flauzino-navy-900">
                          {info?.label ?? key}
                        </p>
                        <Badge variant={loaded ? "success" : "danger"}>
                          {loaded ? "Carregado" : "Ausente"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-flauzino-slate-500">
                        {info?.description ?? "Modelo reportado pela engine."}
                      </p>
                      <p className="mt-1 font-mono-ds text-[11px] text-flauzino-slate-400">{key}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Velocidade nos últimos 7 dias"
            description="Tempo de processamento por imagem em toda a plataforma."
            icon={<Gauge size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-3">
            <ChartLegend series={speedSeries} />
            <TrendChart
              labels={labels}
              series={speedSeries}
              formatValue={(v) => `${Math.round(v)}ms`}
              emptyMessage="Nenhuma passagem processada nos últimos 7 dias."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Resultado das passagens"
            description="O que a engine devolveu nos últimos 7 dias."
            icon={<ScanFace size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            {(data?.statusBreakdown.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-flauzino-slate-400">
                Nenhuma passagem registrada no período.
              </p>
            ) : (
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
            )}
          </CardBody>
        </Card>
      </div>

      {/* Campos adicionais que a engine porventura devolva */}
      {extras.length > 0 && (
        <Card className="mt-5">
          <CardHeader
            title="Outras informações da engine"
            description="Campos reportados pelo serviço além do status e dos modelos."
          />
          <CardBody>
            <dl className="divide-y divide-flauzino-slate-200">
              {extras.map(([key, value]) => (
                <ExtraField key={key} label={key} value={value} />
              ))}
            </dl>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
