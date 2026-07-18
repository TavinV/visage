"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
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
  const isAdmin = user?.role === "admin";
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");

  // Turmas: professor/coordenação não têm GET /classes — o filtro fica para admin
  const classes = useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => api.get<Paginated<ClassItem>>(`/classes${qs({ limit: 100 })}`),
    enabled: isAdmin,
  });

  const students = useQuery({
    queryKey: ["users", "students-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "student", limit: 100 })}`),
    enabled: isAdmin,
  });

  const frequency = useQuery({
    queryKey: ["report-frequency", classId],
    queryFn: () =>
      api.get<{ data: FrequencyReport }>(
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
              isAdmin ? (
                <Select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  placeholder="Selecione a turma"
                  options={classes.data?.data.map((c) => ({ value: c.id, label: c.name })) ?? []}
                  className="w-64"
                />
              ) : undefined
            }
          />
          {!isAdmin && (
            <div className="border-b border-flauzino-slate-200 px-5 py-3 text-xs text-flauzino-slate-500">
              Peça à administração o vínculo das turmas — a seleção direta requer perfil administrador.
            </div>
          )}
          {classId === "" ? (
            <EmptyState
              title="Selecione uma turma para ver a frequência."
              description="O relatório mostra presenças, faltas e percentual por aluno."
            />
          ) : (
            <>
              {frequency.data && (
                <div className="border-b border-flauzino-slate-200 px-5 py-3 text-sm text-flauzino-slate-500">
                  <b className="font-semibold text-flauzino-navy-900">
                    {frequency.data.data.className}
                  </b>{" "}
                  · {frequency.data.data.totalClassesPlanned} aulas previstas
                </div>
              )}
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
                  <TableState
                    colSpan={4}
                    loading={frequency.isPending}
                    error={frequency.error ? friendlyError(frequency.error) : null}
                    empty={frequency.data?.data.students.length === 0}
                    emptyTitle="Nenhum registro de presença nesta turma."
                  />
                  {frequency.data?.data.students.map((s) => (
                    <Tr key={s.userId}>
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
            </>
          )}
        </Card>

        {/* Histórico do aluno */}
        <Card>
          <CardHeader
            title="Histórico do aluno"
            actions={
              isAdmin ? (
                <Select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Selecione o aluno"
                  options={
                    students.data?.data.map((s) => ({
                      value: s.id,
                      label: s.enrollmentCode ? `${s.name} (${s.enrollmentCode})` : s.name,
                    })) ?? []
                  }
                  className="w-64"
                />
              ) : undefined
            }
          />
          {studentId === "" ? (
            <EmptyState
              title="Selecione um aluno para ver o histórico."
              description="Resumo por turma e a lista completa de presenças e ausências."
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
                          {h.classSession.class.name}
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
