"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScanFace, UserPlus, KeyRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import {
  deviceApi,
  deviceKeyStore,
  DeviceApiError,
  type CalibrationProgress,
  type CurrentSession,
  type DeviceContext,
} from "@/lib/deviceApi";
import { TotemCamera } from "@/components/totem/TotemCamera";
import { TotemClock } from "@/components/totem/TotemClock";
import { DeviceKeyModal } from "@/components/totem/DeviceKeyModal";
import { PanelPasswordModal } from "@/components/totem/PanelPasswordModal";
import { EnrollmentWizard } from "@/components/totem/EnrollmentWizard";
import { CalibrationMode } from "@/components/totem/CalibrationMode";
import { useTotemSounds } from "@/components/totem/useTotemSounds";
import type { TotemResult } from "@/components/totem/TotemStage";

const RESULT_DURATION_MS = 3400;

type Mode = "idle" | "attendance" | "enroll" | "calibration";

function resultFor(
  status: string,
  personName?: string,
  preAttendance?: boolean,
  confidence?: number
): TotemResult {
  switch (status) {
    case "identified":
      return preAttendance
        ? {
            kind: "success",
            title: "Pré-presença registrada",
            message: `${personName ?? "Aluno"}, sua presença será confirmada quando a chamada abrir.`,
            confidence,
          }
        : {
            kind: "success",
            title: "Presença confirmada",
            message: `Boa aula, ${personName ?? "aluno"}.`,
            confidence,
          };
    case "not_identified":
      return {
        kind: "error",
        title: "Não foi possível identificar",
        message: "Seu rosto não está entre os alunos desta chamada. Procure a coordenação.",
      };
    case "liveness_failed":
      return {
        kind: "error",
        title: "Verificação de vivacidade reprovada",
        message: "Use o próprio rosto — fotos e telas são bloqueadas pelo sistema.",
      };
    case "no_face_detected":
      return {
        kind: "warning",
        title: "Nenhum rosto detectado",
        message: "Aproxime-se e posicione o rosto dentro da guia.",
      };
    case "multiple_faces_detected":
      return {
        kind: "warning",
        title: "Mais de um rosto na imagem",
        message: "Uma pessoa por vez diante do totem, por favor.",
      };
    case "no_active_session":
      return {
        kind: "warning",
        title: "Nenhuma chamada aberta",
        message: "Aguarde o professor abrir a chamada para registrar presença.",
      };
    default:
      return {
        kind: "error",
        title: "Não foi possível registrar",
        message: "Ocorreu um erro no reconhecimento. Tente novamente em instantes.",
      };
  }
}

export default function TotemPage() {
  const { playSuccess, playError } = useTotemSounds();

  const [hasKey, setHasKey] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [context, setContext] = useState<DeviceContext | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<TotemResult | null>(null);
  const [calibration, setCalibration] = useState<CalibrationProgress | null>(null);

  const [panelPasswordOpen, setPanelPasswordOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  const tapCount = useRef(0);
  const tapTimer = useRef<number | null>(null);
  const resultTimer = useRef<number | null>(null);

  useEffect(() => {
    setHasKey(!!deviceKeyStore.get());
    return () => {
      if (resultTimer.current) window.clearTimeout(resultTimer.current);
    };
  }, []);

  // Contexto do dispositivo (instituição, fuso, senha do painel, cadastro)
  useEffect(() => {
    if (!hasKey) {
      setContext(null);
      return;
    }
    let cancelled = false;
    deviceApi
      .context()
      .then((ctx) => !cancelled && setContext(ctx))
      .catch(() => !cancelled && setContext(null));
    return () => {
      cancelled = true;
    };
  }, [hasKey]);

  // Sessão aberta na sala do totem — sonda a cada 25s
  useEffect(() => {
    if (!hasKey) {
      setSession(null);
      return;
    }
    let cancelled = false;
    const load = () =>
      deviceApi
        .currentSession()
        .then((s) => !cancelled && setSession(s))
        .catch(() => !cancelled && setSession(null));
    load();
    const interval = window.setInterval(load, 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasKey, mode]);

  // Modo calibração acionado pelo painel — sonda a cada 10s
  useEffect(() => {
    if (!hasKey) return;
    let cancelled = false;
    const check = () =>
      deviceApi
        .calibrationProgress()
        .then((progress) => {
          if (cancelled) return;
          setCalibration(progress.active ? progress : null);
          setMode((current) => {
            if (progress.active && current === "idle") return "calibration";
            if (!progress.active && current === "calibration") return "idle";
            return current;
          });
        })
        .catch(() => undefined);
    check();
    const interval = window.setInterval(check, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasKey]);

  const requireKey = (action: () => void) => {
    if (!deviceKeyStore.get()) {
      setKeyModalOpen(true);
      return;
    }
    action();
  };

  const closeCamera = useCallback(() => {
    setResult(null);
    setProcessing(false);
    setMode("idle");
  }, []);

  const presentResult = useCallback(
    (r: TotemResult) => {
      // Avisos (sem rosto, várias pessoas) são silenciosos: no fluxo
      // automático eles acontecem com frequência e o som viraria ruído
      if (r.kind === "success") playSuccess();
      else if (r.kind === "error") playError();
      setResult(r);
      if (resultTimer.current) window.clearTimeout(resultTimer.current);
      resultTimer.current = window.setTimeout(() => setResult(null), RESULT_DURATION_MS);
    },
    [playSuccess, playError]
  );

  const handleCapture = useCallback(
    async (imageB64: string) => {
      setProcessing(true);
      try {
        const data = await deviceApi.recognize(imageB64);
        presentResult(resultFor(data.status, data.personName, data.preAttendance, data.confidence));
      } catch (error) {
        if (error instanceof DeviceApiError && error.status === 401) {
          presentResult({
            kind: "error",
            title: "Totem desautorizado",
            message: "A chave deste dispositivo foi revogada. Configure uma nova chave.",
          });
        } else if (error instanceof DeviceApiError && error.status === 429) {
          presentResult({
            kind: "warning",
            title: "Muitas tentativas",
            message: "Aguarde alguns segundos antes de tentar novamente.",
          });
        } else {
          presentResult(resultFor("error"));
        }
      } finally {
        setProcessing(false);
      }
    },
    [presentResult]
  );

  // 5 toques na marca abrem o painel oculto (com senha, quando configurada)
  const handleSecretTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      if (hasKey && context?.panelPassword) setPanelPasswordOpen(true);
      else setKeyModalOpen(true);
      return;
    }
    tapTimer.current = window.setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
  };

  const onKeyChange = (nowHasKey: boolean) => {
    setHasKey(nowHasKey);
    if (!nowHasKey) {
      setContext(null);
      closeCamera();
    }
  };

  const clockTimezone = context?.clockTimezone ?? "local";
  const subtitle = context?.deviceLabel
    ? `Totem de chamada · ${context.deviceLabel}`
    : context?.tenantName
      ? context.tenantName
      : "Totem de chamada";

  return (
    <div className="relative min-h-screen touch-manipulation select-none overflow-hidden bg-white">
      {/* Marca no topo do descanso — alvo dos 5 toques do painel oculto */}
      <button
        type="button"
        onClick={handleSecretTap}
        aria-label="Visage"
        className="fixed left-1/2 top-[9%] z-30 -translate-x-1/2 cursor-default text-flauzino-navy-900 focus:outline-none"
      >
        <Logo variant="lockup" size={36} />
      </button>

      {/* Modo descanso — relógio central gigante */}
      <AnimatePresence>
        {mode === "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-20 flex flex-col items-center justify-between gap-6 overflow-y-auto px-6 pb-8 pt-24 md:pb-12 md:pt-[16%]"
          >
            <div className="flex flex-1 flex-col items-center justify-center gap-4 md:gap-5">
              <TotemClock timezone={clockTimezone} variant="hero" />
              <p className="text-lg text-flauzino-slate-600 md:text-xl">{subtitle}</p>
              {hasKey && session && (
                <span className="inline-flex items-center gap-2 rounded-full border border-flauzino-accent-100 bg-flauzino-accent-50 px-4 py-2 text-sm font-medium text-flauzino-accent-700">
                  <span className="h-2 w-2 rounded-full bg-flauzino-accent-600" />
                  Chamada aberta · {session.className}
                </span>
              )}
            </div>

            <div className="flex w-full max-w-xl shrink-0 flex-col items-center gap-4 md:gap-5">
              <div className="flex w-full flex-col gap-3 sm:flex-row">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => requireKey(() => setMode("attendance"))}
                  className="flex min-h-[60px] flex-1 items-center justify-center gap-3 whitespace-nowrap rounded-xl bg-flauzino-navy-900 px-5 py-4 text-lg font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-navy-800 focus-visible:outline-none focus-visible:shadow-fl-focus md:min-h-[64px]"
                >
                  <ScanFace size={24} strokeWidth={1.75} />
                  Registrar presença
                </motion.button>
                {context?.allowEnrollment && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => requireKey(() => setMode("enroll"))}
                    className="flex min-h-[60px] flex-1 items-center justify-center gap-3 whitespace-nowrap rounded-xl border border-flauzino-slate-300 bg-white px-5 py-4 text-lg font-semibold text-flauzino-navy-900 shadow-fl-xs transition-colors hover:border-flauzino-accent-500 hover:text-flauzino-accent-700 focus-visible:outline-none focus-visible:shadow-fl-focus md:min-h-[64px]"
                  >
                    <UserPlus size={24} strokeWidth={1.75} />
                    Cadastrar biometria
                  </motion.button>
                )}
              </div>

              {!hasKey && (
                <button
                  type="button"
                  onClick={() => setKeyModalOpen(true)}
                  className="flex items-center gap-2 text-sm font-medium text-flauzino-slate-400 transition-colors hover:text-flauzino-navy-900"
                >
                  <KeyRound size={15} />
                  Configurar este totem
                </button>
              )}

              <p className="text-xs tracking-wide text-flauzino-slate-400">
                Desenvolvido pela Flauzino · Feito para confiar.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modo presença — palco em tela cheia com captura automática */}
      <AnimatePresence>
        {mode === "attendance" && (
          <motion.div
            key="attendance-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TotemCamera
              session={session}
              processing={processing}
              result={result}
              onCapture={handleCapture}
              onClose={closeCamera}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modo cadastro biométrico */}
      <AnimatePresence>
        {mode === "enroll" && <EnrollmentWizard onExit={() => setMode("idle")} />}
      </AnimatePresence>

      {/* Modo calibração (acionado pelo painel) */}
      <AnimatePresence>
        {mode === "calibration" && calibration && <CalibrationMode progress={calibration} />}
      </AnimatePresence>

      <PanelPasswordModal
        open={panelPasswordOpen}
        template={context?.panelPassword ?? ""}
        onClose={() => setPanelPasswordOpen(false)}
        onUnlock={() => {
          setPanelPasswordOpen(false);
          setKeyModalOpen(true);
        }}
      />
      <DeviceKeyModal
        open={keyModalOpen}
        onClose={() => setKeyModalOpen(false)}
        onKeyChange={onKeyChange}
      />
    </div>
  );
}

