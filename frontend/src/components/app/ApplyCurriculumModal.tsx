"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Layers, TriangleAlert } from "lucide-react";
import { api, qs } from "@/lib/api";
import type {
  ApplyCurriculumResult,
  ClassItem,
  Course,
  Paginated,
  Subject,
  User,
} from "@/lib/types";
import { friendlyError } from "@/lib/apiError";
import { cn } from "@/lib/cn";
import { Modal, Button, Input, Select, Field, useToast } from "@/components/ui";
import { TeacherPicker } from "@/components/app/TeacherPicker";

/** Linha do currículo sendo aplicada. */
interface CurriculumRow {
  subjectId: string;
  teacherIds: string[];
  lessonsPerSession: number;
  totalLessonsPlanned: number;
}

interface ApplyCurriculumModalProps {
  course: Course;
  onClose: () => void;
}

const existingOptions = [
  {
    value: "skip",
    label: "Manter como está (só preenche o que falta)",
  },
  { value: "sync", label: "Atualizar a carga, preservando os professores" },
  { value: "replace", label: "Atualizar carga e professores" },
];

/**
 * Aplica a grade do curso em várias turmas de uma vez.
 *
 * Numa faculdade, as 50 turmas de Engenharia de Software cursam as mesmas
 * disciplinas; o que muda é quem leciona. Montar isso turma a turma é o que
 * inviabiliza o cadastro — aqui a secretaria escolhe as disciplinas uma vez,
 * define o professor de cada uma e ajusta depois só onde for diferente.
 */
export function ApplyCurriculumModal({ course, onClose }: ApplyCurriculumModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [rows, setRows] = useState<CurriculumRow[]>([]);
  const [allClasses, setAllClasses] = useState(true);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [existing, setExisting] = useState("skip");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyCurriculumResult | null>(null);

  const subjects = useQuery({
    queryKey: ["subjects", "by-course", course.id, "active"],
    queryFn: () =>
      api.get<Paginated<Subject>>(
        `/subjects${qs({ courseId: course.id, isActive: true, limit: 100 })}`
      ),
  });

  const classes = useQuery({
    queryKey: ["classes", "by-course", course.id],
    queryFn: () =>
      api.get<Paginated<ClassItem>>(`/classes${qs({ courseId: course.id, limit: 100 })}`),
  });

  const teachers = useQuery({
    queryKey: ["users", "teacher-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ role: "teacher", limit: 100 })}`),
  });

  const catalog = subjects.data?.data ?? [];
  const classList = classes.data?.data ?? [];
  const targetCount = allClasses ? classList.length : classIds.length;

  const toggleSubject = (subject: Subject) => {
    setError(null);
    setRows((prev) =>
      prev.some((r) => r.subjectId === subject.id)
        ? prev.filter((r) => r.subjectId !== subject.id)
        : [
            ...prev,
            {
              subjectId: subject.id,
              teacherIds: [],
              // A carga do currículo é o padrão; a turma pode divergir depois
              lessonsPerSession: subject.defaultLessonsPerSession,
              totalLessonsPlanned: subject.defaultTotalLessonsPlanned,
            },
          ]
    );
  };

  const patchRow = (subjectId: string, patch: Partial<CurriculumRow>) =>
    setRows((prev) => prev.map((r) => (r.subjectId === subjectId ? { ...r, ...patch } : r)));

  const toggleClass = (classId: string) =>
    setClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );

  const apply = useMutation({
    mutationFn: () =>
      api.post<{ data: ApplyCurriculumResult }>(`/courses/${course.id}/curriculum/apply`, {
        subjects: rows,
        classIds: allClasses ? undefined : classIds,
        existing,
      }),
    onSuccess: (res) => {
      setResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (err) => {
      setError(friendlyError(err));
      toast.error(friendlyError(err));
    },
  });

  const submit = () => {
    if (rows.length === 0) return setError("Escolha ao menos uma disciplina.");
    const semProfessor = rows.filter((r) => r.teacherIds.length === 0);
    if (semProfessor.length > 0) {
      const nomes = semProfessor
        .map((r) => catalog.find((s) => s.id === r.subjectId)?.name ?? "disciplina")
        .join(", ");
      return setError(`Escolha o professor de: ${nomes}.`);
    }
    if (targetCount === 0) return setError("Escolha ao menos uma turma.");
    setError(null);
    apply.mutate();
  };

  const summary = useMemo(() => {
    if (!result) return null;
    const parts = [
      `${result.created} disciplina(s) adicionada(s)`,
      result.updated > 0 ? `${result.updated} atualizada(s)` : null,
      result.skipped > 0 ? `${result.skipped} preservada(s)` : null,
    ].filter(Boolean);
    return `${parts.join(", ")} em ${result.classesAffected} turma(s).`;
  }, [result]);

  // ── Resultado ───────────────────────────────────────────────────────────────

  if (result) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Grade aplicada"
        description={summary ?? undefined}
        size="lg"
        footer={<Button onClick={onClose}>Concluir</Button>}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Adicionadas", value: result.created },
              { label: "Atualizadas", value: result.updated },
              { label: "Preservadas", value: result.skipped },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-flauzino-slate-200 px-4 py-3"
              >
                <p className="text-xs text-flauzino-slate-500">{item.label}</p>
                <p className="mt-0.5 font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {result.skipped > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-flauzino-warning-100 px-3 py-2.5 text-[13px] leading-relaxed text-flauzino-slate-700">
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-flauzino-warning-600" />
              As disciplinas preservadas já existiam na turma com professor e carga próprios.
              Para sobrescrever, aplique de novo escolhendo o que fazer com as existentes.
            </p>
          )}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-flauzino-slate-200">
            <table className="w-full text-[13px]">
              <tbody>
                {result.details.map((d, i) => (
                  <tr key={`${d.classId}-${d.subjectName}-${i}`} className="border-b border-flauzino-slate-200 last:border-b-0">
                    <td className="px-3 py-2 text-flauzino-navy-900">{d.className}</td>
                    <td className="px-3 py-2 text-flauzino-slate-600">{d.subjectName}</td>
                    <td className="px-3 py-2 text-right text-xs text-flauzino-slate-500">
                      {d.action === "created"
                        ? "adicionada"
                        : d.action === "updated"
                          ? "atualizada"
                          : (d.reason ?? "preservada")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Formulário ──────────────────────────────────────────────────────────────

  return (
    <Modal
      open
      onClose={onClose}
      title="Aplicar grade às turmas"
      description={`As disciplinas escolhidas entram nas turmas de ${course.name}.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={apply.isPending} iconLeft={<Layers size={15} />}>
            Aplicar em {targetCount} turma{targetCount === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Disciplinas */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-flauzino-navy-900">
            Disciplinas do currículo
          </p>
          {subjects.isPending ? (
            <p className="text-sm text-flauzino-slate-500">Carregando disciplinas…</p>
          ) : catalog.length === 0 ? (
            <p className="rounded-lg bg-flauzino-slate-100 px-4 py-3 text-sm text-flauzino-slate-600">
              Este curso ainda não tem disciplinas ativas no catálogo.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {catalog.map((s) => {
                const row = rows.find((r) => r.subjectId === s.id);
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
                      onClick={() => toggleSubject(s)}
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
                      <span className="font-mono-ds text-xs text-flauzino-slate-500">
                        {s.classCount ?? 0} turma(s)
                      </span>
                    </button>

                    {chosen && (
                      <div className="flex flex-col gap-3 border-t border-flauzino-slate-200 px-3 py-3">
                        <TeacherPicker
                          label="Professores"
                          required
                          hint="O primeiro escolhido responde pela disciplina em todas as turmas — dá para trocar turma a turma depois."
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
                            hint="Denominador da frequência."
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
        </div>

        {/* Turmas alvo */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-flauzino-navy-900">Turmas</p>
          {classes.isPending ? (
            <p className="text-sm text-flauzino-slate-500">Carregando turmas…</p>
          ) : classList.length === 0 ? (
            <p className="rounded-lg bg-flauzino-slate-100 px-4 py-3 text-sm text-flauzino-slate-600">
              Este curso ainda não tem turmas.
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                {[
                  { value: true, label: `Todas as ${classList.length}` },
                  { value: false, label: "Escolher turmas" },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setAllClasses(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      allClasses === opt.value
                        ? "border-flauzino-accent-600 bg-flauzino-accent-600 text-white"
                        : "border-flauzino-slate-300 bg-white text-flauzino-navy-900 hover:border-flauzino-accent-500"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {!allClasses && (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-flauzino-slate-200 p-3">
                  {classList.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClass(c.id)}
                      aria-pressed={classIds.includes(c.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        classIds.includes(c.id)
                          ? "border-flauzino-accent-600 bg-flauzino-accent-600 text-white"
                          : "border-flauzino-slate-300 bg-white text-flauzino-navy-900 hover:border-flauzino-accent-500"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <Select
          label="Se a turma já cursa a disciplina"
          hint="A frequência já registrada nunca é apagada — só a configuração da disciplina muda."
          options={existingOptions}
          value={existing}
          onChange={(e) => setExisting(e.target.value)}
        />

        {error && (
          <p className="rounded-lg bg-flauzino-danger-100 px-3 py-2 text-sm text-flauzino-danger-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
