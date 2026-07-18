import React from "react";

function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.fl-avatar { position: relative; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--navy-700); color: #fff; font-family: var(--font-sans);
  font-weight: var(--weight-semibold); overflow: visible; flex: none; }
.fl-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.fl-avatar--sm { width: 28px; height: 28px; font-size: 11px; }
.fl-avatar--md { width: 38px; height: 38px; font-size: 14px; }
.fl-avatar--lg { width: 52px; height: 52px; font-size: 18px; }
.fl-avatar__status { position: absolute; right: 0; bottom: 0; width: 30%; height: 30%;
  min-width: 8px; min-height: 8px; border-radius: 50%; border: 2px solid var(--surface-card); }
.fl-avatar__status--online { background: var(--success-600); }
.fl-avatar__status--away   { background: var(--warning-600); }
.fl-avatar__status--offline{ background: var(--slate-400); }
`;

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

/** Circular avatar — image or auto-initials, with optional status dot. */
export function Avatar({ name = "", src = "", size = "md", status = null, className = "", ...rest }) {
  useStyleOnce("fl-avatar-styles", CSS);
  const cls = ["fl-avatar", `fl-avatar--${size}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} title={name} {...rest}>
      {src ? <img src={src} alt={name} /> : initials(name)}
      {status && <span className={`fl-avatar__status fl-avatar__status--${status}`} aria-label={status} />}
    </span>
  );
}
