"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, IdCard, ScanFace, ShieldAlert, Trash2 } from "lucide-react";
import { deviceApi, DeviceApiError, type TotemIdentification } from "@/lib/deviceApi";
import { useTotemCamera, meanAbsDiff } from "./useTotemCamera";
import { useFaceDetection } from "./useFaceDetection";
import { useTotemSounds } from "./useTotemSounds";
import { totemAudio } from "./totemAudio";
import { CaptureStage, type FramingHint } from "./CaptureStage";
import { framingFromFaceRatio, CAPTURE_REJECTION_MESSAGES } from "./captureGuide";
import {
  WizardShell,
  IdentifierStep,
  WizardOutcome,
  identifierCopy,
  identifierReady,
  type WizardStep,
} from "./TotemWizard";

type Step = "identify" | "confirm" | "verify" | "done" | "failed";

const stepOrder: WizardStep[] = [
  { key: "identify", label: "Identificação", icon: IdCard },
  { key: "confirm", label: "Confirmação", icon: Trash2 },
  { key: "verify", label: "Reconhecimento", icon: ScanFace },
];

/** Pausa depois de uma confirmação recusada — tempo de ler o aviso e se ajeitar. */
const RETRY_COOLDOWN_MS = 2300;

const identityRejectionMessages = {
  face_mismatch: "Não conseguimos confirmar que é você.",
  liveness_failed: CAPTURE_REJECTION_MESSAGES.liveness_failed,
};

interface BiometricErasureWizardProps {
  /** O que este totem pede na identificação (vem de /device/context). */
  identification: TotemIdentification;
  onExit: () => void;
}

/**
 * Exclusão da biometria pelo próprio aluno: identificação → confirmação
 * explícita → reconhecimento facial na hora. Quem decide é o backend, que só
 * apaga se o rosto conferir com a biometria do dono do CPF/matrícula — esta
 * tela conduz o aluno e mostra o desfecho.
 */
export function BiometricErasureWizard({ identification, onExit }: BiometricErasureWizardProps) {
  const { playSuccess, playError } = useTotemSounds();
  const camera = useTotemCamera();
  const faceDetection = useFaceDetection();

  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [firstName, setFirstName] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [failure, setFailure] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [framing, setFraming] = useState<FramingHint>(null);
  const [sending, setSending] = useState(false);
  const verifyBusy = useRef(false);
  const lastLuminance = useRef<Uint8ClampedArray | null>(null);
  const stableTicks = useRef(0);
  const lastAttemptAt = useRef(0);

  const submitIdentifier = async () => {
    if (!identifierReady(identification, identifier) || busy) return;
    setBusy(true);
    setStepError(null);
    try {
      const result = await deviceApi.erasureLookup(identifier.trim());
      setFirstName(result.firstName);
      setStep("confirm");
    } catch (error) {
      playError();
      setStepError(
        error instanceof DeviceApiError
          ? error.message
          : `Não foi possível consultar ${identifierCopy(identification).label.toLowerCase()}. Tente novamente.`
      );
    } finally {
      setBusy(false);
    }
  };

  // O toque em "Confirmar exclusão" é o gesto que libera a câmera
  const startVerification = () => {
    setStep("verify");
    void camera.start();
  };

  const fail = useCallback((message: string) => {
    setFailure(message);
    setStep("failed");
  }, []);

  // ── Reconhecimento automático ───────────────────────────────────────────────

  const verifyFrame = useCallback(async () => {
    if (verifyBusy.current) return;
    if (Date.now() - lastAttemptAt.current < RETRY_COOLDOWN_MS) return;
    const video = camera.videoRef.current;
    if (!video || !video.videoWidth) return;

    verifyBusy.current = true;
    try {
      const faces = await faceDetection.detect(video);
      if (faces !== null) {
        if (faces.length !== 1) {
          stableTicks.current = 0;
          setFraming(null);
          setFeedback(
            faces.length === 0
              ? "Posicione o rosto dentro da guia"
              : "Mais de um rosto na imagem. Uma pessoa por vez."
          );
          return;
        }
        const nextFraming = framingFromFaceRatio(faces[0].width / video.videoWidth);
        setFraming(nextFraming);
        if (nextFraming !== "good") {
          stableTicks.current = 0;
          setFeedback(null);
          return;
        }
      } else {
        // Sem detector nativo: exige movimento entre ticks (alguém diante da câmera)
        const lum = camera.grabLuminance();
        const previous = lastLuminance.current;
        lastLuminance.current = lum;
        if (!lum || !previous || meanAbsDiff(lum, previous) < 1.0) {
          stableTicks.current = 0;
          setFeedback("Posicione o rosto dentro da guia");
          return;
        }
      }

      // Dois ticks estáveis (~1,2s) antes de capturar — evita frames borrados
      stableTicks.current += 1;
      setFeedback(null);
      if (stableTicks.current < 2) return;
      stableTicks.current = 0;

      // Mesmo frame do reconhecimento da chamada: a engine reduz para 640px
      const imageB64 = camera.captureJpegB64(640, 0.85);
      if (!imageB64) return;

      setSending(true);
      const result = await deviceApi.erasureConfirm(identifier.trim(), imageB64);
      setSending(false);
      lastAttemptAt.current = Date.now();

      if (result.erased) {
        // Com áudio, a fala substitui o bipe — os dois juntos se atropelariam
        if (!totemAudio.say("dados_removidos")) playSuccess();
        setStep("done");
        return;
      }

      // Enquadramento: o backend não gastou tentativa, só pede outra foto
      if (result.reason === "no_face_detected" || result.reason === "multiple_faces_detected") {
        setFeedback(CAPTURE_REJECTION_MESSAGES[result.reason]);
        return;
      }

      playError();
      const message =
        identityRejectionMessages[result.reason === "liveness_failed" ? "liveness_failed" : "face_mismatch"];
      if (!result.attemptsLeft) {
        fail(
          `${message} Por segurança, a exclusão fica bloqueada por alguns minutos. Se precisar, procure a secretaria.`
        );
        return;
      }
      setFeedback(
        `${message} ${result.attemptsLeft === 1 ? "Resta 1 tentativa." : `Restam ${result.attemptsLeft} tentativas.`}`
      );
    } catch (error) {
      setSending(false);
      lastAttemptAt.current = Date.now();
      playError();
      // Bloqueio e biometria já apagada não mudam tentando de novo
      if (
        error instanceof DeviceApiError &&
        (error.code === "ERASURE_LOCKED" || error.code === "NO_BIOMETRIC_DATA")
      ) {
        fail(error.message);
        return;
      }
      setFeedback(
        error instanceof DeviceApiError && error.status === 429
          ? "Muitas tentativas. Aguarde alguns segundos."
          : "Não foi possível confirmar agora. Tente de novo em instantes."
      );
    } finally {
      verifyBusy.current = false;
    }
  }, [identifier, camera, faceDetection, playSuccess, playError, fail]);

  useEffect(() => {
    if (step !== "verify" || camera.status !== "ready") return;
    const interval = window.setInterval(() => void verifyFrame(), 650);
    return () => window.clearInterval(interval);
  }, [step, camera.status, verifyFrame]);

  // Câmera desliga ao sair do reconhecimento
  useEffect(() => {
    if (step !== "verify") camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Saída automática nas telas finais
  useEffect(() => {
    if (step !== "done" && step !== "failed") return;
    const timer = window.setTimeout(onExit, step === "done" ? 6000 : 8000);
    return () => window.clearTimeout(timer);
  }, [step, onExit]);

  // Saiu antes de a fala terminar: ela não segue na tela de descanso
  useEffect(() => () => totemAudio.stop(), []);

  return (
    <WizardShell
      steps={stepOrder}
      current={step}
      onExit={onExit}
      exitLabel="Cancelar exclusão"
      stage={
        step === "verify" &&
        camera.status !== "idle" &&
        camera.status !== "starting" && (
          <CaptureStage
            camera={camera}
            icon={<ScanFace size={20} strokeWidth={1.75} />}
            title={firstName}
            subtitle="Exclusão de dados biométricos"
            instruction={sending ? "Confirmando sua identidade…" : "Olhe para a câmera"}
            totalSteps={1}
            completedSteps={0}
            sending={sending}
            feedback={feedback}
            framing={framing}
            acceptedTick={0}
            onClose={onExit}
          />
        )
      }
    >
      {step === "identify" && (
        <IdentifierStep
          eyebrow="Exclusão de dados biométricos"
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

      {step === "confirm" && (
        <div className="rounded-2xl border border-flauzino-slate-200 bg-white p-6 shadow-fl-lg md:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
            Exclusão de dados biométricos
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
            Olá, {firstName}!
          </h2>
          <p className="mt-2 text-[15px] text-flauzino-slate-500">
            Antes de continuar, confira o que vai acontecer.
          </p>

          <div className="mt-6 rounded-xl bg-flauzino-warning-100 px-5 py-4 text-[14px] leading-relaxed text-flauzino-slate-700">
            <p className="font-semibold text-flauzino-navy-900">
              Seus dados biométricos serão apagados permanentemente.
            </p>
            <p className="mt-1">
              Não dá para desfazer: sua presença deixa de ser registrada pelo rosto
              até você fazer um novo cadastro.
            </p>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-flauzino-slate-600">
            Para confirmar que é você, o totem vai reconhecer o seu rosto agora.
            Se o reconhecimento não confirmar sua identidade, nada é apagado.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onExit}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-flauzino-slate-300 px-4 text-base font-semibold text-flauzino-slate-600 transition-colors hover:border-flauzino-slate-400 hover:bg-flauzino-slate-100"
            >
              <ArrowLeft size={18} /> Cancelar
            </button>
            <button
              type="button"
              onClick={startVerification}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-flauzino-accent-600 px-4 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700"
            >
              <ScanFace size={18} /> Confirmar exclusão
            </button>
          </div>
        </div>
      )}

      {step === "verify" && (camera.status === "idle" || camera.status === "starting") && (
        <div
          className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-flauzino-navy-950 p-8 text-center shadow-fl-lg"
          style={{ minHeight: "min(62vh, 640px)" }}
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-flauzino-accent-500">
            <ScanFace size={44} strokeWidth={1.5} />
          </span>
          <p className="text-xl font-semibold text-white md:text-2xl">Abrindo câmera…</p>
        </div>
      )}

      {step === "done" && (
        <WizardOutcome
          title="Dados biométricos removidos com sucesso."
          message={`Pronto, ${firstName}. O totem não reconhece mais o seu rosto. Para voltar a usar o reconhecimento, faça um novo cadastro.`}
        />
      )}

      {step === "failed" && (
        <WizardOutcome
          icon={<ShieldAlert size={36} strokeWidth={1.5} />}
          title="Nenhum dado foi excluído"
          message={failure}
        />
      )}
    </WizardShell>
  );
}
