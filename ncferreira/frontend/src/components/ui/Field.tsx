import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** Wrapper de campo: label 500, hint/erro abaixo — padrão do design system. */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-flauzino-navy-900">
          {label}
          {required && <span className="ml-0.5 text-flauzino-danger-600">*</span>}
        </label>
      )}
      {children}
      {(hint || error) && (
        <span className={cn("text-xs", error ? "text-flauzino-danger-600" : "text-flauzino-slate-500")}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

/** Classes compartilhadas pelos controles de formulário (input/select/textarea). */
export const controlClasses = (error?: string) =>
  cn(
    "w-full rounded-lg border bg-white px-4 text-sm text-flauzino-navy-900 shadow-fl-inset",
    "placeholder:text-flauzino-slate-400 transition-colors duration-150",
    "focus:outline-none focus:border-flauzino-accent-500 focus:shadow-fl-focus",
    "disabled:cursor-not-allowed disabled:bg-flauzino-slate-100 disabled:text-flauzino-slate-500",
    error
      ? "border-flauzino-danger-600"
      : "border-flauzino-slate-300 hover:border-flauzino-slate-400"
  );
