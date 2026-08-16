"use client";

/**
 * "Mostrar inativos" — o interruptor que existe em toda listagem com exclusão
 * lógica (planos, instituições, usuários, totens, salas, períodos, disciplinas).
 *
 * Por que: no produto, "excluir" quase nunca apaga a linha — desativa. Sem
 * este filtro, um plano desativado continuava disputando a tela com os que
 * estão à venda, e não havia como distinguir "sumiu" de "está inativo".
 * Padrão: desligado (só ativos). Ligado, os inativos voltam à lista e vêm
 * marcados pela `InactiveRow`.
 */

import { EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

export function ShowInactiveToggle({
  checked,
  onChange,
  label = "Mostrar inativos",
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border px-3.5 text-[13px] font-medium transition-colors",
        checked
          ? "border-flauzino-accent-100 bg-flauzino-accent-50 text-flauzino-accent-700"
          : "border-flauzino-slate-200 bg-white text-flauzino-slate-600 hover:border-flauzino-slate-300",
        className
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          "peer-focus-visible:shadow-fl-focus",
          checked
            ? "border-flauzino-accent-600 bg-flauzino-accent-600 text-white"
            : "border-flauzino-slate-300 bg-white text-transparent"
        )}
      >
        <EyeOff size={11} strokeWidth={2.5} />
      </span>
      {label}
    </label>
  );
}

/**
 * Classe da linha de um registro inativo: ele aparece, mas não compete com os
 * ativos. O `[&>td]` alcança as células porque a opacidade precisa valer para
 * o conteúdo da linha inteira, inclusive badges.
 */
export const inactiveRowClass = "bg-flauzino-slate-100/40 [&>td]:opacity-60";
