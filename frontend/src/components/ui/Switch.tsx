"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  hint?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, hint, id, className, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <label htmlFor={fieldId} className={cn("flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex">
        <input ref={ref} id={fieldId} type="checkbox" role="switch" className="peer sr-only" {...rest} />
        <span
          aria-hidden="true"
          className={cn(
            "block h-5 w-9 rounded-full bg-flauzino-slate-300 transition-colors duration-150",
            "peer-hover:bg-flauzino-slate-400",
            "peer-checked:bg-flauzino-accent-600 peer-checked:peer-hover:bg-flauzino-accent-700",
            "peer-focus-visible:shadow-fl-focus peer-disabled:opacity-45"
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-fl-sm transition-transform duration-150",
            "peer-checked:translate-x-4"
          )}
        />
      </span>
      {(label || hint) && (
        <span className="flex flex-col gap-0.5">
          {label && <span className="text-sm font-medium text-flauzino-navy-900">{label}</span>}
          {hint && <span className="text-xs text-flauzino-slate-500">{hint}</span>}
        </span>
      )}
    </label>
  );
});
