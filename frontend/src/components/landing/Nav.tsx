"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "./primitives";

const LINKS = [
  { id: "story", label: "Como funciona" },
  { id: "presenca", label: "Presença" },
  { id: "seguranca", label: "Segurança" },
  { id: "velocidade", label: "Velocidade" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        className={`pointer-events-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border px-4 py-2.5 transition-all duration-300 ${
          scrolled
            ? "border-slate-200/80 bg-white/80 shadow-card backdrop-blur-xl"
            : "border-transparent bg-white/0"
        }`}
      >
        <a href="#top" className="flex items-center" aria-label="Visage — início">
          <Wordmark />
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="#demo"
            className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-brand-700 sm:block"
          >
            Entrar
          </a>
          <a
            href="#demo"
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-pop transition-all duration-200 hover:bg-brand-700 hover:shadow-lift"
          >
            Solicitar demo
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
