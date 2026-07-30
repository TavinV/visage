import React from "react";

/* Inject component CSS once (self-contained — references global tokens). */
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

const CSS = `
.fl-btn {
  --_h: var(--control-md);
  font-family: var(--font-sans);
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  letter-spacing: 0.01em;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  height: var(--_h); padding: 0 var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer; white-space: nowrap; user-select: none;
  transition: background var(--duration-fast) var(--ease-standard),
              border-color var(--duration-fast) var(--ease-standard),
              color var(--duration-fast) var(--ease-standard),
              box-shadow var(--duration-fast) var(--ease-standard),
              transform var(--duration-fast) var(--ease-standard);
}
.fl-btn:focus-visible { outline: none; box-shadow: var(--ring-focus); }
.fl-btn:active { transform: translateY(1px); }
.fl-btn[disabled] { opacity: 0.45; cursor: not-allowed; transform: none; }

.fl-btn--sm { --_h: var(--control-sm); font-size: var(--text-xs); padding: 0 var(--space-4); }
.fl-btn--lg { --_h: var(--control-lg); font-size: var(--text-base); padding: 0 var(--space-6); }
.fl-btn--block { width: 100%; }

/* Primary — navy authority */
.fl-btn--primary { background: var(--navy-900); color: #fff; }
.fl-btn--primary:hover:not([disabled]) { background: var(--navy-800); }
.fl-btn--primary:active:not([disabled]) { background: var(--navy-950); }

/* Accent — the one luminous action */
.fl-btn--accent { background: var(--accent-600); color: #fff; }
.fl-btn--accent:hover:not([disabled]) { background: var(--accent-700); }

/* Secondary — outline */
.fl-btn--secondary { background: var(--surface-card); color: var(--text-strong); border-color: var(--border-default); }
.fl-btn--secondary:hover:not([disabled]) { border-color: var(--border-strong); background: var(--surface-sunken); }

/* Ghost */
.fl-btn--ghost { background: transparent; color: var(--text-body); }
.fl-btn--ghost:hover:not([disabled]) { background: var(--surface-sunken); color: var(--text-strong); }

/* Danger */
.fl-btn--danger { background: var(--danger-600); color: #fff; }
.fl-btn--danger:hover:not([disabled]) { filter: brightness(0.93); }

.fl-btn__spinner { width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent;
  animation: fl-spin 0.7s linear infinite; }
@keyframes fl-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .fl-btn__spinner { animation-duration: 1.4s; } }
`;

/**
 * Flauzino primary button. Navy by default; accent for the single key action.
 */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  className = "",
  children,
  ...rest
}) {
  useStyleOnce("fl-btn-styles", CSS);
  const cls = [
    "fl-btn",
    `fl-btn--${variant}`,
    size !== "md" ? `fl-btn--${size}` : "",
    block ? "fl-btn--block" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="fl-btn__spinner" aria-hidden="true" />}
      {!loading && iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
}
