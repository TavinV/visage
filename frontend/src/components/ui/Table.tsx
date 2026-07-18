import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...rest} />
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-flauzino-slate-200 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-flauzino-slate-400",
        className
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-flauzino-slate-200 px-5 py-3 text-flauzino-slate-700", className)}
      {...rest}
    />
  );
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors last:[&>td]:border-b-0 hover:bg-flauzino-slate-100/60", className)}
      {...rest}
    />
  );
}

interface TableStateProps {
  colSpan: number;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

/** Linha única que cobre loading / erro / vazio de uma listagem. */
export function TableState({
  colSpan,
  loading,
  error,
  empty,
  emptyTitle = "Nenhum registro encontrado.",
  emptyDescription,
  emptyAction,
}: TableStateProps) {
  if (!loading && !error && !empty) return null;

  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : error ? (
          <p className="text-center text-sm text-flauzino-danger-600">{error}</p>
        ) : (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        )}
      </td>
    </tr>
  );
}
