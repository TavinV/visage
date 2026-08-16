"use client";

/**
 * Cartões de indicador compartilhados pelos dois painéis — o da instituição
 * (/dashboard) e o da plataforma (/admin). Os números mudam; a leitura é a
 * mesma: rótulo, valor grande, variação contra o período anterior e uma
 * miniatura de tendência.
 */

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/** Variação percentual contra o período anterior. Null quando não há base. */
export function variation(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Seta de tendência. Em velocidade e fraude, cair é bom — daí o `lowerIsBetter`
 * decidir a cor em vez do sinal.
 */
export function TrendPill({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value === null || Math.abs(value) < 0.5) {
    return <span className="text-xs text-flauzino-slate-400">estável</span>;
  }

  const rising = value > 0;
  const good = lowerIsBetter ? !rising : rising;
  const Icon = rising ? TrendingUp : TrendingDown;

  return (
    <span
      className={
        good
          ? "flex items-center gap-1 text-xs font-medium text-flauzino-success-600"
          : "flex items-center gap-1 text-xs font-medium text-flauzino-danger-600"
      }
    >
      <Icon size={13} strokeWidth={2} />
      {`${rising ? "+" : ""}${value.toFixed(0)}%`}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
  trend,
  chart,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  loading: boolean;
  trend?: React.ReactNode;
  chart?: React.ReactNode;
  /** Torna o card clicável para a tela que detalha o indicador. */
  href?: string;
}) {
  const card = (
    <Card className={cn("p-5", href && "hover:border-flauzino-accent-100 hover:shadow-fl-md")}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-flauzino-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-flauzino-accent-50 text-flauzino-accent-600">
          {icon}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-2 flex items-baseline gap-2">
          <p className="font-mono-ds text-3xl font-semibold tracking-tight text-flauzino-navy-900">
            {value}
          </p>
          {trend}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-flauzino-slate-500">{hint}</p>}
      {chart && <div className="mt-3">{chart}</div>}
    </Card>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

/** Contador compacto da faixa secundária. */
export function MiniStat({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const card = (
    <Card
      className={cn(
        "flex h-full items-center gap-3 p-4",
        href && "hover:border-flauzino-accent-100 hover:shadow-fl-md"
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-flauzino-slate-100 text-flauzino-slate-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs text-flauzino-slate-500">{label}</span>
        <b className="font-mono-ds text-lg font-semibold text-flauzino-navy-900">{value}</b>
      </span>
    </Card>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}
