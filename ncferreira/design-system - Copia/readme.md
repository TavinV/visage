# Flauzino — Design System

> **Flauzino** é uma *software house* brasileira especializada em sistemas com **reconhecimento facial**, plataformas corporativas e soluções críticas de negócio.

This repository is the canonical source of truth for the Flauzino brand and product UI. It contains the visual foundations (color, type, spacing, elevation), the brand assets (eagle mark), reusable React UI components, a product UI kit, and sample presentation slides.

---

## 1. Brand essence

Flauzino must read as **extremely competent, technically sophisticated and trustworthy** — an organization mature enough to take responsibility for important, critical systems. It is *not* an experimental startup, a creative agency, or a trend-chasing shop. The feeling to evoke is that of a respected institution: technical competence, tradition, stability, security and operational excellence.

When someone sees the brand for the first time, they should think:

> *"This company looks extremely competent."*
> *"I would trust them with important systems."*
> *"There is serious engineering here, not just pretty design."*

### Core values
- **Competence** — high-level software engineering, robust architecture, attention to detail.
- **Security** — reliability, data protection, stability, operational continuity.
- **Tradition** — longevity, solidity, permanence (modern, but built to last).
- **Innovation** — intelligent evolution, not experimentation; new tech adopted when it creates real client value.

### Slogan

**"Feito para confiar."** — the standing tagline. Pairs with the eagle lockup on the marketing site, decks, and any brand-forward surface. Sentence case, period included, never rephrased or translated.

### Archetype
A blend of **Ruler (Authority)** + **Sage (Expert)**, symbolized by the **Eagle** — broad vision, intelligence, precision, vigilance, protection and leadership. The eagle treatment is elegant, minimal and corporate (heraldic / institutional emblem). Avoid: aggressive eagles, sporty/military/gamer styling, cartoon mascots.

---

## 2. Sources & provenance

This system was authored from the **Flauzino strategic brand brief** (Portuguese), provided as text. No codebase, Figma file, or existing UI was supplied — there is therefore no production UI to recreate. All components and the UI kit are **original designs derived from the brief**, intentionally generic so they can seed real product work.

> **If you have an existing product codebase or Figma, attach it via the Import menu** and ask to align this system to it — the components here are a faithful interpretation of the brief, not a recreation of a shipped product.

**Mandated specifics from the brief:** primary deep institutional navy, sophisticated near-black secondary, a single controlled luminous blue accent, and the typeface **Poppins**.

---

## 3. Repository index

| Path | What it is |
|---|---|
| `styles.css` | Global entry point — `@import`s every token & font file. Consumers link this. |
| `tokens/colors.css` | Color ramps + semantic aliases (surfaces, text, borders, accent). |
| `tokens/typography.css` | Poppins families, weights, type scale, tracking. |
| `tokens/spacing.css` | 4px spacing grid, radii, borders, container & control sizes. |
| `tokens/elevation.css` | Navy-tinted shadows, focus ring, motion (easing/duration). |
| `tokens/fonts.css` | Webfont loading (Poppins + IBM Plex Mono). |
| `tokens/base.css` | Element resets + type-role utility classes (`.fl-display`, `.fl-eyebrow`, …). |
| `assets/` | Brand assets — `flauzino-mark.svg` (eagle emblem). |
| `cards/` | Design-system specimen cards (Colors, Type, Spacing, Brand). |
| `components/` | Reusable React UI primitives (forms, feedback, layout). |
| `ui_kits/sentinel/` | **Sentinel** — facial-recognition access-control console UI kit (login → dashboard → identities, click-through). |
| `ui_kits/website/` | Flauzino marketing site — homepage (2 layout sketches) + Canário Capital case-study page. |
| `assets/logos/` | Client logos for case studies: Canário Capital, Máquina Code, UMC, plus integration marks (NeLogica, ZapSign). |

### Components

All components compile into `window.FlauzinoDesignSystem_b9b227`. Import via Design Component `<x-import>` or read in card HTML:

```js
const { Button, Input, Checkbox, Switch, Card, Badge, Avatar, Logo } = window.FlauzinoDesignSystem_b9b227;
```

- **Button** — primary, secondary, disabled states; 9px/12px padding, max-width flexible.
- **Input** — text, email, password; 1px border, inset shadow, focus ring.
- **Checkbox** — custom checkbox; navy background, accent checkmark.
- **Switch** — toggle; navy track, accent thumb.
- **Card** — container; white bg, `--border-subtle` hairline, `--shadow-sm`.
- **Badge** — status label; 3px padding, semantic color (success/warning/danger/neutral).
- **Avatar** — user profile image; circle or rounded square, fallback initials.
- **Logo** — Flauzino eagle mark; monochrome, scales to any size, `currentColor`-driven.
| `slides/` | Sample institutional presentation slides. |
| `SKILL.md` | Agent-Skill manifest for downloadable/Claude Code use. |

**Component namespace:** components compile into `window.FlauzinoDesignSystem_b9b227`. Read them in card HTML as `const { Button } = window.FlauzinoDesignSystem_b9b227`.

---

## 4. Content fundamentals (voice & copy)

Flauzino's voice is **institutional, precise and quietly confident** — closer to an engineering firm or a security institution than a consumer app.

- **Language:** primary copy is **Brazilian Portuguese**; technical/product UI may mix in established English terms (e.g. *dashboard*, *deploy*) only where they are industry-standard. Keep one language per sentence.
- **Person:** address the client/organization in a neutral-formal register. Prefer impersonal or "nós" (we, the firm) for capability statements — *"Desenvolvemos sistemas críticos sob medida."* Use "você" sparingly and respectfully in product UI guidance.
- **Casing:** sentence case for headings and UI labels. **UPPERCASE only for short eyebrows/kickers** (e.g. `RECONHECIMENTO FACIAL`, `SEGURANÇA`) with wide letter-spacing. Never shout in body copy.
- **Tone:** declarative and concrete. State capability and outcome, not hype. *"Reconhecimento facial com 99,2% de precisão"* over *"a revolução do futuro"*.
- **Numbers & precision:** lead with verifiable specifics (uptime, latency, accuracy, compliance — LGPD). Precision *is* the brand.
- **Emoji:** **never.** No emoji anywhere in brand or product surfaces.
- **Forbidden vibe:** no "hacker", no gamer slang, no startup breeziness, no exclamation-heavy marketing. Calm authority.

**Examples**
- Eyebrow → headline: `PLATAFORMA DE ACESSO` / *"Identidade verificada em menos de 300ms."*
- Button labels: *"Iniciar verificação"*, *"Cadastrar rosto"*, *"Ver registros"* — verb + object, no fluff.
- Empty state: *"Nenhum acesso registrado nas últimas 24 horas."* — factual, complete sentence.

---

## 5. Visual foundations

The identity must transmit **engineering, structure, precision, organization and trust**. Generous whitespace, clean layouts, strong hierarchy, a consistent grid, elegant contrast.

**Color** — Light, institutional surfaces (white / `--slate-50`) carry most of the UI. **Navy** (`--navy-900/800/700`) is the authority color for headers, footers, hero panels and dark sections. **Near-black** (`--ink-900`) for the most exclusive/serious moments. The **luminous blue accent** (`#2563EB`) is rationed — links, active states, focus rings, single key indicators. It must never dominate a screen. Status colors are muted and institutional, not candy-bright.

**Type** — Poppins everywhere. Authority comes from **weight discipline**: body 400, labels/UI 500, headings 600, display 700 (sparingly). Display headings use tight tracking (`-0.015em`); eyebrows use wide tracking (`0.14em`) + uppercase. IBM Plex Mono for data, IDs, timestamps, code.

**Spacing & grid** — strict **4px grid**. Predictable, repeated rhythm signals engineering rigor. Generous outer margins and section padding; let elements breathe.

**Backgrounds** — solid surfaces. **No exaggerated gradients, no glassmorphism, no neon, no decorative noise.** At most a very subtle navy-tinted vignette or a faint 1px grid/blueprint line texture on dark hero panels. Imagery (when used) is **cool-toned, sharp, architectural / technological**, often desaturated toward navy; restrained, never stocky.

**Borders & cards** — cards are white with a **1px `--border-subtle` (slate-200)** hairline and a soft **navy-tinted shadow** (`--shadow-sm`/`--shadow-md`). Radii are **restrained and structural** (`--radius-md` 8px is the default; `--radius-lg` 12px for large panels). No pill-shaped everything. Inputs use an inset hairline + `--shadow-inset`.

**Shadows** — soft, cool, navy-tinted rather than pure black; used to layer, not to dramatize. Avoid heavy drop shadows.

**Motion** — measured and confident. Standard ease `cubic-bezier(0.4,0,0.2,1)`, durations 120–320ms. **Fades and small transl(≤8px) only — no bounce, no spring, no playful overshoot.** Respect `prefers-reduced-motion`.

**Hover / press states**
- *Hover:* darken accent (`--accent` → `--accent-hover`), or lift card with `--shadow-md`; subtle, never glowing.
- *Press:* deepen color and/or 1px nudge; no large scale changes.
- *Focus:* always visible — 3px `--focus-ring-alpha` ring (`--ring-focus`).

**Transparency & blur** — used rarely; only for modal scrims (navy at ~55% opacity). No frosted-glass UI.

---

## 6. Iconography

- **Library:** **Lucide** (https://lucide.dev) — loaded from CDN. Lucide's clean **1.5–2px stroke, geometric, no-fill** style matches the engineering/precision tone and pairs well with Poppins. Use stroke icons at 18–24px in UI.
  - *This is a substitution* — no icon set was provided in the brief. If Flauzino has a house icon set, replace Lucide and update this section.
- **Stroke weight:** keep a consistent 2px (Lucide default) across a surface; do not mix filled and outline icons.
- **Color:** icons inherit `currentColor` — `--text-muted` at rest, `--accent` only when indicating an active/focused state.
- **Brand emblem:** `assets/flauzino-mark.svg` — the client-supplied heraldic eagle. Monochrome, `currentColor`-driven, scales from 16px to hero size. Use it as the app mark / favicon / lockup glyph. Do **not** recolor it into gradients or add effects.
- **Emoji / unicode icons:** never used.
- **SVG vs raster:** all iconography is **inline SVG (stroke)**; no PNG icons.

---

## 7. Caveats for the reader

- The **eagle mark is the client-supplied logo** (`uploads/flauzino logo.svg` → `assets/flauzino-mark.svg`), not a Design-System invention.
- **Fonts** load from Google Fonts CDN; self-host the `.woff2` for production.
- All components & screens are **brief-derived**, not recreations of a shipped Flauzino product. Attach real product code/Figma to align.
