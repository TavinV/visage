"use client";

import { useEffect, useState } from "react";
import { KeyRound, Trash2, Wifi } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { deviceApi, deviceKeyStore, DeviceApiError } from "@/lib/deviceApi";

interface DeviceKeyModalProps {
  open: boolean;
  onClose: () => void;
  onKeyChange: (hasKey: boolean) => void;
}

/**
 * Configuração do totem: cola a chave de API gerada no painel (uma única
 * exibição em POST /devices), testa via heartbeat e persiste no dispositivo.
 */
export function DeviceKeyModal({ open, onClose, onKeyChange }: DeviceKeyModalProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const hasKey = !!deviceKeyStore.get();

  // Testa a conexão da chave já salva ao abrir
  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
    setConnected(null);
    if (deviceKeyStore.get()) {
      deviceApi
        .heartbeat()
        .then(() => setConnected(true))
        .catch(() => setConnected(false));
    }
  }, [open]);

  const save = async () => {
    const key = value.trim();
    if (!key) {
      setError("Cole a chave de acesso do dispositivo.");
      return;
    }
    setSaving(true);
    setError(null);
    // Valida a chave contra o backend antes de persistir
    const previous = deviceKeyStore.get();
    deviceKeyStore.set(key);
    try {
      await deviceApi.heartbeat();
      onKeyChange(true);
      setConnected(true);
      onClose();
    } catch (err) {
      if (previous) deviceKeyStore.set(previous);
      else deviceKeyStore.clear();
      setError(
        err instanceof DeviceApiError && err.status === 401
          ? "Chave inválida ou dispositivo inativo. Confira no painel, em Dispositivos."
          : "Não foi possível conectar ao servidor. Verifique a rede e tente de novo."
      );
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    deviceKeyStore.clear();
    onKeyChange(false);
    setConnected(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurar totem"
      description="A chave de acesso é exibida uma única vez ao registrar o dispositivo no painel."
      size="sm"
      footer={
        <>
          {hasKey && (
            <Button variant="ghost" onClick={clear} iconLeft={<Trash2 size={15} />}>
              Remover chave
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} iconLeft={<KeyRound size={15} />}>
            Salvar chave
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hasKey && (
          <div className="flex items-center justify-between rounded-lg bg-flauzino-slate-100 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-flauzino-slate-700">
              <Wifi size={15} className="text-flauzino-slate-500" />
              Chave configurada neste dispositivo
            </span>
            {connected === null ? (
              <Badge variant="neutral">Verificando…</Badge>
            ) : connected ? (
              <Badge variant="success" dot>Conectado</Badge>
            ) : (
              <Badge variant="danger" dot>Sem conexão</Badge>
            )}
          </div>
        )}
        <Input
          label={hasKey ? "Substituir chave" : "Chave de acesso do dispositivo"}
          placeholder="Cole aqui a chave de 64 caracteres"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          autoComplete="off"
          spellCheck={false}
          className="font-mono-ds"
        />
      </div>
    </Modal>
  );
}
