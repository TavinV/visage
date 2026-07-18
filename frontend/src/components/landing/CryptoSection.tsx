"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Lock, RadioTower } from "lucide-react";
import { Reveal, EASE } from "./primitives";

/* ================================================================== */
/*  Graphic padlock — an editorial security illustration             */
/* ================================================================== */

function LockGraphic() {
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      {/* soft aura */}
      <div className="absolute inset-[14%] rounded-full bg-brand-500/15 blur-3xl" />

      {/* orbiting data dots */}
      {!reduce && (
        <motion.div
          className="absolute inset-[6%]"
          animate={{ rotate: 360 }}
          transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
        >
          {[0, 120, 240].map((deg) => (
            <span
              key={deg}
              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-brand-300/80"
              style={{ transform: `translate(-50%,-50%) rotate(${deg}deg) translateX(120px)` }}
            />
          ))}
        </motion.div>
      )}

      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" fill="none">
        <defs>
          <linearGradient id="lockBody" x1="60" y1="84" x2="150" y2="180" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1E293B" />
            <stop offset="0.55" stopColor="#0F172A" />
            <stop offset="1" stopColor="#020617" />
          </linearGradient>
          <linearGradient id="lockShackle" x1="70" y1="40" x2="130" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="#94A3B8" />
            <stop offset="1" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="lockSheen" x1="60" y1="90" x2="140" y2="170" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" stopOpacity="0.55" />
            <stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="keyGlow" cx="0.5" cy="0.5" r="0.5">
            <stop stopColor="#93C5FD" />
            <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>
          <clipPath id="bodyClip">
            <rect x="56" y="86" width="88" height="84" rx="22" />
          </clipPath>
        </defs>

        {/* pulsing security rings */}
        {[78, 92].map((r, i) => (
          <motion.circle
            key={r}
            cx="100"
            cy="112"
            r={r}
            stroke="#1E3A8A"
            strokeOpacity="0.35"
            strokeWidth="1"
            initial={{ opacity: 0.15, scale: 0.96 }}
            animate={reduce ? {} : { opacity: [0.1, 0.4, 0.1], scale: [0.96, 1.02, 0.96] }}
            transition={{ duration: 5, delay: i * 0.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "100px 112px" }}
          />
        ))}
        <circle cx="100" cy="112" r="64" stroke="#334155" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 6" />

        {/* shackle */}
        <motion.path
          d="M72 96 V74 a28 28 0 0 1 56 0 V96"
          stroke="url(#lockShackle)"
          strokeWidth="11"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: EASE }}
        />

        {/* body */}
        <motion.g
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
        >
          <rect x="56" y="86" width="88" height="84" rx="22" fill="url(#lockBody)" />
          <rect x="56" y="86" width="88" height="84" rx="22" stroke="#334155" strokeWidth="1" />
          {/* sheen */}
          <rect x="56" y="86" width="88" height="84" rx="22" fill="url(#lockSheen)" opacity="0.5" />
          {/* moving shine */}
          {!reduce && (
            <g clipPath="url(#bodyClip)">
              <motion.rect
                x="-40"
                y="80"
                width="36"
                height="100"
                fill="#fff"
                opacity="0.08"
                transform="skewX(-18)"
                animate={{ x: [-40, 200] }}
                transition={{ duration: 4.5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
              />
            </g>
          )}
          {/* keyhole */}
          <circle cx="100" cy="120" r="14" fill="url(#keyGlow)" opacity="0.7" />
          <circle cx="100" cy="120" r="7" fill="#0B1220" stroke="#60A5FA" strokeWidth="1.5" />
          <path d="M100 126 L96 142 H104 Z" fill="#0B1220" stroke="#60A5FA" strokeWidth="1.5" strokeLinejoin="round" />
        </motion.g>
      </svg>

      {/* center seal chip */}
      <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-brand-100 backdrop-blur">
          <Lock className="h-3 w-3" /> Dados protegidos
        </span>
      </div>
    </div>
  );
}

const ASSURANCES = [
  {
    icon: ShieldCheck,
    title: "Criptografia de ponta a ponta",
    desc: "Os dados biométricos são protegidos do momento da captura até o armazenamento.",
  },
  {
    icon: RadioTower,
    title: "Tráfego seguro dos dados",
    desc: "Toda a comunicação entre o totem e a plataforma acontece por canais protegidos.",
  },
  {
    icon: Lock,
    title: "Conformidade com a LGPD",
    desc: "Consentimento formal e total transparência sobre o uso das informações dos alunos.",
  },
];

export default function CryptoSection() {
  return (
    <section
      id="seguranca"
      className="relative scroll-mt-24 overflow-hidden bg-[#0A0E1A] py-24 text-white lg:py-36"
    >
      {/* atmospheric backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.05]" />
      <div className="pointer-events-none absolute -left-40 top-0 h-[480px] w-[480px] rounded-full bg-brand-700/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[480px] w-[480px] rounded-full bg-brand-900/30 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-20">
          {/* copy */}
          <div className="order-2 lg:order-1">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200">
                <span className="h-1 w-1 rounded-full bg-brand-400" />
                Seção 03 · Segurança
              </span>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="mt-5 text-balance text-[clamp(2.1rem,4.4vw,3.4rem)] font-semibold leading-[1.02] tracking-tightest text-white">
                Criptografia a
                <br className="hidden sm:block" /> nível militar
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 max-w-lg text-balance text-lg leading-relaxed text-slate-300">
                Os dados biométricos dos alunos são instantaneamente
                criptografados, atendendo integralmente às exigências da LGPD.
              </p>
            </Reveal>

            <div className="mt-10 space-y-3">
              {ASSURANCES.map((a, i) => (
                <Reveal key={a.title} delay={0.06 * i}>
                  <div className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur transition-colors hover:border-white/15 hover:bg-white/[0.05]">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/[0.06] text-brand-200">
                      <a.icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {a.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">
                        {a.desc}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* graphic */}
          <Reveal delay={0.1} y={36} className="order-1 lg:order-2">
            <LockGraphic />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
