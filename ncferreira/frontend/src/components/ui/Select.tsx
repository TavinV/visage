"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, controlClasses } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, options, placeholder, id, className, children, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <div className="relative flex items-center">
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={!!error}
          className={cn("h-10 appearance-none pr-10", controlClasses(error))}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3.5 text-flauzino-slate-400"
          aria-hidden="true"
        />
      </div>
    </Field>
  );
});
