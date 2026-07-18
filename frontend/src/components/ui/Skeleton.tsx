import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-flauzino-slate-200", className)}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-flauzino-slate-300 border-t-flauzino-accent-600",
        className
      )}
    />
  );
}
