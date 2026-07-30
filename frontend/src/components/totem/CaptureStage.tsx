"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { useTotemCamera } from "./useTotemCamera";
import {
  StageShell,
  StageHeader,
  StageBottom,
  StageError,
  FaceGuide,
  FlashlightOverlay,
  FlashlightButton,
  type GuideState,
} from "./TotemStage";

/** Enquadramento vindo da detecção facial — controla a escala da guia oval. */
export type FramingHint = "far" | "good" | "close" | null;

interface CaptureStageProps {
  camera: ReturnType<typeof useTotemCamera>;
  /** Ícone do indicador superior. */
  icon: ReactNode;
  /** Pessoa em cadastro ou título do modo (indicador glass no topo). */
  title: string;
  subtitle?: string;
  /** Instrução principal exibida na base do palco. */
  instruction: string;
  /** Progresso desta fase: total de passos e quantos já concluídos. */
  totalSteps: number;
  completedSteps: number;
  /** Frame em trânsito para o servidor. */
  sending: boolean;
  /** Feedback pontual (rejeição, ajuste de posição). */
  feedback: string | null;
  framing: FramingHint;
  /** Incrementa quando um passo é aceito — dispara o flash verde da guia. */
  acceptedTick: number;
  onClose?: () => void;
  /** Controles compactos flutuando à direita (avançar pessoa/fase). */
  sideControls?: ReactNode;
}

const ACCEPTED_FLASH_MS = 900;
/** Falhas seguidas de nitidez/luz até sugerir a lanterna de tela (piscando o botão). */
const LOW_LIGHT_HINT_STREAK = 2;
/** "Imagem pouco nítida. Ajuste a iluminação." e variantes equivalentes vindas do backend. */
const LOW_LIGHT_FEEDBACK_RE = /nítid|ilumina/i;

/**
 * Palco de captura compartilhado (cadastro e calibração): câmera em tela
 * cheia no retrato e 16:9 centralizada na paisagem, indicador glass com
 * barras finas de progresso no topo, guia oval que sinaliza o estado pela
 * cor e instruções em texto na base, acima da marca d'água.
 */
export function CaptureStage({
  camera,
  icon,
  title,
  subtitle,
  instruction,
  totalSteps,
  completedSteps,
  sending,
  feedback,
  framing,
  acceptedTick,
  onClose,
  sideControls,
}: CaptureStageProps) {
  const [flashAccepted, setFlashAccepted] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [suggestFlashlight, setSuggestFlashlight] = useState(false);
  const lowLightStreak = useRef(0);

  // Flash verde curto quando um passo é aceito
  useEffect(() => {
    if (acceptedTick === 0) return;
    setFlashAccepted(true);
    const timer = window.setTimeout(() => setFlashAccepted(false), ACCEPTED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [acceptedTick]);

  // Falhas repetidas de nitidez/luz sugerem a lanterna (botão piscando) — some
  // assim que a lanterna liga ou a rejeição deixa de ser desse tipo.
  useEffect(() => {
    const isLowLightHint = !flashlightOn && !!feedback && LOW_LIGHT_FEEDBACK_RE.test(feedback);
    if (!isLowLightHint) {
      lowLightStreak.current = 0;
      setSuggestFlashlight(false);
      return;
    }
    lowLightStreak.current += 1;
    if (lowLightStreak.current >= LOW_LIGHT_HINT_STREAK) setSuggestFlashlight(true);
  }, [feedback, flashlightOn]);

  const toggleFlashlight = () => {
    setFlashlightOn((v) => !v);
    setSuggestFlashlight(false);
    lowLightStreak.current = 0;
  };

  const guide: GuideState = flashAccepted
    ? "success"
    : feedback
      ? "error"
      : sending
        ? "processing"
        : framing !== null
          ? "detecting"
          : "neutral";

  const guideScale = framing === "far" ? 0.88 : framing === "close" ? 1.12 : 1;

  const status = flashAccepted
    ? { key: "accepted", title: "Imagem aceita", subtitle: "Prepare-se para a próxima pose." }
    : feedback
      ? { key: `feedback-${feedback}`, title: feedback, subtitle: "Ajuste e mantenha a posição." }
      : sending
        ? { key: "sending", title: instruction, subtitle: "Analisando a imagem…" }
        : framing === "far"
          ? { key: "far", title: "Aproxime-se da câmera", subtitle: instruction }
          : framing === "close"
            ? { key: "close", title: "Afaste-se um pouco", subtitle: instruction }
            : framing === "good"
              ? { key: `hold-${instruction}`, title: instruction, subtitle: "Mantenha a posição." }
              : {
                  key: `guide-${instruction}`,
                  title: instruction,
                  subtitle: "Mantenha o rosto centralizado e bem iluminado.",
                };

  return (
    <StageShell flashlightOn={flashlightOn}>
      {camera.status === "error" ? (
        <StageError
          message="Não foi possível acessar a câmera. Verifique a permissão do navegador."
          onRetry={() => void camera.start()}
        />
      ) : (
        <>
          <video
            ref={camera.bindVideo}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          />
          <FlashlightOverlay active={flashlightOn} scale={guideScale} />
          <FaceGuide state={guide} scale={guideScale} />
          <StageBottom contentKey={status.key} title={status.title} subtitle={status.subtitle} />
          {sideControls && (
            <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-4 md:right-5">
              {sideControls}
            </div>
          )}
        </>
      )}

      <StageHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        onClose={onClose}
        segments={{ total: totalSteps, completed: completedSteps }}
        chip={
          <FlashlightButton active={flashlightOn} onClick={toggleFlashlight} suggest={suggestFlashlight} />
        }
        flashlightOn={flashlightOn}
      />
    </StageShell>
  );
}
