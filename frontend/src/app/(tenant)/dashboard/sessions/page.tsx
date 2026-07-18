"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Square, Ban, ClipboardList } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClassItem, ClassSession, Location, Paginated, User } from "@/lib/types";
import { formatDateTime, shortId } from "@/lib/format";
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

const SessionSchema = z.object({
  classId: z.string().min(1, "Selecione a turma."),
  teacherId: z.string().optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
  classesWorth: z
    .number("Informe um número.")
    .int("Use um número inteiro.")
    .positive("Deve ser maior que zero.")
    .optional(),
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

  const create = useMutation({
    mutationFn: (v: SessionForm) =>
      api.post("/class-sessions", {
        classId: v.classId,
        teacherId: isTeacher ? undefined : v.teacherId || undefined,
        locationId: v.locationId || undefined,
        classesWorth: v.classesWorth,
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
    form.reset({ classId: "", teacherId: "", locationId: "", classesWorth: 1 });
    setCreating(true);
  };

  // Pré-seleciona a sala padrão da turma (o professor pode trocar)
  const onClassChange = (classId: string) => {
    const cls = classById.get(classId);
    if (cls?.locationId) form.setValue("locationId", cls.locationId);
    if (!isTeacher && cls) form.setValue("teacherId", cls.teacherId);
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
              <Th>Vale por</Th>
              <Th>Status</Th>
              <Th className="w-52 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
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
                </Td>
                <Td>{s.teacherName ?? shortId(s.teacherId)}</Td>
                <Td>{s.locationName ?? "—"}</Td>
                <Td className="font-mono-ds text-xs">{formatDateTime(s.startedAt)}</Td>
                <Td>{s.classesWorth} {s.classesWorth === 1 ? "aula" : "aulas"}</Td>
                <Td><SessionStatusBadge status={s.status} /></Td>
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
        description="Escolha a sala onde a aula vai acontecer — o totem daquela sala passa a reconhecer os alunos desta turma."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => create.mutate(v))} loading={create.isPending}>
              Abrir chamada
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
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
          {!isTeacher && (
            <Select
              label="Professor responsável"
              required
              placeholder="Selecione o professor"
              options={teacherOptions}
              hint="Pré-selecionado pelo responsável da turma."
              error={form.formState.errors.teacherId?.message}
              {...form.register("teacherId")}
            />
          )}
          <Select
            label="Sala"
            placeholder="Sala padrão da turma"
            options={locationOptions}
            hint="A sala não pode ter outra chamada em andamento."
            error={form.formState.errors.locationId?.message}
            {...form.register("locationId")}
          />
          <Input
            label="Vale por quantas aulas"
            type="number"
            min={1}
            hint="Aulas geminadas contam mais de uma vez na frequência."
            error={form.formState.errors.classesWorth?.message}
            {...form.register("classesWorth", {
              setValueAs: (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            })}
          />
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
