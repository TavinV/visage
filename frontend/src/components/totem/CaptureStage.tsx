"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { useTotemCamera } from "./useTotemCamera";
import {
  StageShell,
  StageHeader,
  StageBottom,
  StageError,
  FaceGuide,
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

  // Flash verde curto quando um passo é aceito
  useEffect(() => {
    if (acceptedTick === 0) return;
    setFlashAccepted(true);
    const timer = window.setTimeout(() => setFlashAccepted(false), ACCEPTED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [acceptedTick]);

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
    <StageShell>
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
      />
    </StageShell>
  );
}
