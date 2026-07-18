"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClassEnrollment, ClassItem, Paginated, User } from "@/lib/types";
import { formatDate, shortId } from "@/lib/format";
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
  Pagination,
  Button,
  Select,
  ConfirmDialog,
  Avatar,
  Skeleton,
  useToast,
} from "@/components/ui";
import { FacialStatusBadge } from "@/components/app/badges";

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [removing, setRemoving] = useState<ClassEnrollment | null>(null);

  const classQuery = useQuery({
    queryKey: ["classes", id],
    queryFn: () => api.get<{ data: ClassItem }>(`/classes/${id}`),
  });

  const enrollments = useQuery({
    queryKey: ["class-enrollments", { classId: id, page }],
    queryFn: () =>
      api.get<Paginated<ClassEnrollment>>(
        `/class-enrollments${qs({ classId: id, page, limit: 20 })}`
      ),
  });

  // Lista de usuários é admin-only; professor usa os dados embutidos na matrícula
  const students = useQuery({
    queryKey: ["users", "students-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "student", limit: 100 })}`),
    enabled: !isTeacher,
  });

  const studentById = new Map(students.data?.data.map((s) => [s.id, s]) ?? []);
  const enrolledIds = new Set(enrollments.data?.data.map((e) => e.userId) ?? []);
  const availableStudents =
    students.data?.data.filter((s) => !enrolledIds.has(s.id)) ?? [];

  const enroll = useMutation({
    mutationFn: (userId: string) => api.post("/class-enrollments", { classId: id, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-enrollments"] });
      toast.success("Aluno matriculado.");
      setSelectedStudent("");
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
        description={`${cls.room ? `Sala ${cls.room} · ` : ""}${cls.totalClassesPlanned} aulas previstas no período`}
      />

      <Card>
        <CardHeader
          title="Alunos matriculados"
          description="A chamada reconhece apenas alunos matriculados na turma."
        />

        {!isTeacher && (
        <div className="flex flex-wrap items-end gap-3 border-b border-flauzino-slate-200 px-5 py-4">
          <Select
            label="Adicionar aluno"
            placeholder={
              students.isPending
                ? "Carregando alunos…"
                : availableStudents.length === 0
                  ? "Nenhum aluno disponível"
                  : "Selecione um aluno"
            }
            options={availableStudents.map((s) => ({
              value: s.id,
              label: s.enrollmentCode ? `${s.name} (${s.enrollmentCode})` : s.name,
            }))}
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            className="w-80"
          />
          <Button
            onClick={() => selectedStudent && enroll.mutate(selectedStudent)}
            disabled={!selectedStudent}
            loading={enroll.isPending}
            iconLeft={<Plus size={15} />}
          >
            Matricular aluno
          </Button>
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
              const student = e.student ?? studentById.get(e.userId);
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
        description={`${
          removing
            ? removing.student?.name ?? studentById.get(removing.userId)?.name ?? "O aluno"
            : "O aluno"
        } deixará de ser reconhecido nas chamadas desta turma.`}
        confirmLabel="Remover matrícula"
        danger
        loading={unenroll.isPending}
      />
    </div>
  );
}
