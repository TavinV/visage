import React from "react";

function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.fl-badge {
  display: inline-flex; align-items: center; gap: var(--space-2);
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-semibold);
  letter-spacing: 0.02em; line-height: 1; padding: 4px 9px;
  border-radius: var(--radius-pill); border: 1px solid transparent; white-space: nowrap;
}
.fl-badge--square { border-radius: var(--radius-sm); }
.fl-badge__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.fl-badge--neutral { background: var(--slate-100); color: var(--slate-700); border-color: var(--border-subtle); }
.fl-badge--accent  { background: var(--accent-050); color: var(--accent-700); border-color: var(--accent-100); }
.fl-badge--success { background: var(--success-100); color: var(--success-600); }
.fl-badge--warning { background: var(--warning-100); color: var(--warning-600); }
.fl-badge--danger  { background: var(--danger-100); color: var(--danger-600); }
.fl-badge--solid   { background: var(--navy-900); color: #fff; border-color: transparent; }
`;

/** Compact status / category label. Use `dot` for live status indicators. */
export function Badge({ variant = "neutral", dot = false, square = false, className = "", children, ...rest }) {
  useStyleOnce("fl-badge-styles", CSS);
  const cls = ["fl-badge", `fl-badge--${variant}`, square ? "fl-badge--square" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {dot && <span className="fl-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
