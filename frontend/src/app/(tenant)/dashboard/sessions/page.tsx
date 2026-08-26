"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Square,
  Ban,
  ClipboardList,
  Clock,
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  MapPin,
  ClipboardCheck,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { ClassItem, ClassSession, Location, Paginated, User } from "@/lib/types";
import {
  formatDateTime,
  formatDuration,
  formatLessons,
  formatTime,
  shortId,
  toDateTimeLocalValue,
} from "@/lib/format";
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
  Button,
  Select,
  Input,
  Modal,
  ConfirmDialog,
  useToast,
} from "@/components/ui";
import { SessionStatusBadge } from "@/components/app/badges";

// O professor escolhe apenas a sala e a hora real em que a aula começou —
// quanto a chamada vale vem da disciplina, definida pela secretaria.
const SessionSchema = z.object({
  classId: z.string().min(1, "Selecione a turma."),
  classSubjectId: z.string().min(1, "Selecione a disciplina."),
  teacherId: z.string().optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
  startedAt: z.string().min(1, "Informe a hora de início."),
});

type SessionForm = z.infer<typeof SessionSchema>;

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [closing, setClosing] = useState<ClassSession | null>(null);
  const [cancelling, setCancelling] = useState<ClassSession | null>(null);

  const list = useQuery({
    queryKey: ["class-sessions", { page, statusFilter, classFilter }],
    queryFn: () =>
      api.get<Paginated<ClassSession>>(
        `/class-sessions${qs({ page, limit: 20, status: statusFilter, classId: classFilter })}`
      ),
  });

  // Professor recebe automaticamente apenas as próprias turmas
  const classes = useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => api.get<Paginated<ClassItem>>(`/classes${qs({ limit: 100 })}`),
  });

  const locations = useQuery({
    queryKey: ["locations", "options"],
    queryFn: () => api.get<Paginated<Location>>(`/locations${qs({ isActive: true, limit: 100 })}`),
  });

  const teachers = useQuery({
    queryKey: ["users", "teachers"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "teacher", limit: 100 })}`),
    enabled: !isTeacher,
  });

  const classOptions = classes.data?.data.map((c) => ({ value: c.id, label: c.name })) ?? [];
  const locationOptions = locations.data?.data.map((l) => ({ value: l.id, label: l.name })) ?? [];
  const teacherOptions = teachers.data?.data.map((t) => ({ value: t.id, label: t.name })) ?? [];
  const classById = new Map(classes.data?.data.map((c) => [c.id, c]) ?? []);

  const form = useForm<SessionForm>({ resolver: zodResolver(SessionSchema) });
  const selectedClassId = form.watch("classId");
  const selectedClassSubjectId = form.watch("classSubjectId");
  const startedAtValue = form.watch("startedAt");
  const selectedClass = classById.get(selectedClassId);
  // Professor só abre as disciplinas em que está alocado naquela turma —
  // inclusive as que divide com outro professor
  const subjectOptions = (selectedClass?.subjects ?? [])
    .filter(
      (cs) =>
        !isTeacher ||
        (cs.teachers?.length
          ? cs.teachers.some((t) => t.id === user?.id)
          : cs.teacherId === user?.id)
    )
    .map((cs) => ({ value: cs.id, label: cs.subjectName }));
  const selectedSubject = selectedClass?.subjects.find((cs) => cs.id === selectedClassSubjectId);

  const create = useMutation({
    mutationFn: (v: SessionForm) =>
      api.post("/class-sessions", {
        classSubjectId: v.classSubjectId,
        teacherId: isTeacher ? undefined : v.teacherId || undefined,
        locationId: v.locationId || undefined,
        // datetime-local devolve hora local sem fuso; o backend espera ISO
        // com offset para não interpretar como UTC
        startedAt: new Date(v.startedAt).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-sessions"] });
      toast.success("Chamada aberta. Os alunos já podem passar no totem.");
      setCreating(false);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const close = useMutation({
    mutationFn: (s: ClassSession) => api.post(`/class-sessions/${s.id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-sessions"] });
      toast.success("Chamada encerrada. Ausências consolidadas.");
      setClosing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const cancel = useMutation({
    mutationFn: (s: ClassSession) => api.post(`/class-sessions/${s.id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-sessions"] });
      toast.success("Chamada cancelada — nada foi contabilizado.");
      setCancelling(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({
      classId: "",
      classSubjectId: "",
      teacherId: "",
      locationId: "",
      // Agora por padrão; quem abriu com atraso corrige para a hora real
      startedAt: toDateTimeLocalValue(new Date()),
    });
    setStep(1);
    setCreating(true);
  };

  // Pré-seleciona a sala padrão da turma (o professor pode trocar)
  const onClassChange = (classId: string) => {
    const cls = classById.get(classId);
    if (cls?.locationId) form.setValue("locationId", cls.locationId);
    // A turma tem várias disciplinas agora — a escolha anterior não vale mais
    form.setValue("classSubjectId", "");
    form.setValue("teacherId", "");
  };

  const goToStep2 = async () => {
    const valid = await form.trigger(["classId", "classSubjectId"]);
    if (!valid) return;
    // teacherId é opcional no schema (some sozinho pela disciplina), mas o
    // admin precisa ver quem vai responder antes de seguir
    if (!isTeacher && !form.getValues("teacherId")) {
      form.setError("teacherId", { type: "manual", message: "Selecione o professor." });
      return;
    }
    setStep(2);
  };

  const goToStep3 = async () => {
    const valid = await form.trigger(["locationId", "startedAt"]);
    if (!valid) return;
    setStep(3);
  };

  const submitSession = form.handleSubmit((v) => create.mutate(v));

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 1) return void goToStep2();
    if (step === 2) return void goToStep3();
    submitSession();
  };

  return (
    <div>
      <PageHeader
        title="Chamadas"
        description={
          isTeacher
            ? "Abra a chamada na sala em que a aula vai acontecer e encerre ao final."
            : "Sessões de chamada da instituição — professores abrem as próprias chamadas."
        }
        actions={
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            Abrir chamada
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todos os status"
          options={[
            { value: "open", label: "Aberta" },
            { value: "closed", label: "Encerrada" },
            { value: "cancelled", label: "Cancelada" },
          ]}
          className="w-44"
        />
        <Select
          value={classFilter}
          onChange={(e) => {
            setClassFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todas as turmas"
          options={classOptions}
          className="w-56"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Turma</Th>
              <Th>Professor</Th>
              <Th>Sala</Th>
              <Th>Início</Th>
              <Th>Fecha às</Th>
              <Th>Vale por</Th>
              <Th>Status</Th>
              <Th className="w-52 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={8}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle="Nenhuma chamada registrada."
              emptyDescription="Abra a primeira chamada para começar a registrar presenças."
            />
            {list.data?.data.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <Link
                    href={`/dashboard/sessions/${s.id}`}
                    className="font-medium text-flauzino-navy-900 hover:text-flauzino-accent-600"
                  >
                    {s.className ?? shortId(s.classId)}
                  </Link>
                  {s.subjectName && (
                    <span className="block text-xs text-flauzino-slate-500">{s.subjectName}</span>
                  )}
                </Td>
                <Td>{s.teacherName ?? shortId(s.teacherId)}</Td>
                <Td>{s.locationName ?? "—"}</Td>
                <Td className="font-mono-ds text-xs">{formatDateTime(s.startedAt)}</Td>
                <Td className="font-mono-ds text-xs">
                  {s.status === "open" ? formatTime(s.scheduledEndsAt) : "—"}
                </Td>
                <Td>{formatLessons(s.classesWorth)}</Td>
                <Td>
                  <SessionStatusBadge status={s.status} />
                  {s.autoClosed && (
                    <span className="ml-1.5 text-xs text-flauzino-slate-500">automático</span>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/sessions/${s.id}`}>
                      <Button variant="ghost" size="sm" iconLeft={<ClipboardList size={13} />}>
                        Chamada
                      </Button>
                    </Link>
                    {s.status === "open" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCancelling(s)}
                          iconLeft={<Ban size={13} />}
                          className="text-flauzino-danger-600 hover:bg-flauzino-danger-100 hover:text-flauzino-danger-600"
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setClosing(s)}
                          iconLeft={<Square size={13} />}
                        >
                          Encerrar
                        </Button>
                      </>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {list.data && <Pagination pagination={list.data.pagination} onPageChange={setPage} />}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Abrir chamada"
        description={
          step === 1
            ? "Etapa 1 de 3 — turma e disciplina"
            : step === 2
              ? "Etapa 2 de 3 — sala e horário"
              : "Etapa 3 de 3 — confirme antes de abrir"
        }
        size="md"
        footer={
          step === 1 ? (
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button onClick={goToStep2} iconRight={<ArrowRight size={15} />}>
                Continuar
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <Button variant="secondary" onClick={() => setStep(1)} iconLeft={<ArrowLeft size={15} />}>
                Voltar
              </Button>
              <Button onClick={goToStep3} iconRight={<ArrowRight size={15} />}>
                Continuar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(2)} iconLeft={<ArrowLeft size={15} />}>
                Voltar
              </Button>
              <Button onClick={submitSession} loading={create.isPending} iconLeft={<Check size={15} />}>
                Abrir chamada
              </Button>
            </>
          )
        }
      >
        {/* Trilha das etapas */}
        <ol className="mb-5 flex items-center gap-2 text-xs font-medium">
          {[
            { n: 1 as const, label: "Turma" },
            { n: 2 as const, label: "Sala e horário" },
            { n: 3 as const, label: "Confirmar" },
          ].map(({ n, label }, i, arr) => (
            <li key={n} className="flex flex-1 items-center gap-2 last:flex-none">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  step === n
                    ? "bg-flauzino-accent-600 text-white"
                    : step > n
                      ? "bg-flauzino-success-100 text-flauzino-success-600"
                      : "bg-flauzino-slate-100 text-flauzino-slate-400"
                )}
              >
                {step > n ? <Check size={12} strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap",
                  step === n ? "text-flauzino-navy-900" : "text-flauzino-slate-500"
                )}
              >
                {label}
              </span>
              {i < arr.length - 1 && <span className="h-px flex-1 bg-flauzino-slate-200" />}
            </li>
          ))}
        </ol>

        <form className="flex flex-col gap-4" onSubmit={onFormSubmit}>
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-flauzino-navy-900">
                <GraduationCap size={16} className="text-flauzino-accent-600" />
                Turma e disciplina
              </div>
              <Select
                label="Turma"
                required
                placeholder={
                  classes.isPending
                    ? "Carregando turmas…"
                    : classOptions.length === 0
                      ? "Nenhuma turma disponível"
                      : "Selecione a turma"
                }
                options={classOptions}
                error={form.formState.errors.classId?.message}
                {...form.register("classId", { onChange: (e) => onClassChange(e.target.value) })}
              />
              <Select
                label="Disciplina"
                required
                disabled={!selectedClass}
                placeholder={
                  !selectedClass
                    ? "Escolha a turma primeiro"
                    : subjectOptions.length === 0
                      ? isTeacher
                        ? "Você não leciona nenhuma disciplina desta turma"
                        : "A turma não tem disciplinas na grade"
                      : "Selecione a disciplina"
                }
                hint="A chamada é de uma disciplina — a frequência é contada separadamente em cada uma."
                options={subjectOptions}
                error={form.formState.errors.classSubjectId?.message}
                {...form.register("classSubjectId", {
                  onChange: (e) => {
                    // Admin abre para o professor daquela disciplina
                    const cs = selectedClass?.subjects.find((x) => x.id === e.target.value);
                    if (!isTeacher && cs) form.setValue("teacherId", cs.teacherId);
                  },
                })}
              />
              {!isTeacher && (
                <Select
                  label="Professor responsável"
                  required
                  placeholder="Selecione o professor"
                  options={teacherOptions}
                  hint="Pré-selecionado pelo professor da disciplina."
                  error={form.formState.errors.teacherId?.message}
                  {...form.register("teacherId")}
                />
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-flauzino-navy-900">
                <MapPin size={16} className="text-flauzino-accent-600" />
                Sala e horário
              </div>
              <Select
                label="Sala"
                placeholder="Sala padrão da turma"
                options={locationOptions}
                hint="A sala não pode ter outra chamada em andamento."
                error={form.formState.errors.locationId?.message}
                {...form.register("locationId")}
              />
              <Input
                label="A aula começou às"
                required
                type="datetime-local"
                hint="Informe o horário real de início, mesmo que a chamada esteja sendo aberta com atraso — é dele que sai o fechamento automático."
                error={form.formState.errors.startedAt?.message}
                {...form.register("startedAt")}
              />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-flauzino-navy-900">
                <ClipboardCheck size={16} className="text-flauzino-accent-600" />
                Confirme os dados
              </div>
              <div className="overflow-hidden rounded-xl border border-flauzino-slate-200">
                {[
                  { label: "Turma", value: selectedClass?.name ?? "—" },
                  { label: "Disciplina", value: selectedSubject?.subjectName ?? "—" },
                  {
                    label: "Professor",
                    value: isTeacher
                      ? (user?.name ?? "Você")
                      : (teacherOptions.find((t) => t.value === form.watch("teacherId"))?.label ?? "—"),
                  },
                  {
                    label: "Sala",
                    value:
                      locationOptions.find((l) => l.value === form.watch("locationId"))?.label ??
                      "Sala padrão da turma",
                  },
                  { label: "Início", value: formatDateTime(startedAtValue) },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 border-b border-flauzino-slate-200 bg-white px-4 py-2.5 text-sm last:border-b-0"
                  >
                    <span className="text-flauzino-slate-500">{row.label}</span>
                    <span className="font-medium text-flauzino-navy-900">{row.value}</span>
                  </div>
                ))}
              </div>

              {selectedSubject && (
                <div className="flex items-start gap-2 rounded-lg bg-flauzino-accent-50 px-3 py-2.5 text-sm text-flauzino-navy-900">
                  <Clock size={15} className="mt-0.5 shrink-0 text-flauzino-accent-600" />
                  <span>
                    Vale <strong>{formatLessons(selectedSubject.lessonsPerSession)}</strong> e fecha
                    sozinha após {formatDuration(selectedSubject.sessionDurationMin)}
                    {startedAtValue && !Number.isNaN(new Date(startedAtValue).getTime()) && (
                      <>
                        , às{" "}
                        <strong>
                          {formatTime(
                            new Date(
                              new Date(startedAtValue).getTime() +
                                selectedSubject.sessionDurationMin * 60_000
                            ).toISOString()
                          )}
                        </strong>
                      </>
                    )}
                    .
                  </span>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        onConfirm={() => closing && close.mutate(closing)}
        title="Encerrar chamada"
        description="Os alunos que não passaram no totem serão marcados como ausentes e a frequência será atualizada."
        confirmLabel="Encerrar chamada"
        loading={close.isPending}
      />

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
        title="Cancelar chamada"
        description="Use quando a chamada foi aberta por engano. Nada é contabilizado — nem presenças, nem faltas."
        confirmLabel="Cancelar chamada"
        danger
        loading={cancel.isPending}
      />
    </div>
  );
}
