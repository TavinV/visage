"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, controlClasses } from "./Field";
import { Calendar } from "./Calendar";

export interface DatePickerProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  /** YYYY-MM-DD, ou "" quando não há data escolhida. */
  value?: string | null;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** Mostra um botão para limpar a data — útil em filtros, não em campos obrigatórios. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}

const POPOVER_WIDTH = 304;
const POPOVER_HEIGHT = 356;

function formatDisplay(value?: string | null): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Trigger com a cara de um Input, mas abre o Calendar num popover portalado —
 * assim ele escapa do overflow-hidden de Card/Modal em vez de ficar cortado.
 */
export function DatePicker({
  label,
  hint,
  error,
  required,
  placeholder = "dd/mm/aaaa",
  value,
  onChange,
  min,
  max,
  clearable = false,
  disabled,
  className,
}: DatePickerProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const overflowsRight = r.left + POPOVER_WIDTH > window.innerWidth - 16;
      const spaceBelow = window.innerHeight - r.bottom - 16;
      const spaceAbove = r.top - 16;
      const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
      setPos({
        left: overflowsRight ? Math.max(16, r.right - POPOVER_WIDTH) : r.left,
        // Clampado a 16px do topo — sem isso, um trigger no meio de um Modal
        // alto virava um top negativo e o calendário nascia fora da tela.
        top: openUp ? Math.max(16, r.top - POPOVER_HEIGHT - 6) : r.bottom + 6,
      });
    };

    updatePosition();

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Captura, não bolha: o Modal por trás também escuta Escape no
      // document — só pegando na fase de captura o popover garante que fecha
      // sozinho, sem levar o Modal junto.
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3.5 flex text-flauzino-slate-400">
          <CalendarDays size={16} />
        </span>
        <button
          ref={triggerRef}
          id={fieldId}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={!!error}
          className={cn(
            "h-10 text-left",
            controlClasses(error),
            "pl-10",
            clearable && value && "pr-8",
            !value && "text-flauzino-slate-400"
          )}
        >
          {value ? formatDisplay(value) : placeholder}
        </button>
        {clearable && value && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            aria-label="Limpar data"
            className="absolute right-3 flex rounded p-0.5 text-flauzino-slate-400 transition-colors hover:text-flauzino-accent-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Escolher data"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 rounded-xl border border-flauzino-slate-200 bg-white p-3 shadow-fl-lg"
          >
            <Calendar
              value={value}
              min={min}
              max={max}
              onChange={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
          </div>,
          document.body
        )}
    </Field>
  );
}
