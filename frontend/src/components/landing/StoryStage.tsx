"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Play, ShieldAlert } from "lucide-react";
import {
  CountUp,
  Eyebrow,
  GhostButton,
  PrimaryButton,
  Reveal,
  EASE,
} from "./primitives";

/* ================================================================== */
/*  Seamless keyed video                                              */
/*  Pure-white source background blends into the white page (multiply */
/*  over white = identity), so the subject reads as a native element. */
/*  Sides are lightly cropped to remove the AI watermark.             */
/* ================================================================== */

function SeamlessVideo({
  src,
  vref,
  autoPlay = false,
  className = "",
}: {
  src: string;
  vref?: React.RefObject<HTMLVideoElement>;
  autoPlay?: boolean;
  className?: string;
}) {
  return (
    <video
      ref={vref}
      className={`video-key h-full w-full object-cover ${className}`}
      src={src}
      muted
      loop
      playsInline
      autoPlay={autoPlay}
      preload="auto"
      aria-hidden
    />
  );
}

/* ================================================================== */
/*  Sticky stage — both clips live in one box; v1 autoplays, v2       */
/*  begins as the fraud section scrolls in, with a soft crossfade.    */
/* ================================================================== */

function CrossfadeStage({ progress }: { progress: MotionValue<number> }) {
  const v2 = useRef<HTMLVideoElement>(null);
  const started = useRef(false);

  const o1 = useTransform(progress, [0, 0.4, 0.52], [1, 1, 0]);
  const o2 = useTransform(progress, [0.42, 0.54, 1], [0, 1, 1]);
  const y = useTransform(progress, [0, 1], [16, -16]);

  useMotionValueEvent(progress, "change", (p) => {
    if (p > 0.4 && !started.current && v2.current) {
      started.current = true;
      v2.current.currentTime = 0;
      void v2.current.play();
    }
  });

  return (
    <motion.div style={{ y }} className="relative mx-auto w-full max-w-[560px]">
      {/* both videos share this single box */}
      <div className="relative aspect-[3/2] w-full overflow-hidden">
        <motion.div style={{ opacity: o1 }} className="absolute inset-0">
          <SeamlessVideo src="/reconhecimento.mp4" autoPlay />
        </motion.div>
        <motion.div style={{ opacity: o2 }} className="absolute inset-0">
          <SeamlessVideo src="/fraude.mp4" vref={v2} />
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/*  Hero copy                                                         */
/* ================================================================== */

function HeroCopy() {
  return (
    <div
      id="top"
      className="flex min-h-[92vh] flex-col justify-center pb-10 pt-28 lg:min-h-screen lg:pb-0 lg:pt-0"
    >
      <Reveal>
        <Eyebrow>Chamada por reconhecimento facial</Eyebrow>
      </Reveal>

      <Reveal delay={0.06}>
        <h1 className="mt-5 text-balance text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[0.98] tracking-tightest text-brand-950">
          A chamada que se
          <br />
          faz{" "}
          <span className="relative whitespace-nowrap text-brand-600">
            sozinha
            <svg
              className="absolute -bottom-2 left-0 w-full"
              height="10"
              viewBox="0 0 200 10"
              preserveAspectRatio="none"
              aria-hidden
            >
              <motion.path
                d="M1 7 C 50 2, 150 2, 199 6"
                stroke="#93C5FD"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </svg>
          </span>
          .
        </h1>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-7 max-w-lg text-balance text-lg leading-relaxed text-slate-600">
          A Visage identifica automaticamente quem está presente em sala
          utilizando reconhecimento facial, registrando a frequência em
          segundos.
        </p>
      </Reveal>

      <Reveal delay={0.18}>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <PrimaryButton href="#demo">
            Solicitar demonstração
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </PrimaryButton>
          <GhostButton href="#story">
            <Play className="h-4 w-4 fill-current" />
            Ver funcionamento
          </GhostButton>
        </div>
      </Reveal>

      {/* mobile seamless video */}
      <div className="mt-12 aspect-[3/2] w-full overflow-hidden lg:hidden">
        <SeamlessVideo src="/reconhecimento.mp4" autoPlay />
      </div>

      <Reveal delay={0.24}>
        <SocialProof />
      </Reveal>
    </div>
  );
}

function SocialProof() {
  return (
    <div className="mt-12 max-w-lg rounded-2xl border border-slate-200/80 bg-white/70 p-1.5 shadow-card backdrop-blur lg:mt-14">
      <div className="rounded-[14px] bg-gradient-to-b from-white to-canvas px-5 py-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight text-brand-950">
                +<CountUp to={1000000} />
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Reconhecimentos realizados com sucesso
            </div>
          </div>
          <div className="hidden h-10 w-px bg-slate-200 sm:block" />
          <div className="hidden flex-col gap-1.5 sm:flex">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              99,95% de disponibilidade
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Conformidade LGPD
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Fraud copy                                                        */
/* ================================================================== */

const FRAUD_STEPS = [
  {
    k: "Análise de vivacidade",
    v: "Confirma que há uma pessoa real diante da câmera — não uma imagem.",
  },
  {
    k: "Análise de saturação",
    v: "Reconhece telas e reproduções pelas características de cor da imagem.",
  },
  {
    k: "Modelos avançados de IA",
    v: "Identificam máscaras realistas, fotos no celular e imagens impressas.",
  },
];

function FraudCopy() {
  return (
    <div
      id="fraude"
      className="flex min-h-[92vh] flex-col justify-center py-12 lg:min-h-screen lg:py-0"
    >
      <Reveal>
        <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">
          <ShieldAlert className="h-3.5 w-3.5" /> Seção 01 · Antifraude
        </span>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="mt-5 text-balance text-[clamp(2.1rem,4.4vw,3.4rem)] font-semibold leading-[1.02] tracking-tightest text-brand-950">
          Detecção de fraude
        </h2>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-6 max-w-lg text-balance text-lg leading-relaxed text-slate-600">
          Modelos avançados de machine learning detectam em milissegundos
          máscaras realistas, fotos no celular e imagens impressas, sinalizando
          a fraude.
        </p>
      </Reveal>

      <div className="mt-10 max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {FRAUD_STEPS.map((row, i) => (
          <Reveal key={row.k} delay={0.04 * i}>
            <div className="flex items-start gap-4 border-t border-slate-100 px-5 py-4 first:border-t-0">
              <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-slate-900 font-mono text-[11px] font-semibold text-white">
                0{i + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">
                    {row.k}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    tempo real
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {row.v}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.16}>
        <p className="mt-5 max-w-lg text-sm text-slate-400">
          Tentativas suspeitas são sinalizadas e nunca contabilizadas como
          presença.
        </p>
      </Reveal>

      {/* mobile seamless video */}
      <div className="mt-12 aspect-[3/2] w-full overflow-hidden lg:hidden">
        <SeamlessVideo src="/fraude.mp4" autoPlay />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section export                                                    */
/* ================================================================== */

export default function StoryStage() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  return (
    <section id="story" className="relative bg-white">
      <div ref={ref} className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid lg:grid-cols-2 lg:gap-16">
          {/* LEFT — narrative copy */}
          <div>
            <HeroCopy />
            <FraudCopy />
          </div>

          {/* RIGHT — sticky shared video (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-0 flex h-screen items-center justify-center">
              <CrossfadeStage progress={scrollYProgress} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
