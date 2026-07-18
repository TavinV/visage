import React from "react";

function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.fl-field { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.fl-field__label { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-strong); }
.fl-field__req { color: var(--danger-600); margin-left: 2px; }
.fl-field__hint { font-size: var(--text-xs); color: var(--text-muted); }
.fl-field__hint--error { color: var(--danger-600); }

.fl-input-wrap { position: relative; display: flex; align-items: center; }
.fl-input {
  width: 100%; height: var(--control-md);
  font-family: var(--font-sans); font-size: var(--text-sm); color: var(--text-strong);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 var(--space-4);
  box-shadow: var(--shadow-inset);
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}
.fl-input::placeholder { color: var(--text-faint); }
.fl-input:hover:not(:disabled) { border-color: var(--border-strong); }
.fl-input:focus { outline: none; border-color: var(--accent-500); box-shadow: var(--ring-focus); }
.fl-input:disabled { background: var(--surface-sunken); color: var(--text-muted); cursor: not-allowed; }
.fl-input--has-icon { padding-left: var(--space-8); }
.fl-input--error { border-color: var(--danger-600); }
.fl-input--error:focus { box-shadow: 0 0 0 3px rgba(179,38,30,0.18); }
.fl-input__icon { position: absolute; left: var(--space-4); display: flex; color: var(--text-faint); pointer-events: none; }
`;

/** Labeled text input with hint / error states and optional leading icon. */
export function Input({
  label,
  hint,
  error,
  required = false,
  icon = null,
  id,
  className = "",
  ...rest
}) {
  useStyleOnce("fl-input-styles", CSS);
  const fieldId = id || (label ? "fl-" + label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const inputCls = [
    "fl-input",
    icon ? "fl-input--has-icon" : "",
    error ? "fl-input--error" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className="fl-field">
      {label && (
        <label className="fl-field__label" htmlFor={fieldId}>
          {label}{required && <span className="fl-field__req">*</span>}
        </label>
      )}
      <div className="fl-input-wrap">
        {icon && <span className="fl-input__icon">{icon}</span>}
        <input id={fieldId} className={inputCls} aria-invalid={!!error} {...rest} />
      </div>
      {(hint || error) && (
        <span className={"fl-field__hint" + (error ? " fl-field__hint--error" : "")}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
