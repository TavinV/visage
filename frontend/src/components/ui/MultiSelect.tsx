"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, controlClasses } from "./Field";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Agrupa a opção sob um cabeçalho — ex.: a área de um evento de auditoria. */
  group?: string;
}

export interface MultiSelectProps {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 380;
const MIN_POPOVER_HEIGHT = 180;
const VIEWPORT_MARGIN = 16;

/**
 * Select de múltipla escolha com busca — para listas longas demais para um
 * <select> nativo (dezenas de eventos, por exemplo), onde escolher só um de
 * cada vez também não bate com o uso real ("quero ver criação E exclusão").
 */
export function MultiSelect({
  label,
  hint,
  error,
  placeholder = "Todos",
  searchPlaceholder = "Buscar…",
  options,
  value,
  onChange,
  className,
}: MultiSelectProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const overflowsRight = r.left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_MARGIN;

      // Um trigger no meio de um Modal alto pode não ter os 380px cheios nem
      // acima nem abaixo — sem isso, "abrir pra cima" jogava o popover pra
      // fora do topo da tela (top negativo). Em vez de assumir uma altura
      // fixa, mede o espaço de verdade e encolhe a lista pra caber nele.
      const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_MARGIN;
      const spaceAbove = r.top - VIEWPORT_MARGIN;
      const openUp = spaceBelow < MIN_POPOVER_HEIGHT && spaceAbove > spaceBelow;
      const available = Math.max(MIN_POPOVER_HEIGHT, openUp ? spaceAbove : spaceBelow);
      const maxHeight = Math.min(POPOVER_HEIGHT, available);

      setPos({
        left: overflowsRight ? Math.max(VIEWPORT_MARGIN, r.right - POPOVER_WIDTH) : r.left,
        top: openUp
          ? Math.max(VIEWPORT_MARGIN, r.top - maxHeight - 6)
          : r.bottom + 6,
        maxHeight,
      });
    };
    updatePosition();
    const focusTimer = requestAnimationFrame(() => searchRef.current?.focus());

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Captura, não bolha: o Modal por trás também escuta Escape no
      // document, e um listener não interrompe outro no mesmo alvo e fase —
      // só pegando o evento na fase de captura garante que o popover fecha
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
      cancelAnimationFrame(focusTimer);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)
    );
  }, [options, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MultiSelectOption[]>();
    for (const o of filtered) {
      const key = o.group ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const toggle = (v: string) => {
    onChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const selected = options.filter((o) => selectedSet.has(o.value));
  const triggerText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} selecionados`;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId} className={className}>
      <div className="relative flex items-center">
        <button
          ref={triggerRef}
          id={fieldId}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={!!error}
          className={cn(
            "h-10 pr-9 text-left",
            controlClasses(error),
            value.length > 0 && "pr-14",
            selected.length === 0 && "text-flauzino-slate-400"
          )}
        >
          <span className="block truncate">{triggerText}</span>
        </button>
        {value.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            aria-label="Limpar seleção"
            className="absolute right-8 flex rounded p-0.5 text-flauzino-slate-400 transition-colors hover:text-flauzino-accent-600"
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3.5 text-flauzino-slate-400"
          aria-hidden="true"
        />
      </div>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            aria-label={label ?? "Opções"}
            aria-multiselectable="true"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              maxHeight: pos.maxHeight,
            }}
            className="z-50 flex flex-col overflow-hidden rounded-xl border border-flauzino-slate-200 bg-white shadow-fl-lg"
          >
            <div className="border-b border-flauzino-slate-200 p-2">
              <div className="relative flex items-center">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 text-flauzino-slate-400"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-lg border border-flauzino-slate-200 bg-flauzino-slate-50 pl-8 pr-2 text-sm text-flauzino-navy-900 placeholder:text-flauzino-slate-400 focus:border-flauzino-accent-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {grouped.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-flauzino-slate-400">
                  Nada encontrado.
                </p>
              ) : (
                grouped.map(([group, opts]) => (
                  <div key={group || "_"}>
                    {group && (
                      <div className="sticky top-0 bg-white px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-flauzino-slate-400">
                        {group}
                      </div>
                    )}
                    {opts.map((o) => {
                      const checked = selectedSet.has(o.value);
                      const Icon = o.icon;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => toggle(o.value)}
                          aria-pressed={checked}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-flauzino-slate-50",
                            checked && "bg-flauzino-accent-50/60"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-flauzino-accent-600 bg-flauzino-accent-600 text-white"
                                : "border-flauzino-slate-300 bg-white text-transparent"
                            )}
                          >
                            <Check size={11} strokeWidth={3} />
                          </span>
                          {Icon && (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-flauzino-accent-50 text-flauzino-accent-600">
                              <Icon size={13} strokeWidth={1.75} />
                            </span>
                          )}
                          <span className="truncate text-flauzino-navy-900">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </Field>
  );
}
