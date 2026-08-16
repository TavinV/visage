"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock, Plus } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { ClassItem, Course, Location, Paginated, Subject, User } from "@/lib/types";
import { formatDuration, formatLessons } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import { cn } from "@/lib/cn";
import { Modal, Button, Input, Select, Field, useToast } from "@/components/ui";
import { TeacherPicker } from "@/components/app/TeacherPicker";

/** Linha da grade em construção. O primeiro professor é o responsável. */
interface GradeRow {
  subjectId: string;
  teacherIds: string[];
  lessonsPerSession: number;
  totalLessonsPlanned: number;
}

interface ClassWizardProps {
  /** Ausente = criando; presente = editando a turma. */
  editing?: ClassItem | null;
  onClose: () => void;
}

/**
 * Criação/edição de turma em duas etapas.
 *
 * A separação existe porque são duas decisões diferentes: primeiro que turma
 * é essa (nome, curso, sala), depois que disciplinas ela cursa e com quem.
 * Misturar tudo num formulário só deixava a grade espremida no rodapé.
 */
export function ClassWizard({ editing, onClose }: ClassWizardProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEditing = !!editing;

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(editing?.name ?? "");
  const [courseId, setCourseId] = useState(editing?.courseId ?? "");
  const [room, setRoom] = useState(editing?.room ?? "");
  const [locationId, setLocationId] = useState(editing?.locationId ?? "");
  const [grade, setGrade] = useState<GradeRow[]>(
    editing?.subjects.map((s) => ({
      subjectId: s.subjectId,
      // Responsável primeiro — é ele que o backend grava em teacherId
      teacherIds: s.teachers?.length ? s.teachers.map((t) => t.id) : [s.teacherId],
      lessonsPerSession: s.lessonsPerSession,
      totalLessonsPlanned: s.totalLessonsPlanned,
    })) ?? []
  );
  const [stepError, setStepError] = useState<string | null>(null);

  const courses = useQuery({
    queryKey: ["courses", "options"],
    queryFn: () => api.get<Paginated<Course>>(`/courses${qs({ limit: 100 })}`),
  });

  const locations = useQuery({
    queryKey: ["locations", "options"],
    queryFn: () => api.get<Paginated<Location>>(`/locations${qs({ limit: 100 })}`),
  });

  const teachers = useQuery({
    queryKey: ["users", "teacher-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "teacher", limit: 100 })}`),
  });

  // Catálogo do curso escolhido — só ele pode entrar na grade
  const subjects = useQuery({
    queryKey: ["subjects", "by-course", courseId],
    queryFn: () =>
      api.get<Paginated<Subject>>(`/subjects${qs({ courseId, isActive: true, limit: 100 })}`),
    enabled: courseId !== "",
  });

  const course = courses.data?.data.find((c) => c.id === courseId);
  const catalog = subjects.data?.data ?? [];
  const teacherName = (id: string) =>
    teachers.data?.data.find((t) => t.id === id)?.name ?? "O primeiro escolhido";

  // Trocar de curso invalida a grade: as disciplinas são de outro currículo
  useEffect(() => {
    if (!isEditing) setGrade([]);
  }, [courseId, isEditing]);

  const lessonsAssigned = useMemo(
    () => grade.reduce((sum, r) => sum + (r.lessonsPerSession || 0), 0),
    [grade]
  );

  const toggleSubject = (subjectId: string) => {
    setGrade((prev) =>
      prev.some((r) => r.subjectId === subjectId)
        ? prev.filter((r) => r.subjectId !== subjectId)
        : [
            ...prev,
            {
              subjectId,
              teacherIds: [],
              // A carga do currículo é o ponto de partida da turma
              lessonsPerSession:
                catalog.find((s) => s.id === subjectId)?.defaultLessonsPerSession ?? 1,
              totalLessonsPlanned:
                catalog.find((s) => s.id === subjectId)?.defaultTotalLessonsPlanned ?? 0,
            },
          ]
    );
  };

  const patchRow = (subjectId: string, patch: Partial<GradeRow>) => {
    setGrade((prev) => prev.map((r) => (r.subjectId === subjectId ? { ...r, ...patch } : r)));
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        room: room.trim() || undefined,
        locationId: locationId || undefined,
        subjects: grade,
      };
      return isEditing
        ? api.patch(`/classes/${editing!.id}`, body)
        : api.post("/classes", { ...body, courseId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success(isEditing ? "Turma atualizada." : "Turma criada.");
      onClose();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const goToStep2 = () => {
    if (!name.trim()) return setStepError("Informe o nome da turma.");
    if (!courseId) return setStepError("Selecione o curso.");
    setStepError(null);
    setStep(2);
  };

  const submit = () => {
    if (grade.length === 0) return setStepError("Escolha ao menos uma disciplina.");
    const semProfessor = grade.filter((r) => r.teacherIds.length === 0);
    if (semProfessor.length > 0) {
      const nomes = semProfessor
        .map((r) => catalog.find((s) => s.id === r.subjectId)?.name ?? "disciplina")
        .join(", ");
      return setStepError(`Escolha o professor de: ${nomes}.`);
    }
    setStepError(null);
    save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Editar ${editing!.name}` : "Criar turma"}
      description={
        step === 1
          ? "Etapa 1 de 2 — dados da turma"
          : "Etapa 2 de 2 — disciplinas e professores"
      }
      size="lg"
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={goToStep2} iconRight={<ArrowRight size={15} />}>
              Disciplinas
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(1)} iconLeft={<ArrowLeft size={15} />}>
              Voltar
            </Button>
            <Button onClick={submit} loading={save.isPending} iconLeft={<Check size={15} />}>
              {isEditing ? "Salvar turma" : "Criar turma"}
            </Button>
          </>
        )
      }
    >
      {/* Trilha das etapas */}
      <ol className="mb-5 flex items-center gap-3 text-xs font-medium">
        {[
          { n: 1 as const, label: "Dados da turma" },
          { n: 2 as const, label: "Disciplinas" },
        ].map(({ n, label }) => (
          <li key={n} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                step === n
                  ? "bg-flauzino-accent-600 text-white"
                  : step > n
                    ? "bg-flauzino-success-100 text-flauzino-success-600"
                    : "bg-flauzino-slate-100 text-flauzino-slate-400"
              )}
            >
              {step > n ? <Check size={12} strokeWidth={3} /> : n}
            </span>
            <span className={step === n ? "text-flauzino-navy-900" : "text-flauzino-slate-500"}>
              {label}
            </span>
            {n === 1 && <span className="ml-1 h-px w-8 bg-flauzino-slate-200" />}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nome da turma"
            required
            placeholder="3º A — Manhã"
            className="sm:col-span-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Curso"
            required
            disabled={isEditing}
            hint={
              isEditing
                ? "O curso não muda: a grade e o histórico estão presos a ele."
                : "Define a grade de aulas e o catálogo de disciplinas."
            }
            placeholder="Selecione o curso"
            options={courses.data?.data.map((c) => ({ value: c.id, label: c.name })) ?? []}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          />
          <Select
            label="Sala de aula"
            placeholder="Sem sala vinculada"
            hint="Sala padrão para as chamadas desta turma."
            options={locations.data?.data.map((l) => ({ value: l.id, label: l.name })) ?? []}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          />
          <Input
            label="Sala (texto livre)"
            placeholder="Sala 12"
            hint="Use quando a sala não estiver cadastrada."
            className="sm:col-span-2"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />

          {course && (
            <div className="flex items-start gap-2 rounded-lg bg-flauzino-accent-50 px-3 py-2.5 text-sm text-flauzino-navy-900 sm:col-span-2">
              <Clock size={15} className="mt-0.5 shrink-0 text-flauzino-accent-600" />
              <span>
                {course.name} tem <strong>{course.lessonsPerDay} aulas por dia</strong> de{" "}
                <strong>{formatDuration(course.lessonDurationMin)}</strong> cada.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-flauzino-slate-600">
              Escolha as disciplinas que esta turma cursa e quem leciona cada uma.
            </p>
            {course && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 font-mono-ds text-xs font-semibold",
                  lessonsAssigned > course.lessonsPerDay
                    ? "bg-flauzino-warning-100 text-flauzino-warning-600"
                    : "bg-flauzino-slate-100 text-flauzino-slate-600"
                )}
                title="Soma das aulas por chamada de todas as disciplinas"
              >
                {lessonsAssigned} / {course.lessonsPerDay} aulas do dia
              </span>
            )}
          </div>

          {subjects.isPending ? (
            <p className="text-sm text-flauzino-slate-500">Carregando disciplinas…</p>
          ) : catalog.length === 0 ? (
            <div className="rounded-lg bg-flauzino-slate-100 px-4 py-6 text-center">
              <p className="text-sm text-flauzino-navy-900">
                Este curso ainda não tem disciplinas no catálogo.
              </p>
              <p className="mt-1 text-xs text-flauzino-slate-500">
                Cadastre-as na página do curso antes de montar a turma.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {catalog.map((s) => {
                const row = grade.find((r) => r.subjectId === s.id);
                const chosen = !!row;
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "rounded-lg border transition-colors",
                      chosen
                        ? "border-flauzino-accent-500 bg-flauzino-accent-50/40"
                        : "border-flauzino-slate-200"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "flex h-[18px] w-[18px] items-center justify-center rounded border",
                          chosen
                            ? "border-flauzino-accent-600 bg-flauzino-accent-600 text-white"
                            : "border-flauzino-slate-300 bg-white text-transparent"
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span className="flex-1 text-sm font-medium text-flauzino-navy-900">
                        {s.name}
                        {s.code && (
                          <span className="ml-2 font-mono-ds text-xs text-flauzino-slate-500">
                            {s.code}
                          </span>
                        )}
                      </span>
                      {chosen && course && (
                        <span className="font-mono-ds text-xs text-flauzino-slate-500">
                          {formatDuration(course.lessonDurationMin * row.lessonsPerSession)} por
                          chamada
                        </span>
                      )}
                    </button>

                    {chosen && (
                      <div className="flex flex-col gap-3 border-t border-flauzino-slate-200 px-3 py-3">
                        <TeacherPicker
                          label="Professores"
                          required
                          hint={
                            row.teacherIds.length > 1
                              ? `${teacherName(row.teacherIds[0])} responde pela disciplina; os demais também abrem chamada.`
                              : "Pode alocar mais de um — todos abrem a chamada desta disciplina."
                          }
                          teachers={teachers.data?.data ?? []}
                          loading={teachers.isPending}
                          value={row.teacherIds}
                          onChange={(ids) => patchRow(s.id, { teacherIds: ids })}
                        />
                        <div className="flex gap-3">
                          <Field label="Aulas por chamada" className="w-40">
                            <Input
                              type="number"
                              min={1}
                              max={12}
                              value={row.lessonsPerSession}
                              onChange={(e) =>
                                patchRow(s.id, {
                                  lessonsPerSession: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                            />
                          </Field>
                          <Field
                            label="Aulas no período"
                            hint="Denominador da frequência do aluno."
                            className="w-56"
                          >
                            <Input
                              type="number"
                              min={0}
                              value={row.totalLessonsPlanned}
                              onChange={(e) =>
                                patchRow(s.id, {
                                  totalLessonsPlanned: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {grade.length > 0 && (
            <p className="text-xs text-flauzino-slate-500">
              {grade.length === 1
                ? "1 disciplina na grade"
                : `${grade.length} disciplinas na grade`}
              {course && lessonsAssigned > course.lessonsPerDay && (
                <span className="ml-1 text-flauzino-warning-600">
                  — a soma passa das {formatLessons(course.lessonsPerDay)} do dia. É permitido,
                  mas confira se a grade está certa.
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {stepError && (
        <p className="mt-4 rounded-lg bg-flauzino-danger-100 px-3 py-2 text-sm text-flauzino-danger-600">
          {stepError}
        </p>
      )}
    </Modal>
  );
}

/** Botão que abre o wizard em modo criação. */
export function CreateClassButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} iconLeft={<Plus size={16} />}>
      Criar turma
    </Button>
  );
}
