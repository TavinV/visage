"use client";

/**
 * Auditoria global — visão do super admin sobre TODAS as instituições.
 *
 * É a única tela do produto onde a ausência de filtro por instituição significa
 * "todas". Os endpoints por trás dela ficam em /admin/audit/*, atrás de
 * requireSuperAdmin; o console do tenant nunca chega neles.
 *
 * Eventos sem instituição (login falho de e-mail que não existe em lugar
 * nenhum) só aparecem aqui — não pertencem a nenhum tenant para serem vistos
 * de dentro de um.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import type {
  AuditLog,
  AuditStats,
  AuthSession,
  Paginated,
  RecognitionLog,
  Tenant,
} from "@/lib/types";
import { formatDateTime, formatPercent, shortId } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Pagination,
  Input,
  DatePicker,
  Select,
  MultiSelect,
  Badge,
} from "@/components/ui";
import { RecognitionStatusBadge, recognitionStatusOptions } from "@/components/app/badges";
import {
  AuditDetailModal,
  AuditLogTable,
  AuditLogTableHead,
  SessionDetailModal,
  SessionRows,
  SessionTableHead,
  auditColSpan,
  sessionColSpan,
  useActorOptions,
  useEventOptions,
} from "@/components/app/audit";

const BASE = "/admin/audit";

type Tab = "activity" | "sessions" | "recognition";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "activity", label: "Ações" },
  { id: "sessions", label: "Acessos" },
  { id: "recognition", label: "Reconhecimento" },
];

const severityOptions = [
  { value: "critical", label: "Crítico" },
  { value: "warning", label: "Atenção" },
  { value: "info", label: "Rotina" },
];

/** Instituições para o filtro — compartilhado pelas três abas. */
function useTenantOptions() {
  const tenants = useQuery({
    queryKey: ["tenants", "options"],
    queryFn: () => api.get<Paginated<Tenant>>(`/tenants${qs({ limit: 100 })}`),
  });

  return {
    options: tenants.data?.data.map((t) => ({ value: t.id, label: t.name })) ?? [],
    nameById: new Map(tenants.data?.data.map((t) => [t.id, t.name]) ?? []),
  };
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value?: number;
  tone?: "neutral" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-flauzino-danger-600"
      : tone === "warning"
        ? "text-flauzino-warning-600"
        : "text-flauzino-navy-900";

  return (
    <div className="rounded-xl border border-flauzino-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-flauzino-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>
        {value === undefined ? "—" : value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

// ── Aba: ações ───────────────────────────────────────────────────────────────

function ActivityTab({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [severity, setSeverity] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { options: tenantOptions } = useTenantOptions();
  const { eventMultiOptions, categoryMultiOptions } = useEventOptions(BASE);
  // Trocar de instituição troca a lista de atores — um admin da escola A não
  // deve aparecer no filtro enquanto a escola B está selecionada
  const actorOptions = useActorOptions(BASE, tenantId || undefined);

  const filters = {
    tenant_id: tenantId,
    action: actions.join(","),
    category: categories.join(","),
    severity,
    actor_id: actorId,
    from,
    to,
    search,
  };

  const logs = useQuery({
    queryKey: ["admin-audit", { page, ...filters }],
    queryFn: () =>
      api.get<Paginated<AuditLog>>(`${BASE}/logs${qs({ page, limit: 25, ...filters })}`),
  });

  const stats = useQuery({
    queryKey: ["admin-audit-stats", filters],
    queryFn: () => api.get<{ data: AuditStats }>(`${BASE}/stats${qs(filters)}`),
  });

  const onFilter =
    (setter: (value: string) => void) =>
    (value: string) => {
      setter(value);
      setPage(1);
    };

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Eventos no período" value={stats.data?.data.total} />
        <StatCard
          label="Eventos críticos"
          value={stats.data?.data.bySeverity.find((s) => s.severity === "critical")?.count ?? 0}
          tone="danger"
        />
        <StatCard
          label="Precisam de atenção"
          value={stats.data?.data.bySeverity.find((s) => s.severity === "warning")?.count ?? 0}
          tone="warning"
        />
        <StatCard label="Sessões abertas agora" value={stats.data?.data.activeSessions} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Instituição"
          value={tenantId}
          onChange={(e) => {
            onFilter(setTenantId)(e.target.value);
            setActorId(""); // o ator selecionado pode não existir na nova instituição
          }}
          placeholder="Todas"
          options={tenantOptions}
          className="w-56"
        />
        <DatePicker
          label="De"
          value={from}
          onChange={onFilter(setFrom)}
          max={to || undefined}
          clearable
          className="w-40"
        />
        <DatePicker
          label="Até"
          value={to}
          onChange={onFilter(setTo)}
          min={from || undefined}
          clearable
          className="w-40"
        />
        <MultiSelect
          label="Área"
          value={categories}
          onChange={(vals) => {
            setCategories(vals);
            setPage(1);
          }}
          placeholder="Todas"
          options={categoryMultiOptions}
          className="w-52"
        />
        <MultiSelect
          label="Evento"
          value={actions}
          onChange={(vals) => {
            setActions(vals);
            setPage(1);
          }}
          placeholder="Todos"
          searchPlaceholder="Buscar evento…"
          options={eventMultiOptions}
          className="w-72"
        />
        <Select
          label="Quem fez"
          value={actorId}
          onChange={(e) => onFilter(setActorId)(e.target.value)}
          placeholder="Todos"
          options={actorOptions}
          className="w-56"
        />
        <Select
          label="Relevância"
          value={severity}
          onChange={(e) => onFilter(setSeverity)(e.target.value)}
          placeholder="Todas"
          options={severityOptions}
          className="w-40"
        />
        <Input
          label="Buscar"
          placeholder="Nome, e-mail ou IP"
          value={search}
          onChange={(e) => onFilter(setSearch)(e.target.value)}
          className="w-56"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <AuditLogTableHead tenantColumn />
          </thead>
          <tbody>
            <TableState
              colSpan={auditColSpan(true)}
              loading={logs.isPending}
              error={logs.error ? friendlyError(logs.error) : null}
              empty={logs.data?.data.length === 0}
              emptyTitle="Nenhum evento para os filtros selecionados."
            />
            {logs.data && (
              <AuditLogTable logs={logs.data.data} onSelect={setSelected} tenantColumn />
            )}
          </tbody>
        </Table>
        {logs.data && <Pagination pagination={logs.data.pagination} onPageChange={setPage} />}
      </Card>

      {selected && (
        <AuditDetailModal
          log={selected}
          showTenant
          onClose={() => setSelected(null)}
          onOpenSession={(sessionId) => {
            setSelected(null);
            onOpenSession(sessionId);
          }}
        />
      )}
    </div>
  );
}

// ── Aba: acessos ─────────────────────────────────────────────────────────────

function SessionsTab({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState("");
  const [active, setActive] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const { options: tenantOptions } = useTenantOptions();
  const filters = { tenant_id: tenantId, active, role, from, to, search };

  const sessions = useQuery({
    queryKey: ["admin-audit-sessions", { page, ...filters }],
    queryFn: () =>
      api.get<Paginated<AuthSession>>(`${BASE}/sessions${qs({ page, limit: 25, ...filters })}`),
  });

  const onFilter =
    (setter: (value: string) => void) =>
    (value: string) => {
      setter(value);
      setPage(1);
    };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Instituição"
          value={tenantId}
          onChange={(e) => onFilter(setTenantId)(e.target.value)}
          placeholder="Todas"
          options={tenantOptions}
          className="w-56"
        />
        <DatePicker
          label="De"
          value={from}
          onChange={onFilter(setFrom)}
          max={to || undefined}
          clearable
          className="w-40"
        />
        <DatePicker
          label="Até"
          value={to}
          onChange={onFilter(setTo)}
          min={from || undefined}
          clearable
          className="w-40"
        />
        <Select
          label="Perfil"
          value={role}
          onChange={(e) => onFilter(setRole)(e.target.value)}
          placeholder="Todos"
          options={[
            { value: "super_admin", label: "Super admin" },
            { value: "admin", label: "Administrador" },
            { value: "manager", label: "Coordenador" },
            { value: "teacher", label: "Professor" },
          ]}
          className="w-48"
        />
        <Select
          label="Situação"
          value={active}
          onChange={(e) => onFilter(setActive)(e.target.value)}
          placeholder="Todas"
          options={[
            { value: "true", label: "Em andamento" },
            { value: "false", label: "Encerradas" },
          ]}
          className="w-44"
        />
        <Input
          label="Buscar"
          placeholder="Nome, e-mail ou IP"
          value={search}
          onChange={(e) => onFilter(setSearch)(e.target.value)}
          className="w-56"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <SessionTableHead tenantColumn />
          </thead>
          <tbody>
            <TableState
              colSpan={sessionColSpan(true)}
              loading={sessions.isPending}
              error={sessions.error ? friendlyError(sessions.error) : null}
              empty={sessions.data?.data.length === 0}
              emptyTitle="Nenhum acesso para os filtros selecionados."
            />
            {sessions.data && (
              <SessionRows
                sessions={sessions.data.data}
                onSelect={onOpenSession}
                tenantColumn
              />
            )}
          </tbody>
        </Table>
        {sessions.data && (
          <Pagination pagination={sessions.data.pagination} onPageChange={setPage} />
        )}
      </Card>
    </div>
  );
}

// ── Aba: reconhecimento ──────────────────────────────────────────────────────

function RecognitionTab() {
  const [page, setPage] = useState(1);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [tenantId, setTenantId] = useState("");

  const { options: tenantOptions, nameById } = useTenantOptions();

  const logs = useQuery({
    queryKey: ["admin-logs", { page, date, status, tenantId }],
    queryFn: () =>
      api.get<Paginated<RecognitionLog>>(
        `/admin/recognition-logs${qs({ page, limit: 25, date, status, tenant_id: tenantId })}`
      ),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Instituição"
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value);
            setPage(1);
          }}
          placeholder="Todas"
          options={tenantOptions}
          className="w-56"
        />
        <DatePicker
          label="Data"
          value={date}
          onChange={(value) => {
            setDate(value);
            setPage(1);
          }}
          clearable
          className="w-44"
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Todos"
          options={recognitionStatusOptions}
          className="w-52"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Instituição</Th>
              <Th>Pessoa</Th>
              <Th>Status</Th>
              <Th>Confiança</Th>
              <Th>Vivacidade</Th>
              <Th>Tempo</Th>
              <Th>Fraude</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={8}
              loading={logs.isPending}
              error={logs.error ? friendlyError(logs.error) : null}
              empty={logs.data?.data.length === 0}
              emptyTitle="Nenhum log encontrado para os filtros."
            />
            {logs.data?.data.map((log) => (
              <Tr key={log.id}>
                <Td className="font-mono-ds text-xs">{formatDateTime(log.createdAt)}</Td>
                <Td>{nameById.get(log.tenantId) ?? shortId(log.tenantId)}</Td>
                <Td>{log.userName ?? "—"}</Td>
                <Td><RecognitionStatusBadge status={log.status} /></Td>
                <Td className="font-mono-ds text-xs">
                  {log.confidence != null ? formatPercent(log.confidence * 100) : "—"}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {log.livenessScore != null ? log.livenessScore.toFixed(2) : "—"}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {log.processingMs != null ? `${log.processingMs}ms` : "—"}
                </Td>
                <Td>{log.fraudFrameExists ? <Badge variant="danger">Frame salvo</Badge> : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {logs.data && <Pagination pagination={logs.data.pagination} onPageChange={setPage} />}
      </Card>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function AdminLogsPage() {
  const [tab, setTab] = useState<Tab>("activity");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Auditoria da plataforma"
        description="Visão somente leitura de tudo que acontece em todas as instituições — ações, acessos e reconhecimento."
      />

      <div
        role="tablist"
        aria-label="Visões da auditoria"
        className="mb-5 flex flex-wrap gap-1 border-b border-flauzino-slate-200"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors " +
              (tab === t.id
                ? "border-flauzino-accent-500 text-flauzino-accent-700"
                : "border-transparent text-flauzino-slate-500 hover:text-flauzino-navy-900")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "activity" && <ActivityTab onOpenSession={setOpenSessionId} />}
      {tab === "sessions" && <SessionsTab onOpenSession={setOpenSessionId} />}
      {tab === "recognition" && <RecognitionTab />}

      {openSessionId && (
        <SessionDetailModal
          sessionId={openSessionId}
          basePath={BASE}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </div>
  );
}
