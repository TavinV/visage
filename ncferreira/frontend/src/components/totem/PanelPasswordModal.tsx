"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { panelPasswordCandidates } from "@/lib/deviceApi";

interface PanelPasswordModalProps {
  open: boolean;
  /** Template configurado no painel ({{data}}/{{hora}}). */
  template: string;
  onClose: () => void;
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 3;

/** Gate do painel oculto do totem — senha dinâmica validada no dispositivo. */
export function PanelPasswordModal({ open, template, onClose, onUnlock }: PanelPasswordModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
    setAttempts(0);
  }, [open]);

  const submit = () => {
    const candidates = panelPasswordCandidates(template);
    if (candidates.includes(value.trim())) {
      onUnlock();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setValue("");
    if (next >= MAX_ATTEMPTS) {
      onClose();
      return;
    }
    setError(`Senha incorreta. ${MAX_ATTEMPTS - next} tentativa${MAX_ATTEMPTS - next === 1 ? "" : "s"} restante${MAX_ATTEMPTS - next === 1 ? "" : "s"}.`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Painel do totem"
      description="Acesso restrito à administração da instituição."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} iconLeft={<Lock size={15} />}>
            Desbloquear
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          label="Senha do painel"
          type="password"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          className="font-mono-ds"
        />
      </form>
    </Modal>
  );
}
