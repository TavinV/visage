"use client";

import { cn } from "@/lib/cn";
import { roleOptions } from "./labels";

interface RolePickerProps {
  value: string;
  onChange: (role: "admin" | "manager" | "teacher" | "student") => void;
  error?: string;
  className?: string;
}

/** Seleção de cargo com ícones — cards tocáveis no lugar de um select. */
export function RolePicker({ value, onChange, error, className }: RolePickerProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-flauzino-navy-900">
        Cargo<span className="ml-0.5 text-flauzino-danger-600">*</span>
      </span>
      <div role="radiogroup" aria-label="Cargo" className="grid grid-cols-2 gap-2.5">
        {roleOptions.map((role) => {
          const selected = value === role.value;
          return (
            <button
              key={role.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(role.value)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150",
                "focus-visible:outline-none focus-visible:shadow-fl-focus",
                selected
                  ? "border-flauzino-accent-600 bg-flauzino-accent-50 shadow-fl-xs"
                  : "border-flauzino-slate-200 bg-white hover:border-flauzino-accent-500/50 hover:bg-flauzino-slate-50"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  selected
                    ? "bg-flauzino-accent-600 text-white"
                    : "bg-flauzino-slate-100 text-flauzino-slate-500"
                )}
              >
                <role.icon size={17} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 leading-tight">
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    selected ? "text-flauzino-accent-700" : "text-flauzino-navy-900"
                  )}
                >
                  {role.label}
                </span>
                <span className="block truncate text-[11px] text-flauzino-slate-500">
                  {role.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <span className="text-xs text-flauzino-danger-600">{error}</span>}
    </div>
  );
}
