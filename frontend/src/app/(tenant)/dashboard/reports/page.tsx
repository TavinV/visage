"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  ClassEnrollment,
  ClassItem,
  FrequencyReport,
  Paginated,
  StudentClassSummary,
  StudentHistoryEntry,
  User,
} from "@/lib/types";
import { formatDateTime, formatPercent } from "@/lib/format";
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
  Select,
  Badge,
  EmptyState,
} from "@/components/ui";

function frequencyTone(percent: number): "success" | "warning" | "danger" {
  if (percent >= 75) return "success";
  if (percent >= 50) return "warning";
  return "danger";
}

const attendanceStatusLabel: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  pre_attendance: "Pré-presença",
  manual: "Ajuste manual",
};

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isTeacher = user?.role === "teacher";
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");

  // Professor TEM acesso a GET /classes — o backend já devolve só as turmas
  // dele. Manter isso travado em admin deixava o professor sem seletor e,
  // portanto, sem relatório nenhum.
  const classes = useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => api.get<Paginated<ClassItem>>(`/classes${qs({ limit: 100 })}`),
  });

  // GET /users é admin-only; o professor chega aos alunos pelas matrículas
  // da turma selecionada
  const students = useQuery({
    queryKey: ["users", "students-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "student", limit: 100 })}`),
    enabled: isAdmin,
  });

  const classEnrollments = useQuery({
    queryKey: ["class-enrollments", "report-students", classId],
    queryFn: () =>
      api.get<Paginated<ClassEnrollment>>(
        `/class-enrollments${qs({ classId, limit: 100 })}`
      ),
    enabled: isTeacher && classId !== "",
  });

  const studentOptions = isAdmin
    ? (students.data?.data.map((s) => ({
        value: s.id,
        label: s.enrollmentCode ? `${s.name} (${s.enrollmentCode})` : s.name,
      })) ?? [])
    : (classEnrollments.data?.data.map((e) => ({
        value: e.userId,
        label: e.student?.enrollmentCode
          ? `${e.student.name} (${e.student.enrollmentCode})`
          : (e.student?.name ?? e.userId),
      })) ?? []);

  // Uma entrada por disciplina da turma — a frequência é contada por disciplina
  const frequency = useQuery({
    queryKey: ["report-frequency", classId],
    queryFn: () =>
      api.get<{ data: FrequencyReport[] }>(
        `/attendance/reports/frequency${qs({ class_id: classId })}`
      ),
    enabled: classId !== "",
  });

  const summary = useQuery({
    queryKey: ["report-student-summary", studentId],
    queryFn: () =>
      api.get<{ data: StudentClassSummary[] }>(`/attendance/reports/student/${studentId}/summary`),
    enabled: studentId !== "",
  });

  const history = useQuery({
    queryKey: ["report-student-history", studentId],
    queryFn: () =>
      api.get<{ data: StudentHistoryEntry[] }>(`/attendance/reports/student/${studentId}`),
    enabled: studentId !== "",
  });

  return (
    <div>
      <PageHeader
        title="Relatórios de frequência"
        description="Frequência agregada por turma e histórico individual por aluno."
      />

      <div className="flex flex-col gap-6">
        {/* Frequência por turma */}
        <Card>
          <CardHeader
            title="Frequência por turma"
            actions={
              <Select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  // O aluno escolhido pertencia à turma anterior
                  if (isTeacher) setStudentId("");
                }}
                placeholder={
                  classes.isPending
                    ? "Carregando turmas…"
                    : classes.data?.data.length === 0
                      ? "Nenhuma turma disponível"
                      : "Selecione a turma"
                }
                options={
                  classes.data?.data.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })) ?? []
                }
                className="w-72"
              />
            }
          />
          {classId === "" ? (
            <EmptyState
              title="Selecione uma turma para ver a frequência."
              description="O relatório mostra presenças, faltas e percentual por aluno."
            />
          ) : frequency.isPending ? (
            <p className="px-5 py-6 text-sm text-flauzino-slate-500">Carregando…</p>
          ) : frequency.isError ? (
            <p className="px-5 py-6 text-sm text-flauzino-danger-600">
              {friendlyError(frequency.error)}
            </p>
          ) : (frequency.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              title="Esta turma não tem disciplinas na grade."
              description="Monte a grade da turma para acompanhar a frequência."
            />
          ) : (
            frequency.data!.data.map((f) => (
              <div
                key={f.classSubjectId}
                className="border-b border-flauzino-slate-200 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                  <span className="text-sm font-semibold text-flauzino-navy-900">
                    {f.subjectName}
                    <span className="ml-2 font-normal text-flauzino-slate-500">
                      {f.teacherName}
                    </span>
                  </span>
                  <span className="font-mono-ds text-xs text-flauzino-slate-500">
                    {f.lessonsSoFar} de {f.totalClassesPlanned} aulas dadas
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

        {/* Histórico do aluno */}
        <Card>
          <CardHeader
            title="Histórico do aluno"
            actions={
              <Select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={isTeacher && classId === ""}
                placeholder={
                  isTeacher && classId === ""
                    ? "Escolha a turma acima"
                    : studentOptions.length === 0
                      ? "Nenhum aluno disponível"
                      : "Selecione o aluno"
                }
                options={studentOptions}
                className="w-64"
              />
            }
          />
          {studentId === "" ? (
            <EmptyState
              title="Selecione um aluno para ver o histórico."
              description={
                isTeacher
                  ? "Escolha uma das suas turmas acima e depois o aluno."
                  : "Resumo por turma e a lista completa de presenças e ausências."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-0 xl:grid-cols-2 xl:divide-x xl:divide-flauzino-slate-200">
              <div>
                <div className="border-b border-flauzino-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-flauzino-slate-400">
                  Resumo por turma
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Turma</Th>
                      <Th>Presenças</Th>
                      <Th>Faltas</Th>
                      <Th>Frequência</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={4}
                      loading={summary.isPending}
                      error={summary.error ? friendlyError(summary.error) : null}
                      empty={summary.data?.data.length === 0}
                      emptyTitle="Sem registros para este aluno."
                    />
                    {summary.data?.data.map((s) => (
                      <Tr key={s.classId}>
                        <Td className="font-medium text-flauzino-navy-900">{s.name}</Td>
                        <Td className="font-mono-ds">{s.attended}</Td>
                        <Td className="font-mono-ds">{s.absent}</Td>
                        <Td>
                          <Badge variant={frequencyTone(s.frequencyPercent)}>
                            {formatPercent(s.frequencyPercent)}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div>
                <div className="border-b border-flauzino-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-flauzino-slate-400">
                  Registros de presença
                </div>
                <Table>
                  <thead>
                    <tr>
                      <Th>Turma</Th>
                      <Th>Sessão</Th>
                      <Th>Status</Th>
                      <Th>Reconhecido em</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={4}
                      loading={history.isPending}
                      error={history.error ? friendlyError(history.error) : null}
                      empty={history.data?.data.length === 0}
                      emptyTitle="Nenhum registro de presença."
                    />
                    {history.data?.data.map((h) => (
                      <Tr key={h.id}>
                        <Td className="font-medium text-flauzino-navy-900">
                          {h.classSession.classSubject.class.name}
                          <span className="block text-xs font-normal text-flauzino-slate-500">
                            {h.classSession.classSubject.subject.name}
                          </span>
                        </Td>
                        <Td className="font-mono-ds text-xs">
                          {formatDateTime(h.classSession.startedAt)}
                        </Td>
                        <Td>
                          <Badge variant={h.status === "present" ? "success" : h.status === "absent" ? "danger" : "neutral"}>
                            {attendanceStatusLabel[h.status] ?? h.status}
                          </Badge>
                        </Td>
                        <Td className="font-mono-ds text-xs">{formatDateTime(h.recognizedAt)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
