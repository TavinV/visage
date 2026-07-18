"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/apiError";
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

function ValueChip({ value }: { value: unknown }) {
  if (typeof value === "boolean") {
    return value ? <Badge variant="success" dot>Sim</Badge> : <Badge variant="danger" dot>Não</Badge>;
  }
  if (value === null || value === undefined) {
    return <span className="text-flauzino-slate-400">—</span>;
  }
  if (typeof value === "object") {
    return (
      <code className="font-mono-ds text-xs text-flauzino-slate-700">{JSON.stringify(value)}</code>
    );
  }
  return <span className="font-mono-ds text-xs text-flauzino-navy-900">{String(value)}</span>;
}

export default function EnginePage() {
  const health = useQuery({
    queryKey: ["engine-health"],
    queryFn: () => api.get<{ data: Record<string, unknown> }>("/admin/health"),
    retry: false,
    refetchInterval: 30_000,
  });

  const entries = health.data ? Object.entries(health.data.data) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Saúde da engine"
        description="Estado da engine de reconhecimento facial, consultado via backend."
        actions={
          <Button
            variant="secondary"
            onClick={() => health.refetch()}
            loading={health.isFetching}
            iconLeft={<RefreshCw size={15} />}
          >
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5">
        <Card>
          <CardHeader
            title="Estado geral"
            actions={
              health.isPending ? null : health.isSuccess ? (
                <Badge variant="success" dot>Operacional</Badge>
              ) : (
                <Badge variant="danger" dot>Indisponível</Badge>
              )
            }
          />
          <CardBody>
            {health.isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ) : health.isError ? (
              <EmptyState
                title="A engine não respondeu."
                description={friendlyError(health.error)}
              />
            ) : entries.length === 0 ? (
              <EmptyState title="A engine respondeu sem detalhes." />
            ) : (
              <dl className="divide-y divide-flauzino-slate-200">
                {entries.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-6 py-3">
                    <dt className="font-mono-ds text-xs text-flauzino-slate-500">{key}</dt>
                    <dd><ValueChip value={value} /></dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>

        {health.data && (
          <Card>
            <CardHeader title="Resposta completa" description="Payload retornado por GET /admin/health." />
            <CardBody>
              <pre className="overflow-x-auto rounded-lg bg-flauzino-slate-100 p-4 font-mono-ds text-xs leading-relaxed text-flauzino-slate-700">
                {JSON.stringify(health.data.data, null, 2)}
              </pre>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
