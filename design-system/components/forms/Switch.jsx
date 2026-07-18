import React from "react";

function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.fl-switch { display: inline-flex; align-items: center; gap: var(--space-3); font-family: var(--font-sans); font-size: var(--text-sm); color: var(--text-strong); cursor: pointer; }
.fl-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.fl-switch__track {
  position: relative; width: 38px; height: 22px; border-radius: var(--radius-pill);
  background: var(--slate-300); transition: background var(--duration-base) var(--ease-standard); flex: none;
}
.fl-switch__thumb {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) var(--ease-standard);
}
.fl-switch input:checked + .fl-switch__track { background: var(--accent-600); }
.fl-switch input:checked + .fl-switch__track .fl-switch__thumb { transform: translateX(16px); }
.fl-switch input:focus-visible + .fl-switch__track { box-shadow: var(--ring-focus); }
.fl-switch input:disabled + .fl-switch__track { opacity: 0.5; }
.fl-switch--disabled { cursor: not-allowed; color: var(--text-muted); }
@media (prefers-reduced-motion: reduce) { .fl-switch__thumb, .fl-switch__track { transition: none; } }
`;

/** On/off switch for binary settings. */
export function Switch({ label, disabled = false, className = "", ...rest }) {
  useStyleOnce("fl-switch-styles", CSS);
  return (
    <label className={["fl-switch", disabled ? "fl-switch--disabled" : "", className].filter(Boolean).join(" ")}>
      <input type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="fl-switch__track" aria-hidden="true"><span className="fl-switch__thumb" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}
