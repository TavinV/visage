"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, Clock, Library } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Course, Paginated, Subject } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
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
  Input,
  Modal,
  ConfirmDialog,
  Badge,
  Skeleton,
  useToast,
} from "@/components/ui";

/**
 * Página do curso: a grade (aulas por dia × duração) e o catálogo de
 * disciplinas do currículo.
 *
 * Aqui a disciplina é só o nome. Quem leciona e quanta carga tem é definido
 * por turma, no wizard de criação da turma.
 */
export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });

  const course = useQuery({
    queryKey: ["courses", id],
    queryFn: () => api.get<{ data: Course }>(`/courses/${id}`),
  });

  const subjects = useQuery({
    queryKey: ["subjects", "by-course", id],
    queryFn: () =>
      api.get<Paginated<Subject>>(`/subjects${qs({ courseId: id, limit: 100 })}`),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), code: form.code.trim() || undefined };
      return editing
        ? api.patch(`/subjects/${editing.id}`, body)
        : api.post("/subjects", { ...body, courseId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success(editing ? "Disciplina atualizada." : "Disciplina criada.");
      close();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (s: Subject) => api.delete(`/subjects/${s.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Disciplina excluída.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    setForm({ name: "", code: "" });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (s: Subject) => {
    setForm({ name: s.name, code: s.code ?? "" });
    setCreating(false);
    setEditing(s);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  if (course.isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (course.isError || !course.data) {
    return (
      <div>
        <PageHeader title="Curso não encontrado" description={friendlyError(course.error)} />
        <Link href="/dashboard/courses">
          <Button variant="secondary" iconLeft={<ArrowLeft size={15} />}>
            Voltar para cursos
          </Button>
        </Link>
      </div>
    );
  }

  const c = course.data.data;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link
          href="/dashboard/courses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-flauzino-slate-500 transition-colors hover:text-flauzino-accent-600"
        >
          <ArrowLeft size={15} /> Cursos
        </Link>
      </div>

      <PageHeader
        title={c.name}
        description={c.periodName ? `Período ${c.periodName}` : undefined}
      />

      <Card className="mb-5">
        <CardHeader
          title="Grade do curso"
          description="Vale para todas as turmas e disciplinas deste curso."
          icon={<Clock size={18} strokeWidth={1.75} />}
        />
        <div className="grid grid-cols-1 divide-y divide-flauzino-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
              Aulas por dia
            </p>
            <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
              {c.lessonsPerDay}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
              Duração de uma aula
            </p>
            <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
              {formatDuration(c.lessonDurationMin)}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
              Dia letivo completo
            </p>
            <p className="mt-1 font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
              {formatDuration(c.lessonsPerDay * c.lessonDurationMin)}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Disciplinas do currículo"
          description="O catálogo do curso. O professor e a carga de cada uma são definidos por turma."
          icon={<Library size={18} strokeWidth={1.75} />}
          actions={
            canManage && (
              <Button size="sm" onClick={openCreate} iconLeft={<Plus size={15} />}>
                Adicionar disciplina
              </Button>
            )
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Disciplina</Th>
              <Th>Sigla</Th>
              <Th>Turmas que cursam</Th>
              <Th className="w-24 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={4}
              loading={subjects.isPending}
              error={subjects.error ? friendlyError(subjects.error) : null}
              empty={subjects.data?.data.length === 0}
              emptyTitle="Nenhuma disciplina no currículo deste curso."
              emptyDescription="Sem disciplinas, não é possível montar a grade de uma turma."
            />
            {subjects.data?.data.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <span className="font-medium text-flauzino-navy-900">{s.name}</span>
                  {!s.isActive && (
                    <Badge variant="neutral" className="ml-2">
                      Inativa
                    </Badge>
                  )}
                </Td>
                <Td className="font-mono-ds text-xs">{s.code ?? "—"}</Td>
                <Td className="font-mono-ds text-xs">{s.classCount ?? 0}</Td>
                <Td>
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(s)}
                        aria-label={`Editar ${s.name}`}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(s)}
                        aria-label={`Excluir ${s.name}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={creating || editing !== null}
        onClose={close}
        title={editing ? "Editar disciplina" : "Adicionar disciplina"}
        description={`No currículo de ${c.name}.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!form.name.trim()}
            >
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome"
            required
            placeholder="Matemática"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Sigla"
            placeholder="MAT101"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir disciplina"
        description={`"${deleting?.name}" sai do currículo. Não é possível excluir uma disciplina que alguma turma já cursa.`}
        confirmLabel="Excluir disciplina"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
