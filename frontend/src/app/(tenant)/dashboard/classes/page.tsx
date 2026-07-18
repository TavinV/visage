"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search, UsersRound } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClassItem, Course, Location, Paginated, User } from "@/lib/types";
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

const ClassSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  courseId: z.string().min(1, "Selecione o curso."),
  teacherId: z.string().min(1, "Selecione o professor."),
  room: z.string().max(50, "Máximo de 50 caracteres.").optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
  totalClassesPlanned: z
    .number("Informe um número.")
    .int("Use um número inteiro.")
    .nonnegative("Não pode ser negativo.")
    .optional(),
});

type ClassForm = z.infer<typeof ClassSchema>;

export default function ClassesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const debouncedSearch = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState<ClassItem | null>(null);

  const list = useQuery({
    queryKey: ["classes", { page, search: debouncedSearch, courseFilter }],
    queryFn: () =>
      api.get<Paginated<ClassItem>>(
        `/classes${qs({ page, limit: 20, search: debouncedSearch, courseId: courseFilter })}`
      ),
  });

  const courses = useQuery({
    queryKey: ["courses", "options"],
    queryFn: () => api.get<Paginated<Course>>(`/courses${qs({ limit: 100 })}`),
  });

  // Lista de usuários é admin-only; o professor não precisa dela aqui
  const teachers = useQuery({
    queryKey: ["users", "teachers"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "teacher", limit: 100 })}`),
    enabled: !isTeacher,
  });

  const locations = useQuery({
    queryKey: ["locations", "options"],
    queryFn: () => api.get<Paginated<Location>>(`/locations${qs({ limit: 100 })}`),
  });

  const courseOptions = courses.data?.data.map((c) => ({ value: c.id, label: c.name })) ?? [];
  const teacherOptions = teachers.data?.data.map((t) => ({ value: t.id, label: t.name })) ?? [];
  const locationOptions = locations.data?.data.map((l) => ({ value: l.id, label: l.name })) ?? [];
  const courseNameById = new Map(courses.data?.data.map((c) => [c.id, c.name]) ?? []);
  const teacherNameById = new Map(teachers.data?.data.map((t) => [t.id, t.name]) ?? []);

  const form = useForm<ClassForm>({ resolver: zodResolver(ClassSchema) });

  const save = useMutation({
    mutationFn: (v: ClassForm) => {
      const body = {
        name: v.name,
        teacherId: v.teacherId,
        room: v.room || undefined,
        locationId: v.locationId || undefined,
        totalClassesPlanned: Number.isNaN(v.totalClassesPlanned)
          ? undefined
          : v.totalClassesPlanned,
      };
      return editing
        ? api.patch(`/classes/${editing.id}`, body)
        : api.post("/classes", { ...body, courseId: v.courseId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success(editing ? "Turma atualizada." : "Turma criada.");
      setCreating(false);
      setEditing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (c: ClassItem) => api.delete(`/classes/${c.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Turma excluída.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({
      name: "",
      courseId: "",
      teacherId: "",
      room: "",
      locationId: "",
      totalClassesPlanned: undefined,
    });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (c: ClassItem) => {
    form.reset({
      name: c.name,
      courseId: c.courseId,
      teacherId: c.teacherId,
      room: c.room ?? "",
      locationId: c.locationId ?? "",
      totalClassesPlanned: c.totalClassesPlanned,
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
        title={isTeacher ? "Minhas turmas" : "Turmas"}
        description={
          isTeacher
            ? "Turmas sob sua responsabilidade, com alunos e salas."
            : "Turmas por curso, com professor responsável e sala."
        }
        actions={
          !isTeacher && (
            <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
              Criar turma
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
          value={courseFilter}
          onChange={(e) => {
            setCourseFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todos os cursos"
          options={courseOptions}
          className="w-56"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Turma</Th>
              <Th>Curso</Th>
              <Th>Professor</Th>
              <Th>Sala</Th>
              <Th>Aulas previstas</Th>
              <Th className="w-32 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle="Nenhuma turma cadastrada."
              emptyDescription="É preciso ter curso e professor cadastrados para criar turmas."
            />
            {list.data?.data.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link
                    href={`/dashboard/classes/${c.id}`}
                    className="font-medium text-flauzino-navy-900 hover:text-flauzino-accent-600"
                  >
                    {c.name}
                  </Link>
                </Td>
                <Td>{courseNameById.get(c.courseId) ?? "—"}</Td>
                <Td>{isTeacher ? user?.name : teacherNameById.get(c.teacherId) ?? "—"}</Td>
                <Td>{c.room ?? "—"}</Td>
                <Td className="font-mono-ds">{c.totalClassesPlanned}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Link href={`/dashboard/classes/${c.id}`}>
                      <Button variant="ghost" size="sm" title="Alunos" aria-label={`Alunos de ${c.name}`}>
                        <UsersRound size={15} />
                      </Button>
                    </Link>
                    {!isTeacher && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label={`Editar ${c.name}`}>
                          <Pencil size={15} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label={`Excluir ${c.name}`}>
                          <Trash2 size={15} />
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
        open={creating || editing !== null}
        onClose={close}
        title={editing ? "Editar turma" : "Criar turma"}
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
              {editing ? "Salvar alterações" : "Criar turma"}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
        >
          <Input
            label="Nome da turma"
            required
            placeholder="3º A — Manhã"
            className="sm:col-span-2"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Select
            label="Curso"
            required
            disabled={editing !== null}
            placeholder="Selecione o curso"
            hint={editing ? "O curso não pode ser alterado." : undefined}
            options={courseOptions}
            error={form.formState.errors.courseId?.message}
            {...form.register("courseId")}
          />
          <Select
            label="Professor responsável"
            required
            placeholder="Selecione o professor"
            options={teacherOptions}
            error={form.formState.errors.teacherId?.message}
            {...form.register("teacherId")}
          />
          <Input
            label="Sala (texto livre)"
            placeholder="Sala 12"
            hint="Use quando a sala não estiver cadastrada."
            error={form.formState.errors.room?.message}
            {...form.register("room")}
          />
          <Select
            label="Sala de aula"
            placeholder="Sem sala vinculada"
            options={locationOptions}
            error={form.formState.errors.locationId?.message}
            {...form.register("locationId")}
          />
          <Input
            label="Aulas previstas no período"
            type="number"
            min={0}
            className="sm:col-span-2"
            error={form.formState.errors.totalClassesPlanned?.message}
            {...form.register("totalClassesPlanned", {
              setValueAs: (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir turma"
        description={`"${deleting?.name}" será removida, junto com as matrículas vinculadas.`}
        confirmLabel="Excluir turma"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
