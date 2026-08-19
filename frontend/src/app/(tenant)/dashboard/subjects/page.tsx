"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Course, Paginated, Subject } from "@/lib/types";
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
  Badge,
  useToast,
} from "@/components/ui";
import { ShowInactiveToggle, inactiveRowClass } from "@/components/app/ShowInactive";

/**
 * Catálogo de disciplinas de todos os cursos. A mesma disciplina (ex.:
 * "Banco de Dados 1") é criada uma vez aqui e depois cursada por quantas
 * turmas do curso precisarem dela — cada turma escolhe seu(s) professor(es)
 * na etapa 2 do assistente de turma (@/components/app/ClassWizard).
 */
export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const debouncedSearch = useDebounced(search);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [form, setForm] = useState({
    courseId: "",
    name: "",
    code: "",
  });

  const courses = useQuery({
    queryKey: ["courses", "options"],
    queryFn: () => api.get<Paginated<Course>>(`/courses${qs({ limit: 100 })}`),
  });
  const courseOptions = courses.data?.data.map((c) => ({ value: c.id, label: c.name })) ?? [];

  const list = useQuery({
    queryKey: [
      "subjects",
      { page, search: debouncedSearch, courseFilter, showInactive },
    ],
    queryFn: () =>
      api.get<Paginated<Subject>>(
        `/subjects${qs({
          page,
          limit: 20,
          search: debouncedSearch,
          courseId: courseFilter,
          isActive: showInactive ? undefined : true,
        })}`
      ),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
      };
      return editing
        ? api.patch(`/subjects/${editing.id}`, body)
        : api.post("/subjects", { ...body, courseId: form.courseId });
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
    setForm({
      // Se já está filtrando por um curso, começa com ele selecionado
      courseId: courseFilter,
      name: "",
      code: "",
    });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (s: Subject) => {
    setForm({
      courseId: s.courseId,
      name: s.name,
      code: s.code ?? "",
    });
    setCreating(false);
    setEditing(s);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Disciplinas"
        description="O catálogo de disciplinas dos cursos. Crie uma vez e associe a quantas turmas precisar, cada uma com seu próprio professor."
        actions={
          canManage && (
            <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
              Criar disciplina
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por nome ou sigla"
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
        <ShowInactiveToggle
          checked={showInactive}
          onChange={(v) => {
            setShowInactive(v);
            setPage(1);
          }}
          label="Mostrar inativas"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Disciplina</Th>
              <Th>Sigla</Th>
              <Th>Curso</Th>
              <Th>Turmas que cursam</Th>
              <Th className="w-24 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={5}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle={
                showInactive ? "Nenhuma disciplina cadastrada." : "Nenhuma disciplina ativa."
              }
              emptyDescription={
                showInactive
                  ? "É preciso ter ao menos um curso para criar disciplinas."
                  : "Crie uma disciplina ou marque “Mostrar inativas” para ver as desativadas."
              }
            />
            {list.data?.data.map((s) => (
              <Tr key={s.id} className={s.isActive ? undefined : inactiveRowClass}>
                <Td>
                  <span className="font-medium text-flauzino-navy-900">{s.name}</span>
                  {!s.isActive && (
                    <Badge variant="neutral" className="ml-2">
                      Inativa
                    </Badge>
                  )}
                </Td>
                <Td className="font-mono-ds text-xs">{s.code ?? "—"}</Td>
                <Td>
                  <Link
                    href={`/dashboard/courses/${s.courseId}`}
                    className="text-flauzino-slate-600 hover:text-flauzino-accent-600 hover:underline"
                  >
                    {s.courseName ?? "—"}
                  </Link>
                </Td>
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
        {list.data && <Pagination pagination={list.data.pagination} onPageChange={setPage} />}
      </Card>

      <Modal
        open={creating || editing !== null}
        onClose={close}
        title={editing ? "Editar disciplina" : "Criar disciplina"}
        description={
          editing
            ? `No currículo de ${editing.courseName ?? "curso"}.`
            : "Fica disponível para todas as turmas do curso escolhido."
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!form.name.trim() || (!editing && !form.courseId)}
            >
              {editing ? "Salvar" : "Criar disciplina"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {editing ? (
            <p className="rounded-lg bg-flauzino-slate-100 px-3 py-2 text-sm text-flauzino-slate-600">
              Curso: <span className="font-medium text-flauzino-navy-900">{editing.courseName}</span>
              <span className="block text-xs text-flauzino-slate-500">
                O curso não muda depois de criada — crie outra disciplina se for para outro curso.
              </span>
            </p>
          ) : (
            <Select
              label="Curso"
              required
              placeholder="Selecione o curso"
              hint="Define quais turmas podem cursar esta disciplina."
              options={courseOptions}
              value={form.courseId}
              onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
            />
          )}
          <Input
            label="Nome"
            required
            placeholder="Banco de Dados 1"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Sigla"
            placeholder="BD1"
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
        description={`"${deleting?.name}" sai do catálogo. Não é possível excluir uma disciplina que alguma turma já cursa.`}
        confirmLabel="Excluir disciplina"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
