"use client";

import type { ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface FilterButtonProps {
  /** Quantos filtros (fora a busca) estão com valor diferente do padrão. */
  count: number;
  onClick: () => void;
  className?: string;
}

/** Botão padrão que abre o FilterModal — mesma cara em toda listagem. */
export function FilterButton({ count, onClick, className }: FilterButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onClick}
      iconLeft={<ListFilter size={15} />}
      className={cn(className)}
    >
      Filtros
      {count > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-flauzino-accent-600 px-1 text-[11px] font-semibold leading-none text-white">
          {count}
        </span>
      )}
    </Button>
  );
}

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  /** Volta os filtros ao padrão; some do rodapé se omitido. */
  onClear?: () => void;
  /** Mesma contagem do FilterButton — desabilita "Limpar filtros" quando zero. */
  activeCount?: number;
  children: ReactNode;
}

/**
 * Container padrão para os filtros de uma listagem (status, data, categoria…).
 * A busca por texto continua sempre visível na barra da página — só o que
 * varia de tela para tela entra aqui, num único lugar em vez de uma fileira
 * de controles diferentes a cada página.
 */
export function FilterModal({ open, onClose, onClear, activeCount = 0, children }: FilterModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filtros"
      size="sm"
      footer={
        <>
          {onClear && (
            <Button variant="ghost" onClick={onClear} disabled={activeCount === 0}>
              Limpar filtros
            </Button>
          )}
          <Button onClick={onClose}>Aplicar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>
  );
}
