"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, GraduationCap, MonitorSmartphone, ScanFace, BarChart3 } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClassItem, ClassSession, Device, Paginated, User } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import {
  PageHeader,
  Card,
  CardHeader,
  Skeleton,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Button,
} from "@/components/ui";
import { SessionStatusBadge } from "@/components/app/badges";

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

export default function TenantOverviewPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const users = useQuery({
    queryKey: ["users", { limit: 1 }],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ limit: 1 })}`),
    enabled: isAdmin,
  });

  const classes = useQuery({
    queryKey: ["classes", { limit: 1 }],
    queryFn: () => api.get<Paginated<ClassItem>>(`/classes${qs({ limit: 1 })}`),
    enabled: isAdmin,
  });

  const devices = useQuery({
    queryKey: ["devices", { isActive: true, limit: 1 }],
    queryFn: () => api.get<Paginated<Device>>(`/devices${qs({ isActive: true, limit: 1 })}`),
    enabled: isAdmin,
  });

  const openSessions = useQuery({
    queryKey: ["class-sessions", { status: "open", limit: 6 }],
    queryFn: () =>
      api.get<Paginated<ClassSession>>(`/class-sessions${qs({ status: "open", limit: 6 })}`),
    enabled: isAdmin,
  });

  if (!isAdmin) {
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

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Estado atual da instituição: pessoas, turmas e chamadas em andamento."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuários"
          value={users.data?.pagination.total}
          loading={users.isPending}
          icon={<Users size={18} strokeWidth={1.75} />}
          href="/dashboard/users"
        />
        <StatCard
          label="Turmas"
          value={classes.data?.pagination.total}
          loading={classes.isPending}
          icon={<GraduationCap size={18} strokeWidth={1.75} />}
          href="/dashboard/classes"
        />
        <StatCard
          label="Dispositivos ativos"
          value={devices.data?.pagination.total}
          loading={devices.isPending}
          icon={<MonitorSmartphone size={18} strokeWidth={1.75} />}
          href="/dashboard/devices"
        />
        <StatCard
          label="Chamadas abertas"
          value={openSessions.data?.pagination.total}
          loading={openSessions.isPending}
          icon={<ScanFace size={18} strokeWidth={1.75} />}
          href="/dashboard/sessions"
        />
      </div>

      <Card>
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
              <Th>Sessão</Th>
              <Th>Início</Th>
              <Th>Vale por</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={4}
              loading={openSessions.isPending}
              error={openSessions.error ? friendlyError(openSessions.error) : null}
              empty={openSessions.data?.data.length === 0}
              emptyTitle="Nenhuma chamada aberta no momento."
              emptyDescription="Abra uma sessão em Sessões de chamada para registrar presenças."
            />
            {openSessions.data?.data.map((s) => (
              <Tr key={s.id}>
                <Td className="font-mono-ds text-xs">{s.id.slice(0, 8)}…</Td>
                <Td className="font-mono-ds text-xs">{formatDateTime(s.startedAt)}</Td>
                <Td>{s.classesWorth} {s.classesWorth === 1 ? "aula" : "aulas"}</Td>
                <Td><SessionStatusBadge status={s.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
