import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Card branco com hairline slate-200 e sombra navy suave. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-flauzino-slate-200 bg-white shadow-fl-sm transition-shadow duration-200",
        className
      )}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  /** Ícone Lucide opcional, exibido num quadrado com tinta accent suave. */
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, icon, actions, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-flauzino-slate-200 px-5 py-4",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-flauzino-accent-50 text-flauzino-accent-600">
            {icon}
          </span>
        )}
        <div>
          <h3 className="text-[15px] font-semibold text-flauzino-navy-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-flauzino-slate-500">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}
