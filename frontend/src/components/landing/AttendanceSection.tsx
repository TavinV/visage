"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ScanFace, CheckCircle2, BarChart3, ArrowDown } from "lucide-react";
import { Eyebrow, Reveal } from "./primitives";

const STEPS = [
  {
    icon: ScanFace,
    title: "Aluno identificado",
    desc: "O totem reconhece o rosto e valida a presença em tempo real.",
    meta: "08:02:14",
  },
  {
    icon: CheckCircle2,
    title: "Presença registrada",
    desc: "A frequência é consolidada automaticamente, sem digitação manual.",
    meta: "auto",
  },
  {
    icon: BarChart3,
    title: "Disponível em relatórios",
    desc: "Professores e gestores acompanham tudo em tempo real.",
    meta: "ao vivo",
  },
];

function FlowRail() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 60%"],
  });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div ref={ref} className="relative">
      <div className="absolute left-[27px] top-6 bottom-6 w-px bg-slate-200" aria-hidden />
      <motion.div
        style={{ scaleY }}
        className="absolute left-[27px] top-6 bottom-6 w-px origin-top bg-gradient-to-b from-brand-600 to-brand-400"
        aria-hidden
      />

      <div className="space-y-5">
        {STEPS.map((s, i) => (
          <div key={s.title} className="relative">
            <Reveal delay={i * 0.08}>
              <div className="flex items-start gap-5">
                <div className="relative z-10 flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-card">
                  <s.icon className="h-6 w-6 text-brand-600" strokeWidth={1.8} />
                </div>
                <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">
                      {s.title}
                    </h3>
                    <span className="font-mono text-[11px] text-slate-400">
                      {s.meta}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                    {s.desc}
                  </p>
                </div>
              </div>
            </Reveal>
            {i < STEPS.length - 1 && (
              <div className="flex h-5 items-center pl-[20px] text-slate-300">
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* AI-generated computer mockup of the live attendance panel.
   Drop the rendered image at /public/mockup_pc.webp (prompt provided). */
function ChamadaMockup() {
  return (
    <div className="relative">
      {/* glow */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-tr from-brand-100/60 via-transparent to-brand-50 blur-2xl" />

      <div className="overflow-hidden rounded-2xl bg-canvas [filter:drop-shadow(0_30px_60px_rgba(16,24,40,0.18))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mockup_pc.webp"
          alt="Painel da Visage exibindo a chamada de uma turma sendo preenchida automaticamente em tempo real"
          className="block aspect-[16/10] w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* floating live accent */}
      <div className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-lift backdrop-blur sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold text-slate-700">
          23/25 presentes
        </span>
      </div>
    </div>
  );
}

export default function AttendanceSection() {
  return (
    <section
      id="presenca"
      className="relative scroll-mt-24 border-t border-slate-200/70 bg-canvas py-24 lg:py-36"
    >
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow>Seção 02 · Presença</Eyebrow>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mt-5 text-balance text-[clamp(2.1rem,4.4vw,3.4rem)] font-semibold leading-[1.02] tracking-tightest text-brand-950">
              Registro de presença
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-slate-600">
              Após a validação biométrica, a presença é consolidada
              automaticamente e disponibilizada para professores e gestores em
              tempo real.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <FlowRail />
          <Reveal delay={0.1} y={32}>
            <ChamadaMockup />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
