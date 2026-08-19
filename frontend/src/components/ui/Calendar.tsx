"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CalendarProps {
  /** Data selecionada, formato YYYY-MM-DD. */
  value?: string | null;
  onChange: (value: string) => void;
  /** Limites seletáveis, mesmo formato — fora do intervalo o dia fica desabilitado. */
  min?: string;
  max?: string;
  className?: string;
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface DayCell {
  y: number;
  m: number;
  d: number;
  outside: boolean;
}

function parseIso(value?: string | null): { y: number; m: number; d: number } | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayParts(): { y: number; m: number; d: number } {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

/**
 * Grade de mês em aritmética pura de calendário (sem `new Date(isoString)`,
 * que interpreta "YYYY-MM-DD" como UTC e vira o dia em fusos negativos como o
 * do Brasil). Só usa `Date` para descobrir dia da semana e tamanho do mês —
 * nunca para carregar o valor selecionado.
 */
export function Calendar({ value, onChange, min, max, className }: CalendarProps) {
  const selected = parseIso(value);
  const today = todayParts();

  const [view, setView] = useState(() => selected ?? today);

  const weeks = useMemo(() => {
    const startWeekday = new Date(view.y, view.m, 1).getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const daysInPrevMonth = new Date(view.y, view.m, 0).getDate();

    const cells: DayCell[] = [];
    const prevMonth = view.m === 0 ? 11 : view.m - 1;
    const prevYear = view.m === 0 ? view.y - 1 : view.y;
    for (let i = startWeekday - 1; i >= 0; i--) {
      cells.push({ y: prevYear, m: prevMonth, d: daysInPrevMonth - i, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ y: view.y, m: view.m, d, outside: false });
    }
    const nextMonth = view.m === 11 ? 0 : view.m + 1;
    const nextYear = view.m === 11 ? view.y + 1 : view.y;
    let nextDay = 1;
    while (cells.length < 42) {
      cells.push({ y: nextYear, m: nextMonth, d: nextDay++, outside: true });
    }

    const rows: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [view]);

  const changeMonth = (delta: number) => {
    setView((v) => {
      let m = v.m + delta;
      let y = v.y;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { y, m, d: 1 };
    });
  };

  const isDisabled = (iso: string) => (min && iso < min) || (max && iso > max) || false;
  const selectedIso = selected ? toIso(selected.y, selected.m, selected.d) : null;
  const todayIso = toIso(today.y, today.m, today.d);

  return (
    <div className={cn("w-72 select-none", className)}>
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Mês anterior"
          className="rounded-lg p-1.5 text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900 focus-visible:outline-none focus-visible:shadow-fl-focus"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-flauzino-navy-900">
          {MONTH_LABELS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Próximo mês"
          className="rounded-lg p-1.5 text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900 focus-visible:outline-none focus-visible:shadow-fl-focus"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 justify-items-center gap-y-1 px-1">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="flex h-8 w-9 items-center justify-center text-[11px] font-semibold uppercase text-flauzino-slate-400"
          >
            {w}
          </span>
        ))}

        {weeks.flat().map((cell, i) => {
          const iso = toIso(cell.y, cell.m, cell.d);
          const isSelected = selectedIso === iso;
          const isToday = todayIso === iso;
          const disabled = isDisabled(iso);

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (cell.outside) setView({ y: cell.y, m: cell.m, d: 1 });
                onChange(iso);
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:shadow-fl-focus",
                disabled && "cursor-not-allowed text-flauzino-slate-300",
                !disabled && !isSelected && cell.outside && "text-flauzino-slate-300 hover:bg-flauzino-slate-100",
                !disabled && !isSelected && !cell.outside && "text-flauzino-navy-900 hover:bg-flauzino-accent-50",
                isSelected && "bg-flauzino-accent-600 text-white shadow-fl-xs hover:bg-flauzino-accent-700",
                !isSelected && isToday && "ring-1 ring-inset ring-flauzino-accent-500"
              )}
            >
              {cell.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
