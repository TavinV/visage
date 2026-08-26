"use client";

/* ================================================================== */
/*  Ilustrações da calibração guiada — estilo unDraw (Katerina        */
/*  Limpitsouni, undraw.co), redesenhadas na paleta flauzino-*.       */
/*                                                                    */
/*  São estáticas de propósito: o totem roda em tablets modestos e    */
/*  essas telas já animam a entrada do card.                          */
/* ================================================================== */

const NAVY = "#0b1220";
const NAVY_700 = "#13213a";
const ACCENT = "#2563eb";
const ACCENT_500 = "#3b82f6";
const ACCENT_100 = "#dbe6fe";
const ACCENT_50 = "#eef3ff";
const SLATE_50 = "#f6f8fb";
const SLATE_200 = "#e1e7ef";
const SLATE_300 = "#cbd4e1";
const SLATE_400 = "#9aa7bd";
const WHITE = "#ffffff";

/** Tons de pele variados — as pessoas da escola não são todas iguais. */
const SKINS = ["#f0c4ac", "#c68b6a", "#e8b69c", "#a9704e", "#d9a184"];

interface PersonProps {
  x?: number;
  y?: number;
  scale?: number;
  shirt: string;
  pants?: string;
  skin?: string;
  hair?: string;
}

/**
 * Boneco plano no estilo unDraw: sem rosto, silhueta em formas
 * arredondadas. Ancorado no centro da cabeça (0,0) — os ombros ficam
 * em y≈22 e os pés em y≈110; a largura total com os braços é ~54.
 */
function Person({
  x = 0,
  y = 0,
  scale = 1,
  shirt,
  pants = NAVY_700,
  skin = SKINS[0],
  hair = NAVY,
}: PersonProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* pernas e pés */}
      <rect x="-12" y="62" width="9.5" height="42" rx="4.75" fill={pants} />
      <rect x="2.5" y="62" width="9.5" height="42" rx="4.75" fill={pants} />
      <rect x="-15" y="99" width="13" height="9" rx="4.5" fill={NAVY} />
      <rect x="2" y="99" width="13" height="9" rx="4.5" fill={NAVY} />
      {/* pescoço */}
      <rect x="-5" y="10" width="10" height="16" rx="5" fill={skin} />
      {/* braços encostados no ombro, caindo ao lado do tronco */}
      <rect x="-21.5" y="26" width="7.5" height="36" rx="3.75" fill={shirt} />
      <rect x="14" y="26" width="7.5" height="36" rx="3.75" fill={shirt} />
      <circle cx="-17.75" cy="62" r="5" fill={skin} />
      <circle cx="17.75" cy="62" r="5" fill={skin} />
      {/* tronco com ombros arredondados */}
      <path d="M-14 34 a14 12 0 0 1 28 0 v30 a5 5 0 0 1 -5 5 h-18 a5 5 0 0 1 -5 -5 z" fill={shirt} />
      {/* cabeça e cabelo */}
      <circle cx="0" cy="0" r="15" fill={skin} />
      <path d="M-14.1 -5 A15 15 0 0 1 14.1 -5 Z" fill={hair} />
    </g>
  );
}

/** Selo circular sobreposto à cena (confirmação, interrogação). */
function Badge({
  x,
  y,
  r = 21,
  fill,
  children,
}: {
  x: number;
  y: number;
  r?: number;
  fill: string;
  children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r + 4} fill={WHITE} />
      <circle r={r} fill={fill} />
      {children}
    </g>
  );
}

/** Chão discreto — assenta as figuras sem virar uma linha dura. */
function Ground({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry="9" fill={SLATE_200} />;
}

function Check({ scale = 1 }: { scale?: number }) {
  return (
    <path
      d="M-9 0.5 L-3 6.5 L9 -6"
      transform={`scale(${scale})`}
      fill="none"
      stroke={WHITE}
      strokeWidth={4.5 / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Celular de pé mostrando uma foto de rosto na tela. */
function Phone({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-34" y="-62" width="68" height="124" rx="12" fill={NAVY} />
      <rect x="-28" y="-55" width="56" height="110" rx="6" fill={ACCENT_50} />
      <rect x="-8" y="-59" width="16" height="3" rx="1.5" fill={SLATE_400} />
      {/* retrato exibido na tela */}
      <circle cx="0" cy="-14" r="14" fill={SKINS[2]} />
      <path d="M-13.1 -19 A14 14 0 0 1 13.1 -19 Z" fill={NAVY_700} />
      <path d="M-24 55 v-20 a24 21 0 0 1 48 0 v20 z" fill={ACCENT_500} />
    </g>
  );
}

/** Tablet sobre pedestal, com a câmera virada para a cena. */
function Totem({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-18" y="88" width="36" height="16" rx="5" fill={NAVY_700} />
      <rect x="-8" y="42" width="16" height="50" rx="5" fill={SLATE_400} />
      <rect x="-48" y="-56" width="96" height="106" rx="12" fill={NAVY} />
      <rect x="-41" y="-49" width="82" height="92" rx="7" fill={WHITE} />
      <circle cx="0" cy="-11" r="24" fill={ACCENT_100} />
      <circle cx="0" cy="-11" r="12" fill={ACCENT} />
      <circle cx="4" cy="-16" r="4" fill={WHITE} />
    </g>
  );
}

/* ── 1. O que preparar: dois grupos de pessoas e um celular ────────── */

export function PreparationIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 460 250"
      className={className}
      role="img"
      aria-label="Duas pessoas de um lado, três de outro e um celular com a foto de um rosto"
    >
      <rect x="6" y="36" width="160" height="170" rx="24" fill={ACCENT_50} />
      <rect x="180" y="36" width="196" height="170" rx="24" fill={SLATE_50} />

      <Ground cx={88} cy={190} rx={62} />
      <Ground cx={278} cy={188} rx={84} />
      <Ground cx={420} cy={190} rx={28} />

      <Person x={62} y={96} shirt={ACCENT} skin={SKINS[0]} scale={0.88} />
      <Person x={116} y={96} shirt={ACCENT_500} skin={SKINS[1]} hair={NAVY_700} scale={0.88} />

      <Person x={224} y={100} shirt={SLATE_300} pants={NAVY_700} skin={SKINS[2]} scale={0.82} />
      <Person x={278} y={94} shirt={SLATE_400} pants={NAVY_700} skin={SKINS[3]} scale={0.87} />
      <Person x={332} y={100} shirt={SLATE_300} pants={NAVY_700} skin={SKINS[4]} hair={NAVY_700} scale={0.82} />

      <Phone x={420} y={152} scale={0.62} />
    </svg>
  );
}

/* ── 2. Grupo 1: as pessoas que o totem vai reconhecer ─────────────── */

export function KnownGroupIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 250"
      className={className}
      role="img"
      aria-label="Duas pessoas diante do totem, aprovadas com um sinal de confirmação"
    >
      <circle cx="146" cy="120" r="110" fill={ACCENT_50} />
      <Ground cx={150} cy={202} rx={110} />
      <Ground cx={356} cy={204} rx={50} />

      <Person x={106} y={96} shirt={ACCENT} skin={SKINS[0]} />
      <Person x={198} y={100} shirt={ACCENT_500} skin={SKINS[3]} hair={NAVY_700} scale={0.96} />

      <Totem x={356} y={106} scale={0.94} />

      <Badge x={252} y={66} fill={ACCENT}>
        <Check />
      </Badge>
    </svg>
  );
}

/* ── 3. Grupo 2: as pessoas que o totem não pode confundir ─────────── */

export function OutsiderGroupIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 250"
      className={className}
      role="img"
      aria-label="Três pessoas de fora da instituição, marcadas com um ponto de interrogação"
    >
      <circle cx="220" cy="120" r="112" fill={SLATE_50} />
      <Ground cx={220} cy={202} rx={146} />

      <Person x={132} y={104} shirt={SLATE_300} pants={NAVY_700} skin={SKINS[1]} scale={0.91} />
      <Person x={220} y={94} shirt={SLATE_400} pants={NAVY_700} skin={SKINS[2]} hair={NAVY_700} />
      <Person x={308} y={104} shirt={SLATE_300} pants={NAVY_700} skin={SKINS[4]} scale={0.91} />

      <Badge x={220} y={56} fill={SLATE_400}>
        <text textAnchor="middle" y="10" fill={WHITE} fontSize="28" fontWeight="700">
          ?
        </text>
      </Badge>
    </svg>
  );
}

/* ── 4. O teste do celular: uma foto na tela diante da câmera ──────── */

export function ScreenAttackIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 250"
      className={className}
      role="img"
      aria-label="Uma mão levantando um celular com a foto de um rosto diante da câmera do totem"
    >
      <circle cx="146" cy="116" r="104" fill={ACCENT_50} />
      <Ground cx={330} cy={206} rx={60} />

      {/* manga entrando pela base, erguendo o celular */}
      <rect
        x="34"
        y="186"
        width="124"
        height="26"
        rx="13"
        fill={ACCENT}
        transform="rotate(-14 96 199)"
      />
      <Phone x={148} y={106} />
      {/* mão fechada na borda inferior — a foto continua visível acima */}
      <rect
        x="122"
        y="158"
        width="54"
        height="26"
        rx="13"
        fill={SKINS[0]}
        transform="rotate(-14 149 171)"
      />

      <Totem x={330} y={100} />

      {/* linha de visada entre a tela e a câmera */}
      <path
        d="M192 92 H272"
        stroke={SLATE_300}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="2 12"
      />
    </svg>
  );
}

/* ── 5. Pessoa concluída — overlay entre uma pessoa e a próxima ────── */

export function PersonDoneIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 220"
      className={className}
      role="img"
      aria-label="Uma pessoa com um sinal de confirmação"
    >
      <circle cx="126" cy="100" r="92" fill={ACCENT_50} />
      <Ground cx={126} cy={186} rx={78} />
      <Person x={118} y={70} shirt={ACCENT} skin={SKINS[0]} scale={1.06} />
      <Badge x={186} y={62} r={26} fill={ACCENT}>
        <Check scale={1.22} />
      </Badge>
    </svg>
  );
}

/* ── 6. Coleta concluída — o resultado volta para o painel ─────────── */

export function CollectionDoneIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 220"
      className={className}
      role="img"
      aria-label="Um painel com o gráfico da calibração pronto e um sinal de confirmação"
    >
      <circle cx="126" cy="98" r="92" fill={ACCENT_50} />
      <Ground cx={126} cy={182} rx={82} />

      <rect x="46" y="34" width="150" height="112" rx="12" fill={NAVY} />
      <rect x="53" y="41" width="136" height="98" rx="7" fill={WHITE} />
      <rect x="107" y="146" width="28" height="26" fill={SLATE_400} />
      <rect x="79" y="170" width="84" height="12" rx="6" fill={NAVY_700} />

      <rect x="68" y="52" width="40" height="8" rx="4" fill={SLATE_200} />
      <rect x="68" y="98" width="18" height="26" rx="4" fill={ACCENT_100} />
      <rect x="94" y="80" width="18" height="44" rx="4" fill={ACCENT_500} />
      <rect x="120" y="72" width="18" height="52" rx="4" fill={ACCENT} />

      <Badge x={182} y={122} r={26} fill={ACCENT}>
        <Check scale={1.22} />
      </Badge>
    </svg>
  );
}
