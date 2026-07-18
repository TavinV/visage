"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface TotemClockProps {
  /** "local" usa o relógio do dispositivo; senão um fuso IANA (ex.: America/Sao_Paulo). */
  timezone?: string;
  variant?: "hero" | "compact";
  className?: string;
}

function parts(now: Date, timezone?: string) {
  const tz = timezone && timezone !== "local" ? timezone : undefined;
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(now);
  const get = (type: string) => time.find((p) => p.type === type)?.value ?? "00";
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(now);
  return { hh: get("hour"), mm: get("minute"), ss: get("second"), date };
}

/** Relógio do totem — segundos em tempo real, fuso configurável no painel. */
export function TotemClock({ timezone, variant = "hero", className }: TotemClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!now) return null;
  const { hh, mm, ss, date } = parts(now, timezone);

  if (variant === "compact") {
    return (
      <div className={cn("text-right leading-tight", className)}>
        <p className="font-mono-ds text-xl font-semibold tabular-nums text-flauzino-navy-900">
          {hh}:{mm}
          <span className="text-flauzino-slate-400">:{ss}</span>
        </p>
      </div>
    );
  }

  return (
    <div className={cn("text-center", className)}>
      <p
        className="font-mono-ds font-semibold tabular-nums leading-none tracking-tight text-flauzino-navy-900"
        style={{ fontSize: "clamp(4.5rem, 16vw, 9rem)" }}
      >
        {hh}:{mm}
        <span className="text-flauzino-slate-300">:{ss}</span>
      </p>
      <p className="mt-4 text-base capitalize text-flauzino-slate-500 md:text-lg">{date}</p>
    </div>
  );
}
