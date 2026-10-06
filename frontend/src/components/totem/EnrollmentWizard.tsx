"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, IdCard, ScanFace, ShieldCheck, UserCheck } from "lucide-react";
import { maskCpf } from "@/lib/masks";
import {
  deviceApi,
  DeviceApiError,
  type EnrollmentLookup,
  type EnrollmentSessionInfo,
  type TotemIdentification,
} from "@/lib/deviceApi";
import { EagleMark } from "@/components/ui/Logo";
import { useTotemCamera } from "./useTotemCamera";
import { useFaceDetection } from "./useFaceDetection";
import { useTotemSounds } from "./useTotemSounds";
import { totemAudio } from "./totemAudio";
import { CaptureStage, type FramingHint } from "./CaptureStage";
import { capturePose, framingFromFaceRatio, CAPTURE_REJECTION_MESSAGES } from "./captureGuide";
import {
  WizardShell,
  IdentifierStep,
  WizardOutcome,
  identifierCopy,
  identifierReady,
  type WizardStep,
} from "./TotemWizard";

type Step = "identify" | "confirm" | "terms" | "capture" | "done" | "refused";

const stepOrder: WizardStep[] = [
  { key: "identify", label: "Identificação", icon: IdCard },
  { key: "confirm", label: "Confirmação", icon: UserCheck },
  { key: "terms", label: "Consentimento", icon: ShieldCheck },
  { key: "capture", label: "Captura", icon: ScanFace },
];

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
  /** O que este totem pede na identificação (vem de /device/context). */
  identification: TotemIdentification;
  onExit: () => void;
}

export function EnrollmentWizard({ identification, onExit }: EnrollmentWizardProps) {
  const { playSuccess, playError } = useTotemSounds();
  const camera = useTotemCamera();
  const faceDetection = useFaceDetection();

  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
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

  const submitIdentifier = async () => {
    if (!identifierReady(identification, identifier) || busy) return;
    setBusy(true);
    setStepError(null);
    try {
      const result = await deviceApi.enrollmentLookup(identifier.trim());
      setLookup(result);
      setStep("confirm");
    } catch (error) {
      fail(
        error,
        `Não foi possível consultar ${identifierCopy(identification).label.toLowerCase()}. Tente novamente.`
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmIdentity = async () => {
    if (busy) return;
    setBusy(true);
    setStepError(null);
    try {
      const result = await deviceApi.enrollmentStart(identifier.trim());
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
        const nextFraming = framingFromFaceRatio(faces[0].width / video.videoWidth);
        setFraming(nextFraming);
        if (nextFraming !== "good") {
          stableTicks.current = 0;
          setCaptureFeedback(null);
          return;
        }
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
        // A pose mudou: a fala da anterior perde a validade na hora
        totemAudio.say(result.completed ? null : capturePose(result.framesCollected).cue);
        if (result.completed) {
          setFinalizing(true);
          await deviceApi.enrollmentFinalize(session.sessionId);
          camera.stop();
          // Com áudio, a fala substitui o bipe — os dois juntos se atropelariam
          if (!totemAudio.say("reconhecimento_facial_cadastrado")) playSuccess();
          setStep("done");
        }
      } else {
        playError();
        setCaptureFeedback(
          CAPTURE_REJECTION_MESSAGES[result.reason ?? ""] ??
            "Foto recusada. Ajuste a posição e tente de novo."
        );
      }
    } catch (error) {
      setSending(false);
      playError();
      setCaptureFeedback(
        error instanceof DeviceApiError
          ? error.message
          : "Falha ao enviar a foto. Verifique a conexão."
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

  // Saiu no meio de uma orientação falada: ela não segue na tela de descanso
  useEffect(() => () => totemAudio.stop(), []);

  const firstName = lookup?.name.split(" ")[0] ?? "";
  const instruction = capturePose(framesCollected).instruction;

  return (
    <WizardShell
      steps={stepOrder}
      current={step}
      onExit={onExit}
      exitLabel="Cancelar cadastro"
      stage={
        step === "capture" &&
        camera.status !== "idle" &&
        camera.status !== "starting" && (
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
        )
      }
    >
      {step === "identify" && (
        <IdentifierStep
          eyebrow="Cadastro biométrico"
          identification={identification}
          value={identifier}
          onChange={(value) => {
            setIdentifier(value);
            setStepError(null);
          }}
          error={stepError}
          busy={busy}
          onSubmit={() => void submitIdentifier()}
        />
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
            {lookup.document && (
              <div className="flex flex-col gap-0.5 px-5 py-3.5">
                <dt className="text-xs font-medium text-flauzino-slate-500">CPF</dt>
                <dd className="font-mono-ds text-[15px] text-flauzino-navy-900">
                  {maskCpf(lookup.document)}
                </dd>
              </div>
            )}
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
                setIdentifier("");
                setStep("identify");
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

      {step === "capture" && (camera.status === "idle" || camera.status === "starting") && (
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
        <WizardOutcome
          title="Cadastro concluído"
          message={`Pronto, ${firstName}. A partir de agora sua presença é registrada automaticamente ao passar pelo totem.`}
        />
      )}

      {step === "refused" && (
        <WizardOutcome
          icon={<ShieldCheck size={36} strokeWidth={1.5} />}
          title="Sem problema"
          message="Nenhum dado biométrico foi coletado. Sua presença pode ser registrada manualmente pelo professor."
        />
      )}
    </WizardShell>
  );
}
