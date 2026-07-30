"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationMeta } from "@/lib/types";
import { Button } from "./Button";

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-flauzino-slate-200 px-5 py-3">
      <span className="font-mono-ds text-xs text-flauzino-slate-500">
        Página {page} de {totalPages} · {total} registros
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          iconLeft={<ChevronLeft size={14} />}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          iconRight={<ChevronRight size={14} />}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
