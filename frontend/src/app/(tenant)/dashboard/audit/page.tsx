"use client";

/**
 * Auditoria da instituição — três leituras da mesma pergunta "o que aconteceu
 * aqui": as ações das pessoas no console, as sessões de acesso e o que a
 * engine viu nos totens.
 *
 * Acesso restrito a administrador e coordenador (ver nav.ts). O backend também
 * cobra o perfil e amarra tudo ao tenant do JWT — a tela nunca escolhe a
 * instituição.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { api, fetchAuthenticatedBlobUrl, qs } from "@/lib/api";
import type {
  AuditLog,
  AuditStats,
  AuthSession,
  Paginated,
  RecognitionLog,
  User,
} from "@/lib/types";
import { formatDateTime, formatPercent } from "@/lib/format";
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
  Select,
  Button,
  Modal,
  Spinner,
  useToast,
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

const BASE = "/audit";

type Tab = "activity" | "sessions" | "recognition";

const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "activity", label: "Ações", hint: "Tudo que foi feito no console" },
  { id: "sessions", label: "Acessos", hint: "Quem entrou, quando e de onde" },
  { id: "recognition", label: "Reconhecimento", hint: "O que os totens registraram" },
];

const severityOptions = [
  { value: "critical", label: "Crítico" },
  { value: "warning", label: "Atenção" },
  { value: "info", label: "Rotina" },
];

// ── Fraud frame ──────────────────────────────────────────────────────────────

/** Modal que busca a foto da tentativa de fraude como blob autenticado. */
function FraudFrameModal({ log, onClose }: { log: RecognitionLog; onClose: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    fetchAuthenticatedBlobUrl(`/audit/frames/${log.id}`)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.id]);

  useEffect(() => {
    if (error) toast.error(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Foto da tentativa de fraude"
      description={`Registrado em ${formatDateTime(log.createdAt)} · retenção limitada conforme a LGPD. Esta abertura fica registrada na auditoria.`}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex min-h-[240px] items-center justify-center rounded-lg bg-flauzino-slate-100">
        {error ? (
          <p className="px-6 text-center text-sm text-flauzino-danger-600">{error}</p>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Foto capturada na tentativa de fraude"
            className="max-h-[420px] w-auto rounded-lg"
          />
        ) : (
          <Spinner />
        )}
      </div>
    </Modal>
  );
}

// ── Cartão de número ─────────────────────────────────────────────────────────

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
  const [action, setAction] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { eventOptions, categoryOptions } = useEventOptions(BASE);
  const actorOptions = useActorOptions(BASE);

  const filters = { action, category, severity, actor_id: actorId, from, to, search };

  const logs = useQuery({
    queryKey: ["audit-activity", { page, ...filters }],
    queryFn: () =>
      api.get<Paginated<AuditLog>>(`${BASE}/logs${qs({ page, limit: 25, ...filters })}`),
  });

  const stats = useQuery({
    queryKey: ["audit-stats", filters],
    queryFn: () => api.get<{ data: AuditStats }>(`${BASE}/stats${qs(filters)}`),
  });

  /** Qualquer mudança de filtro volta para a primeira página. */
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
        <Input
          label="De"
          type="date"
          value={from}
          onChange={(e) => onFilter(setFrom)(e.target.value)}
          className="w-40"
        />
        <Input
          label="Até"
          type="date"
          value={to}
          onChange={(e) => onFilter(setTo)(e.target.value)}
          className="w-40"
        />
        <Select
          label="Área"
          value={category}
          onChange={(e) => onFilter(setCategory)(e.target.value)}
          placeholder="Todas"
          options={categoryOptions}
          className="w-52"
        />
        <Select
          label="Evento"
          value={action}
          onChange={(e) => onFilter(setAction)(e.target.value)}
          placeholder="Todos"
          options={eventOptions}
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
            <AuditLogTableHead />
          </thead>
          <tbody>
            <TableState
              colSpan={auditColSpan()}
              loading={logs.isPending}
              error={logs.error ? friendlyError(logs.error) : null}
              empty={logs.data?.data.length === 0}
              emptyTitle="Nenhum evento para os filtros selecionados."
              emptyDescription="Ajuste o período ou limpe os filtros para ver mais."
            />
            {logs.data && <AuditLogTable logs={logs.data.data} onSelect={setSelected} />}
          </tbody>
        </Table>
        {logs.data && <Pagination pagination={logs.data.pagination} onPageChange={setPage} />}
      </Card>

      {selected && (
        <AuditDetailModal
          log={selected}
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
  const [active, setActive] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const filters = { active, role, from, to, search };

  const sessions = useQuery({
    queryKey: ["audit-sessions", { page, ...filters }],
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
        <Input
          label="De"
          type="date"
          value={from}
          onChange={(e) => onFilter(setFrom)(e.target.value)}
          className="w-40"
        />
        <Input
          label="Até"
          type="date"
          value={to}
          onChange={(e) => onFilter(setTo)(e.target.value)}
          className="w-40"
        />
        <Select
          label="Perfil"
          value={role}
          onChange={(e) => onFilter(setRole)(e.target.value)}
          placeholder="Todos"
          options={[
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
            <SessionTableHead />
          </thead>
          <tbody>
            <TableState
              colSpan={sessionColSpan()}
              loading={sessions.isPending}
              error={sessions.error ? friendlyError(sessions.error) : null}
              empty={sessions.data?.data.length === 0}
              emptyTitle="Nenhum acesso para os filtros selecionados."
            />
            {sessions.data && (
              <SessionRows sessions={sessions.data.data} onSelect={onOpenSession} />
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
  const [userId, setUserId] = useState("");
  const [viewing, setViewing] = useState<RecognitionLog | null>(null);

  const logs = useQuery({
    queryKey: ["recognition-logs", { page, date, status, userId }],
    queryFn: () =>
      api.get<Paginated<RecognitionLog>>(
        `/audit/recognition-logs${qs({ page, limit: 25, date, status, user_id: userId })}`
      ),
  });

  // A lista de usuários é admin-only; para coordenador o filtro fica oculto
  const students = useQuery({
    queryKey: ["users", "audit-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ limit: 100 })}`),
    retry: false,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          label="Data"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
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
        {students.isSuccess && (
          <Select
            label="Pessoa"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
            placeholder="Todas"
            options={students.data.data.map((s) => ({ value: s.id, label: s.name }))}
            className="w-64"
          />
        )}
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Pessoa</Th>
              <Th>Status</Th>
              <Th>Confiança</Th>
              <Th>Vivacidade</Th>
              <Th>Tempo</Th>
              <Th className="w-32 text-right">Fraude</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
              loading={logs.isPending}
              error={logs.error ? friendlyError(logs.error) : null}
              empty={logs.data?.data.length === 0}
              emptyTitle="Nenhum evento para os filtros selecionados."
            />
            {logs.data?.data.map((log) => (
              <Tr key={log.id}>
                <Td className="font-mono-ds text-xs">{formatDateTime(log.createdAt)}</Td>
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
                <Td>
                  <div className="flex justify-end">
                    {log.fraudFrameExists && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewing(log)}
                        iconLeft={<Eye size={13} />}
                      >
                        Ver foto
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {logs.data && <Pagination pagination={logs.data.pagination} onPageChange={setPage} />}
      </Card>

      {viewing && <FraudFrameModal log={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>("activity");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Registro permanente do que foi feito na instituição: quem fez, quando, de qual endereço e o que mudou."
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
            title={t.hint}
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
