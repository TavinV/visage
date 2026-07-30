import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "neutral" | "accent" | "success" | "warning" | "danger" | "solid";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  dot?: boolean;
}

const variants: Record<Variant, string> = {
  neutral: "bg-flauzino-slate-100 text-flauzino-slate-700 border-flauzino-slate-200",
  accent: "bg-flauzino-accent-50 text-flauzino-accent-700 border-flauzino-accent-100",
  success: "bg-flauzino-success-100 text-flauzino-success-600 border-transparent",
  warning: "bg-flauzino-warning-100 text-flauzino-warning-600 border-transparent",
  danger: "bg-flauzino-danger-100 text-flauzino-danger-600 border-transparent",
  solid: "bg-flauzino-navy-900 text-white border-transparent",
};

export function Badge({ variant = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold leading-none tracking-wide",
        variants[variant],
        className
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
