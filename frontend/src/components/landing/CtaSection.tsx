"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { Reveal } from "./primitives";

export default function CtaSection() {
  return (
    <section id="demo" className="scroll-mt-24 bg-canvas px-5 py-24 lg:px-8 lg:py-32">
      <Reveal y={32}>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-[#0A0E1A] px-6 py-16 text-center shadow-lift lg:px-12 lg:py-24">
          {/* atmosphere */}
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.07]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/25 blur-[120px]" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Hackathon UMC 2026
            </span>

            <h2 className="mx-auto mt-6 max-w-2xl text-balance text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.04] tracking-tightest text-white">
              A solução mais avançada de chamada automática para instituições de
              ensino.
            </h2>

            <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-slate-300">
              Qualquer dispositivo vira um totem. Sem hardware proprietário, sem
              contrato de fidelidade.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <a
                href="mailto:contato@visage.app?subject=Demonstração Visage"
                className="group inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-brand-950 shadow-pop transition-all duration-200 hover:bg-brand-50"
              >
                Solicitar demonstração
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
              <a
                href="#story"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors duration-200 hover:bg-white/10"
              >
                Ver funcionamento
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Conforme
                à LGPD
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Criptografia
                de ponta a ponta
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Cancelável a
                qualquer momento
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
