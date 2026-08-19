"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, Library, BarChart3 } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  ClassEnrollment,
  ClassItem,
  FrequencyReport,
  Paginated,
  User,
} from "@/lib/types";
import { formatDate, formatDuration, formatLessons, formatPercent, shortId } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import { useDebounced } from "@/lib/useDebounced";
import {
  PageHeader,
  Card,
  CardHeader,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Pagination,
  Button,
  Input,
  ConfirmDialog,
  Avatar,
  Badge,
  Skeleton,
  useToast,
} from "@/components/ui";
import { FacialStatusBadge } from "@/components/app/badges";

function frequencyTone(percent: number): "success" | "warning" | "danger" {
  if (percent >= 75) return "success";
  if (percent >= 50) return "warning";
  return "danger";
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [page, setPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const debouncedStudentSearch = useDebounced(studentSearch);
  const [removing, setRemoving] = useState<ClassEnrollment | null>(null);

  const classQuery = useQuery({
    queryKey: ["classes", id],
    queryFn: () => api.get<{ data: ClassItem }>(`/classes/${id}`),
  });

  // Frequência de todas as disciplinas da turma — o que o professor abre
  // aqui para ver a situação de todo mundo de uma vez
  const frequency = useQuery({
    queryKey: ["report-frequency", "by-class", id],
    queryFn: () =>
      api.get<{ data: FrequencyReport[] }>(
        `/attendance/reports/frequency${qs({ class_id: id })}`
      ),
  });

  const enrollments = useQuery({
    queryKey: ["class-enrollments", { classId: id, page }],
    queryFn: () =>
      api.get<Paginated<ClassEnrollment>>(
        `/class-enrollments${qs({ classId: id, page, limit: 20 })}`
      ),
  });

  // Busca server-side: com centenas de alunos, filtrar as primeiras 100 no
  // cliente esconderia justamente quem o usuário está procurando.
  // Lista de usuários é admin-only; professor usa os dados embutidos na matrícula.
  const searchResults = useQuery({
    queryKey: ["users", "student-search", debouncedStudentSearch],
    queryFn: () =>
      api.get<Paginated<User>>(
        `/users${qs({ role: "student", search: debouncedStudentSearch, limit: 10 })}`
      ),
    enabled: !isTeacher && debouncedStudentSearch.trim().length >= 2,
  });

  // Todos os matriculados da turma, para marcar quem já está dentro nos
  // resultados da busca (a página atual da tabela não basta)
  const allEnrolled = useQuery({
    queryKey: ["class-enrollments", "all-ids", id],
    queryFn: () =>
      api.get<Paginated<ClassEnrollment>>(
        `/class-enrollments${qs({ classId: id, limit: 100 })}`
      ),
    enabled: !isTeacher,
  });

  const enrolledIds = new Set(allEnrolled.data?.data.map((e) => e.userId) ?? []);

  const enroll = useMutation({
    mutationFn: (userId: string) => api.post("/class-enrollments", { classId: id, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-enrollments"] });
      toast.success("Aluno matriculado.");
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const unenroll = useMutation({
    mutationFn: (e: ClassEnrollment) =>
      api.delete(`/class-enrollments/${e.classId}/${e.userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-enrollments"] });
      toast.success("Matrícula removida.");
      setRemoving(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const cls = classQuery.data?.data;

  if (classQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full max-w-3xl" />
      </div>
    );
  }

  if (classQuery.isError || !cls) {
    return (
      <div>
        <PageHeader title="Turma não encontrada" description={friendlyError(classQuery.error)} />
        <Link href="/dashboard/classes">
          <Button variant="secondary" iconLeft={<ArrowLeft size={15} />}>Voltar para turmas</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link
          href="/dashboard/classes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-flauzino-slate-500 transition-colors hover:text-flauzino-accent-600"
        >
          <ArrowLeft size={15} /> Turmas
        </Link>
      </div>

      <PageHeader
        title={cls.name}
        description={[
          cls.courseName,
          cls.locationName ?? (cls.room ? `Sala ${cls.room}` : null),
          `${cls.enrolledCount} ${cls.enrolledCount === 1 ? "aluno" : "alunos"}`,
          `${cls.lessonsPerDay} aulas/dia de ${formatDuration(cls.lessonDurationMin)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      {/* Grade da turma */}
      <Card className="mb-5">
        <CardHeader
          title="Disciplinas da turma"
          description="Cada disciplina tem seu professor, sua carga e sua frequência."
          icon={<Library size={18} strokeWidth={1.75} />}
        />
        <Table>
          <thead>
            <tr>
              <Th>Disciplina</Th>
              <Th>Professores</Th>
              <Th>Chamada vale</Th>
              <Th>Aulas no período</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={4}
              empty={cls.subjects.length === 0}
              emptyTitle="Nenhuma disciplina na grade desta turma."
            />
            {cls.subjects.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <span className="font-medium text-flauzino-navy-900">{s.subjectName}</span>
                  {s.subjectCode && (
                    <span className="ml-2 font-mono-ds text-xs text-flauzino-slate-500">
                      {s.subjectCode}
                    </span>
                  )}
                </Td>
                <Td>
                  {/* Responsável em destaque; quem divide a disciplina vem
                      logo abaixo, para não sumir da vista da secretaria */}
                  <span className="block text-flauzino-navy-900">{s.teacherName}</span>
                  {s.teachers.length > 1 && (
                    <span className="text-xs text-flauzino-slate-500">
                      com{" "}
                      {s.teachers
                        .filter((t) => !t.isPrimary)
                        .map((t) => t.name)
                        .join(", ")}
                    </span>
                  )}
                </Td>
                <Td>
                  {formatLessons(s.lessonsPerSession)}
                  <span className="ml-1.5 text-xs text-flauzino-slate-500">
                    · {formatDuration(s.sessionDurationMin)}
                  </span>
                </Td>
                <Td className="font-mono-ds text-xs">{s.totalLessonsPlanned}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Frequência por disciplina */}
      <Card className="mb-5">
        <CardHeader
          title="Frequência dos alunos"
          description="Presenças sobre as aulas previstas no período, disciplina por disciplina."
          icon={<BarChart3 size={18} strokeWidth={1.75} />}
        />
        {frequency.isPending ? (
          <div className="px-5 py-6">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : frequency.isError ? (
          <p className="px-5 py-6 text-sm text-flauzino-danger-600">
            {friendlyError(frequency.error)}
          </p>
        ) : (frequency.data?.data.length ?? 0) === 0 ? (
          <p className="px-5 py-6 text-sm text-flauzino-slate-500">
            Nenhuma disciplina para relatar.
          </p>
        ) : (
          frequency.data!.data.map((f) => (
            <div key={f.classSubjectId} className="border-b border-flauzino-slate-200 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="text-sm font-semibold text-flauzino-navy-900">
                  {f.subjectName}
                  <span className="ml-2 font-normal text-flauzino-slate-500">{f.teacherName}</span>
                </span>
                <span className="font-mono-ds text-xs text-flauzino-slate-500">
                  {f.lessonsSoFar} de {f.totalClassesPlanned} aulas dadas
                  {f.periodName && ` · ${f.periodName}`}
                </span>
              </div>
              {f.students.length === 0 ? (
                <p className="px-5 pb-4 text-xs text-flauzino-slate-400">
                  Nenhuma chamada encerrada ainda nesta disciplina.
                </p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Aluno</Th>
                      <Th>Presenças</Th>
                      <Th>Faltas</Th>
                      <Th>Frequência</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.students.map((s) => (
                      <Tr key={s.userId}>
                        <Td className="font-medium text-flauzino-navy-900">{s.name}</Td>
                        <Td className="font-mono-ds">{s.attended}</Td>
                        <Td className="font-mono-ds">{s.absent}</Td>
                        <Td>
                          <Badge variant={frequencyTone(s.frequencyPercent)}>
                            {formatPercent(s.frequencyPercent)}
                          </Badge>
                          <span
                            className="ml-2 text-xs text-flauzino-slate-500"
                            title="Sobre as aulas que já aconteceram"
                          >
                            {formatPercent(s.partialPercent)} do dado
                          </span>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          ))
        )}
      </Card>

      <Card>
        <CardHeader
          title="Alunos matriculados"
          description="A chamada reconhece apenas alunos matriculados na turma."
        />

        {!isTeacher && (
          <div className="border-b border-flauzino-slate-200 px-5 py-4">
            <Input
              label="Adicionar aluno"
              placeholder="Buscar por nome, e-mail, CPF ou matrícula"
              icon={<Search size={15} />}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              hint="Digite ao menos 2 caracteres para buscar entre todos os alunos da instituição."
              className="w-full max-w-md"
            />

            {debouncedStudentSearch.trim().length >= 2 && (
              <div className="mt-3 max-w-md overflow-hidden rounded-lg border border-flauzino-slate-200">
                {searchResults.isPending ? (
                  <p className="px-3 py-3 text-sm text-flauzino-slate-500">Buscando…</p>
                ) : searchResults.data?.data.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-flauzino-slate-500">
                    Nenhum aluno encontrado para “{debouncedStudentSearch}”.
                  </p>
                ) : (
                  <ul className="divide-y divide-flauzino-slate-100">
                    {searchResults.data?.data.map((s) => {
                      const already = enrolledIds.has(s.id);
                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={s.name} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-flauzino-navy-900">
                                {s.name}
                              </span>
                              <span className="block truncate font-mono-ds text-xs text-flauzino-slate-500">
                                {s.enrollmentCode ?? s.email ?? "sem matrícula"}
                              </span>
                            </span>
                          </span>
                          {already ? (
                            <span className="shrink-0 text-xs text-flauzino-slate-500">
                              Já matriculado
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => enroll.mutate(s.id)}
                              loading={enroll.isPending && enroll.variables === s.id}
                              iconLeft={<Plus size={14} />}
                            >
                              Matricular
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <Table>
          <thead>
            <tr>
              <Th>Aluno</Th>
              <Th>Matrícula</Th>
              <Th>Biometria</Th>
              <Th>Matriculado em</Th>
              <Th className="w-28 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={5}
              loading={enrollments.isPending}
              error={enrollments.error ? friendlyError(enrollments.error) : null}
              empty={enrollments.data?.data.length === 0}
              emptyTitle="Nenhum aluno matriculado nesta turma."
            />
            {enrollments.data?.data.map((e) => {
              const student = e.student;
              return (
                <Tr key={`${e.classId}-${e.userId}`}>
                  <Td>
                    <span className="flex items-center gap-3">
                      <Avatar name={student?.name ?? "?"} size="sm" />
                      {isTeacher ? (
                        <span className="font-medium text-flauzino-navy-900">
                          {student?.name ?? shortId(e.userId)}
                        </span>
                      ) : (
                        <Link
                          href={`/dashboard/users/${e.userId}`}
                          className="font-medium text-flauzino-navy-900 hover:text-flauzino-accent-600"
                        >
                          {student?.name ?? shortId(e.userId)}
                        </Link>
                      )}
                    </span>
                  </Td>
                  <Td className="font-mono-ds text-xs">{student?.enrollmentCode ?? "—"}</Td>
                  <Td>{student ? <FacialStatusBadge status={student.facialStatus} /> : "—"}</Td>
                  <Td className="font-mono-ds text-xs">{formatDate(e.enrolledAt)}</Td>
                  <Td>
                    {!isTeacher && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoving(e)}
                          aria-label={`Remover matrícula de ${student?.name ?? e.userId}`}
                        >
                          Remover
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        {enrollments.data && (
          <Pagination pagination={enrollments.data.pagination} onPageChange={setPage} />
        )}
      </Card>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && unenroll.mutate(removing)}
        title="Remover matrícula"
        description={`${removing?.student?.name ?? "O aluno"} deixará de ser reconhecido nas chamadas desta turma.`}
        confirmLabel="Remover matrícula"
        danger
        loading={unenroll.isPending}
      />
    </div>
  );
}
