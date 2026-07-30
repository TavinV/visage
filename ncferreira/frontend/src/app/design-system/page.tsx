import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Copy,
  Plus,
  Search,
  Settings,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Design tokens (data)                                              */
/* ------------------------------------------------------------------ */

const BLUE_SCALE = [
  {
    step: "50",
    hex: "#EFF6FF",
    purpose: "App / section backgrounds",
    note: "Quiet info surfaces, hover wash",
    onDark: false,
  },
  {
    step: "100",
    hex: "#DBEAFE",
    purpose: "Subtle fills · selected rows",
    note: "Soft chips, table selection",
    onDark: false,
  },
  {
    step: "200",
    hex: "#BFDBFE",
    purpose: "Badge backgrounds · dividers",
    note: "Low-emphasis accents",
    onDark: false,
  },
  {
    step: "300",
    hex: "#93C5FD",
    purpose: "Disabled accents · gridlines",
    note: "Decorative, never text",
    onDark: false,
  },
  {
    step: "400",
    hex: "#60A5FA",
    purpose: "Secondary data series · illustration",
    note: "Charts, supportive graphics",
    onDark: false,
  },
  {
    step: "500",
    hex: "#3B82F6",
    purpose: "Focus rings · primary data series",
    note: "Highlights, active glow",
    onDark: true,
  },
  {
    step: "600",
    hex: "#2563EB",
    purpose: "PRIMARY — brand, buttons, key actions",
    note: "The one true call-to-action",
    onDark: true,
  },
  {
    step: "700",
    hex: "#1D4ED8",
    purpose: "Links · primary hover / pressed",
    note: "Interactive states",
    onDark: true,
  },
  {
    step: "800",
    hex: "#1E40AF",
    purpose: "Emphasis text on light",
    note: "Strong labels, active nav",
    onDark: true,
  },
  {
    step: "900",
    hex: "#1E3A8A",
    purpose: "Section headings",
    note: "High-contrast titles",
    onDark: true,
  },
  {
    step: "950",
    hex: "#172554",
    purpose: "Display headlines · max contrast",
    note: "Hero text on light",
    onDark: true,
  },
];

const NEUTRALS = [
  { name: "Canvas", hex: "#F6F7F9", purpose: "Page background" },
  { name: "Surface", hex: "#FFFFFF", purpose: "Cards & panels" },
  { name: "Border", hex: "#E5E7EB", purpose: "Hairlines & outlines" },
  { name: "Muted", hex: "#94A3B8", purpose: "Placeholder / disabled text" },
  { name: "Body", hex: "#475569", purpose: "Body copy" },
  { name: "Ink", hex: "#0F172A", purpose: "Primary text" },
];

const SEMANTIC = [
  {
    name: "Success",
    hex: "#16A34A",
    soft: "#DCFCE7",
    purpose: "Confirmed presence, positive deltas",
  },
  {
    name: "Warning",
    hex: "#D97706",
    soft: "#FEF3C7",
    purpose: "Pending review, attention",
  },
  {
    name: "Danger",
    hex: "#DC2626",
    soft: "#FEE2E2",
    purpose: "Fraud blocked, errors",
  },
  {
    name: "Info",
    hex: "#2563EB",
    soft: "#DBEAFE",
    purpose: "Neutral system messages",
  },
];

const TYPE_SCALE = [
  {
    label: "Display",
    cls: "text-5xl font-bold tracking-tight text-brand-950",
    size: "48 / 700",
    sample: "Presença comprovada",
  },
  {
    label: "Heading 1",
    cls: "text-4xl font-semibold tracking-tight text-brand-900",
    size: "36 / 600",
    sample: "Painel de frequência",
  },
  {
    label: "Heading 2",
    cls: "text-2xl font-semibold text-brand-900",
    size: "24 / 600",
    sample: "Turmas ativas hoje",
  },
  {
    label: "Heading 3",
    cls: "text-lg font-semibold text-slate-900",
    size: "18 / 600",
    sample: "Reconhecimento em tempo real",
  },
  {
    label: "Body Large",
    cls: "text-base font-normal text-slate-600 leading-relaxed",
    size: "16 / 400",
    sample:
      "Cada presença é validada por inteligência artificial e registrada com evidência completa.",
  },
  {
    label: "Body",
    cls: "text-sm font-normal text-slate-600 leading-relaxed",
    size: "14 / 400",
    sample: "Acompanhe todas as turmas em tempo real, sem atualizar a página.",
  },
  {
    label: "Caption",
    cls: "text-xs font-medium uppercase tracking-wider text-slate-400",
    size: "12 / 500",
    sample: "Atualizado há 2 minutos",
  },
];

const WEIGHTS = [
  { w: "Light", cls: "font-light", n: 300 },
  { w: "Regular", cls: "font-normal", n: 400 },
  { w: "Medium", cls: "font-medium", n: 500 },
  { w: "SemiBold", cls: "font-semibold", n: 600 },
  { w: "Bold", cls: "font-bold", n: 700 },
];

const RADII = [
  { name: "sm", px: "6px", cls: "rounded-md" },
  { name: "md", px: "8px", cls: "rounded-lg" },
  { name: "lg", px: "14px", cls: "rounded-xl" },
  { name: "xl", px: "18px", cls: "rounded-2xl" },
  { name: "full", px: "9999px", cls: "rounded-full" },
];

const SHADOWS = [
  { name: "soft", cls: "shadow-soft", use: "Inputs, flat cards" },
  { name: "card", cls: "shadow-card", use: "Raised panels, KPI cards" },
  { name: "pop", cls: "shadow-pop", use: "Primary CTA, popovers" },
];

const SPACING = [
  { token: "1", px: 4 },
  { token: "2", px: 8 },
  { token: "3", px: 12 },
  { token: "4", px: 16 },
  { token: "6", px: 24 },
  { token: "8", px: 32 },
  { token: "12", px: 48 },
];

const VIZ = [
  { hex: "#1D4ED8", label: "Series 1" },
  { hex: "#3B82F6", label: "Series 2" },
  { hex: "#60A5FA", label: "Series 3" },
  { hex: "#93C5FD", label: "Series 4" },
  { hex: "#BFDBFE", label: "Series 5" },
];

const NAV = [
  { id: "color", label: "Color" },
  { id: "type", label: "Type" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Forms" },
  { id: "cards", label: "Cards" },
  { id: "tokens", label: "Tokens" },
];

/* ------------------------------------------------------------------ */
/*  Primitives                                                         */
/* ------------------------------------------------------------------ */

function Section({
  id,
  eyebrow,
  title,
  desc,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 py-14 border-t border-slate-200/70 first:border-t-0"
    >
      <div className="mb-8">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-brand-900">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
          {desc}
        </p>
      </div>
      {children}
    </section>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 120;
  const h = 40;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 shadow-pop">
              <ShieldCheck
                className="h-[18px] w-[18px] text-white"
                strokeWidth={2.4}
              />
            </div>
            <div className="leading-none">
              <div className="text-sm font-semibold text-brand-950">Visage</div>
              <div className="text-[11px] font-medium text-slate-400">
                Design System
              </div>
            </div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Light ·
            v1.0
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6">
        {/* Intro */}
        <div className="py-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
            Poppins · Blue-driven · SaaS
          </div>
          <h1 className="mt-5 max-w-3xl text-5xl font-bold leading-[1.08] tracking-tight text-brand-950">
            A foundation in <span className="text-brand-600">blue</span>.
            <br /> Built for clarity and trust.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-500">
            A single source of truth for color, type, and components. Every
            shade of blue here carries a distinct, intentional purpose — from
            quiet backgrounds to the one true call-to-action.
          </p>
        </div>

        {/* ---------------- COLOR ---------------- */}
        <Section
          id="color"
          eyebrow="Foundations"
          title="Color — a purpose-driven blue scale"
          desc="Eleven steps of one hue. Each step is assigned a job, so blue never competes with itself. Neutrals and semantics support the brand without stealing focus."
        >
          {/* Blue scale */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BLUE_SCALE.map((c) => (
              <div
                key={c.step}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft"
              >
                <div
                  className="flex h-20 items-end justify-between p-3"
                  style={{ backgroundColor: c.hex }}
                >
                  <span
                    className={`text-xs font-semibold ${c.onDark ? "text-white/90" : "text-brand-900/80"}`}
                  >
                    brand-{c.step}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                      c.onDark
                        ? "bg-white/15 text-white"
                        : "bg-brand-950/5 text-brand-900"
                    }`}
                  >
                    <Copy className="h-3 w-3" /> {c.hex}
                  </span>
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {c.purpose}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{c.note}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Neutrals + Semantic */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Neutrals &amp; surfaces
              </h3>
              <div className="space-y-2.5">
                {NEUTRALS.map((n) => (
                  <div key={n.name} className="flex items-center gap-3">
                    <span
                      className="h-9 w-9 flex-shrink-0 rounded-lg border border-slate-200"
                      style={{ backgroundColor: n.hex }}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {n.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {n.purpose}
                        </div>
                      </div>
                      <code className="text-xs font-medium text-slate-400">
                        {n.hex}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Semantic
              </h3>
              <div className="space-y-2.5">
                {SEMANTIC.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="flex flex-shrink-0 items-center">
                      <span
                        className="h-9 w-9 rounded-lg"
                        style={{ backgroundColor: s.hex }}
                      />
                      <span
                        className="-ml-2 h-9 w-9 rounded-lg border border-white"
                        style={{ backgroundColor: s.soft }}
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {s.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.purpose}
                        </div>
                      </div>
                      <code className="text-xs font-medium text-slate-400">
                        {s.hex}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------------- TYPOGRAPHY ---------------- */}
        <Section
          id="type"
          eyebrow="Foundations"
          title="Typography — Poppins"
          desc="One geometric sans across the whole product. Weight and color (not many fonts) create hierarchy. Headings lean on the deep blues; body stays in calm slate."
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="divide-y divide-slate-100">
                {TYPE_SCALE.map((t) => (
                  <div
                    key={t.label}
                    className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0 flex-1">
                      <span className={t.cls}>{t.sample}</span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3 text-xs text-slate-400">
                      <span className="font-medium text-slate-500">
                        {t.label}
                      </span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                        {t.size}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Weights
              </h3>
              <div className="space-y-3">
                {WEIGHTS.map((w) => (
                  <div
                    key={w.w}
                    className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <span className={`text-xl text-brand-900 ${w.cls}`}>
                      Aa
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900">
                        {w.w}
                      </div>
                      <div className="text-xs text-slate-400">{w.n}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------------- BUTTONS ---------------- */}
        <Section
          id="buttons"
          eyebrow="Components"
          title="Buttons"
          desc="brand-600 is the single primary action; brand-700 is its hover/pressed state. Everything else recedes so the main CTA always wins the eye."
        >
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-pop transition-colors hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/30">
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
              <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-50 px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100">
                Secondary
              </button>
              <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
                Outline
              </button>
              <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100">
                Ghost
              </button>
              <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800">
                Text link <ArrowRight className="h-4 w-4" />
              </button>
              <button
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-400"
              >
                Disabled
              </button>
            </div>

            {/* Sizes + icon buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
              <button className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700">
                Small
              </button>
              <button className="cursor-pointer rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
                Medium
              </button>
              <button className="cursor-pointer rounded-xl bg-brand-600 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-700">
                Large
              </button>
              <span className="mx-1 h-8 w-px bg-slate-200" />
              <button
                aria-label="Add"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700"
              >
                <Plus className="h-[18px] w-[18px]" />
              </button>
              <button
                aria-label="Settings"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Settings className="h-[18px] w-[18px]" />
              </button>
              <button
                aria-label="Notifications"
                className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Bell className="h-[18px] w-[18px]" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" />
              </button>
            </div>
          </Card>
        </Section>

        {/* ---------------- FORMS ---------------- */}
        <Section
          id="forms"
          eyebrow="Components"
          title="Form controls"
          desc="Inputs sit on white with a hairline border; brand-500 owns the focus ring so it reads as 'this is where you are'. Controls stay calm until touched."
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="ds-name"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Nome da turma
                  </label>
                  <input
                    id="ds-name"
                    type="text"
                    defaultValue="3º Ano B — Matemática"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ds-search"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Buscar aluno
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="ds-search"
                      type="text"
                      placeholder="Digite um nome ou matrícula"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="ds-select"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Período
                  </label>
                  <div className="relative">
                    <select
                      id="ds-select"
                      className="w-full cursor-pointer appearance-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20"
                      defaultValue="manha"
                    >
                      <option value="manha">Manhã</option>
                      <option value="tarde">Tarde</option>
                      <option value="noite">Noite</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="ds-textarea"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Observação
                  </label>
                  <textarea
                    id="ds-textarea"
                    rows={3}
                    placeholder="Anotações da chamada…"
                    className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20"
                  />
                </div>

                {/* Checkbox */}
                <label className="flex cursor-pointer items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-600 text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-slate-700">
                    Registrar pré-presença automaticamente
                  </span>
                </label>

                {/* Radio group */}
                <div className="flex items-center gap-6">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border-[5px] border-brand-600 bg-white" />
                    <span className="text-sm text-slate-700">Facial</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <span className="h-5 w-5 rounded-full border-2 border-slate-300 bg-white" />
                    <span className="text-sm text-slate-500">Manual</span>
                  </label>
                </div>

                {/* Toggle (on) */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">
                    Notificações em tempo real
                  </span>
                  <span className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full bg-brand-600 transition-colors">
                    <span className="ml-auto mr-0.5 h-5 w-5 rounded-full bg-white shadow-sm" />
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------------- CARDS ---------------- */}
        <Section
          id="cards"
          eyebrow="Components"
          title="Cards & data"
          desc="The building blocks of the dashboard: KPI tiles with sparklines, status chips, and content cards. White surfaces, soft shadows, blue reserved for signal."
        >
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-slate-500">
                    Total de presenças
                  </div>
                  <div className="mt-1 text-3xl font-semibold text-brand-950">
                    12.480
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
                  <TrendingUp className="h-3.5 w-3.5" /> 19%
                </span>
              </div>
              <div className="mt-3 text-brand-600">
                <Sparkline
                  values={[8, 12, 9, 14, 13, 18, 16, 22]}
                  color="#2563EB"
                />
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-slate-500">
                    Fraudes bloqueadas
                  </div>
                  <div className="mt-1 text-3xl font-semibold text-brand-950">
                    312
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                  <TrendingDown className="h-3.5 w-3.5" /> 4%
                </span>
              </div>
              <div className="mt-3 text-brand-400">
                <Sparkline
                  values={[20, 18, 19, 15, 16, 12, 13, 11]}
                  color="#60A5FA"
                />
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-slate-500">Tempo médio</div>
                  <div className="mt-1 text-3xl font-semibold text-brand-950">
                    0,28s
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                  estável
                </span>
              </div>
              <div className="mt-3 text-brand-500">
                <Sparkline values={[5, 6, 5, 7, 6, 6, 5, 6]} color="#3B82F6" />
              </div>
            </Card>
          </div>

          {/* Content card + status list */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Chamada — 3º Ano B
                  </h3>
                  <p className="text-xs text-slate-500">Matemática · 08:00</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
                  Aberta
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  { n: "Ana Beatriz Costa", t: "08:02:14" },
                  { n: "Carlos Eduardo Lima", t: "08:02:31" },
                  { n: "Fernanda Oliveira", t: "08:02:45" },
                ].map((r) => (
                  <div
                    key={r.n}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {r.n
                          .split(" ")
                          .map((x) => x[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span className="text-sm text-slate-700">{r.n}</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
                      <Check className="h-3.5 w-3.5 text-emerald-500" /> {r.t}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Badges &amp; tags
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                  Primary
                </span>
                <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  Info
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  Presente
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
                  Pendente
                </span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                  Bloqueado
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                  Neutro
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Ao
                  vivo
                </span>
              </div>

              <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-900">
                Data viz palette
              </h3>
              <div className="flex items-end gap-1.5">
                {VIZ.map((v, i) => (
                  <div
                    key={v.hex}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        backgroundColor: v.hex,
                        height: `${56 - i * 9}px`,
                      }}
                    />
                    <span className="text-[10px] font-medium text-slate-400">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------------- TOKENS ---------------- */}
        <Section
          id="tokens"
          eyebrow="Foundations"
          title="Radius, elevation & spacing"
          desc="Soft, consistent corners and a restrained shadow scale keep the UI light. Spacing follows a 4px base grid."
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Radius */}
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Radius
              </h3>
              <div className="space-y-3">
                {RADII.map((r) => (
                  <div key={r.name} className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 border-2 border-brand-300 bg-brand-50 ${r.cls}`}
                    />
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {r.name}
                      </span>
                      <code className="text-xs text-slate-400">{r.px}</code>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Elevation */}
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Elevation
              </h3>
              <div className="space-y-4">
                {SHADOWS.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-xl border border-slate-100 bg-white ${s.cls}`}
                    />
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {s.name}
                      </span>
                      <span className="text-xs text-slate-400">{s.use}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Spacing */}
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Spacing · 4px base
              </h3>
              <div className="space-y-2.5">
                {SPACING.map((s) => (
                  <div key={s.token} className="flex items-center gap-3">
                    <code className="w-6 text-xs font-medium text-slate-400">
                      {s.token}
                    </code>
                    <div
                      className="h-3 rounded bg-brand-500"
                      style={{ width: `${s.px}px` }}
                    />
                    <span className="text-xs text-slate-400">{s.px}px</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600">
              <ShieldCheck className="h-3.5 w-3.5 text-white" />
            </div>
            Visage Design System — preview only
          </div>
          <span className="text-xs text-slate-400">
            Poppins · Tailwind · Next.js
          </span>
        </div>
      </footer>
    </main>
  );
}
