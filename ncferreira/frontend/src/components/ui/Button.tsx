"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-flauzino-navy-900 text-white shadow-fl-xs hover:bg-flauzino-navy-800 hover:shadow-fl-sm active:bg-flauzino-navy-950",
  accent:
    "bg-flauzino-accent-600 text-white shadow-fl-xs hover:bg-flauzino-accent-700 hover:shadow-fl-sm",
  secondary:
    "bg-white text-flauzino-navy-900 border-flauzino-slate-300 shadow-fl-xs hover:border-flauzino-accent-500 hover:text-flauzino-accent-700 hover:shadow-fl-sm",
  ghost: "bg-transparent text-flauzino-slate-700 hover:bg-flauzino-slate-100 hover:text-flauzino-accent-700",
  danger: "bg-flauzino-danger-600 text-white shadow-fl-xs hover:brightness-95 hover:shadow-fl-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-4 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-8 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    block = false,
    loading = false,
    disabled,
    iconLeft,
    iconRight,
    className,
    children,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-semibold tracking-wide transition-colors duration-150",
        "focus-visible:outline-none focus-visible:shadow-fl-focus",
        "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0",
        variants[variant],
        sizes[size],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {!loading && iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});
