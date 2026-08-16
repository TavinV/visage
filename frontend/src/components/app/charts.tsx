"use client";

/**
 * Gráficos em SVG puro para o console.
 *
 * Nada de biblioteca: os gráficos daqui são poucos e simples, e uma dependência
 * de 100kB para desenhar quatro linhas custaria mais do que resolve. Todos
 * medem o próprio container (ResizeObserver) e desenham em pixels reais — sem
 * `preserveAspectRatio`, que esticaria traços e textos.
 */

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export const chartColors = {
  accent: "#2563eb",
  accentSoft: "#93C5FD",
  success: "#1f7a4d",
  danger: "#b3261e",
  warning: "#b07410",
  slate: "#9aa7bd",
} as const;

/**
 * Sequência para séries de tamanho desconhecido (um plano, um tenant…).
 * Ordenada por contraste: as duas primeiras já se separam em preto e branco.
 */
export const chartPalette = [
  chartColors.accent,
  chartColors.success,
  chartColors.warning,
  chartColors.accentSoft,
  chartColors.danger,
  chartColors.slate,
] as const;

/** Cor estável para o índice `i` de uma lista sem tamanho fixo. */
export function paletteColor(index: number): string {
  return chartPalette[index % chartPalette.length];
}

// ── Medição ───────────────────────────────────────────────────────────────────

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - next) > 1 ? next : current));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/** Teto "redondo" do eixo Y — 137 vira 150, 1.020 vira 1.100. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// ── Gráfico de linhas / área ─────────────────────────────────────────────────

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** Preenche a área sob a linha — use em uma série só, senão vira borrão. */
  area?: boolean;
  dashed?: boolean;
}

interface TrendChartProps {
  /** Rótulos do eixo X, um por ponto (já formatados). */
  labels: string[];
  series: ChartSeries[];
  height?: number;
  /** Formatação dos valores no eixo e no tooltip. */
  formatValue?: (value: number) => string;
  /** Teto fixo do eixo Y (ex.: 100 para percentuais). */
  maxValue?: number;
  emptyMessage?: string;
  className?: string;
}

const PADDING = { top: 14, right: 14, bottom: 24, left: 44 };

export function TrendChart({
  labels,
  series,
  height = 220,
  formatValue = (v) => String(Math.round(v)),
  maxValue,
  emptyMessage = "Sem dados no período.",
  className,
}: TrendChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const points = labels.length;
  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const hasData = points > 0 && allValues.some((v) => v > 0);

  const top = maxValue ?? niceMax(Math.max(...allValues, 0));
  const innerWidth = Math.max(width - PADDING.left - PADDING.right, 10);
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const xAt = (index: number) =>
    PADDING.left + (points <= 1 ? innerWidth / 2 : (innerWidth * index) / (points - 1));
  const yAt = (value: number) => PADDING.top + innerHeight * (1 - value / top);

  /** Quebra o traçado em lacunas (dia sem medição não vira linha reta). */
  const pathOf = (values: Array<number | null>) => {
    let d = "";
    let pen = false;
    values.forEach((value, index) => {
      if (value === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const areaOf = (values: Array<number | null>) => {
    const line = pathOf(values);
    if (!line) return "";
    const firstIndex = values.findIndex((v) => v !== null);
    const lastIndex = values.length - 1 - [...values].reverse().findIndex((v) => v !== null);
    const base = PADDING.top + innerHeight;
    return `${line}L${xAt(lastIndex).toFixed(1)} ${base}L${xAt(firstIndex).toFixed(1)} ${base}Z`;
  };

  // Três linhas de grade bastam para dar referência sem virar papel milimetrado
  const ticks = [0, top / 2, top];

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }}>
      {width > 0 && hasData && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={series.map((s) => s.label).join(", ")}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left - PADDING.left) / innerWidth;
            const index = Math.round(ratio * (points - 1));
            setHover(Math.min(points - 1, Math.max(0, index)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="#e1e7ef"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={yAt(tick) + 3}
                textAnchor="end"
                className="fill-flauzino-slate-400 font-mono-ds"
                style={{ fontSize: 10 }}
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {series.map((s) => (
            <g key={s.key}>
              {s.area && (
                <path d={areaOf(s.values)} fill={`url(#${gradientId}-${s.key})`} />
              )}
              <path
                d={pathOf(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "5 4" : undefined}
              />
            </g>
          ))}

          {hover !== null && (
            <g>
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={PADDING.top}
                y2={PADDING.top + innerHeight}
                stroke="#cbd4e1"
                strokeWidth={1}
              />
              {series.map((s) => {
                const value = s.values[hover];
                if (value === null || value === undefined) return null;
                return (
                  <circle
                    key={s.key}
                    cx={xAt(hover)}
                    cy={yAt(value)}
                    r={3.5}
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}

          {/* Primeiro e último rótulo: com 30 dias, todos viram borrão */}
          <text
            x={PADDING.left}
            y={height - 6}
            className="fill-flauzino-slate-400"
            style={{ fontSize: 10 }}
          >
            {labels[0]}
          </text>
          <text
            x={width - PADDING.right}
            y={height - 6}
            textAnchor="end"
            className="fill-flauzino-slate-400"
            style={{ fontSize: 10 }}
          >
            {labels[points - 1]}
          </text>
        </svg>
      )}

      {width > 0 && !hasData && (
        <div className="flex h-full items-center justify-center text-sm text-flauzino-slate-400">
          {emptyMessage}
        </div>
      )}

      {hover !== null && hasData && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[140px] rounded-lg border border-flauzino-slate-200 bg-white px-3 py-2 shadow-fl-md"
          style={{
            left: Math.min(Math.max(xAt(hover) - 70, 0), Math.max(width - 150, 0)),
          }}
        >
          <p className="text-[11px] font-semibold text-flauzino-navy-900">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-[11px]">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-flauzino-slate-500">{s.label}</span>
              <b className="ml-auto font-mono-ds font-semibold text-flauzino-navy-900">
                {s.values[hover] === null || s.values[hover] === undefined
                  ? "—"
                  : formatValue(s.values[hover] as number)}
              </b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legenda compartilhada pelos gráficos de linha. */
export function ChartLegend({ series }: { series: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-xs text-flauzino-slate-500">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Barras ────────────────────────────────────────────────────────────────────

interface BarsChartProps {
  bars: Array<{ label: string; value: number; hint?: string }>;
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
}

export function BarsChart({
  bars,
  color = chartColors.accent,
  height = 160,
  formatValue = (v) => String(v),
  emptyMessage = "Sem dados no período.",
}: BarsChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0));
  const hasData = bars.some((b) => b.value > 0);

  const bottom = 18;
  const innerHeight = height - bottom;
  const slot = bars.length > 0 ? width / bars.length : 0;
  const barWidth = Math.max(slot - 3, 2);

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && hasData && (
        <svg width={width} height={height} role="img" aria-label="Distribuição por hora">
          {bars.map((bar, index) => {
            const barHeight = Math.max((bar.value / max) * innerHeight, bar.value > 0 ? 2 : 0);
            return (
              <g key={bar.label}>
                <rect
                  x={index * slot + 1.5}
                  y={innerHeight - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={color}
                  opacity={bar.value > 0 ? 0.85 : 0.15}
                >
                  <title>{bar.hint ?? `${bar.label}: ${formatValue(bar.value)}`}</title>
                </rect>
                {/* Rótulo a cada 3 barras — 24 horas não cabem lado a lado */}
                {index % 3 === 0 && (
                  <text
                    x={index * slot + barWidth / 2 + 1.5}
                    y={height - 5}
                    textAnchor="middle"
                    className="fill-flauzino-slate-400 font-mono-ds"
                    style={{ fontSize: 9 }}
                  >
                    {bar.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {width > 0 && !hasData && (
        <div className="flex h-full items-center justify-center text-sm text-flauzino-slate-400">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

// ── Rosca ─────────────────────────────────────────────────────────────────────

interface DonutChartProps {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
  /** Texto grande no centro (ex.: total). */
  centerValue?: string;
  centerLabel?: string;
  /** Formatação dos valores da legenda (ex.: moeda). */
  formatValue?: (value: number) => string;
}

export function DonutChart({
  slices,
  size = 148,
  centerValue,
  centerLabel,
  formatValue = (v) => String(v),
}: DonutChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} role="img" aria-label="Resultados do reconhecimento">
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="#eef2f7" strokeWidth={14} />
          {total > 0 &&
            slices.map((slice) => {
              const length = (slice.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const element = (
                <circle
                  key={slice.label}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={14}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                >
                  <title>{`${slice.label}: ${formatValue(slice.value)}`}</title>
                </circle>
              );
              offset += length;
              return element;
            })}
        </g>
        {centerValue && (
          <text
            x={size / 2}
            y={size / 2 - 2}
            textAnchor="middle"
            className="fill-flauzino-navy-900 font-mono-ds"
            style={{ fontSize: 20, fontWeight: 600 }}
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x={size / 2}
            y={size / 2 + 14}
            textAnchor="middle"
            className="fill-flauzino-slate-500"
            style={{ fontSize: 10 }}
          >
            {centerLabel}
          </text>
        )}
      </svg>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: slice.color }}
            />
            <span className="truncate text-flauzino-slate-600">{slice.label}</span>
            <span className="ml-auto font-mono-ds font-semibold text-flauzino-navy-900">
              {formatValue(slice.value)}
            </span>
            <span className="w-12 text-right font-mono-ds text-flauzino-slate-400">
              {total > 0 ? `${Math.round((slice.value / total) * 100)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

/** Miniatura sem eixos para dentro dos cards de indicador. */
export function Sparkline({
  values,
  color = chartColors.accent,
  height = 34,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const gradientId = useId();
  const max = Math.max(...values, 1);

  const path = values
    .map((value, index) => {
      const x = values.length <= 1 ? width / 2 : (width * index) / (values.length - 1);
      const y = height - 3 - (value / max) * (height - 6);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && values.length > 1 && (
        <svg width={width} height={height} aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${path}L${width} ${height}L0 ${height}Z`} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ── Barra de progresso ────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  color = chartColors.accent,
}: {
  /** Percentual de 0 a 100. */
  value: number;
  color?: string;
}) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-flauzino-slate-100"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}
