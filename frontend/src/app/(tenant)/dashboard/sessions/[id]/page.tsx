"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  DoorOpen,
  Eye,
  MapPin,
  ScanFace,
  Square,
  Timer,
  UserRound,
  Users,
} from "lucide-react";
import { api, fetchAuthenticatedBlobUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Rollcall, RollcallStudent, SessionFrame, TenantSettings } from "@/lib/types";
import {
  formatDateTime,
  formatLessons,
  formatPercent,
  formatTime,
} from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import { cn } from "@/lib/cn";
import {
  PageHeader,
  Card,
  CardHeader,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Button,
  Badge,
  Avatar,
  Modal,
  ConfirmDialog,
  Skeleton,
  Spinner,
  useToast,
} from "@/components/ui";
import { SessionStatusBadge, RecognitionStatusBadge } from "@/components/app/badges";

/** Seletor de aulas contadas por aluno — 0 marca ausência. */
function CountedSelect({
  student,
  worth,
  disabled,
  onChange,
  saving,
}: {
  student: RollcallStudent;
  worth: number;
  disabled: boolean;
  onChange: (counted: number) => void;
  saving: boolean;
}) {
  const options = Array.from({ length: worth + 1 }, (_, i) => i);
  return (
    <div className="flex items-center justify-end gap-2">
      {saving && <Spinner className="h-3.5 w-3.5" />}
      <select
        value={student.classesCounted}
        disabled={disabled || saving}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`Aulas contadas para ${student.name}`}
        className={cn(
          "h-9 rounded-lg border bg-white px-2.5 font-mono-ds text-sm text-flauzino-navy-900 shadow-fl-inset",
          "focus:border-flauzino-accent-500 focus:shadow-fl-focus focus:outline-none",
          "disabled:cursor-not-allowed disabled:bg-flauzino-slate-100 disabled:text-flauzino-slate-400",
          student.classesCounted === 0
            ? "border-flauzino-danger-600/40"
            : "border-flauzino-slate-300"
        )}
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? "0 · Ausente" : `${n} de ${worth}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Contagem regressiva até o fechamento automático.
 *
 * A chamada encerra sozinha ao fim do período (aulas × duração da aula), e o
 * professor precisa ver isso chegando — não descobrir depois que fechou.
 */
function AutoCloseCountdown({ scheduledEndsAt }: { scheduledEndsAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = new Date(scheduledEndsAt).getTime() - now;
  // O job varre a cada minuto: entre o prazo vencer e a sessão fechar existe
  // uma janela curta em que a tela ainda está aberta
  if (remainingMs <= 0) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-flauzino-warning-600">
        <Timer size={14} /> Encerrando…
      </span>
    );
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const label =
    hours > 0
      ? `${hours}h${String(minutes).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 font-mono-ds text-sm font-medium",
        remainingMs < 5 * 60_000
          ? "text-flauzino-warning-600"
          : "text-flauzino-slate-500"
      )}
      title={`Fecha automaticamente às ${formatTime(scheduledEndsAt)}`}
    >
      <Timer size={14} /> {label}
    </span>
  );
}

/**
 * Checkout individual: o professor libera a saída e o totem grava o horário
 * quando o aluno passa. As aulas cumpridas são recalculadas a partir da hora
 * real de início da aula.
 */
function CheckoutCell({
  student,
  disabled,
  onRelease,
  onRevoke,
  saving,
}: {
  student: RollcallStudent;
  disabled: boolean;
  onRelease: () => void;
  onRevoke: () => void;
  saving: boolean;
}) {
  if (student.checkedOutAt) {
    return (
      <span className="flex items-center justify-end gap-2">
        <Badge variant="warning">Saiu {formatTime(student.checkedOutAt)}</Badge>
      </span>
    );
  }

  if (student.checkoutReleased) {
    return (
      <span className="flex items-center justify-end gap-2">
        <Badge variant="accent" dot>
          Liberado
        </Badge>
        {!disabled && (
          <Button variant="ghost" size="sm" onClick={onRevoke} loading={saving}>
            Desfazer
          </Button>
        )}
      </span>
    );
  }

  // Só faz sentido liberar a saída de quem está presente
  if (student.status !== "present" || disabled) {
    return <span className="block text-right text-xs text-flauzino-slate-400">—</span>;
  }

  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={onRelease}
        loading={saving}
        iconLeft={<DoorOpen size={13} />}
      >
        Liberar saída
      </Button>
    </div>
  );
}

function FrameModal({ sessionId, frame, onClose }: { sessionId: string; frame: SessionFrame; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchAuthenticatedBlobUrl(`/class-sessions/${sessionId}/frames/${frame.id}`)
      .then((u) => {
        if (cancelled) return URL.revokeObjectURL(u);
        objectUrl = u;
        setUrl(u);
      })
      .catch((err) => !cancelled && setError(friendlyError(err)));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, frame.id]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Tentativa de fraude nesta aula"
      description={`Registrada em ${formatDateTime(frame.createdAt)} · retenção limitada conforme a LGPD.`}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex min-h-[240px] items-center justify-center rounded-lg bg-flauzino-slate-100">
        {error ? (
          <p className="px-6 text-center text-sm text-flauzino-danger-600">{error}</p>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Frame da tentativa de fraude" className="max-h-[420px] w-auto rounded-lg" />
        ) : (
          <Spinner />
        )}
      </div>
    </Modal>
  );
}

export default function RollcallPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [checkoutUserId, setCheckoutUserId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [viewingFrame, setViewingFrame] = useState<SessionFrame | null>(null);

  const settings = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: () => api.get<{ data: TenantSettings }>("/tenant-settings"),
  });

  const rollcall = useQuery({
    queryKey: ["rollcall", id],
    queryFn: () => api.get<{ data: Rollcall }>(`/class-sessions/${id}/rollcall`),
    // Chamada aberta é tela viva: novas presenças faciais aparecem sozinhas
    refetchInterval: (query) =>
      query.state.data?.data.session.status === "open" ? 5000 : false,
  });

  const frames = useQuery({
    queryKey: ["session-frames", id],
    queryFn: () => api.get<{ data: SessionFrame[] }>(`/class-sessions/${id}/frames`),
    refetchInterval: () =>
      rollcall.data?.data.session.status === "open" ? 15_000 : false,
  });

  const setCounted = useMutation({
    mutationFn: ({ userId, counted }: { userId: string; counted: number }) =>
      api.put(`/class-sessions/${id}/attendance/${userId}`, { classesCounted: counted }),
    onMutate: ({ userId }) => setSavingUserId(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rollcall", id] }),
    onError: (error) => toast.error(friendlyError(error)),
    onSettled: () => setSavingUserId(null),
  });

  const releaseCheckout = useMutation({
    mutationFn: (userId: string) => api.post(`/class-sessions/${id}/checkout/${userId}`),
    onMutate: (userId) => setCheckoutUserId(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rollcall", id] });
      toast.success("Saída liberada. O horário será gravado quando o aluno passar no totem.");
    },
    onError: (error) => toast.error(friendlyError(error)),
    onSettled: () => setCheckoutUserId(null),
  });

  const revokeCheckout = useMutation({
    mutationFn: (userId: string) => api.delete(`/class-sessions/${id}/checkout/${userId}`),
    onMutate: (userId) => setCheckoutUserId(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rollcall", id] });
      toast.success("Liberação desfeita.");
    },
    onError: (error) => toast.error(friendlyError(error)),
    onSettled: () => setCheckoutUserId(null),
  });

  const close = useMutation({
    mutationFn: () => api.post(`/class-sessions/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rollcall", id] });
      queryClient.invalidateQueries({ queryKey: ["class-sessions"] });
      toast.success("Chamada encerrada. Frequência consolidada.");
      setClosing(false);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/class-sessions/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rollcall", id] });
      queryClient.invalidateQueries({ queryKey: ["class-sessions"] });
      toast.success("Chamada cancelada — nada foi contabilizado.");
      setCancelling(false);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  if (rollcall.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (rollcall.isError || !rollcall.data) {
    return (
      <div>
        <PageHeader title="Chamada não encontrada" description={friendlyError(rollcall.error)} />
        <Link href="/dashboard/sessions">
          <Button variant="secondary" iconLeft={<ArrowLeft size={15} />}>Voltar para chamadas</Button>
        </Link>
      </div>
    );
  }

  const { session, students, stats } = rollcall.data.data;
  const isOpen = session.status === "open";
  const canWrite =
    user?.role === "admin" || user?.role === "super_admin" || session.teacherId === user?.id;
  const worth = session.classesWorth;
  const checkoutEnabled = settings.data?.data.individualCheckoutEnabled ?? false;
  const showCheckout = checkoutEnabled && (isOpen || students.some((s) => s.checkedOutAt));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dashboard/sessions"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-flauzino-slate-500 hover:text-flauzino-navy-900"
        >
          <ArrowLeft size={15} /> Chamadas
        </Link>
      </div>

      <PageHeader
        title={session.className ?? "Chamada"}
        description={[
          session.subjectName,
          session.teacherName ?? "—",
          `aula iniciada em ${formatDateTime(session.startedAt)}`,
          `vale ${formatLessons(worth)}`,
          session.status === "closed" && session.autoClosed
            ? "encerrada automaticamente no fim do período"
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-3">
            {session.locationName && (
              <span className="flex items-center gap-1.5 text-sm text-flauzino-slate-500">
                <MapPin size={14} /> {session.locationName}
              </span>
            )}
            {isOpen && session.scheduledEndsAt && (
              <AutoCloseCountdown scheduledEndsAt={session.scheduledEndsAt} />
            )}
            <SessionStatusBadge status={session.status} />
            {isOpen && canWrite && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setCancelling(true)}
                  iconLeft={<Ban size={15} />}
                  className="text-flauzino-danger-600 hover:bg-flauzino-danger-100 hover:text-flauzino-danger-600"
                >
                  Cancelar
                </Button>
                <Button onClick={() => setClosing(true)} iconLeft={<Square size={15} />}>
                  Encerrar chamada
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Resumo vivo */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">Presentes</p>
          <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-success-600">{stats.present}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
            {isOpen ? "Aguardando" : "Ausentes"}
          </p>
          <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
            {isOpen ? stats.pending : stats.absent}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
            <ScanFace size={12} /> Pela facial
          </p>
          <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-accent-700">{stats.facial}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
            <UserRound size={12} /> Ajustes manuais
          </p>
          <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-navy-900">{stats.manual}</p>
        </Card>
      </div>

      {/* Lista de chamada */}
      <Card>
        <CardHeader
          title="Lista de chamada"
          description={
            isOpen
              ? showCheckout
                ? "Atualiza sozinha conforme os alunos passam no totem. Ao liberar uma saída, o aluno passa no totem de novo e as aulas cumpridas são recalculadas pelo tempo em sala."
                : "Atualiza sozinha conforme os alunos passam no totem. Ajuste as aulas contadas quando necessário — 0 marca ausência."
              : session.status === "cancelled"
                ? "Chamada cancelada — nenhum registro foi contabilizado."
                : "Chamada encerrada — a frequência já foi consolidada."
          }
          icon={<Users size={18} strokeWidth={1.75} />}
        />
        <Table>
          <thead>
            <tr>
              <Th>Aluno</Th>
              <Th>Matrícula</Th>
              <Th>Entrada</Th>
              {showCheckout && <Th className="text-right">Saída</Th>}
              <Th className="text-right">Aulas contadas</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={showCheckout ? 5 : 4}
              empty={students.length === 0}
              emptyTitle="Nenhum aluno matriculado nesta turma."
            />
            {students.map((s) => (
              <Tr key={s.userId} className={cn(s.status === "absent" && "opacity-70")}>
                <Td>
                  <span className="flex items-center gap-3">
                    <Avatar name={s.name} size="sm" />
                    <span className="font-medium text-flauzino-navy-900">{s.name}</span>
                  </span>
                </Td>
                <Td className="font-mono-ds text-xs">{s.enrollmentCode ?? "—"}</Td>
                <Td>
                  {s.source === "facial" || s.source === "pre" ? (
                    <span className="flex items-center gap-2">
                      <Badge variant="accent" dot>
                        {s.source === "pre" ? "Pré-presença" : "Facial"}
                      </Badge>
                      <span className="font-mono-ds text-xs text-flauzino-slate-500">
                        {formatDateTime(s.recognizedAt)}
                        {s.confidence != null && ` · ${formatPercent(s.confidence * 100, 0)}`}
                      </span>
                    </span>
                  ) : s.source === "manual" ? (
                    <Badge variant="neutral">Ajuste manual</Badge>
                  ) : s.status === "pending" ? (
                    <span className="text-xs text-flauzino-slate-400">Aguardando totem</span>
                  ) : (
                    <Badge variant="danger">Ausente</Badge>
                  )}
                </Td>
                {showCheckout && (
                  <Td>
                    <CheckoutCell
                      student={s}
                      disabled={!isOpen || !canWrite}
                      saving={checkoutUserId === s.userId}
                      onRelease={() => releaseCheckout.mutate(s.userId)}
                      onRevoke={() => revokeCheckout.mutate(s.userId)}
                    />
                  </Td>
                )}
                <Td>
                  <CountedSelect
                    student={s}
                    worth={worth}
                    disabled={!isOpen || !canWrite}
                    saving={savingUserId === s.userId}
                    onChange={(counted) => setCounted.mutate({ userId: s.userId, counted })}
                  />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Tentativas de fraude da própria aula */}
      <Card className="mt-5">
        <CardHeader
          title="Tentativas de fraude nesta aula"
          description="Frames bloqueados pela verificação de vivacidade durante a janela desta chamada."
          icon={<Eye size={18} strokeWidth={1.75} />}
        />
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Motivo</Th>
              <Th>Vivacidade</Th>
              <Th className="w-32 text-right">Frame</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={4}
              loading={frames.isPending}
              error={frames.error ? friendlyError(frames.error) : null}
              empty={frames.data?.data.length === 0}
              emptyTitle="Nenhuma tentativa de fraude registrada nesta aula."
            />
            {frames.data?.data.map((f) => (
              <Tr key={f.id}>
                <Td className="font-mono-ds text-xs">{formatDateTime(f.createdAt)}</Td>
                <Td><RecognitionStatusBadge status={f.status} /></Td>
                <Td className="font-mono-ds text-xs">
                  {f.livenessScore != null ? f.livenessScore.toFixed(2) : "—"}
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setViewingFrame(f)}
                      iconLeft={<Eye size={13} />}
                    >
                      Ver frame
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={() => close.mutate()}
        title="Encerrar chamada"
        description="Quem não passou no totem será marcado como ausente e a frequência da turma será atualizada com os ajustes feitos."
        confirmLabel="Encerrar chamada"
        loading={close.isPending}
      />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={() => cancel.mutate()}
        title="Cancelar chamada"
        description="Use quando a chamada foi aberta por engano. Nada é contabilizado — nem presenças, nem faltas."
        confirmLabel="Cancelar chamada"
        danger
        loading={cancel.isPending}
      />

      {viewingFrame && (
        <FrameModal sessionId={id} frame={viewingFrame} onClose={() => setViewingFrame(null)} />
      )}
    </div>
  );
}
