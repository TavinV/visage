"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, controlClasses } from "./Field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, icon, id, className, type, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 flex text-flauzino-slate-400">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          type={isPassword && revealed ? "text" : type}
          required={required}
          aria-invalid={!!error}
          className={cn("h-10", controlClasses(error), icon && "pl-10", isPassword && "pr-10")}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-3 flex rounded p-0.5 text-flauzino-slate-400 transition-colors hover:text-flauzino-accent-600"
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </Field>
  );
});
