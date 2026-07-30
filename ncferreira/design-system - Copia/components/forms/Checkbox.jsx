import React from "react";

function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.fl-check { display: inline-flex; align-items: flex-start; gap: var(--space-3); font-family: var(--font-sans); cursor: pointer; color: var(--text-body); font-size: var(--text-sm); }
.fl-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.fl-check__box {
  flex: none; width: 18px; height: 18px; margin-top: 1px;
  border: 1.5px solid var(--border-strong); border-radius: var(--radius-xs);
  background: var(--surface-card); display: grid; place-items: center;
  transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.fl-check__box svg { width: 12px; height: 12px; stroke: #fff; stroke-width: 3; fill: none; opacity: 0; transition: opacity var(--duration-fast) var(--ease-standard); }
.fl-check input:checked + .fl-check__box { background: var(--accent-600); border-color: var(--accent-600); }
.fl-check input:checked + .fl-check__box svg { opacity: 1; }
.fl-check input:focus-visible + .fl-check__box { box-shadow: var(--ring-focus); }
.fl-check input:disabled + .fl-check__box { opacity: 0.5; }
.fl-check--disabled { cursor: not-allowed; color: var(--text-muted); }
.fl-check__label b { font-weight: var(--weight-medium); color: var(--text-strong); display: block; }
.fl-check__label span { color: var(--text-muted); font-size: var(--text-xs); }
`;

/** Checkbox with an accessible label and optional description. */
export function Checkbox({ label, description, disabled = false, className = "", ...rest }) {
  useStyleOnce("fl-check-styles", CSS);
  return (
    <label className={["fl-check", disabled ? "fl-check--disabled" : "", className].filter(Boolean).join(" ")}>
      <input type="checkbox" disabled={disabled} {...rest} />
      <span className="fl-check__box" aria-hidden="true">
        <svg viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" /></svg>
      </span>
      {(label || description) && (
        <span className="fl-check__label"><b>{label}</b>{description && <span>{description}</span>}</span>
      )}
    </label>
  );
}
