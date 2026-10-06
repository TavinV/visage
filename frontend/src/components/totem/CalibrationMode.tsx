"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Smartphone,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { deviceApi, DeviceApiError, type CalibrationProgress } from "@/lib/deviceApi";
import { EagleMark } from "@/components/ui/Logo";
import { useTotemCamera } from "./useTotemCamera";
import { useFaceDetection } from "./useFaceDetection";
import { useTotemSounds } from "./useTotemSounds";
import { totemAudio } from "./totemAudio";
import { CaptureStage, type FramingHint } from "./CaptureStage";
import { capturePose } from "./captureGuide";
import {
  PreparationIllustration,
  KnownGroupIllustration,
  OutsiderGroupIllustration,
  ScreenAttackIllustration,
  PersonDoneIllustration,
  CollectionDoneIllustration,
} from "./calibrationIllustrations";

const SHOT_COOLDOWN_MS = 2200;

/* ── Telas de tela cheia ─────────────────────────────────────────────── */

interface StepAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Tela cheia branca com ilustração, usada em tudo que interrompe a captura:
 * explicação das etapas, pessoa concluída e virada de grupo. Sem
 * AnimatePresence de propósito — se a saída não animasse, o totem ficaria
 * preso com a tela antiga por cima da câmera.
 */
function FullScreenStep({
  illustration,
  eyebrow,
  title,
  description,
  primary,
  secondary,
  footer,
}: {
  illustration: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  primary: StepAction;
  secondary?: StepAction;
  footer?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-white px-6 py-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
        className="flex w-full max-w-lg flex-col items-center text-center"
      >
        <div className="w-full max-w-[300px]">{illustration}</div>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-flauzino-slate-600">{description}</p>

        <div className="mt-8 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-flauzino-accent-600 px-6 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700 disabled:cursor-not-allowed disabled:bg-flauzino-slate-200 disabled:text-flauzino-slate-400 disabled:shadow-none"
          >
            {primary.label} <ChevronRight size={18} />
          </button>
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-flauzino-slate-300 px-6 text-base font-semibold text-flauzino-slate-700 transition-colors hover:border-flauzino-slate-400 hover:bg-flauzino-slate-100 disabled:cursor-not-allowed disabled:border-flauzino-slate-200 disabled:text-flauzino-slate-300"
            >
              {secondary.label}
            </button>
          )}
        </div>
        {footer && <div className="mt-5">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}

/* ── Explicação inicial, uma etapa por tela ──────────────────────────── */

interface IntroPage {
  illustration: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}

/** `min` vem do backend para o texto não mentir se os limites mudarem. */
function introPages(min: { people: number; impostors: number }): IntroPage[] {
  const total = min.people + min.impostors;
  return [
    {
      illustration: <PreparationIllustration className="h-auto w-full" />,
      eyebrow: "Antes de começar",
      title: `Chame ${total} pessoas até aqui`,
      description: `Elas vão se dividir em dois grupos: ${min.people} de um lado e ${min.impostors} do outro. Também é preciso um celular com a foto de um rosto na tela. No total, uns cinco minutos.`,
    },
    {
      illustration: <KnownGroupIllustration className="h-auto w-full" />,
      eyebrow: "Primeiro · Grupo 1",
      title: `${min.people} pessoas, 3 fotos de cada`,
      description:
        "A câmera pede que cada uma olhe para frente, para a direita e para a esquerda. São os rostos que o totem vai guardar como referência de quem ele deve reconhecer.",
    },
    {
      illustration: <OutsiderGroupIllustration className="h-auto w-full" />,
      eyebrow: "Depois · Grupo 2",
      title: `${min.impostors} pessoas, uma foto de cada`,
      description:
        "Precisam ser pessoas diferentes das do grupo 1. Comparando os dois grupos, o totem aprende a distinguir quem ele conhece de quem ele nunca viu.",
    },
    {
      illustration: <ScreenAttackIllustration className="h-auto w-full" />,
      eyebrow: "Por último · Teste da foto",
      title: "Mostre um rosto na tela do celular",
      description:
        "Alguém segura o celular de frente para a câmera, com a foto de um rosto aberta. É assim que o totem aprende a diferença entre uma pessoa de verdade e uma imagem.",
    },
  ];
}

interface CalibrationModeProps {
  /** Progresso vindo do polling do pai — mantém o totem em sincronia. */
  progress: CalibrationProgress;
}

/**
 * Coleta guiada de calibração em três etapas: o grupo que o totem vai
 * reconhecer (3 poses por pessoa), o grupo de fora e o teste da foto na
 * tela. Cada pessoa concluída interrompe a captura com uma tela cheia — sem
 * isso a câmera continuaria fotografando quem já terminou.
 */
export function CalibrationMode({ progress: initialProgress }: CalibrationModeProps) {
  const camera = useTotemCamera();
  const faceDetection = useFaceDetection();
  const { playError } = useTotemSounds();

  const [progress, setProgress] = useState<CalibrationProgress>(initialProgress);
  const [introStep, setIntroStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [framing, setFraming] = useState<FramingHint>(null);
  const [sending, setSending] = useState(false);
  const [acceptedTick, setAcceptedTick] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const [phaseIntro, setPhaseIntro] = useState<"impostor" | "attack" | null>(null);
  /** Grupo 2 e teste da foto: pausa depois de cada foto para trocar de pessoa. */
  const [awaitingNext, setAwaitingNext] = useState(false);
  const busyRef = useRef(false);
  const lastShotAt = useRef(0);
  const stableTicks = useRef(0);
  const hasLocalUpdates = useRef(false);

  const phase = progress.phase;
  const limits = progress.limits;

  // O pai sonda a cada 10s, mas quem escreve a coleta é esta tela: uma
  // resposta emitida antes da última foto voltaria o contador para trás e
  // derrubaria a tela de "pessoa cadastrada" com a câmera já rodando.
  // Depois da primeira mutação local, o estado daqui manda. O encerramento
  // pelo painel continua chegando por outro caminho (o pai desmonta a tela).
  useEffect(() => {
    if (hasLocalUpdates.current) return;
    setProgress(initialProgress);
  }, [initialProgress]);

  /** Volta a capturar com o cooldown zerado — o operador acabou de trocar de pessoa. */
  const resume = useCallback(() => {
    lastShotAt.current = Date.now();
    stableTicks.current = 0;
    setFeedback(null);
    setFraming(null);
    setPhaseIntro(null);
    setAwaitingNext(false);
  }, []);

  // Câmera desliga na tela final
  useEffect(() => {
    if (phase === "done") camera.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Calibração encerrada pelo painel no meio de uma orientação falada
  useEffect(() => () => totemAudio.stop(), []);

  const personComplete = progress.photosCurrentPerson >= progress.photosPerPerson;
  const completePeople = personComplete ? progress.people : progress.people - 1;
  const canLeaveGroupOne = completePeople >= limits.minPeople;
  const canLeaveGroupTwo = progress.impostors >= limits.minImpostors;
  const canFinish = progress.attacks >= limits.minAttacks;

  // Toda tela cheia bloqueia a captura — a câmera não fotografa por trás delas
  const personDone = phase === "genuine" && personComplete;
  const paused = phaseIntro !== null || personDone || awaitingNext;

  const instruction: string = (() => {
    if (phase === "genuine") return capturePose(progress.photosCurrentPerson).instruction;
    if (phase === "impostor") return "Uma pessoa do grupo 2, olhando para a câmera";
    return "Mostre a foto do rosto na tela do celular";
  })();

  const phaseSubtitle = (() => {
    if (phase === "genuine") {
      return `Grupo 1 · pessoa ${Math.max(progress.people, 1)} · foto ${Math.min(
        progress.photosCurrentPerson + 1,
        progress.photosPerPerson
      )} de ${progress.photosPerPerson}`;
    }
    if (phase === "impostor") {
      return `Grupo 2 · ${progress.impostors} de ${limits.minImpostors} pessoas`;
    }
    return `Teste da foto · ${progress.attacks} de ${limits.minAttacks}`;
  })();

  const captureLoop = useCallback(async () => {
    if (busyRef.current || phase === "done" || advancing || paused) return;
    if (Date.now() - lastShotAt.current < SHOT_COOLDOWN_MS) return;
    const video = camera.videoRef.current;
    if (!video || !video.videoWidth) return;

    busyRef.current = true;
    try {
      // O teste da foto é uma tela/impressão — a exigência de enquadramento
      // é relaxada, senão a própria guia rejeitaria a amostra
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
      hasLocalUpdates.current = true;
      setProgress(next);
      setAcceptedTick((t) => t + 1);
      // Grupo 1: a pose mudou e a fala da anterior perde a validade na hora
      // (com as 3 poses feitas, só cala — a tela de pessoa concluída assume)
      if (next.phase === "genuine") {
        totemAudio.say(
          next.photosCurrentPerson >= next.photosPerPerson
            ? null
            : capturePose(next.photosCurrentPerson).cue
        );
      }
      // Grupo 2 e teste da foto avançam de pessoa a cada foto; no grupo 1 a
      // pausa vem sozinha quando as 3 poses fecham
      if (next.phase === "impostor" || next.phase === "attack") setAwaitingNext(true);
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
  }, [phase, advancing, paused, camera, faceDetection, playError]);

  useEffect(() => {
    if (!started || camera.status !== "ready" || phase === "done" || paused) return;
    const interval = window.setInterval(() => void captureLoop(), 700);
    return () => window.clearInterval(interval);
  }, [started, camera.status, phase, paused, captureLoop]);

  const advance = async (action: "next-person" | "next-phase") => {
    if (advancing) return;
    setAdvancing(true);
    setFeedback(null);
    try {
      const next = await deviceApi.calibrationAdvance(action);
      hasLocalUpdates.current = true;
      setProgress(next);
      setAwaitingNext(false);
      stableTicks.current = 0;
      lastShotAt.current = Date.now();
      // A tela cheia seguinte explica o grupo que está começando
      if (action === "next-phase" && (next.phase === "impostor" || next.phase === "attack")) {
        setPhaseIntro(next.phase);
      }
    } catch (error) {
      playError();
      setFeedback(error instanceof DeviceApiError ? error.message : "Não foi possível avançar.");
    } finally {
      setAdvancing(false);
    }
  };

  /* ── Botão lateral: saída de emergência quando uma pessoa não fecha as
        3 fotos e o operador precisa seguir mesmo assim ─────────────────── */
  const sideControls = (() => {
    const control =
      phase === "genuine"
        ? { icon: Users, label: "Concluir grupo 1", disabled: !canLeaveGroupOne }
        : phase === "impostor"
          ? { icon: Smartphone, label: "Concluir grupo 2", disabled: !canLeaveGroupTwo }
          : { icon: Check, label: "Concluir coleta", disabled: !canFinish };
    const Icon = control.icon;
    const disabled = control.disabled || advancing;
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => void advance("next-phase")}
          disabled={disabled}
          aria-label={control.label}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full border backdrop-blur-xl transition-all",
            disabled
              ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
              : "border-white/25 bg-white/10 text-white hover:bg-white/20"
          )}
        >
          <Icon size={22} strokeWidth={2} />
        </button>
        <span className="max-w-[76px] text-center text-[10px] font-medium leading-tight text-white/75">
          {control.label}
        </span>
      </div>
    );
  })();

  const phaseSteps =
    phase === "genuine"
      ? progress.photosPerPerson
      : phase === "impostor"
        ? limits.minImpostors
        : limits.minAttacks;
  const phaseCompleted =
    phase === "genuine"
      ? Math.min(progress.photosCurrentPerson, progress.photosPerPerson)
      : phase === "impostor"
        ? Math.min(progress.impostors, limits.minImpostors)
        : Math.min(progress.attacks, limits.minAttacks);

  const pages = introPages({ people: limits.minPeople, impostors: limits.minImpostors });
  const page = pages[introStep];
  const lastPage = introStep === pages.length - 1;
  const showIntro =
    phase !== "done" && (!started || camera.status === "idle" || camera.status === "starting");
  const stageActive =
    started &&
    phase !== "done" &&
    (camera.status === "ready" || camera.status === "error");

  const startCamera = () => {
    setStarted(true);
    void camera.start();
  };

  /* ── Tela cheia ativa no momento ───────────────────────────────────── */

  const overlay = (() => {
    if (phaseIntro === "impostor") {
      return (
        <FullScreenStep
          illustration={<OutsiderGroupIllustration className="h-auto w-full" />}
          eyebrow="Etapa 2 de 3 · Grupo 2"
          title="Agora as pessoas de fora"
          description={`Chame ${limits.minImpostors} pessoas que não estão no grupo 1. Cada uma passa uma vez pela câmera — uma foto por pessoa.`}
          primary={{ label: "Chamar a primeira pessoa", onClick: resume }}
        />
      );
    }
    if (phaseIntro === "attack") {
      return (
        <FullScreenStep
          illustration={<ScreenAttackIllustration className="h-auto w-full" />}
          eyebrow="Etapa 3 de 3 · Teste da foto"
          title="Hora do celular"
          description="Abra a foto de um rosto na tela do celular e segure o aparelho de frente para a câmera, na altura do rosto de uma pessoa."
          primary={{ label: "Estou com o celular pronto", onClick: resume }}
        />
      );
    }
    if (personDone) {
      const number = Math.max(completePeople, 1);
      return (
        <FullScreenStep
          illustration={<PersonDoneIllustration className="h-auto w-full" />}
          eyebrow="Grupo 1"
          title={`Pessoa ${number} cadastrada`}
          description={
            canLeaveGroupOne
              ? "As 3 fotos foram aceitas. Pode seguir para o grupo 2 ou cadastrar mais uma pessoa aqui."
              : `As 3 fotos foram aceitas. Chame a próxima pessoa do grupo 1 — são ${limits.minPeople} no mínimo.`
          }
          primary={
            canLeaveGroupOne
              ? { label: "Ir para o grupo 2", onClick: () => void advance("next-phase"), disabled: advancing }
              : {
                  label: "Chamar a próxima pessoa",
                  onClick: () => void advance("next-person"),
                  disabled: advancing,
                }
          }
          secondary={
            canLeaveGroupOne
              ? {
                  label:
                    progress.people >= limits.maxPeople
                      ? `Limite de ${limits.maxPeople} pessoas`
                      : "Cadastrar mais uma pessoa",
                  onClick: () => void advance("next-person"),
                  disabled: advancing || progress.people >= limits.maxPeople,
                }
              : undefined
          }
        />
      );
    }
    if (awaitingNext && phase === "impostor") {
      return (
        <FullScreenStep
          illustration={<PersonDoneIllustration className="h-auto w-full" />}
          eyebrow="Grupo 2"
          title={`Pessoa ${progress.impostors} registrada`}
          description={
            canLeaveGroupTwo
              ? "Já dá para seguir para o teste da foto, ou registrar mais alguém do grupo 2."
              : `Chame a próxima pessoa do grupo 2 — faltam ${limits.minImpostors - progress.impostors}.`
          }
          primary={
            canLeaveGroupTwo
              ? {
                  label: "Ir para o teste da foto",
                  onClick: () => void advance("next-phase"),
                  disabled: advancing,
                }
              : { label: "Chamar a próxima pessoa", onClick: resume }
          }
          secondary={
            canLeaveGroupTwo
              ? {
                  label:
                    progress.impostors >= limits.maxImpostors
                      ? `Limite de ${limits.maxImpostors} pessoas`
                      : "Registrar mais uma pessoa",
                  onClick: resume,
                  disabled: progress.impostors >= limits.maxImpostors,
                }
              : undefined
          }
        />
      );
    }
    if (awaitingNext && phase === "attack") {
      return (
        <FullScreenStep
          illustration={<ScreenAttackIllustration className="h-auto w-full" />}
          eyebrow="Teste da foto"
          title={`${progress.attacks} ${progress.attacks === 1 ? "foto testada" : "fotos testadas"}`}
          description="Repetir com outra foto ou outro ângulo deixa a proteção mais precisa — mas já dá para concluir."
          primary={{
            label: "Concluir a coleta",
            onClick: () => void advance("next-phase"),
            disabled: advancing || !canFinish,
          }}
          secondary={{
            label:
              progress.attacks >= limits.maxAttacks
                ? `Limite de ${limits.maxAttacks} fotos`
                : "Testar mais uma foto",
            onClick: resume,
            disabled: progress.attacks >= limits.maxAttacks,
          }}
        />
      );
    }
    return null;
  })();

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
          {phase === "done" ? (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 190, damping: 24 }}
              className="flex flex-col items-center rounded-2xl border border-flauzino-slate-200 bg-white px-6 py-10 text-center shadow-fl-lg"
            >
              <CollectionDoneIllustration className="h-auto w-full max-w-[260px]" />
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                Coleta concluída
              </h2>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-flauzino-slate-500">
                Foram enviadas {progress.people} pessoas do grupo 1, {progress.impostors} do grupo 2
                e {progress.attacks} {progress.attacks === 1 ? "foto testada" : "fotos testadas"}.
                O resto acontece no painel: é lá que os números são calculados e aplicados. Este
                totem volta ao normal quando o modo for encerrado.
              </p>
            </motion.div>
          ) : showIntro ? (
            /* Troca por key monta a etapa nova na hora — sem esperar animação
               de saída, que num tablet ocioso pode nunca terminar */
            <motion.div
              key={`intro-${introStep}`}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 210, damping: 24 }}
              className="flex flex-col items-center rounded-2xl border border-flauzino-slate-200 bg-white px-6 py-8 text-center shadow-fl-lg md:px-10"
            >
              <div className="w-full max-w-[340px]">{page.illustration}</div>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
                {page.eyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
                {page.title}
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-flauzino-slate-600">
                {page.description}
              </p>

              <div className="mt-7 flex w-full max-w-sm flex-col gap-3">
                <button
                  type="button"
                  onClick={() => (lastPage ? startCamera() : setIntroStep((s) => s + 1))}
                  disabled={camera.status === "starting"}
                  className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-xl bg-flauzino-accent-600 px-6 text-base font-semibold text-white shadow-fl-md transition-colors hover:bg-flauzino-accent-700 disabled:opacity-60"
                >
                  {lastPage ? (
                    <>
                      <Camera size={20} />
                      {camera.status === "starting" ? "Abrindo câmera…" : "Ligar a câmera e começar"}
                    </>
                  ) : (
                    <>
                      Entendi, continuar <ArrowRight size={18} />
                    </>
                  )}
                </button>
                {introStep > 0 ? (
                  <button
                    type="button"
                    onClick={() => setIntroStep((s) => s - 1)}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100"
                  >
                    <ArrowLeft size={16} /> Voltar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex min-h-[48px] w-full items-center justify-center rounded-xl text-[15px] font-medium text-flauzino-slate-500 transition-colors hover:bg-flauzino-slate-100"
                  >
                    Já sei como funciona, pular
                  </button>
                )}
              </div>

              {/* Onde estou na explicação */}
              <div className="mt-6 flex items-center gap-2" aria-hidden>
                {pages.map((p, i) => (
                  <span
                    key={p.eyebrow}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === introStep
                        ? "w-6 bg-flauzino-accent-600"
                        : "w-1.5 bg-flauzino-slate-300"
                    )}
                  />
                ))}
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>

      {/* Palco em tela cheia — fora de qualquer wrapper com key para o <video>
          não remontar (e o preview não sumir) a cada troca de etapa */}
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

      {overlay}
    </motion.div>
  );
}
