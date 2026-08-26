"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  MonitorSmartphone,
  ScanFace,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Device } from "@/lib/types";
import { friendlyError } from "@/lib/apiError";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Modal, Button, Badge, Checkbox, Skeleton, useToast } from "@/components/ui";

// ── Tipos espelhando o backend/engine ─────────────────────────────────────────

interface RecognitionOption {
  profile: "conservative" | "balanced" | "liberal";
  profile_label: string;
  threshold: number;
  genuine_accept_rate: number;
  impostor_reject_rate: number;
  false_rejection_rate: number;
  false_acceptance_rate: number;
  youden_score: number;
  interpretation: string;
}

interface RecognitionCalibration {
  dprime: number;
  eer: number;
  auc: number;
  options: RecognitionOption[];
  recommended_profile: string;
  recommended_threshold: number;
  confidence: "low" | "medium" | "high";
  warning?: string | null;
  overall_interpretation: string;
  persons_processed: Array<{ person_id: string; photo_count: number; failed_photos: number }>;
  impostor_count: number;
}

interface ThresholdAnalysis {
  suggested_value: number;
  real_pass_rate: number;
  attack_block_rate: number;
  youden_score: number;
  confidence: "low" | "medium" | "high";
  interpretation: string;
  /** Apenas em liveness_analysis: média dos scores reais + 0.15, para o cadastro. */
  suggested_enrollment_value?: number | null;
}

interface LivenessCalibration {
  liveness_analysis: ThresholdAnalysis;
  hsv_analysis: ThresholdAnalysis;
  overall_interpretation: string;
  warning?: string | null;
}

interface CalibrationResults {
  computedAt: string;
  recognition?: RecognitionCalibration;
  recognitionError?: string;
  liveness?: LivenessCalibration;
  livenessError?: string;
}

interface CalibrationReport {
  active: boolean;
  phase: "genuine" | "impostor" | "attack" | "done";
  people: number;
  photosCurrentPerson: number;
  photosPerPerson: number;
  genuineTotal: number;
  impostors: number;
  attacks: number;
  limits: {
    minPeople: number;
    minImpostors: number;
    minAttacks: number;
    maxPeople: number;
    maxImpostors: number;
    maxAttacks: number;
  };
  canComputeRecognition: boolean;
  canComputeLiveness: boolean;
  hasResults: boolean;
  results: CalibrationResults | null;
}

const phaseLabels: Record<string, string> = {
  genuine: "Etapa 1 · Grupo 1",
  impostor: "Etapa 2 · Grupo 2",
  attack: "Etapa 3 · Teste da foto",
  done: "Coleta concluída",
};

const confidenceLabels: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  high: { label: "Confiança alta", variant: "success" },
  medium: { label: "Confiança média", variant: "warning" },
  low: { label: "Confiança baixa", variant: "danger" },
};

const fmtNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(digits);

interface CalibrationModalProps {
  /** Totem que vai conduzir a coleta — a calibração é dele, não da instituição. */
  device: Device;
  onClose: () => void;
}

/**
 * Calibração guiada de um totem: acompanha a coleta em três etapas, calcula
 * os limiares via índice de Youden na engine e aplica o perfil escolhido
 * neste totem (e o limiar do cadastro, que é da instituição).
 */
export function CalibrationModal({ device, onClose }: CalibrationModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const deviceId = device.id;
  const deviceName = device.label ?? device.deviceFingerprint;
  const [running, setRunning] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [applyLiveness, setApplyLiveness] = useState(true);

  const report = useQuery({
    queryKey: ["calibration", deviceId],
    queryFn: () => api.get<{ data: CalibrationReport }>(`/devices/${deviceId}/calibration`),
    enabled: running,
    refetchInterval: 2500,
  });

  const start = useMutation({
    mutationFn: () => api.post(`/devices/${deviceId}/calibration/start`),
    onSuccess: () => setRunning(true),
    onError: (error) => toast.error(friendlyError(error)),
  });

  const compute = useMutation({
    mutationFn: () =>
      api.post<{ data: CalibrationResults }>(`/devices/${deviceId}/calibration/compute`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["calibration", deviceId] });
      const rec = res.data.recognition;
      if (rec) setSelectedProfile(rec.recommended_profile);
      toast.success("Cálculo concluído.");
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const stopAndClose = async () => {
    if (running) {
      try {
        await api.delete(`/devices/${deviceId}/calibration`);
      } catch {
        // TTL do Redis encerra sozinho — falha aqui não bloqueia o fechamento
      }
    }
    onClose();
  };

  const data = report.data?.data;
  const results = data?.results ?? null;
  const recognition = results?.recognition;
  const liveness = results?.liveness;

  const selectedOption = useMemo(
    () =>
      recognition?.options.find(
        (o) => o.profile === (selectedProfile ?? recognition.recommended_profile)
      ) ?? null,
    [recognition, selectedProfile]
  );

  const apply = useMutation({
    mutationFn: async () => {
      // A calibração vale para ESTE totem: a câmera e a iluminação medidas
      // aqui não são as do totem da sala ao lado
      const devicePatch: Record<string, number> = {};
      if (selectedOption) devicePatch.recognitionThreshold = selectedOption.threshold;
      if (applyLiveness && liveness) {
        devicePatch.livenessThreshold = liveness.liveness_analysis.suggested_value;
      }
      if (Object.keys(devicePatch).length === 0) {
        throw new Error("Nada selecionado para aplicar.");
      }
      await api.put(`/devices/${deviceId}/calibration/settings`, devicePatch);

      // O limiar do cadastro biométrico é da instituição — não existe por
      // totem no modelo, e o cadastro é um fluxo único
      const enrollmentValue =
        applyLiveness && liveness
          ? liveness.liveness_analysis.suggested_enrollment_value
          : null;
      if (enrollmentValue != null) {
        await api.patch("/tenant-settings", { livenessThresholdEnrollment: enrollmentValue });
      }

      await api.delete(`/devices/${deviceId}/calibration`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success(`Calibração aplicada a ${deviceName}.`);
      onClose();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const collectStat = (label: string, value: string, ok: boolean) => (
    <div
      className={cn(
        "rounded-lg border p-3",
        ok ? "border-flauzino-success-100 bg-flauzino-success-100/40" : "border-flauzino-slate-200"
      )}
    >
      <dt className="text-[11px] font-medium uppercase tracking-wide text-flauzino-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-mono-ds text-xl font-semibold text-flauzino-navy-900">{value}</dd>
    </div>
  );

  return (
    <Modal
      open
      onClose={stopAndClose}
      title={`Calibrar pelo totem — ${deviceName}`}
      description="A coleta é guiada na tela deste totem e o resultado vale só para ele: câmera e iluminação mudam de sala para sala. Depois dá para copiar a calibração para outros totens."
      size="lg"
      footer={
        !running ? (
          <>
            <Button variant="secondary" onClick={stopAndClose}>Cancelar</Button>
            <Button
              onClick={() => start.mutate()}
              loading={start.isPending}
              iconLeft={<Activity size={15} />}
            >
              Iniciar calibração
            </Button>
          </>
        ) : results ? (
          <>
            <Button variant="secondary" onClick={stopAndClose}>Encerrar sem aplicar</Button>
            <Button
              onClick={() => apply.mutate()}
              loading={apply.isPending}
              disabled={!selectedOption && !(applyLiveness && liveness)}
              iconLeft={<CheckCircle2 size={15} />}
            >
              Aplicar a este totem
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={stopAndClose}>Encerrar</Button>
            <Button
              onClick={() => compute.mutate()}
              loading={compute.isPending}
              disabled={!data || (!data.canComputeRecognition && !data.canComputeLiveness)}
              iconLeft={<Activity size={15} />}
            >
              {compute.isPending ? "Calculando…" : "Calcular resultados"}
            </Button>
          </>
        )
      }
    >
      {!running ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-flauzino-slate-600">
            Antes de começar, reúna <b className="font-semibold text-flauzino-navy-900">5 pessoas</b>{" "}
            perto do totem e tenha um celular à mão. A tela do totem explica cada passo;
            aqui você só acompanha e aplica o resultado no fim.
          </p>
          <ul className="flex flex-col gap-2.5">
            <li className="flex items-start gap-3 rounded-lg bg-flauzino-slate-100 px-4 py-3">
              <UserRound size={16} className="mt-0.5 shrink-0 text-flauzino-accent-600" />
              <span className="text-[13px] leading-relaxed text-flauzino-slate-700">
                <b className="font-semibold text-flauzino-navy-900">Grupo 1 — 2 pessoas.</b>{" "}
                O totem tira 3 fotos de cada uma. São os rostos que ele vai aprender a reconhecer.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-lg bg-flauzino-slate-100 px-4 py-3">
              <Users size={16} className="mt-0.5 shrink-0 text-flauzino-accent-600" />
              <span className="text-[13px] leading-relaxed text-flauzino-slate-700">
                <b className="font-semibold text-flauzino-navy-900">Grupo 2 — 3 pessoas.</b>{" "}
                Uma foto de cada. Servem para o totem aprender a diferença entre elas e as do grupo 1.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-lg bg-flauzino-slate-100 px-4 py-3">
              <Smartphone size={16} className="mt-0.5 shrink-0 text-flauzino-accent-600" />
              <span className="text-[13px] leading-relaxed text-flauzino-slate-700">
                <b className="font-semibold text-flauzino-navy-900">Teste da foto.</b>{" "}
                Alguém mostra à câmera a foto de um rosto na tela do celular — é assim que o
                totem aprende a recusar quem tenta se passar por outra pessoa.
              </span>
            </li>
          </ul>
          <p className="text-[13px] leading-relaxed text-flauzino-slate-500">
            Ao iniciar, a tela do totem muda sozinha em até 10 segundos.
          </p>
        </div>
      ) : !results ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between rounded-lg bg-flauzino-slate-100 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-flauzino-slate-700">
              <MonitorSmartphone size={16} className="text-flauzino-slate-500" />
              {deviceName}
            </span>
            {data ? (
              <Badge variant={data.phase === "done" ? "success" : "accent"} dot>
                {phaseLabels[data.phase]}
              </Badge>
            ) : (
              <Badge variant="warning" dot>Aguardando o totem</Badge>
            )}
          </div>

          {report.isPending && !data ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            data && (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {collectStat(
                    "Pessoas do grupo 1",
                    `${data.people}/${data.limits.minPeople}+`,
                    data.people >= data.limits.minPeople
                  )}
                  {collectStat("Fotos do grupo 1", `${data.genuineTotal}`, data.genuineTotal >= 4)}
                  {collectStat(
                    "Pessoas do grupo 2",
                    `${data.impostors}/${data.limits.minImpostors}+`,
                    data.impostors >= data.limits.minImpostors
                  )}
                  {collectStat(
                    "Fotos na tela",
                    `${data.attacks}/${data.limits.minAttacks}+`,
                    data.attacks >= data.limits.minAttacks
                  )}
                </dl>

                <div className="flex flex-col gap-2 text-[13px] text-flauzino-slate-600">
                  <span className="flex items-center gap-2">
                    <ScanFace size={14} className={data.canComputeRecognition ? "text-flauzino-success-600" : "text-flauzino-slate-400"} />
                    Reconhecimento: {data.canComputeRecognition ? "pronto para calcular" : "aguardando os dois grupos de pessoas"}
                  </span>
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} className={data.canComputeLiveness ? "text-flauzino-success-600" : "text-flauzino-slate-400"} />
                    Vivacidade: {data.canComputeLiveness ? "pronto para calcular" : "aguardando o teste da foto na tela"}
                  </span>
                </div>

                {compute.isPending && (
                  <p className="rounded-lg bg-flauzino-accent-50 px-4 py-3 text-[13px] text-flauzino-slate-700">
                    Processando as imagens — pode levar até um minuto.
                  </p>
                )}
              </>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── Reconhecimento ── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-flauzino-navy-900">
                <ScanFace size={16} className="text-flauzino-accent-600" />
                Reconhecimento facial
              </h4>
              {recognition && (
                <div className="flex items-center gap-2">
                  <Badge variant={confidenceLabels[recognition.confidence].variant}>
                    {confidenceLabels[recognition.confidence].label}
                  </Badge>
                </div>
              )}
            </div>

            {recognition ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <span
                    title="O quanto os rostos do grupo 1 se distinguem dos do grupo 2 (d′)"
                    className="rounded-full bg-flauzino-slate-100 px-3 py-1 font-mono-ds text-xs text-flauzino-slate-600"
                  >
                    Separação {fmtNum(recognition.dprime)}
                  </span>
                  <span
                    title="Precisão geral do modelo nesta calibração (AUC)"
                    className="rounded-full bg-flauzino-slate-100 px-3 py-1 font-mono-ds text-xs text-flauzino-slate-600"
                  >
                    Precisão {fmtNum(recognition.auc, 3)}
                  </span>
                  <span
                    title="Taxa de erro no ponto de equilíbrio entre falsos positivos e negativos (EER)"
                    className="rounded-full bg-flauzino-slate-100 px-3 py-1 font-mono-ds text-xs text-flauzino-slate-600"
                  >
                    Taxa de erro {formatPercent(recognition.eer * 100)}
                  </span>
                  <span className="rounded-full bg-flauzino-slate-100 px-3 py-1 font-mono-ds text-xs text-flauzino-slate-600">
                    <Users size={11} className="mr-1 inline" />
                    {recognition.persons_processed.length} no grupo 1 · {recognition.impostor_count} no grupo 2
                  </span>
                </div>

                <div role="radiogroup" aria-label="Perfil de limiar" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {recognition.options.map((option) => {
                    const selected =
                      option.profile === (selectedProfile ?? recognition.recommended_profile);
                    const recommended = option.profile === recognition.recommended_profile;
                    return (
                      <button
                        key={option.profile}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSelectedProfile(option.profile)}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all duration-150",
                          selected
                            ? "border-flauzino-accent-600 bg-flauzino-accent-50 shadow-fl-xs"
                            : "border-flauzino-slate-200 bg-white hover:border-flauzino-accent-500/50"
                        )}
                      >
                        <span className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              selected ? "text-flauzino-accent-700" : "text-flauzino-navy-900"
                            )}
                          >
                            {option.profile_label}
                          </span>
                          {recommended && <Badge variant="accent">Recomendado</Badge>}
                        </span>
                        <span className="font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
                          {fmtNum(option.threshold, 4)}
                        </span>
                        <span className="text-[11px] leading-relaxed text-flauzino-slate-500">
                          Reconhece {formatPercent(option.genuine_accept_rate * 100, 0)} de quem é do grupo 1
                          {" · "}barra {formatPercent(option.impostor_reject_rate * 100, 0)} de quem é de fora
                        </span>
                        <span
                          title="Índice de equilíbrio entre acertos e bloqueios (índice de Youden)"
                          className="font-mono-ds text-[11px] text-flauzino-slate-400"
                        >
                          Equilíbrio {fmtNum(option.youden_score)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedOption && (
                  <p className="mt-3 rounded-lg bg-flauzino-slate-50 px-4 py-3 text-[13px] leading-relaxed text-flauzino-slate-600">
                    {selectedOption.interpretation}
                  </p>
                )}

                {recognition.warning && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-flauzino-warning-100 px-4 py-3 text-[13px] leading-relaxed text-flauzino-slate-700">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-flauzino-warning-600" />
                    {recognition.warning}
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-flauzino-danger-100 px-4 py-3 text-[13px] text-flauzino-slate-700">
                {results.recognitionError ?? "Reconhecimento não calculado — faltaram pessoas em algum dos grupos."}
              </p>
            )}
          </section>

          {/* ── Vivacidade ── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-flauzino-navy-900">
                <ShieldCheck size={16} className="text-flauzino-accent-600" />
                Vivacidade (proteção contra fraudes)
              </h4>
              {liveness && (
                <Badge variant={confidenceLabels[liveness.liveness_analysis.confidence].variant}>
                  {confidenceLabels[liveness.liveness_analysis.confidence].label}
                </Badge>
              )}
            </div>

            {liveness ? (
              <div className="rounded-xl border border-flauzino-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-flauzino-slate-400">
                        Limiar sugerido (chamada)
                      </p>
                      <p className="font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
                        {fmtNum(liveness.liveness_analysis.suggested_value)}
                      </p>
                    </div>
                    {liveness.liveness_analysis.suggested_enrollment_value != null && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-flauzino-slate-400">
                          Limiar sugerido (cadastro)
                        </p>
                        <p className="font-mono-ds text-2xl font-semibold text-flauzino-navy-900">
                          {fmtNum(liveness.liveness_analysis.suggested_enrollment_value)}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[12px] text-flauzino-slate-500">
                    <p>
                      Rostos reais aceitos:{" "}
                      <b className="font-mono-ds text-flauzino-success-600">
                        {formatPercent(liveness.liveness_analysis.real_pass_rate * 100, 0)}
                      </b>
                    </p>
                    <p>
                      Fotos na tela barradas:{" "}
                      <b className="font-mono-ds text-flauzino-success-600">
                        {formatPercent(liveness.liveness_analysis.attack_block_rate * 100, 0)}
                      </b>
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-flauzino-slate-600">
                  {liveness.liveness_analysis.interpretation}
                </p>
                <div className="mt-4 border-t border-flauzino-slate-200 pt-3">
                  <Checkbox
                    label="Aplicar limiares de vivacidade sugeridos (chamada e cadastro)"
                    checked={applyLiveness}
                    onChange={(e) => setApplyLiveness(e.target.checked)}
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-flauzino-slate-100 px-4 py-3 text-[13px] text-flauzino-slate-600">
                {results.livenessError ?? "Vivacidade não calculada — o teste da foto na tela não foi feito."}
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
