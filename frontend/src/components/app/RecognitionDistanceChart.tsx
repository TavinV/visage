"use client";

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";

interface CurvePoint {
  threshold: number;
  genuine_accept_rate: number;
  false_acceptance_rate: number;
}

interface ChartOption {
  profile: string;
  profile_label: string;
  threshold: number;
}

interface RecognitionDistanceChartProps {
  curve: CurvePoint[];
  options: ChartOption[];
  selectedProfile: string;
  onSelectProfile: (profile: string) => void;
}

const KNOWN_COLOR = "#2563eb";
const FRAUD_COLOR = "#b3261e";
const WIDTH = 600;
const HEIGHT = 210;
const PAD_LEFT = 30;
const PAD_RIGHT = 30;
const PAD_TOP = 34;
const PAD_BOTTOM = 10;
const LABEL_HALF_WIDTH = 32;
const MIN_LABEL_GAP = 66;

/** Curva suave (Catmull-Rom) entre os pontos — evita o visual quadriculado de um histograma. */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  }
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

interface ThresholdMark extends ChartOption {
  x: number;
  labelX: number;
}

/**
 * Curva de troca entre acerto e risco: conforme o limiar fica mais permissivo
 * (esquerda → direita), mais pessoas conhecidas são reconhecidas de primeira,
 * mas também mais gente de fora consegue passar. As linhas verticais marcam
 * onde cada perfil corta essa curva — clicar num rótulo seleciona o perfil.
 */
export function RecognitionDistanceChart({
  curve,
  options,
  selectedProfile,
  onSelectProfile,
}: RecognitionDistanceChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (curve.length === 0) return null;

    const domainMin = curve[0].threshold;
    const domainMax = curve[curve.length - 1].threshold;
    const span = domainMax - domainMin || 1;
    const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const baselineY = PAD_TOP + innerHeight;

    const xScale = (v: number) => PAD_LEFT + ((v - domainMin) / span) * innerWidth;
    const yScale = (rate: number) => PAD_TOP + innerHeight - rate * innerHeight;

    const knownPoints = curve.map((p): [number, number] => [xScale(p.threshold), yScale(p.genuine_accept_rate)]);
    const fraudPoints = curve.map((p): [number, number] => [xScale(p.threshold), yScale(p.false_acceptance_rate)]);

    const knownLine = smoothPath(knownPoints);
    const fraudLine = smoothPath(fraudPoints);
    const knownArea = `${knownLine} L ${knownPoints[knownPoints.length - 1][0].toFixed(2)} ${baselineY} L ${knownPoints[0][0].toFixed(2)} ${baselineY} Z`;
    const fraudArea = `${fraudLine} L ${fraudPoints[fraudPoints.length - 1][0].toFixed(2)} ${baselineY} L ${fraudPoints[0][0].toFixed(2)} ${baselineY} Z`;

    const marks: ThresholdMark[] = [...options]
      .sort((a, b) => a.threshold - b.threshold)
      .map((opt) => ({ ...opt, x: xScale(opt.threshold), labelX: xScale(opt.threshold) }));
    const minX = PAD_LEFT + LABEL_HALF_WIDTH;
    const maxX = WIDTH - PAD_RIGHT - LABEL_HALF_WIDTH;
    if (marks.length > 0) {
      marks[0].labelX = Math.max(marks[0].labelX, minX);
      for (let i = 1; i < marks.length; i++) {
        marks[i].labelX = Math.max(marks[i].labelX, marks[i - 1].labelX + MIN_LABEL_GAP);
      }
      const last = marks[marks.length - 1];
      if (last.labelX > maxX) {
        const overflow = last.labelX - maxX;
        marks.forEach((m) => (m.labelX -= overflow));
      }
      marks.forEach((m) => (m.labelX = Math.min(Math.max(m.labelX, minX), maxX)));
    }

    return { knownLine, fraudLine, knownArea, fraudArea, marks, baselineY, xScale, yScale, innerWidth };
  }, [curve, options]);

  if (!chart) return null;

  const hovered = hoverIdx !== null ? curve[hoverIdx] : null;
  const crosshairX = hovered ? chart.xScale(hovered.threshold) : null;

  const handleMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - bounds.left;
    const frac = Math.min(Math.max(relX / bounds.width, 0), 1);
    setHoverIdx(Math.round(frac * (curve.length - 1)));
  };

  return (
    <div className="rounded-xl border border-flauzino-slate-200 p-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Curva mostrando, para cada limiar, quantas pessoas conhecidas são reconhecidas e quantas pessoas de fora conseguem passar"
      >
        {[0, 0.5, 1].map((f) => {
          const y = PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="#e1e7ef" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#9aa7bd">
                {Math.round(f * 100)}%
              </text>
            </g>
          );
        })}

        <path d={chart.knownArea} fill={KNOWN_COLOR} fillOpacity={0.12} stroke="none" />
        <path d={chart.fraudArea} fill={FRAUD_COLOR} fillOpacity={0.12} stroke="none" />
        <path d={chart.knownLine} fill="none" stroke={KNOWN_COLOR} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d={chart.fraudLine} fill="none" stroke={FRAUD_COLOR} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={chart.innerWidth}
          height={chart.baselineY - PAD_TOP}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        />

        {crosshairX !== null && hovered && (
          <g pointerEvents="none">
            <line x1={crosshairX} x2={crosshairX} y1={PAD_TOP} y2={chart.baselineY} stroke="#cbd4e1" strokeWidth={1} />
            <circle cx={crosshairX} cy={chart.yScale(hovered.genuine_accept_rate)} r={4} fill={KNOWN_COLOR} stroke="#fff" strokeWidth={2} />
            <circle cx={crosshairX} cy={chart.yScale(hovered.false_acceptance_rate)} r={4} fill={FRAUD_COLOR} stroke="#fff" strokeWidth={2} />
          </g>
        )}

        {chart.marks.map((mark) => {
          const selected = mark.profile === selectedProfile;
          return (
            <g key={mark.profile} onClick={() => onSelectProfile(mark.profile)} className="cursor-pointer">
              <line
                x1={mark.x}
                x2={mark.x}
                y1={PAD_TOP - 2}
                y2={chart.baselineY}
                stroke={selected ? "#1d4ed8" : "#9aa7bd"}
                strokeWidth={selected ? 2 : 1.25}
                strokeDasharray={selected ? undefined : "3 3"}
              />
              {Math.abs(mark.labelX - mark.x) > 1 && (
                <line x1={mark.x} x2={mark.labelX} y1={PAD_TOP - 2} y2={PAD_TOP - 2} stroke="#cbd4e1" strokeWidth={1} />
              )}
              <rect
                x={mark.labelX - LABEL_HALF_WIDTH}
                y={PAD_TOP - 24}
                width={LABEL_HALF_WIDTH * 2}
                height={17}
                rx={8.5}
                fill={selected ? "#2563eb" : "#eef2f7"}
              />
              <text
                x={mark.labelX}
                y={PAD_TOP - 12}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={600}
                fill={selected ? "#ffffff" : "#4d5b72"}
              >
                {mark.profile_label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-flauzino-slate-400">
        <span>Limiar mais rígido</span>
        <span>Limiar mais permissivo</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-flauzino-slate-100 pt-3 text-[12px] text-flauzino-slate-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KNOWN_COLOR }} />
          Pessoas conhecidas reconhecidas
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FRAUD_COLOR }} />
          Pessoas de fora que conseguem passar
        </span>
        <span className="ml-auto text-flauzino-slate-400">
          {hovered
            ? `${Math.round(hovered.genuine_accept_rate * 100)}% reconhecidos · ${Math.round(hovered.false_acceptance_rate * 100)}% de fora passam`
            : "Passe o mouse para comparar · toque num rótulo para escolher o perfil"}
        </span>
      </div>
    </div>
  );
}
