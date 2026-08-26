"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Copy, RotateCcw, SlidersHorizontal } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Device, Paginated } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import {
  Modal,
  Button,
  Input,
  Checkbox,
  Badge,
  ConfirmDialog,
  useToast,
} from "@/components/ui";

interface DeviceCalibrationModalProps {
  device: Device;
  onClose: () => void;
  /** Abre a coleta guiada na tela deste totem (CalibrationModal). */
  onStartGuided: () => void;
}

/**
 * Ajuste fino e propagação da calibração de um totem.
 *
 * Os limiares são overrides do totem: vazio herda o valor da instituição.
 * A coleta guiada (CalibrationModal) preenche esses mesmos campos — aqui é
 * onde se corrige à mão e se copia uma calibração boa para totens de salas
 * equivalentes, sem repetir a coleta inteira.
 */
export function DeviceCalibrationModal({
  device,
  onClose,
  onStartGuided,
}: DeviceCalibrationModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const calibration = device.calibration;

  const [recognition, setRecognition] = useState("");
  const [liveness, setLiveness] = useState("");
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [resetting, setResetting] = useState(false);

  // Campo vazio = herda; por isso o override nulo vira string vazia
  useEffect(() => {
    setRecognition(calibration?.recognitionThreshold?.toString() ?? "");
    setLiveness(calibration?.livenessThreshold?.toString() ?? "");
    setCopyTargets([]);
  }, [device.id, calibration?.recognitionThreshold, calibration?.livenessThreshold]);

  const others = useQuery({
    queryKey: ["devices", "copy-targets"],
    queryFn: () => api.get<Paginated<Device>>(`/devices${qs({ limit: 100 })}`),
  });

  const targetDevices = others.data?.data.filter((d) => d.id !== device.id) ?? [];

  const save = useMutation({
    mutationFn: () =>
      api.put(`/devices/${device.id}/calibration/settings`, {
        recognitionThreshold: recognition === "" ? null : Number(recognition),
        livenessThreshold: liveness === "" ? null : Number(liveness),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Calibração do totem salva.");
      onClose();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const reset = useMutation({
    mutationFn: () => api.delete(`/devices/${device.id}/calibration/settings`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Totem voltou a usar os limiares da instituição.");
      setResetting(false);
      onClose();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const copy = useMutation({
    mutationFn: () =>
      api.post(`/devices/${device.id}/calibration/copy`, { targetDeviceIds: copyTargets }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success(
        copyTargets.length === 1
          ? "Calibração copiada para 1 totem."
          : `Calibração copiada para ${copyTargets.length} totens.`
      );
      setCopyTargets([]);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const toggleTarget = (id: string) =>
    setCopyTargets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );

  const deviceName = device.label ?? device.deviceFingerprint;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Calibração — ${deviceName}`}
        description="Calibre pela câmera do totem ou ajuste os limiares à mão. Campo vazio herda o valor da instituição."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Salvar calibração
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-lg bg-flauzino-slate-100 px-3 py-2.5">
            <span className="text-sm text-flauzino-slate-600">
              {calibration?.isCalibrated ? (
                <>
                  Calibrado em{" "}
                  <strong className="text-flauzino-navy-900">
                    {formatDateTime(calibration.calibratedAt)}
                  </strong>
                  {calibration.calibrationSourceLabel && (
                    <> · copiado de {calibration.calibrationSourceLabel}</>
                  )}
                </>
              ) : (
                "Ainda não calibrado — usando os limiares da instituição."
              )}
            </span>
            {calibration?.isCalibrated ? (
              <Badge variant="accent" dot>
                Próprio
              </Badge>
            ) : (
              <Badge variant="neutral">Herdado</Badge>
            )}
          </div>

          {/* Caminho principal: medir na própria sala em vez de chutar números */}
          <div className="rounded-xl border border-flauzino-accent-100 bg-flauzino-accent-50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-medium text-flauzino-navy-900">
              <Activity size={15} className="text-flauzino-accent-600" />
              Calibrar pelo totem
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-flauzino-slate-600">
              O próprio totem conduz a coleta na tela: cinco pessoas passam pela câmera e ele
              descobre os números certos para a luz desta sala. Leva poucos minutos.
            </p>
            <Button
              size="sm"
              className="mt-3"
              disabled={!device.isActive}
              onClick={onStartGuided}
              iconLeft={<Activity size={14} />}
            >
              {calibration?.isCalibrated ? "Calibrar de novo" : "Começar calibração"}
            </Button>
            {!device.isActive && (
              <p className="mt-2 text-xs text-flauzino-slate-500">
                Ative o dispositivo para poder calibrar.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Input
              label="Limiar de reconhecimento"
              type="number"
              step="0.01"
              min={0.3}
              max={2}
              placeholder={`${calibration?.effectiveRecognitionThreshold ?? 1.1} (instituição)`}
              hint="Menor = mais rígido."
              value={recognition}
              onChange={(e) => setRecognition(e.target.value)}
              className="flex-1"
            />
            <Input
              label="Limiar de vivacidade"
              type="number"
              step="0.01"
              min={0.5}
              max={0.95}
              placeholder={`${calibration?.effectiveLivenessThreshold ?? 0.85} (instituição)`}
              hint="Maior = mais rígido."
              value={liveness}
              onChange={(e) => setLiveness(e.target.value)}
              className="flex-1"
            />
          </div>

          {calibration?.isCalibrated && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResetting(true)}
                iconLeft={<RotateCcw size={14} />}
              >
                Voltar aos limiares da instituição
              </Button>
            </div>
          )}

          {/* Propagação para totens equivalentes */}
          <div className="border-t border-flauzino-slate-200 pt-5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-flauzino-navy-900">
              <Copy size={15} className="text-flauzino-accent-600" />
              Copiar esta calibração para outros totens
            </h3>
            <p className="mt-1 text-xs text-flauzino-slate-500">
              Útil para salas com câmera e iluminação parecidas — evita repetir a coleta
              guiada em cada totem.
            </p>

            {!calibration?.isCalibrated ? (
              <p className="mt-3 rounded-lg bg-flauzino-slate-100 px-3 py-2.5 text-sm text-flauzino-slate-500">
                Calibre este totem antes de copiar a configuração dele.
              </p>
            ) : targetDevices.length === 0 ? (
              <p className="mt-3 rounded-lg bg-flauzino-slate-100 px-3 py-2.5 text-sm text-flauzino-slate-500">
                Não há outros totens registrados.
              </p>
            ) : (
              <>
                <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-flauzino-slate-200">
                  <ul className="divide-y divide-flauzino-slate-100">
                    {targetDevices.map((d) => (
                      <li key={d.id} className="px-3 py-2.5 hover:bg-flauzino-slate-50">
                        <Checkbox
                          checked={copyTargets.includes(d.id)}
                          onChange={() => toggleTarget(d.id)}
                          label={d.label ?? d.deviceFingerprint}
                          hint={
                            d.calibration?.isCalibrated
                              ? "Já calibrado — será sobrescrito"
                              : "Usando os limiares da instituição"
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  disabled={copyTargets.length === 0}
                  loading={copy.isPending}
                  onClick={() => copy.mutate()}
                  iconLeft={<SlidersHorizontal size={14} />}
                >
                  {copyTargets.length === 0
                    ? "Selecione os totens de destino"
                    : `Copiar para ${copyTargets.length} ${copyTargets.length === 1 ? "totem" : "totens"}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() => reset.mutate()}
        title="Descartar calibração do totem"
        description={`${deviceName} volta a usar os limiares da instituição no reconhecimento.`}
        confirmLabel="Descartar calibração"
        danger
        loading={reset.isPending}
      />
    </>
  );
}
