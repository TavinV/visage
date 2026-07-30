"use client";

import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoOff, X, Flashlight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { EagleMark } from "@/components/ui/Logo";

export type ResultKind = "success" | "warning" | "error";

export interface TotemResult {
  kind: ResultKind;
  title: string;
  message: string;
  confidence?: number;
}

/**
 * Estado da guia oval — ela é o indicador central de progresso do totem:
 * branca em repouso, pulsando em azul com rosto detectado/processando,
 * verde/âmbar/vermelha no desfecho.
 */
export type GuideState = "neutral" | "detecting" | "processing" | "success" | "warning" | "error";

/**
 * Palco de câmera orientado à tela:
 * — retrato: vídeo em tela cheia, como a câmera de um celular (o object-cover
 *   recorta a faixa central do sensor 16:9);
 * — paisagem: caixa 16:9 centralizada ocupando ~88% da largura, com a altura
 *   proporcional (limitada pela altura da tela em monitores ultrawide).
 */
export function StageShell({
  children,
  flashlightOn = false,
}: {
  children: ReactNode;
  /** Lanterna de tela ligada: também clareia a área fora da caixa da câmera. */
  flashlightOn?: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center transition-colors duration-300",
        flashlightOn ? "bg-white" : "bg-flauzino-navy-950"
      )}
    >
      <div
        className={cn(
          "relative h-full w-full overflow-hidden transition-colors duration-300",
          flashlightOn ? "bg-white" : "bg-flauzino-navy-950",
          "landscape:aspect-video landscape:h-auto landscape:w-[min(88vw,160svh)]",
          "landscape:rounded-3xl landscape:border landscape:border-white/10 landscape:shadow-fl-xl"
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface StageHeaderProps {
  icon: ReactNode;
  /** Aula da chamada aberta ou pessoa em cadastro. */
  title: string;
  subtitle?: string;
  /** Ponto azul "ao vivo" ao lado do subtítulo. */
  live?: boolean;
  /** Conteúdo extra à direita (ex.: contagem regressiva). */
  chip?: ReactNode;
  onClose?: () => void;
  /** Barras finas segmentadas sob o cartão (progresso discreto do cadastro). */
  segments?: { total: number; completed: number };
  /** Barra fina contínua 0–1 (ex.: tempo restante da sessão da câmera). */
  fraction?: number;
  /** Lanterna de tela ligada: fundo vira branco, então o texto vira escuro para continuar legível. */
  flashlightOn?: boolean;
}

/** Indicador superior em glass morphism + barras finas de progresso. */
export function StageHeader({
  icon,
  title,
  subtitle,
  live,
  chip,
  onClose,
  segments,
  fraction,
  flashlightOn = false,
}: StageHeaderProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3 md:p-5">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-3 rounded-2xl border py-2.5 pl-3 pr-2.5 shadow-fl-lg backdrop-blur-xl transition-colors duration-300",
            flashlightOn
              ? "border-flauzino-navy-900/10 bg-flauzino-navy-900/5"
              : "border-white/15 bg-white/10"
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
              flashlightOn ? "bg-flauzino-navy-900/10 text-flauzino-navy-900" : "bg-white/10 text-white"
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p
              className={cn(
                "truncate text-sm font-semibold transition-colors duration-300",
                flashlightOn ? "text-flauzino-navy-900" : "text-white"
              )}
            >
              {title}
            </p>
            {subtitle && (
              <p
                className={cn(
                  "flex items-center gap-1.5 truncate text-xs transition-colors duration-300",
                  flashlightOn ? "text-flauzino-navy-900/65" : "text-white/65"
                )}
              >
                {live && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-flauzino-accent-500" />
                )}
                {subtitle}
              </p>
            )}
          </div>
          {chip}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className={cn(
                "rounded-xl p-2.5 transition-colors focus-visible:outline-none focus-visible:shadow-fl-focus",
                flashlightOn
                  ? "text-flauzino-navy-900/70 hover:bg-flauzino-navy-900/10 hover:text-flauzino-navy-900"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {segments && segments.total > 1 && (
          <div className="flex gap-1.5 px-0.5">
            {Array.from({ length: segments.total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 overflow-hidden rounded-full backdrop-blur-md transition-colors duration-300",
                  flashlightOn ? "bg-flauzino-navy-900/15" : "bg-white/20"
                )}
              >
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-500 ease-out",
                    flashlightOn ? "bg-flauzino-navy-900" : "bg-white",
                    i < segments.completed ? "w-full" : "w-0"
                  )}
                />
              </span>
            ))}
          </div>
        )}

        {fraction !== undefined && (
          <div
            className={cn(
              "h-1 overflow-hidden rounded-full backdrop-blur-md transition-colors duration-300",
              flashlightOn ? "bg-flauzino-navy-900/15" : "bg-white/20"
            )}
          >
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-1000 ease-linear",
                flashlightOn ? "bg-flauzino-navy-900/85" : "bg-white/85"
              )}
              style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Cores de sinalização sobre vídeo — mais claras que a paleta de superfície. */
const guideStyles: Record<GuideState, { border: string; glow: string }> = {
  neutral: { border: "rgba(255,255,255,0.7)", glow: "rgba(255,255,255,0)" },
  detecting: { border: "#3b82f6", glow: "rgba(59,130,246,0.55)" },
  processing: { border: "#3b82f6", glow: "rgba(59,130,246,0.65)" },
  success: { border: "#4ade80", glow: "rgba(74,222,128,0.6)" },
  warning: { border: "#fbbf24", glow: "rgba(251,191,36,0.45)" },
  error: { border: "#f87171", glow: "rgba(248,113,113,0.6)" },
};

interface FaceGuideProps {
  state: GuideState;
  /** Escala do enquadramento (rosto longe/perto). */
  scale?: number;
  /** Piscada rápida na cor do estado — usada antes do overlay de resultado. */
  blink?: boolean;
}

/** Dimensões da guia oval — compartilhadas com a lanterna de tela para o recorte alinhar. */
const OVAL_BOX_CLASS =
  "relative aspect-[3/4] h-[56%] max-h-[72%] portrait:h-auto portrait:max-h-none portrait:w-[70%] portrait:max-w-[420px]";

/**
 * Guia oval central: escurece o entorno e sinaliza o estado pela cor.
 *
 * O escurecimento e o anel colorido vivem em camadas z separadas (5 e 11)
 * para que a lanterna de tela (z-8, ver FlashlightOverlay) possa se
 * intercalar entre elas — branco cobrindo o escurecimento, mas sempre
 * por baixo do anel de status.
 */
export function FaceGuide({ state, scale = 1, blink = false }: FaceGuideProps) {
  const s = guideStyles[state];
  const pulsing = blink || state === "detecting" || state === "processing";
  const pulseDuration = blink ? 0.4 : state === "processing" ? 1.1 : 1.7;
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
        <motion.div
          animate={{ scale }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className={OVAL_BOX_CLASS}
        >
          <div
            className="absolute inset-0 rounded-[50%]"
            style={{ boxShadow: "0 0 0 9999px rgba(8,13,24,0.42)" }}
          />
        </motion.div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-[11] flex items-center justify-center">
        <motion.div
          animate={{ scale }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className={OVAL_BOX_CLASS}
        >
          <motion.div
            className="absolute inset-0 rounded-[50%] border-[2.5px] border-solid"
            // Cor da borda via style + transição CSS: o framer não aplica
            // borderColor de forma confiável alternando keyframes ↔ valor único
            style={{ borderColor: s.border, transition: "border-color 0.3s ease" }}
            animate={{
              boxShadow: pulsing
                ? [`0 0 0px 0px ${s.glow}`, `0 0 36px 5px ${s.glow}`, `0 0 0px 0px ${s.glow}`]
                : `0 0 26px 2px ${s.glow}`,
              opacity: pulsing ? [0.6, 1, 0.6] : 1,
            }}
            transition={
              pulsing
                ? { duration: pulseDuration, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.35 }
            }
          />
        </motion.div>
      </div>
    </>
  );
}

/**
 * "Lanterna" de tela: acende toda a área ao redor da guia oval em branco
 * para iluminar o rosto em ambientes escuros — sempre manual (nunca liga
 * sozinha). Mesmo recorte oval da guia, para o furo bater exatamente com
 * ela. Fica entre o escurecimento (z-5) e o anel de status (z-11) do
 * FaceGuide: branco opaco cobre o escurecimento por completo (sem o cinza
 * de um branco translúcido sobre preto) e o anel de status continua visível
 * por cima.
 */
export function FlashlightOverlay({ active, scale = 1 }: { active: boolean; scale?: number }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[8] flex items-center justify-center transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0"
      )}
      aria-hidden={!active}
    >
      <motion.div
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className={OVAL_BOX_CLASS}
      >
        <div className="absolute inset-0 rounded-[50%]" style={{ boxShadow: "0 0 0 9999px #fff" }} />
      </motion.div>
    </div>
  );
}

/** Botão de alternância da lanterna de tela — some no chip do cabeçalho. */
export function FlashlightButton({
  active,
  onClick,
  suggest = false,
}: {
  active: boolean;
  onClick: () => void;
  /** Pisca para sugerir ligar a lanterna após falhas repetidas de nitidez/luz. */
  suggest?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? "Desligar lanterna de tela" : "Ligar lanterna de tela"}
      className={cn(
        "pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
        active
          ? "border-flauzino-navy-900 bg-flauzino-navy-900 text-white"
          : suggest
            ? "animate-pulse border-[#fbbf24] bg-[#fbbf24]/20 text-[#fbbf24]"
            : "border-white/20 bg-white/10 text-white/85 hover:bg-white/20"
      )}
    >
      <Flashlight size={16} strokeWidth={1.9} />
    </button>
  );
}

const overlayBackgrounds: Record<"success" | "error", string> = {
  success: "bg-gradient-to-b from-[#14532d]/95 via-[#15803d]/94 to-[#052e16]/96",
  error: "bg-gradient-to-b from-[#7f1d1d]/95 via-[#b91c1c]/94 to-[#450a0a]/96",
};

const overlayIconPaths: Record<"success" | "error", string> = {
  success: "M5 13l4 4L19 7",
  error: "M6 18L18 6M6 6l12 12",
};

/**
 * Overlay de desfecho em tela cheia: verde no sucesso, vermelho na falha.
 * Ícone desenhado + anéis pulsantes + textos em cascata. Avisos (sem rosto
 * etc.) não disparam overlay — ficam no texto da base.
 */
export function StageResultOverlay({ result }: { result: TotemResult | null }) {
  const kind = result && result.kind !== "warning" ? result.kind : null;
  return (
    <AnimatePresence>
      {kind && result && (
        <motion.div
          key={`overlay-${kind}-${result.title}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32 }}
          className={cn(
            "absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-8 text-center backdrop-blur-sm",
            overlayBackgrounds[kind]
          )}
        >
          <div className="relative flex items-center justify-center">
            {/* Anéis expandindo atrás do ícone */}
            {[0, 1].map((i) => (
              <motion.span
                key={i}
                className="absolute h-28 w-28 rounded-full border-2 border-white/35"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: [0.75, 2], opacity: [0.5, 0] }}
                transition={{
                  duration: 1.7,
                  delay: 0.3 + i * 0.6,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            ))}
            <motion.span
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 15, delay: 0.05 }}
              className="flex h-28 w-28 items-center justify-center rounded-full border border-white/30 bg-white/15 backdrop-blur-md"
            >
              <svg className="h-14 w-14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <motion.path
                  d={overlayIconPaths[kind]}
                  stroke="#fff"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.28, duration: 0.5, ease: "easeOut" }}
                />
              </svg>
            </motion.span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="text-3xl font-bold tracking-tight text-white md:text-4xl"
            >
              {result.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34 }}
              className="max-w-md text-[15px] leading-relaxed text-white/80 md:text-base"
            >
              {result.message}
            </motion.p>
            {result.confidence !== undefined && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.48 }}
                className="mt-2 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 font-mono-ds text-xs text-white/90 backdrop-blur-md"
              >
                Confiança {formatPercent(result.confidence * 100)}
              </motion.span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface StageBottomProps {
  /** Troca do conteúdo anima entrada/saída — key estável por estado. */
  contentKey: string;
  title: string;
  subtitle?: string;
  chip?: ReactNode;
}

/** Texto de status na base do palco, sempre acima da marca d'água Flauzino. */
export function StageBottom({ contentKey, title, subtitle, chip }: StageBottomProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 bg-gradient-to-t from-flauzino-navy-950/85 via-flauzino-navy-950/35 to-transparent px-5 pb-3 pt-16">
      <div className="grid w-full max-w-2xl place-items-center text-center">
        {/* Sem mode="wait": o totem não pode travar se o callback de saída não disparar */}
        <AnimatePresence initial={false}>
          <motion.div
            key={contentKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="col-start-1 row-start-1 flex flex-col items-center gap-1.5"
          >
            {chip}
            <p className="text-xl font-bold leading-snug text-white md:text-2xl">{title}</p>
            {subtitle && (
              <p className="max-w-md text-[13px] leading-relaxed text-white/60 md:text-sm">
                {subtitle}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-2 text-white/60">
        <EagleMark size={18} />
        <span className="text-xs font-semibold tracking-wide">Flauzino</span>
      </div>
    </div>
  );
}

/** Falha de câmera com ação de nova tentativa — ocupa o palco inteiro. */
export function StageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-flauzino-danger-600/25 text-[#f87171]">
        <VideoOff size={28} strokeWidth={1.75} />
      </span>
      <p className="max-w-sm text-base font-medium text-white/85">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="pointer-events-auto rounded-xl border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
      >
        Tentar novamente
      </button>
    </div>
  );
}
