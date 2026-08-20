"use client";

/**
 * Peças compartilhadas da auditoria.
 *
 * A tela do tenant (/dashboard/audit) e a visão global do super admin
 * (/admin/logs) mostram os mesmos eventos com o mesmo vocabulário — só muda o
 * escopo e a coluna de instituição. Tudo que é comum mora aqui.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Monitor,
  Server,
  User as UserIcon,
  UserX,
  ArrowRight,
  LogIn,
  Users,
  GraduationCap,
  ShieldCheck,
  Fingerprint,
  MonitorSmartphone,
  Library,
  ClipboardCheck,
  Settings,
  Building2,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import { friendlyError } from "@/lib/apiError";
import { formatDateTime, formatDuration } from "@/lib/format";
import type {
  AuditLog,
  AuditSeverity,
  AuthSession,
  AuthSessionDetail,
} from "@/lib/types";
import { Badge, Button, Modal, Spinner, Table, Th, Td, Tr, type MultiSelectOption } from "@/components/ui";

// ── Ícones por área ──────────────────────────────────────────────────────────

/** Mesma chave de backend/src/lib/auditEvents.ts (AUDIT_CATEGORIES). */
export const categoryIcons: Record<string, LucideIcon> = {
  auth: LogIn,
  user: Users,
  student: GraduationCap,
  consent: ShieldCheck,
  data: Fingerprint,
  device: MonitorSmartphone,
  academic: Library,
  attendance: ClipboardCheck,
  settings: Settings,
  tenant: Building2,
};

// ── Vocabulário ──────────────────────────────────────────────────────────────

const roleLabels: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  manager: "Coordenador",
  teacher: "Professor",
  student: "Aluno",
  device: "Totem",
};

export function roleLabel(role?: string): string {
  if (!role) return "—";
  return roleLabels[role] ?? role;
}

const endReasonLabels: Record<string, string> = {
  logout: "Saiu do sistema",
  expired: "Sessão expirou",
  revoked: "Acesso revogado",
};

/**
 * Severidade em linguagem de gestor, não de engenheiro: "crítico" marca o que
 * um auditor externo procuraria primeiro (dados pessoais, consentimento,
 * chaves de acesso), não o que "deu erro".
 */
export function AuditSeverityBadge({ severity }: { severity: AuditSeverity }) {
  const map: Record<AuditSeverity, { label: string; variant: "neutral" | "warning" | "danger" }> = {
    info: { label: "Rotina", variant: "neutral" },
    warning: { label: "Atenção", variant: "warning" },
    critical: { label: "Crítico", variant: "danger" },
  };
  const cfg = map[severity] ?? map.info;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

const actorIcons = {
  user: UserIcon,
  device: Monitor,
  system: Server,
  anonymous: UserX,
} as const;

/**
 * Quem fez. O ícone distingue pessoa de totem e de rotina automática — sem
 * ele, "Fechamento automático" pareceria o nome de um funcionário.
 */
export function ActorCell({ log }: { log: AuditLog }) {
  const Icon = actorIcons[log.actorType] ?? UserIcon;

  const subtitle =
    log.actorType === "device"
      ? "Totem"
      : log.actorType === "system"
        ? "Rotina automática"
        : log.actorType === "anonymous"
          ? "Não autenticado"
          : roleLabel(log.actorRole);

  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="mt-0.5 shrink-0 text-flauzino-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate font-medium text-flauzino-navy-900">
          {log.actorName ?? "—"}
        </div>
        <div className="truncate text-xs text-flauzino-slate-500">{subtitle}</div>
      </div>
    </div>
  );
}

// ── Diff antes/depois ────────────────────────────────────────────────────────

/** Nomes de campo em português — o console nunca mostra o nome da coluna. */
const fieldLabels: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  role: "Perfil",
  status: "Situação",
  document: "CPF",
  enrollmentCode: "Matrícula",
  facialStatus: "Biometria",
  label: "Identificação",
  locationId: "Local",
  isActive: "Ativo",
  allowEnrollment: "Permite cadastro biométrico",
  deviceFingerprint: "Impressão do dispositivo",
  recognitionThreshold: "Limiar de reconhecimento",
  livenessThreshold: "Limiar de vivacidade",
  livenessEnabled: "Vivacidade ativa",
  livenessThresholdEnrollment: "Limiar de vivacidade no cadastro",
  allowManualOverride: "Permite ajuste manual de presença",
  preAttendanceEnabled: "Pré-presença ativa",
  preAttendanceWindowMin: "Janela de pré-presença (min)",
  individualCheckoutEnabled: "Checkout individual ativo",
  saveFraudFrames: "Guardar fotos de fraude",
  fraudRetentionHours: "Retenção das fotos de fraude (h)",
  enrollmentTokenExpiryHours: "Validade da sessão de cadastro (h)",
  requireConsentBeforeFacial: "Exigir consentimento antes da biometria",
  enrollmentMultiFrameCount: "Frames no cadastro",
  totemPanelPassword: "Senha do painel do totem",
  totemClockTimezone: "Fuso do relógio do totem",
  studentIdentification: "Identificação registrada do aluno",
  totemIdentification: "Identificação pedida no totem",
  validateCpf: "Validar dígitos do CPF",
  address: "Endereço",
  room: "Sala",
  courseId: "Curso",
  academicPeriodId: "Período letivo",
  lessonsPerDay: "Aulas por dia",
  lessonDuration: "Duração da aula",
  lessonDurationUnit: "Unidade da duração",
  defaultLessonsPerSession: "Aulas por chamada (padrão)",
  defaultTotalLessonsPlanned: "Total de aulas previstas",
  code: "Código",
  startsAt: "Início",
  endsAt: "Término",
  startedAt: "Início da aula",
  scheduledEndsAt: "Término previsto",
  endedAt: "Encerrada em",
  classesWorth: "Vale quantas aulas",
  classesCounted: "Aulas contadas",
  subjectCount: "Nº de disciplinas",
  institutionType: "Tipo de instituição",
  planId: "Plano",
  timezone: "Fuso horário",
  consent: "Consentimento",
  biometricsStored: "Biometria armazenada",
  enrolled: "Matriculado",
  checkoutReleased: "Saída liberada",
  recognizedByFace: "Reconhecido pelo rosto",
  of: "De um total de",
};

export function fieldLabel(field: string): string {
  return fieldLabels[field] ?? field;
}

/** Valores crus do JSON em algo legível numa célula. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // Datas ISO viram data/hora local; o resto passa direto
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:/.test(value)) return formatDateTime(value);
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Estado anterior → novo, campo a campo. Só aparecem os campos que mudaram —
 * é o backend que decide isso, gravando apenas o diff.
 */
export function StateDiff({ log }: { log: AuditLog }) {
  // changedFields é a fonte de verdade; a união das chaves é só o fallback
  // para eventos que gravaram estado sem declarar o que mudou (criação/exclusão)
  const fields = log.changedFields.length
    ? log.changedFields
    : Array.from(
        new Set(
          Object.keys(log.beforeState ?? {}).concat(Object.keys(log.afterState ?? {}))
        )
      );

  if (fields.length === 0) return null;

  const hasBefore = log.beforeState != null;
  const hasAfter = log.afterState != null;

  return (
    <div className="overflow-hidden rounded-lg border border-flauzino-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-flauzino-slate-50 text-left">
          <tr>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-flauzino-slate-500">
              Campo
            </th>
            {hasBefore && (
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-flauzino-slate-500">
                Antes
              </th>
            )}
            {hasAfter && (
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-flauzino-slate-500">
                {hasBefore ? "Depois" : "Valor"}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-flauzino-slate-100">
          {fields.map((field) => (
            <tr key={field}>
              <td className="px-3 py-2 font-medium text-flauzino-navy-900">
                {fieldLabel(field)}
              </td>
              {hasBefore && (
                <td className="px-3 py-2 text-flauzino-slate-500 line-through decoration-flauzino-slate-300">
                  {formatValue(log.beforeState?.[field])}
                </td>
              )}
              {hasAfter && (
                <td className="px-3 py-2 font-medium text-flauzino-navy-900">
                  {formatValue(log.afterState?.[field])}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Detalhe do evento ────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5">
      <dt className="text-sm text-flauzino-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-flauzino-navy-900">{children}</dd>
    </div>
  );
}

/**
 * Ficha completa de um evento: quem, quando, de onde, sobre o quê e o que mudou.
 *
 * @param onOpenSession Abre a sessão de login do ator. Só faz sentido quando o
 *   consumidor sabe navegar até lá — a visão global do super admin passa,
 *   consumidores mais simples omitem.
 */
export function AuditDetailModal({
  log,
  onClose,
  onOpenSession,
  showTenant = false,
}: {
  log: AuditLog;
  onClose: () => void;
  onOpenSession?: (sessionId: string) => void;
  showTenant?: boolean;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={log.actionLabel}
      description={`${log.categoryLabel} · ${formatDateTime(log.createdAt)}`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {log.sessionId && onOpenSession ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenSession(log.sessionId!)}
            >
              Ver a sessão inteira
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <AuditSeverityBadge severity={log.severity} />
          <Badge variant="neutral">{log.categoryLabel}</Badge>
          {log.status === "failure" && <Badge variant="danger">Não concluída</Badge>}
        </div>

        {log.details && (
          <p className="text-sm leading-relaxed text-flauzino-slate-700">{log.details}</p>
        )}

        <dl className="divide-y divide-flauzino-slate-100">
          {showTenant && (
            <DetailRow label="Instituição">{log.tenantName ?? "Sem instituição"}</DetailRow>
          )}
          <DetailRow label="Quem fez">
            {log.actorName ?? "—"}
            {log.actorEmail && (
              <span className="text-flauzino-slate-500"> · {log.actorEmail}</span>
            )}
            {log.actorRole && (
              <span className="text-flauzino-slate-500"> · {roleLabel(log.actorRole)}</span>
            )}
          </DetailRow>
          {log.targetLabel && <DetailRow label="Sobre">{log.targetLabel}</DetailRow>}
          <DetailRow label="Quando">{formatDateTime(log.createdAt)}</DetailRow>
          <DetailRow label="Endereço IP">
            <span className="font-mono-ds text-xs">{log.ipAddress ?? "—"}</span>
          </DetailRow>
          {log.deviceLabel && <DetailRow label="Totem">{log.deviceLabel}</DetailRow>}
          {log.userAgent && (
            <DetailRow label="Dispositivo">
              <span className="text-xs text-flauzino-slate-600">{log.userAgent}</span>
            </DetailRow>
          )}
          {(log.requestMethod || log.requestPath) && (
            <DetailRow label="Origem">
              <span className="font-mono-ds text-xs">
                {log.requestMethod} {log.requestPath}
              </span>
            </DetailRow>
          )}
        </dl>

        {(log.beforeState || log.afterState) && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-flauzino-navy-900">
              O que mudou
            </h3>
            <StateDiff log={log} />
          </div>
        )}

        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <details className="rounded-lg border border-flauzino-slate-200 bg-flauzino-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-flauzino-navy-900">
              Informações técnicas
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono-ds text-xs text-flauzino-slate-600">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Modal>
  );
}

// ── Sessão de acesso ─────────────────────────────────────────────────────────

export function SessionStateBadge({ session }: { session: AuthSession }) {
  if (session.isActive) return <Badge variant="success" dot>Em andamento</Badge>;
  return <Badge variant="neutral">{endReasonLabels[session.endReason ?? ""] ?? "Encerrada"}</Badge>;
}

/**
 * A sessão e a linha do tempo do que a pessoa fez nela — a resposta direta a
 * "esse professor entrou às 14h02 e daí fez isso, isso e isso".
 *
 * @param basePath "/audit" no console do tenant, "/admin/audit" no super admin.
 */
export function SessionDetailModal({
  sessionId,
  basePath,
  onClose,
}: {
  sessionId: string;
  basePath: string;
  onClose: () => void;
}) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const detail = useQuery({
    queryKey: ["audit-session", basePath, sessionId],
    queryFn: () => api.get<{ data: AuthSessionDetail }>(`${basePath}/sessions/${sessionId}`),
  });

  const session = detail.data?.data.session;
  const timeline = detail.data?.data.timeline ?? [];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={session ? `Sessão de ${session.userName}` : "Sessão de acesso"}
        description={
          session
            ? `Entrou em ${formatDateTime(session.loginAt)} · ${formatDuration(session.durationMinutes)} de sessão`
            : undefined
        }
        footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
      >
        {detail.isPending && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {detail.error && (
          <p className="py-6 text-center text-sm text-flauzino-danger-600">
            {friendlyError(detail.error)}
          </p>
        )}

        {session && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SessionStateBadge session={session} />
              <Badge variant="neutral">{roleLabel(session.userRole)}</Badge>
            </div>

            <dl className="divide-y divide-flauzino-slate-100">
              {session.userEmail && <DetailRow label="E-mail">{session.userEmail}</DetailRow>}
              <DetailRow label="Login">{formatDateTime(session.loginAt)}</DetailRow>
              <DetailRow label="Última atividade">
                {formatDateTime(session.lastSeenAt)}
              </DetailRow>
              {session.endedAt && (
                <DetailRow label="Fim da sessão">{formatDateTime(session.endedAt)}</DetailRow>
              )}
              <DetailRow label="Endereço IP">
                <span className="font-mono-ds text-xs">{session.ipAddress ?? "—"}</span>
              </DetailRow>
              {session.userAgent && (
                <DetailRow label="Dispositivo">
                  <span className="text-xs text-flauzino-slate-600">{session.userAgent}</span>
                </DetailRow>
              )}
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-flauzino-navy-900">
                O que fez nesta sessão ({timeline.length})
              </h3>

              {timeline.length === 0 ? (
                <p className="rounded-lg border border-dashed border-flauzino-slate-200 px-4 py-6 text-center text-sm text-flauzino-slate-500">
                  Nenhuma ação registrada além do login.
                </p>
              ) : (
                // Linha do tempo vertical: a ordem cronológica é o que conta a
                // história, então nada de tabela ordenável aqui
                <ol className="relative space-y-3 border-l border-flauzino-slate-200 pl-5">
                  {timeline.map((log) => (
                    <li key={log.id} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-flauzino-accent-500 ring-4 ring-white"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="w-full rounded-lg px-2 py-1 text-left transition-colors hover:bg-flauzino-slate-50"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono-ds text-xs text-flauzino-slate-500">
                            {new Date(log.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="text-sm font-medium text-flauzino-navy-900">
                            {log.actionLabel}
                          </span>
                          {log.targetLabel && (
                            <span className="inline-flex items-center gap-1 text-sm text-flauzino-slate-500">
                              <ArrowRight size={11} aria-hidden="true" />
                              {log.targetLabel}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>

      {selectedLog && (
        <AuditDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </>
  );
}

// ── Tabela de eventos ────────────────────────────────────────────────────────

/**
 * Grade de eventos reutilizada pelas duas telas. `tenantColumn` acrescenta a
 * instituição, que só existe na visão global.
 */
export function AuditLogTable({
  logs,
  onSelect,
  tenantColumn = false,
}: {
  logs: AuditLog[];
  onSelect: (log: AuditLog) => void;
  tenantColumn?: boolean;
}) {
  return (
    <>
      {logs.map((log) => (
        <Tr key={log.id} onClick={() => onSelect(log)} className="cursor-pointer">
          <Td className="whitespace-nowrap font-mono-ds text-xs">
            {formatDateTime(log.createdAt)}
          </Td>
          {tenantColumn && (
            <Td className="text-sm">{log.tenantName ?? "—"}</Td>
          )}
          <Td><ActorCell log={log} /></Td>
          <Td>
            <div className="font-medium text-flauzino-navy-900">{log.actionLabel}</div>
            {log.targetLabel && (
              <div className="truncate text-xs text-flauzino-slate-500">{log.targetLabel}</div>
            )}
          </Td>
          <Td className="text-sm text-flauzino-slate-600">{log.categoryLabel}</Td>
          <Td><AuditSeverityBadge severity={log.severity} /></Td>
          <Td className="whitespace-nowrap font-mono-ds text-xs text-flauzino-slate-500">
            {log.ipAddress ?? "—"}
          </Td>
        </Tr>
      ))}
    </>
  );
}

/** Cabeçalho correspondente ao AuditLogTable. */
export function AuditLogTableHead({ tenantColumn = false }: { tenantColumn?: boolean }) {
  return (
    <tr>
      <Th>Quando</Th>
      {tenantColumn && <Th>Instituição</Th>}
      <Th>Quem</Th>
      <Th>O que aconteceu</Th>
      <Th>Área</Th>
      <Th>Relevância</Th>
      <Th>IP</Th>
    </tr>
  );
}

/** Quantas colunas o AuditLogTable ocupa — usado pelo TableState. */
export function auditColSpan(tenantColumn = false): number {
  return tenantColumn ? 7 : 6;
}

// ── Tabela de sessões ────────────────────────────────────────────────────────

export function SessionTableHead({ tenantColumn = false }: { tenantColumn?: boolean }) {
  return (
    <tr>
      <Th>Login</Th>
      {tenantColumn && <Th>Instituição</Th>}
      <Th>Usuário</Th>
      <Th>Perfil</Th>
      <Th>Duração</Th>
      <Th>Ações</Th>
      <Th>IP</Th>
      <Th>Situação</Th>
    </tr>
  );
}

export function SessionRows({
  sessions,
  onSelect,
  tenantColumn = false,
}: {
  sessions: AuthSession[];
  onSelect: (sessionId: string) => void;
  tenantColumn?: boolean;
}) {
  return (
    <>
      {sessions.map((session) => (
        <Tr
          key={session.id}
          onClick={() => onSelect(session.id)}
          className="cursor-pointer"
        >
          <Td className="whitespace-nowrap font-mono-ds text-xs">
            {formatDateTime(session.loginAt)}
          </Td>
          {tenantColumn && <Td className="text-sm">{session.tenantName ?? "—"}</Td>}
          <Td>
            <div className="font-medium text-flauzino-navy-900">{session.userName}</div>
            {session.userEmail && (
              <div className="truncate text-xs text-flauzino-slate-500">
                {session.userEmail}
              </div>
            )}
          </Td>
          <Td className="text-sm text-flauzino-slate-600">{roleLabel(session.userRole)}</Td>
          <Td className="whitespace-nowrap text-sm">
            {formatDuration(session.durationMinutes)}
          </Td>
          <Td className="text-sm">{session.eventCount}</Td>
          <Td className="whitespace-nowrap font-mono-ds text-xs text-flauzino-slate-500">
            {session.ipAddress ?? "—"}
          </Td>
          <Td><SessionStateBadge session={session} /></Td>
        </Tr>
      ))}
    </>
  );
}

export function sessionColSpan(tenantColumn = false): number {
  return tenantColumn ? 8 : 7;
}

// ── Filtro de eventos ────────────────────────────────────────────────────────

/**
 * Opções do seletor de evento, agrupadas por área. Sem o agrupamento a lista
 * de ~60 eventos vira uma parede de texto.
 */
export function useEventOptions(basePath: string) {
  const catalog = useQuery({
    queryKey: ["audit-events", basePath],
    queryFn: () =>
      api.get<{ data: import("@/lib/types").AuditEventCatalog }>(`${basePath}/events`),
    staleTime: Infinity, // catálogo é estático no build do backend
  });

  const eventOptions = useMemo(() => {
    const events = catalog.data?.data.events ?? [];
    return events.map((event) => ({
      value: event.action,
      label: `${event.categoryLabel} · ${event.label}`,
    }));
  }, [catalog.data]);

  const categoryOptions = useMemo(
    () =>
      (catalog.data?.data.categories ?? []).map((category) => ({
        value: category.value,
        label: category.label,
      })),
    [catalog.data]
  );

  // Mesmos dados, moldados pro MultiSelect: evento agrupado por área (com
  // ícone), área com ícone e sem grupo (ela já É o agrupamento).
  const eventMultiOptions = useMemo<MultiSelectOption[]>(() => {
    const events = catalog.data?.data.events ?? [];
    return events.map((event) => ({
      value: event.action,
      label: event.label,
      group: event.categoryLabel,
      icon: categoryIcons[event.category],
    }));
  }, [catalog.data]);

  const categoryMultiOptions = useMemo<MultiSelectOption[]>(
    () =>
      (catalog.data?.data.categories ?? []).map((category) => ({
        value: category.value,
        label: category.label,
        icon: categoryIcons[category.value],
      })),
    [catalog.data]
  );

  return { eventOptions, categoryOptions, eventMultiOptions, categoryMultiOptions };
}

/** Atores para o filtro "quem fez". */
export function useActorOptions(basePath: string, tenantId?: string) {
  const actors = useQuery({
    queryKey: ["audit-actors", basePath, tenantId],
    queryFn: () =>
      api.get<{ data: import("@/lib/types").AuditActor[] }>(
        `${basePath}/actors${qs({ tenant_id: tenantId })}`
      ),
  });

  return useMemo(
    () =>
      (actors.data?.data ?? []).map((actor) => ({
        value: actor.id,
        label: `${actor.name}${actor.role ? ` (${roleLabel(actor.role)})` : ""}`,
      })),
    [actors.data]
  );
}
