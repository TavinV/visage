"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { User } from "@/lib/types";
import { Field, Input, Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";

interface TeacherPickerProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  teachers: User[];
  loading?: boolean;
  /** IDs selecionados. */
  value: string[];
  onChange: (userIds: string[]) => void;
  /** Um só professor (o da disciplina na turma) em vez de vários. */
  single?: boolean;
}

/**
 * Seleção de professores em pílulas clicáveis.
 *
 * Tudo é pílula: a selecionada fica preenchida, a disponível fica em
 * contorno. Sem lista com checkbox — a mesma informação em dois lugares
 * fazia o olho procurar duas vezes.
 */
export function TeacherPicker({
  label,
  hint,
  error,
  required,
  teachers,
  loading,
  value,
  onChange,
  single = false,
}: TeacherPickerProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  // Selecionados primeiro: quem já está escolhido não pode sumir por causa
  // de um filtro digitado depois
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? teachers.filter(
          (t) =>
            t.name.toLowerCase().includes(q) || (t.email ?? "").toLowerCase().includes(q)
        )
      : teachers;
    const chosen = teachers.filter((t) => selected.has(t.id));
    const rest = matches.filter((t) => !selected.has(t.id));
    return [...chosen, ...rest];
  }, [teachers, query, selected]);

  const toggle = (userId: string) => {
    if (single) {
      onChange(selected.has(userId) ? [] : [userId]);
      return;
    }
    onChange(selected.has(userId) ? value.filter((id) => id !== userId) : [...value, userId]);
  };

  // Busca só ajuda quando a lista é grande o bastante para atrapalhar
  const showSearch = teachers.length > 8;

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {showSearch && (
        <Input
          placeholder="Buscar professor"
          icon={<Search size={15} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {loading ? (
        <p className="text-sm text-flauzino-slate-500">Carregando professores…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-flauzino-slate-500">
          {teachers.length === 0
            ? "Nenhum professor cadastrado nesta instituição."
            : "Nenhum professor corresponde à busca."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visible.map((t) => {
            const isSelected = selected.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-medium transition-colors duration-150",
                  "focus:outline-none focus-visible:shadow-fl-focus",
                  isSelected
                    ? "border-flauzino-accent-600 bg-flauzino-accent-600 text-white"
                    : "border-flauzino-slate-300 bg-white text-flauzino-navy-900 hover:border-flauzino-accent-500 hover:bg-flauzino-accent-50"
                )}
              >
                {isSelected ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : (
                  <Avatar name={t.name} size="xs" />
                )}
                {t.name}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}
