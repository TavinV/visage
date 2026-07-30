"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  hint?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, id, className, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <label htmlFor={fieldId} className={cn("flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex">
        <input ref={ref} id={fieldId} type="checkbox" className="peer sr-only" {...rest} />
        <span
          aria-hidden="true"
          className={cn(
            "flex h-[18px] w-[18px] items-center justify-center rounded border border-flauzino-slate-300 bg-white text-transparent shadow-fl-inset transition-all duration-150",
            "hover:border-flauzino-accent-500",
            "peer-checked:border-flauzino-accent-600 peer-checked:bg-flauzino-accent-600 peer-checked:text-white peer-checked:shadow-fl-xs",
            "peer-focus-visible:shadow-fl-focus peer-disabled:opacity-45"
          )}
        >
          <Check size={12} strokeWidth={3} />
        </span>
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
