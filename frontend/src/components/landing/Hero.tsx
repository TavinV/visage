"use client";

import { ArrowRight, CheckCircle2, Play, Sparkles } from "lucide-react";
import { GhostButton, PrimaryButton, Reveal, ShinyText } from "./primitives";
import { ConsoleMockup } from "./mockups";

const PROOF_ITEMS = [
  "Implantação em poucas horas",
  "Funciona com o celular da própria escola",
  "Sem hardware proprietário",
  "Conforme a LGPD",
  "Cancelamento a qualquer momento",
];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white pb-24 pt-32 lg:pt-36">
      {/* atmosfera clara: brilho azul suave descendo do topo */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(59,130,246,0.12),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 lg:px-8">
        {/* pílula de novidade */}
        <Reveal>
          <a
            href="#plataforma"
            className="group inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 shadow-soft backdrop-blur transition-colors hover:border-brand-200 hover:bg-brand-50/60"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600">
              <Sparkles className="h-3.5 w-3.5" />
              Novo
            </span>
            <span className="text-xs text-slate-500">
              Funciona com qualquer celular ou tablet da escola
            </span>
            <ArrowRight className="h-3 w-3 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600" />
          </a>
        </Reveal>

        {/* headline em gradiente */}
        <Reveal delay={0.06}>
          <h1 className="mt-8 max-w-4xl text-balance text-center text-[clamp(2.4rem,5.6vw,4.4rem)] font-semibold leading-[1.04] tracking-tightest">
            <ShinyText as="span">A chamada que se faz sozinha</ShinyText>
          </h1>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-7 max-w-2xl text-balance text-center text-lg leading-relaxed text-slate-600">
            Automatize a chamada com <b>reconhecimento facial</b>, elimine fraudes e acompanhe a frequência em tempo real.
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton href="/demonstracao">
              Solicitar demonstração
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </PrimaryButton>
            <GhostButton href="#plataforma">
              <Play className="h-4 w-4 fill-current" />
              Ver a plataforma
            </GhostButton>
          </div>
        </Reveal>

        {/* o produto como protagonista: console real recriado em código */}
        <Reveal delay={0.2} y={44} className="mt-16 w-full lg:mt-20">
          <ConsoleMockup />
        </Reveal>

        {/* prova de valor — benefícios diretos para a direção */}
        <Reveal delay={0.1} className="w-full">
          <div className="mt-20 border-t border-slate-200/70 pt-10">
            <p className="text-center text-xl font-semibold tracking-tight text-brand-950 lg:text-2xl">
              Menos tempo com chamada. Mais tempo para ensinar.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
              {PROOF_ITEMS.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 text-sm text-slate-600"
                >
                  <CheckCircle2 className="h-4 w-4 flex-none text-emerald-500" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
