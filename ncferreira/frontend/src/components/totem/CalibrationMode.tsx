"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { deviceApi, DeviceApiError, type CalibrationProgress } from "@/lib/deviceApi";
import { EagleMark } from "@/components/ui/Logo";
import { useTotemCamera } from "./useTotemCamera";
import { useFaceDetection } from "./useFaceDetection";
import { useTotemSounds } from "./useTotemSounds";
import { CaptureStage, type FramingHint } from "./CaptureStage";

const poseTexts = [
  "Olhe para o centro",
  "Vire levemente para a direita",
  "Vire levemente para a esquerda",
];

const SHOT_COOLDOWN_MS = 2200;

const phaseModalContent: Record<
  "impostor" | "attack",
  { icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>; title: string; description: string }
> = {
  impostor: {
    icon: Users,
    title: "Fase 2 · Impostores",
    description:
      "Agora chame pessoas de FORA do sistema — quem não será cadastrado. Cada uma passa pela câmera; são necessárias pelo menos 3 fotos.",
  },
  attack: {
    icon: Smartphone,
    title: "Fase 3 · Ataques",
    description:
      "Simule fraudes: mostre à câmera uma foto impressa ou um rosto na tela de um celular. Isso calibra a detecção de vivacidade.",
  },
};

interface SideButtonProps {
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}

/** Botão circular compacto em glass para os controles laterais do palco. */
function SideButton({ icon: Icon, label, disabled, primary, onClick }: SideButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full border backdrop-blur-xl transition-all",
          disabled
            ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
            : primary
              ? "border-flauzino-accent-500/60 bg-flauzino-accent-600/85 text-white shadow-fl-md hover:bg-flauzino-accent-600"
              : "border-white/25 bg-white/10 text-white hover:bg-white/20"
        )}
      >
        <Icon size={22} strokeWidth={2} />
      </button>
      <span className="max-w-[76px] text-center text-[10px] font-medium leading-tight text-white/75">
        {label}
      </span>
    </div>
  );
}

interface CalibrationModeProps {
  /** Progresso vindo do polling do pai — mantém o totem em sincronia. */
  progress: CalibrationProgress;
}

/**
 * Coleta guiada de calibração em três fases: pessoas legítimas (3 poses por
 * pessoa), impostores e ataques de apresentação. Controles compactos flutuam
 * à direita do palco; a transição de fase é explicada em um modal.
 */
export function CalibrationMode({ progress: initialProgress }: CalibrationModeProps) {
  const camera = useTotemCamera();
  const faceDetection = useFaceDetection();
  const { playError } = useTotemSounds();

  const [progress, setProgress] = useState<CalibrationProgress>(initialProgress);
  const [started, setStarted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [framing, setFraming] = useState<FramingHint>(null);
  const [sending, setSending] = useState(false);
  const [acceptedTick, setAcceptedTick] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const [phaseModal, setPhaseModal] = useState<"impostor" | "attack" | null>(null);
  const busyRef = useRef(false);
  const lastShotAt = useRef(0);
  const stableTicks = useRef(0);

  const phase = progress.phase;

  // Sincroniza com o polling do pai (ex.: painel encerrou → pai desmonta)
  useEffect(() => setProgress(initialProgress), [initialProgress]);

  // Câmera desliga na tela final
  useEffect(() => {
    if (phase === "done") camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const personComplete = progress.photosCurrentPerson >= progress.photosPerPerson;
  const completePeople = personComplete ? progress.people : progress.people - 1;

  const instruction: string = (() => {
    if (phase === "genuine") {
      if (personComplete) return "Pessoa concluída — avance na seta ao lado";
      const pose = progress.photosCurrentPerson % poseTexts.length;
      return `Pessoa ${progress.people || 1} · ${poseTexts[pose]}`;
    }
    if (phase === "impostor") return "Agora uma pessoa de FORA do sistema";
    return "Mostre uma foto impressa ou uma tela com um rosto";
  })();

  const phaseSubtitle = (() => {
    if (phase === "genuine") {
      return `Fase 1 · Pessoa ${Math.max(progress.people, 1)} · foto ${Math.min(
        progress.photosCurrentPerson + 1,
        progress.photosPerPerson
      )}/${progress.photosPerPerson} · ${Math.max(completePeople, 0)} concluída(s)`;
    }
    if (phase === "impostor") {
      return `Fase 2 · Impostores · ${progress.impostors}/${progress.limits.minImpostors} mín.`;
    }
    return `Fase 3 · Ataques · ${progress.attacks}/${progress.limits.minAttacks} mín.`;
  })();

  const captureLoop = useCallback(async () => {
    if (busyRef.current || phase === "done" || advancing || phaseModal !== null) return;
    if (Date.now() - lastShotAt.current < SHOT_COOLDOWN_MS) return;
    const video = camera.videoRef.current;
    if (!video || !video.videoWidth) return;

    // Fase genuine: pessoa atual completa aguarda o operador avançar
    if (phase === "genuine" && progress.photosCurrentPerson >= progress.photosPerPerson) {
      setFeedback(null);
      return;
    }

    busyRef.current = true;
    try {
      // Ataques são fotos/telas — a exigência de enquadramento é relaxada
      if (phase !== "attack") {
        const faces = await faceDetection.detect(video);
        if (faces !== null) {
          if (faces.length !== 1) {
            stableTicks.current = 0;
            setFraming(null);
            setFeedback(faces.length === 0 ? "Posicione o rosto dentro da guia" : "Uma pessoa por vez");
            return;
          }
          const ratio = faces[0].width / video.videoWidth;
          if (ratio < 0.18) {
            stableTicks.current = 0;
            setFraming("far");
            setFeedback(null);
            return;
          }
          if (ratio > 0.46) {
            stableTicks.current = 0;
            setFraming("close");
            setFeedback(null);
            return;
          }
          setFraming("good");
        }
      } else {
        setFraming(null);
      }

      stableTicks.current += 1;
      setFeedback(null);
      if (stableTicks.current < 2) return;
      stableTicks.current = 0;

      const imageB64 = camera.captureJpegB64();
      if (!imageB64) return;

      setSending(true);
      const next = await deviceApi.calibrationSample(imageB64);
      setSending(false);
      lastShotAt.current = Date.now();
      setProgress(next);
      setAcceptedTick((t) => t + 1);
    } catch (error) {
      setSending(false);
      // Falha também respeita o cooldown — erro persistente (engine fora do
      // ar, amostra rejeitada) não pode martelar o backend a cada tick
      lastShotAt.current = Date.now();
      if (error instanceof DeviceApiError && error.code === "CALIBRATION_PERSON_COMPLETE") {
        setFeedback(null);
      } else {
        playError();
        setFeedback(
          error instanceof DeviceApiError ? error.message : "Falha ao enviar a amostra."
        );
      }
    } finally {
      busyRef.current = false;
    }
  }, [phase, progress.photosCurrentPerson, progress.photosPerPerson, advancing, phaseModal, camera, faceDetection, playError]);

  useEffect(() => {
    if (!started || camera.status !== "ready" || phase === "done" || phaseModal !== null) return;
    const interval = window.setInterval(() => void captureLoop(), 700);
    return () => window.clearInterval(interval);
  }, [started, camera.status, phase, phaseModal, captureLoop]);

  const advance = async (action: "next-person" | "next-phase") => {
    if (advancing) return;
    setAdvancing(true);
    setFeedback(null);
    try {
      const next = await deviceApi.calibrationAdvance(action);
      setProgress(next);
      lastShotAt.current = Date.now();
      // Modal explica a fase que está começando
      if (action === "next-phase" && (next.phase === "impostor" || next.phase === "attack")) {
        setPhaseModal(next.phase);
      }
    } catch (error) {
      playError();
      setFeedback(error instanceof DeviceApiError ? error.message : "Não foi possível avançar.");
    } finally {
      setAdvancing(false);
    }
  };

  const sideControls = (() => {
    if (phase === "genuine") {
      return (
        <>
          <SideButton
            icon={UserRound}
            label="Próxima pessoa"
            primary
            disabled={!personComplete || advancing || progress.people >= progress.limits.maxPeople}
            onClick={() => void advance("next-person")}
          />
          <SideButton
            icon={ChevronRight}
            label="Concluir fase"
            disabled={advancing || completePeople < progress.limits.minPeople}
            onClick={() => void advance("next-phase")}
          />
        </>
      );
    }
    if (phase === "impostor") {
      return (
        <SideButton
          icon={ChevronRight}
          label="Concluir fase"
          primary
          disabled={advancing || progress.impostors < progress.limits.minImpostors}
          onClick={() => void advance("next-phase")}
        />
      );
    }
    return (
      <SideButton
        icon={Check}
        label="Concluir coleta"
        primary
        disabled={advancing || progress.attacks < progress.limits.minAttacks}
        onClick={() => void advance("next-phase")}
      />
    );
  })();

  const phaseSteps =
    phase === "genuine"
      ? progress.photosPerPerson
      : phase === "impostor"
        ? progress.limits.minImpostors
        : progress.limits.minAttacks;
  const phaseCompleted =
    phase === "genuine"
      ? Math.min(progress.photosCurrentPerson, progress.photosPerPerson)
      : phase === "impostor"
        ? Math.min(progress.impostors, progress.limits.minImpostors)
        : Math.min(progress.attacks, progress.limits.minAttacks);

  const showIntro = !started || camera.status === "idle" || camera.status === "starting";
  const stageActive =
    started &&
    phase !== "done" &&
    (camera.status === "ready" || camera.status === "error");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col items-center overflow-y-auto bg-white px-4 py-5 md:px-8"
    >
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="flex items-center gap-2.5 text-flauzino-navy-900">
          <EagleMark size={26} />
          <span className="text-lg font-semibold tracking-tight">Visage</span>
        </span>
        <span className="flex items-center gap-2 rounded-full border border-flauzino-accent-100 bg-flauzino-accent-50 px-3.5 py-1.5 text-sm font-medium text-flauzino-accent-700">
          <Activity size={14} className="animate-pulse" />
          Modo calibração
        </span>
      </div>

      <div className="flex w-full max-w-2xl flex-1 items-center py-5">
        <div className="w-full">
          <motion.div
            key={!started ? "intro" : phase === "done" ? "done" : "capturing"}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 190, damping: 24 }}
            className="w-full"
          >
            {phase === "done" ? (
              <div className="flex flex-col items-center rounded-2xl border border-flauzino-slate-200 bg-white px-6 py-12 text-center shadow-fl-lg">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-flauzino-success-100 text-flauzino-success-600">
                  <CheckCircle2 size={36} strokeWidth={1.75} />
                </span>
                <h2 className="mt-6 text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                  Coleta concluída
                </h2>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-flauzino-slate-500">
                  {progress.people} pessoa(s), {progress.impostors} impostor(es) e{" "}
                  {progress.attacks} ataque(s) enviados. Calcule os resultados no painel
                  administrativo — o totem volta ao normal quando o modo for encerrado.
                </p>
              </div>
            ) : showIntro ? (
              <div className="rounded-2xl border border-flauzino-slate-200 bg-white p-6 shadow-fl-lg md:p-10">
                <h2 className="text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
                  Calibração guiada
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-flauzino-slate-500">
                  O painel colocou este totem em modo calibração. A coleta tem três
                  fases e leva poucos minutos:
                </p>
                <ul className="mt-5 space-y-3">
                  <li className="flex items-start gap-3 rounded-xl bg-flauzino-slate-50 px-4 py-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flauzino-accent-600 text-white">
                      <UserRound size={16} />
                    </span>
                    <span className="text-sm leading-relaxed text-flauzino-slate-700">
                      <b className="font-semibold text-flauzino-navy-900">Pessoas do sistema</b> —
                      pelo menos {initialProgress.limits.minPeople} pessoas cadastráveis, 3 fotos
                      cada (centro, direita, esquerda).
                    </span>
                  </li>
                  <li className="flex items-start gap-3 rounded-xl bg-flauzino-slate-50 px-4 py-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flauzino-navy-900 text-white">
                      <Users size={16} />
                    </span>
                    <span className="text-sm leading-relaxed text-flauzino-slate-700">
                      <b className="font-semibold text-flauzino-navy-900">Impostores</b> — pessoas
                      de fora do sistema, ao menos {initialProgress.limits.minImpostors} fotos.
                    </span>
                  </li>
                  <li className="flex items-start gap-3 rounded-xl bg-flauzino-slate-50 px-4 py-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flauzino-danger-600 text-white">
                      <Smartphone size={16} />
                    </span>
                    <span className="text-sm leading-relaxed text-flauzino-slate-700">
                      <b className="font-semibold text-flauzino-navy-900">Ataques</b> — fotos
                      impressas ou telas com um rosto, para calibrar a vivacidade.
                    </span>
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setStarted(true);
                    void camera.start();
                  }}
                  disabled={camera.status === "starting"}
                  className="mx-auto mt-7 flex min-h-[56px] items-center gap-3 rounded-xl bg-flauzino-accent-600 px-8 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700 disabled:opacity-60"
                >
                  <Camera size={20} />
                  {camera.status === "starting" ? "Abrindo câmera…" : "Iniciar câmera"}
                </button>
              </div>
            ) : null}
          </motion.div>
        </div>
      </div>

      {/* Palco em tela cheia — fora do wrapper com key para o <video> não
          remontar (e o preview não sumir) a cada troca de fase */}
      {stageActive && (
        <CaptureStage
          camera={camera}
          icon={<Activity size={20} strokeWidth={1.75} />}
          title="Modo calibração"
          subtitle={phaseSubtitle}
          instruction={instruction}
          totalSteps={phaseSteps}
          completedSteps={phaseCompleted}
          sending={sending}
          feedback={feedback}
          framing={framing}
          acceptedTick={acceptedTick}
          sideControls={sideControls}
        />
      )}

      {/* Modal de transição de fase — pausa a captura enquanto aberto */}
      <AnimatePresence>
        {phaseModal && (
          <motion.div
            key={`phase-modal-${phaseModal}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-flauzino-navy-950/70 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 18, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 8, opacity: 0, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 240, damping: 20 }}
              className="flex w-full max-w-md flex-col items-center rounded-2xl bg-white p-8 text-center shadow-fl-xl"
            >
              {(() => {
                const content = phaseModalContent[phaseModal];
                return (
                  <>
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-flauzino-accent-50 text-flauzino-accent-600">
                      <content.icon size={30} strokeWidth={1.75} />
                    </span>
                    <h2 className="mt-5 text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                      {content.title}
                    </h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-flauzino-slate-600">
                      {content.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhaseModal(null)}
                      className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-flauzino-accent-600 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700"
                    >
                      Começar <ChevronRight size={18} />
                    </button>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
