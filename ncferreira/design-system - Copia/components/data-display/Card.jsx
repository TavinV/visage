import React from "react";

function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css; document.head.appendChild(el);
}

const CSS = `
.fl-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  font-family: var(--font-sans);
  transition: box-shadow var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard);
}
.fl-card--interactive { cursor: pointer; }
.fl-card--interactive:hover { box-shadow: var(--shadow-md); border-color: var(--border-default); }
.fl-card--flat { box-shadow: none; }
.fl-card--inverse { background: var(--navy-900); border-color: var(--border-inverse); color: var(--text-inverse); }
.fl-card__header { padding: var(--space-5) var(--space-5) 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.fl-card__title { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--text-strong); }
.fl-card--inverse .fl-card__title { color: #fff; }
.fl-card__eyebrow { font-size: var(--text-xs); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-eyebrow); text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.fl-card--inverse .fl-card__eyebrow { color: var(--accent-500); }
.fl-card__body { padding: var(--space-5); color: var(--text-body); font-size: var(--text-sm); line-height: var(--leading-relaxed); }
.fl-card__footer { padding: 0 var(--space-5) var(--space-5); display: flex; gap: var(--space-3); align-items: center; }
`;

/** Surface container with optional eyebrow/title header and footer slots. */
export function Card({
  title,
  eyebrow,
  headerAction = null,
  footer = null,
  interactive = false,
  flat = false,
  inverse = false,
  className = "",
  children,
  ...rest
}) {
  useStyleOnce("fl-card-styles", CSS);
  const cls = [
    "fl-card",
    interactive ? "fl-card--interactive" : "",
    flat ? "fl-card--flat" : "",
    inverse ? "fl-card--inverse" : "",
    className,
  ].filter(Boolean).join(" ");
  const hasHeader = title || eyebrow || headerAction;
  return (
    <div className={cls} {...rest}>
      {hasHeader && (
        <div className="fl-card__header">
          <div>
            {eyebrow && <div className="fl-card__eyebrow">{eyebrow}</div>}
            {title && <div className="fl-card__title">{title}</div>}
          </div>
          {headerAction}
        </div>
      )}
      {children && <div className="fl-card__body">{children}</div>}
      {footer && <div className="fl-card__footer">{footer}</div>}
    </div>
  );
}
