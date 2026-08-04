"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { EASE, Wordmark } from "./primitives";

const LINKS = [
  { id: "plataforma", label: "Como funciona" },
  { id: "recursos", label: "Recursos" },
  { id: "seguranca", label: "Segurança" },
  { id: "planos", label: "Planos" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // trava o scroll do body e fecha no ESC enquanto a gaveta está aberta
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        className={`pointer-events-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border px-4 py-2.5 transition-all duration-300 ${
          scrolled || open
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
          <Link
            href="/login"
            className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-brand-700 sm:block"
          >
            Entrar
          </Link>
          <Link
            href="/demonstracao"
            className="group hidden cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-pop transition-all duration-200 hover:bg-brand-700 hover:shadow-lift sm:inline-flex"
          >
            Solicitar demo
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>

          {/* hambúrguer — só no mobile */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* gaveta lateral mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            className="pointer-events-auto fixed inset-0 z-[60] bg-flauzino-navy-950/45 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            role="dialog"
            aria-modal="true"
            className="pointer-events-auto fixed inset-y-0 right-0 z-[70] flex w-[86vw] max-w-sm flex-col bg-white shadow-lift md:hidden"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <a
                  href="#top"
                  className="flex items-center"
                  aria-label="Visage — início"
                  onClick={() => setOpen(false)}
                >
                  <Wordmark />
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar menu"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-5">
                {LINKS.map((l, i) => (
                  <motion.a
                    key={l.id}
                    href={`#${l.id}`}
                    onClick={() => setOpen(false)}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.08 + i * 0.05, ease: EASE }}
                    className="rounded-xl px-3.5 py-3 text-[15px] font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                  >
                    {l.label}
                  </motion.a>
                ))}
              </nav>

              <div className="flex flex-col gap-2.5 border-t border-slate-100 px-5 py-5">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                >
                  Entrar
                </Link>
                <Link
                  href="/demonstracao"
                  onClick={() => setOpen(false)}
                  className="group inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-pop transition-all duration-200 hover:bg-brand-700 hover:shadow-lift"
                >
                  Solicitar demo
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
