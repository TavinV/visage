"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, UsersRound } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClassItem, Course, Location, Paginated, Subject, User } from "@/lib/types";
import { formatDuration } from "@/lib/format";
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
  ConfirmDialog,
  Badge,
  FilterButton,
  FilterModal,
  useToast,
} from "@/components/ui";
import { ClassWizard } from "@/components/app/ClassWizard";

export default function ClassesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const debouncedSearch = useDebounced(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState<ClassItem | null>(null);

  const activeFilterCount =
    (courseFilter ? 1 : 0) +
    (subjectFilter ? 1 : 0) +
    (teacherFilter ? 1 : 0) +
    (locationFilter ? 1 : 0);

  const list = useQuery({
    queryKey: [
      "classes",
      { page, search: debouncedSearch, courseFilter, subjectFilter, teacherFilter, locationFilter },
    ],
    queryFn: () =>
      api.get<Paginated<ClassItem>>(
        `/classes${qs({
          page,
          limit: 20,
          search: debouncedSearch,
          courseId: courseFilter,
          subjectId: subjectFilter,
          teacherId: teacherFilter,
          locationId: locationFilter,
        })}`
      ),
  });

  const courses = useQuery({
    queryKey: ["courses", "options"],
    queryFn: () => api.get<Paginated<Course>>(`/courses${qs({ limit: 100 })}`),
  });

  // Sem curso escolhido, mostra o catálogo inteiro do tenant — melhor um
  // filtro amplo do que um campo travado esperando outra escolha primeiro
  const subjects = useQuery({
    queryKey: ["subjects", "by-course", courseFilter, "filter-options"],
    queryFn: () =>
      api.get<Paginated<Subject>>(
        `/subjects${qs({ courseId: courseFilter, isActive: true, limit: 100 })}`
      ),
  });

  const teachers = useQuery({
    queryKey: ["users", "teacher-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "teacher", limit: 100 })}`),
  });

  const locations = useQuery({
    queryKey: ["locations", "options"],
    queryFn: () => api.get<Paginated<Location>>(`/locations${qs({ limit: 100 })}`),
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

  return (
    <div>
      <PageHeader
        title={isTeacher ? "Minhas turmas" : "Turmas"}
        description={
          isTeacher
            ? "Turmas em que você leciona. Abra uma para ver os alunos e a frequência."
            : "Cada turma é um grupo de alunos e as disciplinas que ele cursa."
        }
        actions={
          !isTeacher && (
            <Button onClick={() => setCreating(true)} iconLeft={<Plus size={16} />}>
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
        <FilterButton count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
      </div>

      <FilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onClear={() => {
          setCourseFilter("");
          setSubjectFilter("");
          setTeacherFilter("");
          setLocationFilter("");
          setPage(1);
        }}
        activeCount={activeFilterCount}
      >
        <Select
          label="Curso"
          value={courseFilter}
          onChange={(e) => {
            setCourseFilter(e.target.value);
            setSubjectFilter(""); // disciplina escolhida pode não existir no novo curso
            setPage(1);
          }}
          placeholder="Todos os cursos"
          options={courses.data?.data.map((c) => ({ value: c.id, label: c.name })) ?? []}
        />
        <Select
          label="Disciplina"
          value={subjectFilter}
          onChange={(e) => {
            setSubjectFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todas as disciplinas"
          options={subjects.data?.data.map((s) => ({ value: s.id, label: s.name })) ?? []}
        />
        <Select
          label="Professor"
          value={teacherFilter}
          onChange={(e) => {
            setTeacherFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todos os professores"
          options={teachers.data?.data.map((t) => ({ value: t.id, label: t.name })) ?? []}
        />
        <Select
          label="Sala vinculada"
          value={locationFilter}
          onChange={(e) => {
            setLocationFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todas as salas"
          options={locations.data?.data.map((l) => ({ value: l.id, label: l.name })) ?? []}
        />
      </FilterModal>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Turma</Th>
              <Th>Curso</Th>
              <Th>Disciplinas</Th>
              <Th>Sala</Th>
              <Th>Alunos</Th>
              <Th className="w-32 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle={
                isTeacher ? "Você ainda não leciona em nenhuma turma." : "Nenhuma turma cadastrada."
              }
              emptyDescription={
                isTeacher
                  ? "A secretaria vincula você às disciplinas das turmas."
                  : "É preciso um curso com disciplinas no catálogo para criar turmas."
              }
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
                <Td>{c.courseName ?? "—"}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {c.subjects.length === 0 ? (
                      <span className="text-xs text-flauzino-slate-400">—</span>
                    ) : (
                      c.subjects.map((s) => (
                        <Badge
                          key={s.id}
                          variant="neutral"
                          title={`${s.teachers?.map((t) => t.name).join(", ") ?? s.teacherName} · ${s.lessonsPerSession} aula(s) · ${formatDuration(s.sessionDurationMin)}`}
                        >
                          {s.subjectName}
                        </Badge>
                      ))
                    )}
                  </span>
                </Td>
                <Td>{c.locationName ?? c.room ?? "—"}</Td>
                <Td className="font-mono-ds">{c.enrolledCount}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Link href={`/dashboard/classes/${c.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Alunos e frequência"
                        aria-label={`Abrir ${c.name}`}
                      >
                        <UsersRound size={15} />
                      </Button>
                    </Link>
                    {!isTeacher && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(c)}
                          aria-label={`Editar ${c.name}`}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(c)}
                          aria-label={`Excluir ${c.name}`}
                        >
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

      {(creating || editing) && (
        <ClassWizard
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir turma"
        description={`"${deleting?.name}" será removida, junto com as matrículas e a grade de disciplinas.`}
        confirmLabel="Excluir turma"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
