"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { maskCpf, isCompleteCpf } from "@/lib/masks";
import type { TotemIdentification } from "@/lib/deviceApi";
import { EagleMark } from "@/components/ui/Logo";

/**
 * Peças dos fluxos guiados do totem — cadastro e exclusão da biometria.
 * Os dois começam pela mesma identificação (CPF ou matrícula, conforme a
 * instituição), avançam pelo mesmo stepper e terminam num cartão de
 * desfecho; só o miolo de cada passo muda.
 */

export interface WizardStep {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface WizardShellProps {
  steps: ReadonlyArray<WizardStep>;
  /** Passo atual. Fora da lista (telas finais), o stepper some. */
  current: string;
  onExit: () => void;
  /** Rótulo acessível do botão de sair. */
  exitLabel: string;
  /** Palco de captura em tela cheia, quando houver. */
  stage?: ReactNode;
  children: ReactNode;
}

/** Tela branca com marca, botão de sair, stepper e o cartão do passo atual. */
export function WizardShell({ steps, current, onExit, exitLabel, stage, children }: WizardShellProps) {
  const reduceMotion = useReducedMotion();
  const stepIndex = steps.findIndex((s) => s.key === current);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col items-center overflow-y-auto bg-white px-4 py-5 md:px-8 md:py-6"
    >
      {/* Topo: marca + sair */}
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="flex items-center gap-2.5 text-flauzino-navy-900">
          <EagleMark size={26} />
          <span className="text-lg font-semibold tracking-tight">Visage</span>
        </span>
        <button
          type="button"
          onClick={onExit}
          aria-label={exitLabel}
          className="rounded-lg p-2.5 text-flauzino-slate-400 transition-colors hover:bg-flauzino-slate-100 hover:text-flauzino-navy-900"
        >
          <X size={20} />
        </button>
      </div>

      {/* Stepper com ícones */}
      {stepIndex >= 0 && (
        <div className="mt-5 flex w-full max-w-2xl items-center gap-2">
          {steps.map((s, i) => {
            const done = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={s.key} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors duration-300",
                    done
                      ? "bg-flauzino-success-600"
                      : isCurrent
                        ? "bg-flauzino-accent-600"
                        : "bg-flauzino-slate-200"
                  )}
                />
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    done
                      ? "text-flauzino-success-600"
                      : isCurrent
                        ? "text-flauzino-accent-700"
                        : "text-flauzino-slate-400"
                  )}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : <s.icon size={12} strokeWidth={2} />}
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Conteúdo do passo — key troca o card e anima só na entrada. Sem
          AnimatePresence mode="wait": um totem não pode travar caso o callback
          de fim-de-saída da animação não dispare (aba em background, rAF lento). */}
      <div className="flex w-full max-w-2xl flex-1 items-center py-5 md:py-6">
        <div className="w-full">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 42 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 190, damping: 24 }}
            className="w-full"
          >
            {children}
          </motion.div>
        </div>
      </div>

      {/* Palco de captura em tela cheia — fora do wrapper animado (transform
          criaria um containing block e quebraria o position: fixed) */}
      {stage}
    </motion.div>
  );
}

/** Textos da identificação por tipo de identificador pedido pela instituição. */
const identifyCopy: Record<
  TotemIdentification,
  { label: string; hint: string; placeholder: string }
> = {
  cpf: {
    label: "CPF",
    hint: "Digite o CPF informado na sua matrícula.",
    placeholder: "000.000.000-00",
  },
  enrollment_code: {
    label: "Matrícula",
    hint: "Digite o número da sua matrícula na instituição.",
    placeholder: "Ex.: 2026001234",
  },
  any: {
    label: "CPF ou matrícula",
    hint: "Digite o seu CPF ou o número da sua matrícula.",
    placeholder: "CPF ou matrícula",
  },
};

export function identifierCopy(identification: TotemIdentification) {
  return identifyCopy[identification] ?? identifyCopy.cpf;
}

/** CPF só vale completo; matrícula não tem tamanho fixo entre instituições. */
export function identifierReady(identification: TotemIdentification, value: string): boolean {
  return identification === "cpf" ? isCompleteCpf(value) : value.trim().length >= 3;
}

interface IdentifierStepProps {
  /** Nome do fluxo acima do título. */
  eyebrow: string;
  identification: TotemIdentification;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}

/** Primeira tela: o aluno digita o CPF ou a matrícula. */
export function IdentifierStep({
  eyebrow,
  identification,
  value,
  onChange,
  error,
  busy,
  onSubmit,
}: IdentifierStepProps) {
  const copy = identifierCopy(identification);
  // Máscara e teclado numérico só no modo CPF puro: matrícula pode ter letras,
  // e no modo misto o aluno escolhe o que digitar
  const cpfOnly = identification === "cpf";
  const ready = identifierReady(identification, value);

  return (
    <div className="rounded-2xl border border-flauzino-slate-200 bg-white p-6 shadow-fl-lg md:p-10">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-flauzino-navy-900 md:text-3xl">
        Vamos te identificar
      </h2>
      <p className="mt-2 text-[15px] text-flauzino-slate-500">{copy.hint}</p>
      <form
        className="mx-auto mt-7 flex max-w-sm flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          value={value}
          onChange={(e) => onChange(cpfOnly ? maskCpf(e.target.value) : e.target.value)}
          placeholder={copy.placeholder}
          inputMode={cpfOnly ? "numeric" : "text"}
          autoComplete="off"
          autoCapitalize="characters"
          aria-label={copy.label}
          className={cn(
            "h-14 w-full rounded-xl border bg-white text-center font-mono-ds text-xl tracking-[0.05em] text-flauzino-navy-900 shadow-fl-inset transition-colors",
            "placeholder:text-flauzino-slate-300 focus:border-flauzino-accent-500 focus:shadow-fl-focus focus:outline-none",
            error ? "border-flauzino-danger-600" : "border-flauzino-slate-300"
          )}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-flauzino-danger-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!ready || busy}
          className={cn(
            "mt-5 flex h-13 min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white transition-colors",
            ready && !busy
              ? "bg-flauzino-accent-600 shadow-fl-md hover:bg-flauzino-accent-700"
              : "cursor-not-allowed bg-flauzino-slate-200 text-flauzino-slate-400"
          )}
        >
          {busy ? "Consultando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}

interface WizardOutcomeProps {
  /** Ícone de um desfecho neutro. Sem ícone, desenha o check animado de sucesso. */
  icon?: ReactNode;
  title: string;
  message: string;
}

/** Cartão final do fluxo — sucesso ou desfecho neutro (recusa, falha). */
export function WizardOutcome({ icon, title, message }: WizardOutcomeProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-flauzino-slate-200 bg-white px-6 py-12 text-center shadow-fl-lg">
      {icon ? (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-flauzino-slate-100 text-flauzino-slate-500">
          {icon}
        </span>
      ) : (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 15 }}
          className="flex h-24 w-24 items-center justify-center rounded-full bg-flauzino-success-100 text-flauzino-success-600"
        >
          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
              stroke="currentColor"
            />
          </svg>
        </motion.span>
      )}
      <h2
        className={cn(
          "mt-6 font-semibold tracking-tight text-flauzino-navy-900",
          icon ? "text-2xl" : "text-3xl"
        )}
      >
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-flauzino-slate-500">{message}</p>
    </div>
  );
}
