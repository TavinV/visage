"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Field, controlClasses } from "./Field";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, id, className, rows = 3, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        className={cn("py-2.5", controlClasses(error))}
        {...rest}
      />
    </Field>
  );
});
