"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, ScanFace, Activity } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Paginated, Plan, RecognitionLog, Tenant } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Th, Td, Tr, TableState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { TenantStatusBadge, RecognitionStatusBadge } from "@/components/app/badges";

function StatCard({
  label,
  value,
  loading,
  icon,
  href,
}: {
  label: string;
  value: string | number | undefined;
  loading: boolean;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="p-5 hover:border-flauzino-accent-100 hover:shadow-fl-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-flauzino-slate-500">{label}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-flauzino-accent-50 text-flauzino-accent-600">
            {icon}
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-16" />
        ) : (
          <p className="mt-2 font-mono-ds text-3xl font-semibold tracking-tight text-flauzino-navy-900">
            {value ?? "—"}
          </p>
        )}
      </Card>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const tenants = useQuery({
    queryKey: ["tenants", { page: 1, limit: 5 }],
    queryFn: () => api.get<Paginated<Tenant>>(`/tenants${qs({ limit: 5 })}`),
  });

  const plans = useQuery({
    queryKey: ["plans", "all"],
    queryFn: () => api.get<Paginated<Plan>>(`/plans${qs({ all: true, limit: 100 })}`),
  });

  const logs = useQuery({
    queryKey: ["admin-logs", { page: 1, limit: 6 }],
    queryFn: () => api.get<Paginated<RecognitionLog>>(`/admin/recognition-logs${qs({ limit: 6 })}`),
  });

  const health = useQuery({
    queryKey: ["engine-health"],
    queryFn: () => api.get<{ data: Record<string, unknown> }>("/admin/health"),
    retry: false,
  });

  const activePlans = plans.data?.data.filter((p) => p.isActive).length;
  const engineOk = health.isSuccess;

  return (
    <div>
      <PageHeader
        title="Visão geral da plataforma"
        description="Instituições, planos e atividade de reconhecimento em toda a base."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Instituições"
          value={tenants.data?.pagination.total}
          loading={tenants.isPending}
          icon={<Building2 size={18} strokeWidth={1.75} />}
          href="/admin/tenants"
        />
        <StatCard
          label="Planos ativos"
          value={activePlans}
          loading={plans.isPending}
          icon={<CreditCard size={18} strokeWidth={1.75} />}
          href="/admin/plans"
        />
        <StatCard
          label="Reconhecimentos registrados"
          value={logs.data?.pagination.total}
          loading={logs.isPending}
          icon={<ScanFace size={18} strokeWidth={1.75} />}
          href="/admin/logs"
        />
        <Link href="/admin/engine">
          <Card className="p-5 transition-shadow hover:shadow-fl-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-flauzino-slate-500">Engine facial</span>
              <span className="text-flauzino-slate-400">
                <Activity size={18} strokeWidth={1.75} />
              </span>
            </div>
            <div className="mt-3">
              {health.isPending ? (
                <Skeleton className="h-6 w-24" />
              ) : engineOk ? (
                <Badge variant="success" dot>Operacional</Badge>
              ) : (
                <Badge variant="danger" dot>Indisponível</Badge>
              )}
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Instituições recentes" />
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={3}
                loading={tenants.isPending}
                error={tenants.error ? friendlyError(tenants.error) : null}
                empty={tenants.data?.data.length === 0}
                emptyTitle="Nenhuma instituição cadastrada."
              />
              {tenants.data?.data.map((t) => (
                <Tr key={t.id}>
                  <Td className="font-medium text-flauzino-navy-900">{t.name}</Td>
                  <Td>{t.institutionType === "school" ? "Escola" : "Universidade"}</Td>
                  <Td><TenantStatusBadge status={t.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Últimos reconhecimentos" />
          <Table>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Pessoa</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={3}
                loading={logs.isPending}
                error={logs.error ? friendlyError(logs.error) : null}
                empty={logs.data?.data.length === 0}
                emptyTitle="Nenhum reconhecimento registrado."
              />
              {logs.data?.data.map((log) => (
                <Tr key={log.id}>
                  <Td className="font-mono-ds text-xs">{formatDateTime(log.createdAt)}</Td>
                  <Td>{log.userName ?? "—"}</Td>
                  <Td><RecognitionStatusBadge status={log.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
