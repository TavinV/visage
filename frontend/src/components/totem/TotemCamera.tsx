"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanFace, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import type { CurrentSession } from "@/lib/deviceApi";
import { useTotemCamera, meanAbsDiff } from "./useTotemCamera";
import { useFaceDetection } from "./useFaceDetection";
import {
  StageShell,
  StageHeader,
  StageBottom,
  StageError,
  StageResultOverlay,
  FaceGuide,
  FlashlightOverlay,
  FlashlightButton,
  type GuideState,
  type TotemResult,
} from "./TotemStage";

const IDLE_TIMEOUT_S = 60;

const DETECT_INTERVAL_MS = 550;
/** Movimento mínimo entre ticks para considerar alguém presente (fallback sem FaceDetector). */
const MOTION_PRESENCE_THRESHOLD = 2.0;
/** A oval pisca na cor do desfecho por este tempo antes do overlay entrar. */
const GUIDE_BLINK_BEFORE_OVERLAY_MS = 550;

const loadingPhrases = [
  "Analisando a imagem capturada",
  "Confirmando que é uma pessoa real",
  "Comparando com os alunos da chamada",
  "Confirmando identidade",
  "Registrando presença",
];

type FaceState = "none" | "far" | "close" | "good" | "multiple";

interface TotemCameraProps {
  session: CurrentSession | null;
  processing: boolean;
  result: TotemResult | null;
  /** detectionMs: tempo desde a câmera ficar pronta (ou o último resultado) até a captura disparar. */
  onCapture: (imageB64: string, detectionMs: number) => void;
  onClose: () => void;
}

/**
 * Palco de presença em tela cheia: a detecção facial dispara a captura
 * automaticamente — sem botão. A guia oval sinaliza o estado (branca →
 * azul pulsante → verde/vermelha) e o texto de status vive na base.
 */
export function TotemCamera({
  session,
  processing,
  result,
  onCapture,
  onClose,
}: TotemCameraProps) {
  const camera = useTotemCamera();
  const faceDetection = useFaceDetection();

  const [countdown, setCountdown] = useState(IDLE_TIMEOUT_S);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [faceState, setFaceState] = useState<FaceState>("none");
  const [showOverlay, setShowOverlay] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const busyRef = useRef(false);
  const stableTicks = useRef(0);
  const lastLuminance = useRef<Uint8ClampedArray | null>(null);
  /** Marca o início do ciclo de detecção atual — reseta quando a câmera fica pronta ou um resultado é exibido. */
  const cycleStartRef = useRef(performance.now());

  const busy = processing || result !== null;
  const cameraError = camera.status === "error";

  // Coreografia do desfecho: a oval pisca na cor do resultado e só então o
  // overlay verde/vermelho toma a tela. Avisos ficam apenas no texto da base.
  useEffect(() => {
    if (!result || result.kind === "warning") {
      setShowOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => setShowOverlay(true), GUIDE_BLINK_BEFORE_OVERLAY_MS);
    return () => {
      window.clearTimeout(timer);
      setShowOverlay(false);
    };
  }, [result]);

  useEffect(() => {
    void camera.start();
    return camera.stop;
  }, [camera.start, camera.stop]);

  // Câmera pronta = início de um novo ciclo de detecção (diagnóstico de latência)
  useEffect(() => {
    if (camera.status === "ready") cycleStartRef.current = performance.now();
  }, [camera.status]);

  // Contagem de inatividade — pausa durante processamento/resultado
  useEffect(() => {
    if (busy || cameraError) return;
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [busy, cameraError, onClose]);

  // Resultado exibido renova o tempo do totem e zera a estabilidade
  useEffect(() => {
    if (result) {
      setCountdown(IDLE_TIMEOUT_S);
      stableTicks.current = 0;
      cycleStartRef.current = performance.now();
    }
  }, [result]);

  // Frases rotativas durante o processamento
  useEffect(() => {
    if (!processing) {
      setPhraseIndex(0);
      return;
    }
    const interval = window.setInterval(
      () => setPhraseIndex((p) => (p + 1) % loadingPhrases.length),
      2200
    );
    return () => window.clearInterval(interval);
  }, [processing]);

  /**
   * Um tick do laço de reconhecimento: detecta rosto (nativo ou por
   * movimento), exige 2 ticks estáveis e envia o frame — tudo sem
   * interação do aluno.
   */
  const runDetectionTick = useCallback(async () => {
    const video = camera.videoRef.current;
    if (busyRef.current || !video || !video.videoWidth) return;
    busyRef.current = true;
    try {
      const faces = await faceDetection.detect(video);
      if (faces !== null) {
        if (faces.length === 0) {
          stableTicks.current = 0;
          setFaceState("none");
          return;
        }
        if (faces.length > 1) {
          stableTicks.current = 0;
          setFaceState("multiple");
          return;
        }
        setCountdown(IDLE_TIMEOUT_S);
        const ratio = faces[0].width / video.videoWidth;
        if (ratio < 0.16) {
          stableTicks.current = 0;
          setFaceState("far");
          return;
        }
        if (ratio > 0.52) {
          stableTicks.current = 0;
          setFaceState("close");
          return;
        }
        setFaceState("good");
      } else {
        // Sem FaceDetector nativo: movimento entre ticks indica presença
        const lum = camera.grabLuminance();
        const prev = lastLuminance.current;
        lastLuminance.current = lum;
        if (!lum || !prev) return;
        if (meanAbsDiff(lum, prev) < MOTION_PRESENCE_THRESHOLD) {
          stableTicks.current = 0;
          setFaceState("none");
          return;
        }
        setCountdown(IDLE_TIMEOUT_S);
        setFaceState("good");
      }

      // Dois ticks estáveis (~1,1s) antes de capturar — evita frames borrados
      stableTicks.current += 1;
      if (stableTicks.current < 2) return;
      stableTicks.current = 0;

      // 640px: a engine reduz a imagem para 640 no maior lado antes de
      // detectar, então enviar mais que isso só custa upload e decode de
      // pixels que serão descartados (medido: decode de até 96ms).
      const imageB64 = camera.captureJpegB64(640, 0.85);
      if (imageB64) onCapture(imageB64, performance.now() - cycleStartRef.current);
    } finally {
      busyRef.current = false;
    }
  }, [camera, faceDetection, onCapture]);

  useEffect(() => {
    if (camera.status !== "ready" || busy) return;
    const interval = window.setInterval(() => void runDetectionTick(), DETECT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [camera.status, busy, runDetectionTick]);

  const guide: GuideState = result
    ? result.kind
    : processing
      ? "processing"
      : faceState === "multiple"
        ? "warning"
        : faceState === "none"
          ? "neutral"
          : "detecting";

  const guideScale = faceState === "far" ? 0.88 : faceState === "close" ? 1.12 : 1;

  const status = result
    ? {
        key: `result-${result.kind}-${result.title}`,
        title: result.title,
        subtitle: result.message,
        chip:
          result.confidence !== undefined ? (
            <span className="rounded-full bg-white/15 px-3 py-1 font-mono-ds text-[11px] text-white/85 backdrop-blur-md">
              Confiança {formatPercent(result.confidence * 100)}
            </span>
          ) : undefined,
      }
    : processing
      ? {
          key: `loading-${phraseIndex}`,
          title: "Reconhecendo…",
          subtitle: `${loadingPhrases[phraseIndex]}.`,
        }
      : faceState === "multiple"
        ? {
            key: "multiple",
            title: "Uma pessoa por vez",
            subtitle: "Afaste os demais rostos para continuar.",
          }
        : faceState === "far"
          ? {
              key: "far",
              title: "Aproxime-se da câmera",
              subtitle: "Chegue mais perto até o rosto preencher a guia.",
            }
          : faceState === "close"
            ? {
                key: "close",
                title: "Afaste-se um pouco",
                subtitle: "Seu rosto está muito próximo da câmera.",
              }
            : faceState === "good"
              ? {
                  key: "good",
                  title: "Fique parado um instante",
                  subtitle: "O reconhecimento acontece automaticamente.",
                }
              : {
                  key: "idle",
                  title: "Posicione o rosto dentro da guia",
                  subtitle: "Mantenha o rosto centralizado e bem iluminado.",
                };

  return (
    <StageShell flashlightOn={flashlightOn}>
      {cameraError ? (
        <StageError
          message="Não foi possível acessar a câmera. Verifique a permissão do navegador."
          onRetry={() => void camera.start()}
        />
      ) : (
        <>
          {/* Espelhado como um espelho de verdade; a captura usa o frame bruto */}
          <video
            ref={camera.bindVideo}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          />
          <FlashlightOverlay active={flashlightOn} scale={guideScale} />
          <FaceGuide
            state={guide}
            scale={guideScale}
            blink={!!result && result.kind !== "warning" && !showOverlay}
          />
          <StageBottom
            contentKey={status.key}
            title={status.title}
            subtitle={status.subtitle}
            chip={status.chip}
          />
          <StageResultOverlay result={showOverlay ? result : null} />
        </>
      )}

      <StageHeader
        icon={<ScanFace size={20} strokeWidth={1.75} />}
        title={session ? session.className : "Nenhuma chamada aberta"}
        subtitle={session ? "Chamada aberta" : "Pré-presença — confirmada quando a chamada abrir"}
        live={!!session}
        chip={
          !cameraError ? (
            <div className="flex shrink-0 items-center gap-2">
              <FlashlightButton active={flashlightOn} onClick={() => setFlashlightOn((v) => !v)} />
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono-ds text-xs transition-colors duration-300",
                  flashlightOn ? "bg-flauzino-navy-900/10 text-flauzino-navy-900" : "bg-white/10 text-white/85"
                )}
              >
                <Timer size={13} />
                {countdown}s
              </span>
            </div>
          ) : undefined
        }
        onClose={onClose}
        fraction={cameraError ? undefined : countdown / IDLE_TIMEOUT_S}
        flashlightOn={flashlightOn}
      />
    </StageShell>
  );
}
