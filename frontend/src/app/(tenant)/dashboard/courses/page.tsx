"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AcademicPeriod, Course, Paginated } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import { useDebounced } from "@/lib/useDebounced";
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
  Input,
  Select,
  Modal,
  ConfirmDialog,
  useToast,
} from "@/components/ui";

const CourseSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  academicPeriodId: z.string().min(1, "Selecione o período."),
  lessonsPerDay: z
    .number({ message: "Informe quantas aulas." })
    .int("Use um número inteiro.")
    .min(1, "Mínimo 1.")
    .max(20, "Máximo 20."),
  lessonDuration: z
    .number({ message: "Informe a duração." })
    .int("Use um número inteiro.")
    .min(1, "Mínimo 1."),
  lessonDurationUnit: z.enum(["minutes", "hours"]),
});

type CourseForm = z.infer<typeof CourseSchema>;

const UNIT_OPTIONS = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
];

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const debouncedSearch = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);

  const list = useQuery({
    queryKey: ["courses", { page, search: debouncedSearch, periodFilter }],
    queryFn: () =>
      api.get<Paginated<Course>>(
        `/courses${qs({ page, limit: 20, search: debouncedSearch, academicPeriodId: periodFilter })}`
      ),
  });

  const periods = useQuery({
    queryKey: ["academic-periods", "options"],
    queryFn: () => api.get<Paginated<AcademicPeriod>>(`/academic-periods${qs({ limit: 100 })}`),
  });

  const periodOptions =
    periods.data?.data.map((p) => ({ value: p.id, label: p.name })) ?? [];
  const periodNameById = new Map(periods.data?.data.map((p) => [p.id, p.name]) ?? []);

  const form = useForm<CourseForm>({ resolver: zodResolver(CourseSchema) });

  const save = useMutation({
    mutationFn: (v: CourseForm) =>
      editing ? api.patch(`/courses/${editing.id}`, v) : api.post("/courses", v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success(editing ? "Curso atualizado." : "Curso criado.");
      setCreating(false);
      setEditing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (c: Course) => api.delete(`/courses/${c.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Curso excluído.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({
      name: "",
      academicPeriodId: "",
      lessonsPerDay: 4,
      lessonDuration: 50,
      lessonDurationUnit: "minutes",
    });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (c: Course) => {
    form.reset({
      name: c.name,
      academicPeriodId: c.academicPeriodId,
      lessonsPerDay: c.lessonsPerDay,
      lessonDuration: c.lessonDuration,
      lessonDurationUnit: c.lessonDurationUnit,
    });
    setCreating(false);
    setEditing(c);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Cursos"
        description="Cada curso agrupa suas disciplinas e define quanto tempo dura uma aula."
        actions={
          !isTeacher && (
            <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
              Criar curso
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por nome"
          icon={<Search size={15} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-72"
        />
        <Select
          value={periodFilter}
          onChange={(e) => {
            setPeriodFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todos os períodos"
          options={periodOptions}
          className="w-52"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Período</Th>
              <Th>Grade do dia</Th>
              <Th>Disciplinas</Th>
              <Th>Criado em</Th>
              <Th className="w-24 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle="Nenhum curso cadastrado."
              emptyDescription="É preciso ter ao menos um período acadêmico para criar cursos."
            />
            {list.data?.data.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link
                    href={`/dashboard/courses/${c.id}`}
                    className="font-medium text-flauzino-navy-900 hover:text-flauzino-accent-600"
                  >
                    {c.name}
                  </Link>
                </Td>
                <Td>{periodNameById.get(c.academicPeriodId) ?? "—"}</Td>
                <Td className="font-mono-ds text-xs">
                  {c.lessonsPerDay} × {formatDuration(c.lessonDurationMin)}
                </Td>
                <Td>
                  <Link
                    href={`/dashboard/courses/${c.id}`}
                    className="font-mono-ds text-xs text-flauzino-accent-600 hover:underline"
                  >
                    {c.subjectCount ?? 0}
                  </Link>
                </Td>
                <Td className="font-mono-ds text-xs">{formatDate(c.createdAt)}</Td>
                <Td>
                  {!isTeacher && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label={`Editar ${c.name}`}>
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label={`Excluir ${c.name}`}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {list.data && <Pagination pagination={list.data.pagination} onPageChange={setPage} />}
      </Card>

      <Modal
        open={creating || editing !== null}
        onClose={close}
        title={editing ? "Editar curso" : "Criar curso"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
              {editing ? "Salvar alterações" : "Criar curso"}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Input
            label="Nome"
            required
            placeholder="Matemática — Ensino Médio"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Select
            label="Período acadêmico"
            required
            placeholder="Selecione o período"
            options={periodOptions}
            error={form.formState.errors.academicPeriodId?.message}
            {...form.register("academicPeriodId")}
          />
          <div>
            <div className="flex items-end gap-3">
              <Input
                label="Aulas por dia"
                required
                type="number"
                min={1}
                max={20}
                className="w-28"
                error={form.formState.errors.lessonsPerDay?.message}
                {...form.register("lessonsPerDay", { valueAsNumber: true })}
              />
              <Input
                label="Duração de uma aula"
                required
                type="number"
                min={1}
                className="w-32"
                error={form.formState.errors.lessonDuration?.message}
                {...form.register("lessonDuration", { valueAsNumber: true })}
              />
              <Select
                aria-label="Unidade da duração"
                options={UNIT_OPTIONS}
                className="w-32"
                {...form.register("lessonDurationUnit")}
              />
            </div>
            <p className="mt-1.5 text-xs text-flauzino-slate-500">
              A grade vale para todas as disciplinas do curso. A duração da aula é o que
              define quando a chamada fecha sozinha e quantas aulas o aluno cumpriu ao sair
              mais cedo.
            </p>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir curso"
        description={`"${deleting?.name}" e suas disciplinas serão removidos. Não é possível excluir um curso que ainda tenha turmas.`}
        confirmLabel="Excluir curso"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
