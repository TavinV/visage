"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Camera, Check, IdCard, ScanFace, ShieldCheck, UserCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { maskCpf, isCompleteCpf } from "@/lib/masks";
import {
  deviceApi,
  DeviceApiError,
  type EnrollmentLookup,
  type EnrollmentSessionInfo,
} from "@/lib/deviceApi";
import { EagleMark } from "@/components/ui/Logo";
import { useTotemCamera } from "./useTotemCamera";
import { useFaceDetection } from "./useFaceDetection";
import { useTotemSounds } from "./useTotemSounds";
import { CaptureStage, type FramingHint } from "./CaptureStage";

type Step = "cpf" | "confirm" | "terms" | "capture" | "done" | "refused";

const stepOrder: Array<{ key: Step; label: string; icon: LucideIcon }> = [
  { key: "cpf", label: "Identificação", icon: IdCard },
  { key: "confirm", label: "Confirmação", icon: UserCheck },
  { key: "terms", label: "Consentimento", icon: ShieldCheck },
  { key: "capture", label: "Captura", icon: ScanFace },
];

const captureInstructions = [
  "Olhe para o centro",
  "Vire levemente para a direita",
  "Vire levemente para a esquerda",
];

const frameRejectionMessages: Record<string, string> = {
  no_face_detected: "Nenhum rosto encontrado. Centralize o rosto na guia.",
  multiple_faces_detected: "Mais de um rosto na imagem. Uma pessoa por vez.",
  low_detection_score: "Imagem pouco nítida. Ajuste a iluminação.",
  liveness_failed: "A verificação de vivacidade reprovou o frame. Evite fotos ou telas.",
  static_image: "A imagem parece estática. Mova-se naturalmente diante da câmera.",
};

const facialStatusLabel: Record<string, string> = {
  none: "Sem biometria cadastrada",
  consent_given: "Consentimento registrado",
  registered: "Biometria já cadastrada",
  consent_refused: "Consentimento recusado anteriormente",
  revoked: "Biometria revogada",
};

/** Pausa após aceitar um frame — dá tempo do usuário ler a nova instrução. */
const STEP_COOLDOWN_MS = 2300;

interface EnrollmentWizardProps {
  onExit: () => void;
}

export function EnrollmentWizard({ onExit }: EnrollmentWizardProps) {
  const reduceMotion = useReducedMotion();
  const { playSuccess, playError } = useTotemSounds();
  const camera = useTotemCamera();
  const faceDetection = useFaceDetection();

  const [step, setStep] = useState<Step>("cpf");
  const [cpf, setCpf] = useState("");
  const [lookup, setLookup] = useState<EnrollmentLookup | null>(null);
  const [session, setSession] = useState<EnrollmentSessionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [framesCollected, setFramesCollected] = useState(0);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [framing, setFraming] = useState<FramingHint>(null);
  const [sending, setSending] = useState(false);
  const [acceptedTick, setAcceptedTick] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const captureLoopBusy = useRef(false);
  const lastLuminance = useRef<Uint8ClampedArray | null>(null);
  const stableTicks = useRef(0);
  const lastAcceptedAt = useRef(0);

  const requiredFrames = session?.requiredFrames ?? 3;

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      playError();
      setStepError(error instanceof DeviceApiError ? error.message : fallback);
    },
    [playError]
  );

  // ── Passos 1–3 ───────────────────────────────────────────────────────────────

  const submitCpf = async () => {
    if (!isCompleteCpf(cpf) || busy) return;
    setBusy(true);
    setStepError(null);
    try {
      const result = await deviceApi.enrollmentLookup(cpf);
      setLookup(result);
      setStep("confirm");
    } catch (error) {
      fail(error, "Não foi possível consultar o CPF. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const confirmIdentity = async () => {
    if (busy) return;
    setBusy(true);
    setStepError(null);
    try {
      const result = await deviceApi.enrollmentStart(cpf);
      setSession(result);
      setStep(result.requiresConsent ? "terms" : "capture");
    } catch (error) {
      fail(error, "Não foi possível iniciar o cadastro. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const acceptTerms = async () => {
    if (!session || busy) return;
    setBusy(true);
    setStepError(null);
    try {
      await deviceApi.enrollmentConsent(session.sessionId);
      setStep("capture");
    } catch (error) {
      fail(error, "Não foi possível registrar o consentimento.");
    } finally {
      setBusy(false);
    }
  };

  const refuseTerms = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await deviceApi.enrollmentRefuse(session.sessionId);
    } catch {
      // a recusa local segue mesmo se a rede falhar
    } finally {
      setBusy(false);
      setStep("refused");
    }
  };

  // ── Passo 4: captura automática ─────────────────────────────────────────────

  const processCandidateFrame = useCallback(async () => {
    if (!session || captureLoopBusy.current || finalizing) return;
    if (Date.now() - lastAcceptedAt.current < STEP_COOLDOWN_MS) return;
    const video = camera.videoRef.current;
    if (!video || !video.videoWidth) return;

    captureLoopBusy.current = true;
    try {
      // Detecção nativa: 1 rosto, com enquadramento na faixa ideal
      const faces = await faceDetection.detect(video);
      if (faces !== null) {
        if (faces.length === 0) {
          stableTicks.current = 0;
          setFraming(null);
          setCaptureFeedback("Posicione o rosto dentro da guia");
          return;
        }
        if (faces.length > 1) {
          stableTicks.current = 0;
          setFraming(null);
          setCaptureFeedback("Mais de um rosto na imagem. Uma pessoa por vez.");
          return;
        }
        const ratio = faces[0].width / video.videoWidth;
        if (ratio < 0.18) {
          stableTicks.current = 0;
          setFraming("far");
          setCaptureFeedback(null);
          return;
        }
        if (ratio > 0.46) {
          stableTicks.current = 0;
          setFraming("close");
          setCaptureFeedback(null);
          return;
        }
        setFraming("good");
      }

      // Sem detector nativo: exige presença de movimento entre ticks
      const lum = camera.grabLuminance();
      if (faces === null && lum && lastLuminance.current) {
        const diff = (() => {
          let sum = 0;
          for (let i = 0; i < lum.length; i++) sum += Math.abs(lum[i] - lastLuminance.current![i]);
          return sum / lum.length;
        })();
        if (diff < 1.0) {
          lastLuminance.current = lum;
          stableTicks.current = 0;
          setCaptureFeedback("Posicione o rosto dentro da guia");
          return;
        }
      }
      if (lum) lastLuminance.current = lum;

      // Dois ticks estáveis (~1,2s) antes de capturar — evita frames borrados
      stableTicks.current += 1;
      setCaptureFeedback(null);
      if (stableTicks.current < 2) return;
      stableTicks.current = 0;

      // Frame do cadastro em resolução/qualidade maiores que o reconhecimento:
      // a nitidez aqui define a qualidade do embedding consolidado
      const imageB64 = camera.captureJpegB64(1280, 0.92);
      if (!imageB64) return;

      setSending(true);
      const result = await deviceApi.enrollmentFrame(session.sessionId, imageB64);
      setSending(false);
      if (result.accepted) {
        lastAcceptedAt.current = Date.now();
        setFramesCollected(result.framesCollected);
        setAcceptedTick((t) => t + 1);
        setCaptureFeedback(null);
        if (result.completed) {
          setFinalizing(true);
          await deviceApi.enrollmentFinalize(session.sessionId);
          camera.stop();
          playSuccess();
          setStep("done");
        }
      } else {
        playError();
        setCaptureFeedback(
          frameRejectionMessages[result.reason ?? ""] ??
            "Frame recusado. Ajuste a posição e tente de novo."
        );
      }
    } catch (error) {
      setSending(false);
      playError();
      setCaptureFeedback(
        error instanceof DeviceApiError
          ? error.message
          : "Falha ao enviar o frame. Verifique a conexão."
      );
    } finally {
      captureLoopBusy.current = false;
    }
  }, [session, finalizing, camera, faceDetection, playSuccess, playError]);

  useEffect(() => {
    if (step !== "capture" || camera.status !== "ready") return;
    const interval = window.setInterval(() => void processCandidateFrame(), 650);
    return () => window.clearInterval(interval);
  }, [step, camera.status, processCandidateFrame]);

  // Saída automática nas telas finais
  useEffect(() => {
    if (step !== "done" && step !== "refused") return;
    const timer = window.setTimeout(onExit, step === "done" ? 6000 : 5000);
    return () => window.clearTimeout(timer);
  }, [step, onExit]);

  // Câmera desliga ao sair do passo de captura
  useEffect(() => {
    if (step !== "capture") camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const stepIndex = stepOrder.findIndex((s) => s.key === step);
  const firstName = lookup?.name.split(" ")[0] ?? "";
  const instruction = captureInstructions[framesCollected % captureInstructions.length];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col items-center overflow-y-auto bg-white px-4 py-5 md:px-8 md:py-6"
    >
      {/* Topo: marca + sair */}
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="flex items-center gap-2.5 text-flauzino-navy-900">
          <EagleMark size={26} />
          <span className="text-lg font-semibold tracking-tight">Visage</span>
        </span>
        <button
          type="button"
          onClick={onExit}
          aria-label="Cancelar cadastro"
          className="rounded-lg p-2.5 text-flauzino-slate-400 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900"
        >
          <X size={20} />
        </button>
      </div>

      {/* Stepper com ícones */}
      {stepIndex >= 0 && (
        <div className="mt-5 flex w-full max-w-2xl items-center gap-2">
          {stepOrder.map((s, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <div key={s.key} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors duration-300",
                    done
                      ? "bg-flauzino-success-600"
                      : current
                        ? "bg-flauzino-accent-600"
                        : "bg-flauzino-slate-200"
                  )}
                />
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    done
                      ? "text-flauzino-success-600"
                      : current
                        ? "text-flauzino-accent-700"
                        : "text-flauzino-slate-400"
                  )}
                >
                  {done ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    <s.icon size={12} strokeWidth={2} />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Conteúdo do passo — key troca o card e anima só na entrada. Sem
          AnimatePresence mode="wait": um totem não pode travar caso o callback
          de fim-de-saída da animação não dispare (aba em background, rAF lento). */}
      <div className="flex w-full max-w-2xl flex-1 items-center py-5 md:py-6">
        <div className="w-full">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 42 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 190, damping: 24 }}
            className="w-full"
          >
            {step === "cpf" && (
              <div className="rounded-2xl border border-flauzino-slate-200 bg-white p-6 shadow-fl-lg md:p-10">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
                  Cadastro biométrico
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
                  Vamos te identificar
                </h2>
                <p className="mt-2 text-[15px] text-flauzino-slate-500">
                  Digite o CPF informado na sua matrícula.
                </p>
                <form
                  className="mx-auto mt-7 flex max-w-sm flex-col"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitCpf();
                  }}
                >
                  <input
                    value={cpf}
                    onChange={(e) => {
                      setCpf(maskCpf(e.target.value));
                      setStepError(null);
                    }}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="CPF"
                    className={cn(
                      "h-14 w-full rounded-xl border bg-white text-center font-mono-ds text-xl tracking-[0.05em] text-flauzino-navy-900 shadow-fl-inset transition-colors",
                      "placeholder:text-flauzino-slate-300 focus:border-flauzino-accent-500 focus:shadow-fl-focus focus:outline-none",
                      stepError ? "border-flauzino-danger-600" : "border-flauzino-slate-300"
                    )}
                  />
                  {stepError && (
                    <p role="alert" className="mt-3 text-sm text-flauzino-danger-600">
                      {stepError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={!isCompleteCpf(cpf) || busy}
                    className={cn(
                      "mt-5 flex h-13 min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white transition-colors",
                      isCompleteCpf(cpf) && !busy
                        ? "bg-flauzino-accent-600 shadow-fl-md hover:bg-flauzino-accent-700"
                        : "cursor-not-allowed bg-flauzino-slate-200 text-flauzino-slate-400"
                    )}
                  >
                    {busy ? "Consultando…" : "Continuar"}
                  </button>
                </form>
              </div>
            )}

            {step === "confirm" && lookup && (
              <div className="rounded-2xl border border-flauzino-slate-200 bg-white p-6 shadow-fl-lg md:p-10">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
                  Confirmação de identidade
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
                  Olá, {firstName}!
                </h2>
                <p className="mt-2 text-[15px] text-flauzino-slate-500">
                  Confira se estes dados são mesmo os seus.
                </p>

                <dl className="mt-6 divide-y divide-flauzino-slate-200 rounded-xl border border-flauzino-slate-200">
                  <div className="flex flex-col gap-0.5 px-5 py-3.5">
                    <dt className="text-xs font-medium text-flauzino-slate-500">Nome completo</dt>
                    <dd className="text-[15px] font-semibold leading-snug text-flauzino-navy-900">
                      {lookup.name}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 px-5 py-3.5">
                    <dt className="text-xs font-medium text-flauzino-slate-500">CPF</dt>
                    <dd className="font-mono-ds text-[15px] text-flauzino-navy-900">
                      {maskCpf(lookup.document)}
                    </dd>
                  </div>
                  {lookup.enrollmentCode && (
                    <div className="flex flex-col gap-0.5 px-5 py-3.5">
                      <dt className="text-xs font-medium text-flauzino-slate-500">Matrícula</dt>
                      <dd className="font-mono-ds text-[15px] text-flauzino-navy-900">
                        {lookup.enrollmentCode}
                      </dd>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 px-5 py-3.5">
                    <dt className="text-xs font-medium text-flauzino-slate-500">Situação</dt>
                    <dd className="text-[15px] font-medium text-flauzino-slate-700">
                      {facialStatusLabel[lookup.facialStatus] ?? lookup.facialStatus}
                    </dd>
                  </div>
                </dl>

                {lookup.facialStatus === "registered" && (
                  <p className="mt-4 rounded-lg bg-flauzino-warning-100 px-4 py-3 text-[13px] leading-relaxed text-flauzino-slate-700">
                    Você já possui biometria ativa. Ao continuar, o cadastro anterior
                    será substituído pelo novo.
                  </p>
                )}

                {stepError && (
                  <p role="alert" className="mt-4 text-sm text-flauzino-danger-600">
                    {stepError}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setLookup(null);
                      setCpf("");
                      setStep("cpf");
                    }}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-flauzino-slate-300 px-4 text-base font-semibold text-flauzino-slate-600 transition-colors hover:border-flauzino-slate-400 hover:bg-flauzino-slate-100"
                  >
                    <ArrowLeft size={18} /> Não sou eu
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmIdentity()}
                    disabled={busy}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-flauzino-accent-600 px-4 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700 disabled:opacity-60"
                  >
                    <Check size={18} /> {busy ? "Preparando…" : "Sou eu, continuar"}
                  </button>
                </div>
              </div>
            )}

            {step === "terms" && (
              <div className="rounded-2xl border border-flauzino-slate-200 bg-white p-6 shadow-fl-lg md:p-10">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-flauzino-accent-50 text-flauzino-accent-600">
                  <ShieldCheck size={24} strokeWidth={1.75} />
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
                  Seu rosto, protegido de ponta a ponta
                </h2>
                <p className="mt-2 text-[15px] text-flauzino-slate-500">
                  Antes de prosseguir, saiba como seus dados biométricos serão coletados,
                  utilizados e protegidos, em conformidade com a Lei Geral de Proteção de Dados
                  Pessoais (Lei nº 13.709/2018).
                </p>

                <div className="mt-6 max-h-[32vh] space-y-4 overflow-y-auto rounded-xl bg-flauzino-slate-50 p-5 text-[14px] leading-relaxed text-flauzino-slate-700">
                  <p>
                    <b className="font-semibold text-flauzino-navy-900">O que coletamos.</b>{" "}
                      Algumas imagens do seu rosto serão utilizadas apenas para gerar seus dados
                      biométricos de identificação. As imagens capturadas são descartadas após o
                      processamento e não permanecem armazenadas.
                  </p>
                  <p>
                    <b className="font-semibold text-flauzino-navy-900">Como protegemos.</b>{" "}
                      Seus dados biométricos são armazenados de forma segura e criptografada. Nem
                      a Flauzino nem a sua instituição de ensino conseguem visualizar ou acessar
                      essas informações em formato legível.
                  </p>
                  <p>
                    <b className="font-semibold text-flauzino-navy-900">Finalidade do uso.</b>{" "}
                      Seus dados biométricos serão utilizados exclusivamente para confirmar sua
                      identidade e registrar sua presença nesta instituição de ensino. Eles não
                      são utilizados para publicidade, treinamento de modelos de Machine Learning,
                      marketing ou compartilhados com terceiros
                      para quaisquer outras finalidades.
                  </p>
                  <p>
                    <b className="font-semibold text-flauzino-navy-900">Seus direitos.</b>{" "}
                      A biometria é considerada um dado pessoal sensível, protegido pela Lei Geral
                      de Proteção de Dados Pessoais (Lei nº 13.709/2018). Você poderá solicitar,
                      junto à secretaria da instituição, informações sobre o tratamento dos seus
                      dados, bem como a <i>revogação do consentimento</i> e a <i>exclusão da sua biometria</i>,
                      observadas as disposições da legislação aplicável.
                  </p>
                  <p>
                    <b className="font-semibold text-flauzino-navy-900">Se você recusar.</b>{" "}
                      O cadastro biométrico é <i>opcional</i>. Caso você opte por não realizá-lo, nenhum
                      dado biométrico será coletado e sua presença poderá ser registrada por outro
                      procedimento adotado pela instituição de ensino.
                  </p>
                </div>

                {stepError && (
                  <p role="alert" className="mt-4 text-sm text-flauzino-danger-600">
                    {stepError}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void refuseTerms()}
                    disabled={busy}
                    className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-flauzino-slate-300 px-4 text-base font-semibold text-flauzino-slate-600 transition-colors hover:border-flauzino-slate-400 hover:bg-flauzino-slate-100 disabled:opacity-60"
                  >
                    Não aceito
                  </button>
                  <button
                    type="button"
                    onClick={() => void acceptTerms()}
                    disabled={busy}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-flauzino-accent-600 px-4 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700 disabled:opacity-60"
                  >
                    <ShieldCheck size={18} /> Aceito e quero continuar
                  </button>
                </div>
              </div>
            )}

            {step === "capture" &&
              (camera.status === "idle" || camera.status === "starting") && (
                <div
                  className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-flauzino-navy-950 p-8 text-center shadow-fl-lg"
                  style={{ minHeight: "min(62vh, 640px)" }}
                >
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-flauzino-accent-500">
                    <ScanFace size={44} strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-xl font-semibold text-white md:text-2xl">
                      Hora da captura, {firstName}
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-white/70">
                      Serão {requiredFrames} imagens do seu rosto, com instruções na
                      tela — leva menos de um minuto.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void camera.start()}
                    disabled={camera.status === "starting"}
                    className="flex min-h-[56px] items-center gap-3 rounded-xl bg-flauzino-accent-600 px-8 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700 disabled:opacity-60"
                  >
                    <Camera size={20} />
                    {camera.status === "starting" ? "Abrindo câmera…" : "Iniciar câmera"}
                  </button>
                  <span className="flex items-center gap-2 text-white/50">
                    <EagleMark size={18} />
                    <span className="text-xs font-semibold tracking-wide">Flauzino</span>
                  </span>
                </div>
              )}

            {step === "done" && (
              <div className="flex flex-col items-center rounded-2xl border border-flauzino-slate-200 bg-white px-6 py-12 text-center shadow-fl-lg">
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 15 }}
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-flauzino-success-100 text-flauzino-success-600"
                >
                  <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                    />
                  </svg>
                </motion.span>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight text-flauzino-navy-900">
                  Cadastro concluído
                </h2>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-flauzino-slate-500">
                  Pronto, {firstName}. A partir de agora sua presença é registrada
                  automaticamente ao passar pelo totem.
                </p>
              </div>
            )}

            {step === "refused" && (
              <div className="flex flex-col items-center rounded-2xl border border-flauzino-slate-200 bg-white px-6 py-12 text-center shadow-fl-lg">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-flauzino-slate-100 text-flauzino-slate-500">
                  <ShieldCheck size={36} strokeWidth={1.5} />
                </span>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                  Sem problema
                </h2>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-flauzino-slate-500">
                  Nenhum dado biométrico foi coletado. Sua presença pode ser registrada
                  manualmente pelo professor.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Palco de captura em tela cheia — fora do wrapper animado (transform
          criaria um containing block e quebraria o position: fixed) */}
      {step === "capture" && camera.status !== "idle" && camera.status !== "starting" && (
        <CaptureStage
          camera={camera}
          icon={<ScanFace size={20} strokeWidth={1.75} />}
          title={lookup?.name ?? "Cadastro biométrico"}
          subtitle="Cadastro biométrico"
          instruction={finalizing ? "Consolidando seu cadastro…" : instruction}
          totalSteps={requiredFrames}
          completedSteps={framesCollected}
          sending={sending || finalizing}
          feedback={captureFeedback}
          framing={framing}
          acceptedTick={acceptedTick}
          onClose={onExit}
        />
      )}
    </motion.div>
  );
}
