/* @ds-bundle: {"format":4,"namespace":"FlauzinoDesignSystem_b9b227","components":[{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Avatar","sourcePath":"components/data-display/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/brand/Logo.jsx":"f08a579ed4ed","components/data-display/Avatar.jsx":"a2345d9f996a","components/data-display/Badge.jsx":"60e9f23250f5","components/data-display/Card.jsx":"892a374eb916","components/forms/Button.jsx":"d6e35fb1a031","components/forms/Checkbox.jsx":"5096f8e5fc1a","components/forms/Input.jsx":"b31359adfeeb","components/forms/Switch.jsx":"66790be1b5f0","ui_kits/sentinel/Dashboard.jsx":"71ee1f0e02ef","ui_kits/sentinel/Icons.jsx":"a5b8357f4048","ui_kits/sentinel/Identities.jsx":"8e29735c4428","ui_kits/sentinel/Login.jsx":"d0b0b6832f81","ui_kits/sentinel/Sidebar.jsx":"cb2ca7ae9c6e","ui_kits/sentinel/Topbar.jsx":"88a52ccc2d7d","ui_kits/sentinel/data.js":"29dc84ccfc15"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FlauzinoDesignSystem_b9b227 = window.FlauzinoDesignSystem_b9b227 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function EagleMark({
  size
}) {
  const h = size * (257 / 361);
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: h,
    viewBox: "0 0 361 257",
    fill: "currentColor",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M47.0908 24.4504C47.242 24.5725 48.7058 28.9997 48.967 29.6907C50.4259 33.6485 52.2532 37.4606 54.4248 41.0768C67.6308 62.6023 97.502 77.4688 119.968 87.3778C145.627 98.6953 173.83 107.974 192.667 130.144C202.468 141.68 207.901 155.987 208.277 171.123C208.349 174.806 207.867 178.684 207.504 182.391C216.423 167.502 214.971 144.302 204.521 130.498C211.104 126.384 217.31 121.249 223.855 117.506C215.317 115.585 213.082 112.303 208.451 105.748C216.598 108.526 229.396 108.505 237.789 106.571C250.454 103.653 272.038 95.3596 280.644 109.918C291.775 110.458 303.259 110.558 307.41 122.733C308.512 125.966 308.691 128.496 309.283 131.797C306.526 130.348 302.157 129.064 298.996 129.318C264.004 131.925 245.779 167.482 227.066 192.588C201.945 226.292 174.074 237.792 133.178 238.926C118.799 239.083 106.613 236.501 92.9199 232.802C98.2245 231.81 102.624 231.35 107.946 229.795C121.038 225.971 134.164 218.154 142.578 207.252C143.995 205.415 145.45 203.728 146.589 201.688C150.646 210.31 150.048 218.141 146.062 226.79C153.048 222.543 156.681 212.907 156.027 204.978C154.243 183.517 131.954 176.262 114.899 170.072C95.374 162.986 75.3648 158.592 59.4409 144.407C47.702 133.949 40.3492 119.697 37.373 104.33C36.2028 98.2883 35.7842 91.7581 35.397 85.651C36.0516 87.3809 37.1141 89.2884 38.1206 90.8866C59.1748 124.318 100.724 129.271 134.226 143.071C141.74 146.167 150.267 152.267 156.517 156.774C148.857 143.55 136.606 136.845 123.365 130.028C97.8222 116.877 65.4093 107.667 50.1091 81.2409C39.2904 62.5552 41.8354 43.7497 47.0908 24.4504Z"
  }));
}

/**
 * Flauzino logo — heraldic eagle mark, optionally locked up with the
 * Poppins wordmark and tagline. Inherits color via `currentColor`.
 */
function Logo({
  variant = "lockup",
  // "mark" | "lockup" | "stacked"
  size = 40,
  tagline = "Reconhecimento facial",
  color,
  className = "",
  ...rest
}) {
  const wrapBase = {
    fontFamily: "var(--font-sans)",
    color: color || "var(--navy-900)",
    display: "inline-flex"
  };
  if (variant === "mark") {
    return /*#__PURE__*/React.createElement("span", _extends({
      className: className,
      style: wrapBase
    }, rest), /*#__PURE__*/React.createElement(EagleMark, {
      size: size
    }));
  }
  const stacked = variant === "stacked";
  const word = /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1,
      alignItems: stacked ? "center" : "flex-start"
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontWeight: 600,
      fontSize: size * 0.55,
      letterSpacing: "-0.01em",
      color: "inherit"
    }
  }, "Flauzino"), tagline && /*#__PURE__*/React.createElement("small", {
    style: {
      fontSize: Math.max(9, size * 0.22),
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginTop: size * 0.12,
      fontWeight: 500
    }
  }, tagline));
  return /*#__PURE__*/React.createElement("span", _extends({
    className: className,
    style: {
      ...wrapBase,
      flexDirection: stacked ? "column" : "row",
      alignItems: "center",
      gap: stacked ? size * 0.25 : size * 0.32
    }
  }, rest), /*#__PURE__*/React.createElement(EagleMark, {
    size: size
  }), word);
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
function Avatar({
  name = "",
  src = "",
  size = "md",
  status = null,
  className = "",
  ...rest
}) {
  useStyleOnce("fl-avatar-styles", CSS);
  const cls = ["fl-avatar", `fl-avatar--${size}`, className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    title: name
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initials(name), status && /*#__PURE__*/React.createElement("span", {
    className: `fl-avatar__status fl-avatar__status--${status}`,
    "aria-label": status
  }));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
function Badge({
  variant = "neutral",
  dot = false,
  square = false,
  className = "",
  children,
  ...rest
}) {
  useStyleOnce("fl-badge-styles", CSS);
  const cls = ["fl-badge", `fl-badge--${variant}`, square ? "fl-badge--square" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "fl-badge__dot",
    "aria-hidden": "true"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
function Card({
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
  const cls = ["fl-card", interactive ? "fl-card--interactive" : "", flat ? "fl-card--flat" : "", inverse ? "fl-card--inverse" : "", className].filter(Boolean).join(" ");
  const hasHeader = title || eyebrow || headerAction;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), hasHeader && /*#__PURE__*/React.createElement("div", {
    className: "fl-card__header"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "fl-card__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    className: "fl-card__title"
  }, title)), headerAction), children && /*#__PURE__*/React.createElement("div", {
    className: "fl-card__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "fl-card__footer"
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function Button({
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
  const cls = ["fl-btn", `fl-btn--${variant}`, size !== "md" ? `fl-btn--${size}` : "", block ? "fl-btn--block" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    disabled: disabled || loading
  }, rest), loading && /*#__PURE__*/React.createElement("span", {
    className: "fl-btn__spinner",
    "aria-hidden": "true"
  }), !loading && iconLeft, children, !loading && iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
function Checkbox({
  label,
  description,
  disabled = false,
  className = "",
  ...rest
}) {
  useStyleOnce("fl-check-styles", CSS);
  return /*#__PURE__*/React.createElement("label", {
    className: ["fl-check", disabled ? "fl-check--disabled" : "", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "fl-check__box",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 14 14"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "2,7 6,11 12,3"
  }))), (label || description) && /*#__PURE__*/React.createElement("span", {
    className: "fl-check__label"
  }, /*#__PURE__*/React.createElement("b", null, label), description && /*#__PURE__*/React.createElement("span", null, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
function Input({
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
  const inputCls = ["fl-input", icon ? "fl-input--has-icon" : "", error ? "fl-input--error" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    className: "fl-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "fl-field__label",
    htmlFor: fieldId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "fl-field__req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: "fl-input-wrap"
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "fl-input__icon"
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    className: inputCls,
    "aria-invalid": !!error
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    className: "fl-field__hint" + (error ? " fl-field__hint--error" : "")
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyleOnce(id, css) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
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
function Switch({
  label,
  disabled = false,
  className = "",
  ...rest
}) {
  useStyleOnce("fl-switch-styles", CSS);
  return /*#__PURE__*/React.createElement("label", {
    className: ["fl-switch", disabled ? "fl-switch--disabled" : "", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "fl-switch__track",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fl-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/Dashboard.jsx
try { (() => {
/* Sentinel — Dashboard: live stats, recognition feed, camera monitor, status. */
function StatCard({
  s
}) {
  const toneClass = s.tone === "warning" ? "sx-stat__delta--warn" : s.delta.startsWith("+") || s.delta.startsWith("−") && s.tone === "success" ? "sx-stat__delta--up" : "";
  return /*#__PURE__*/React.createElement("div", {
    className: "sx-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-stat__label"
  }, s.label), /*#__PURE__*/React.createElement("div", {
    className: "sx-stat__value"
  }, s.value), /*#__PURE__*/React.createElement("div", {
    className: "sx-stat__delta " + (s.tone === "warning" ? "sx-stat__delta--warn" : "sx-stat__delta--up")
  }, s.delta, " vs. ontem"));
}
function StatusPill(status) {
  const {
    Badge
  } = window.FlauzinoDesignSystem_b9b227;
  if (status === "granted") return /*#__PURE__*/React.createElement(Badge, {
    variant: "success",
    dot: true
  }, "Autorizado");
  if (status === "denied") return /*#__PURE__*/React.createElement(Badge, {
    variant: "danger",
    dot: true
  }, "Negado");
  return /*#__PURE__*/React.createElement(Badge, {
    variant: "warning",
    dot: true
  }, "Revis\xE3o");
}
function Dashboard() {
  const data = window.SENTINEL_DATA;
  const {
    Camera
  } = window.SentinelIcons;
  return /*#__PURE__*/React.createElement(React.Fragment, null, window.SentinelTopbar && React.createElement(window.SentinelTopbar, {
    title: "Painel",
    crumb: "Visão geral em tempo real"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-pagehead"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "Bem-vinda, Iris"), /*#__PURE__*/React.createElement("p", null, "7 c\xE2meras ativas \xB7 4 port\xF5es monitorados \xB7 atualizado h\xE1 3s"))), /*#__PURE__*/React.createElement("div", {
    className: "sx-stats"
  }, data.stats.map((s, i) => /*#__PURE__*/React.createElement(StatCard, {
    key: i,
    s: s
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sx-cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-panel__head"
  }, /*#__PURE__*/React.createElement("h3", null, "Reconhecimentos recentes"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, "Port\xE3o Principal \xB7 Laborat\xF3rios \xB7 Recep\xE7\xE3o")), /*#__PURE__*/React.createElement("table", {
    className: "sx-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "ID"), /*#__PURE__*/React.createElement("th", null, "Pessoa"), /*#__PURE__*/React.createElement("th", null, "Port\xE3o"), /*#__PURE__*/React.createElement("th", null, "Hor\xE1rio"), /*#__PURE__*/React.createElement("th", null, "Confian\xE7a"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, data.events.map(e => /*#__PURE__*/React.createElement("tr", {
    className: "sx-row",
    key: e.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "sx-cell-id"
  }, e.id), /*#__PURE__*/React.createElement("td", {
    className: "sx-cell-person"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, e.name), /*#__PURE__*/React.createElement("span", null, e.role))), /*#__PURE__*/React.createElement("td", null, e.gate), /*#__PURE__*/React.createElement("td", {
    className: "sx-conf"
  }, e.time), /*#__PURE__*/React.createElement("td", {
    className: "sx-conf"
  }, e.conf.toFixed(1), "%"), /*#__PURE__*/React.createElement("td", null, StatusPill(e.status))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-panel__head"
  }, /*#__PURE__*/React.createElement("h3", null, "Port\xE3o Principal"), /*#__PURE__*/React.createElement(Camera, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-cam"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-cam__grid"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-scan"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-cam__hud"
  }, /*#__PURE__*/React.createElement("span", null, "CAM-01 \xB7 PORT\xC3O PRINCIPAL"), /*#__PURE__*/React.createElement("span", {
    className: "sx-cam__rec"
  }, /*#__PURE__*/React.createElement("i", null), "AO VIVO")), /*#__PURE__*/React.createElement("div", {
    className: "sx-cam__box"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-cam__tag"
  }, "Helena Braga \xB7 99.2%")))), /*#__PURE__*/React.createElement("div", {
    className: "sx-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-panel__head"
  }, /*#__PURE__*/React.createElement("h3", null, "Status dos port\xF5es")), /*#__PURE__*/React.createElement("div", {
    className: "sx-statusline"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-statusrow"
  }, /*#__PURE__*/React.createElement("span", null, "Port\xE3o Principal"), /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--success-600)"
    }
  }, "Ativo")), /*#__PURE__*/React.createElement("div", {
    className: "sx-statusrow"
  }, /*#__PURE__*/React.createElement("span", null, "Laborat\xF3rio 1"), /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--success-600)"
    }
  }, "Ativo")), /*#__PURE__*/React.createElement("div", {
    className: "sx-statusrow"
  }, /*#__PURE__*/React.createElement("span", null, "Doca de Carga"), /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--warning-600)"
    }
  }, "Alerta")), /*#__PURE__*/React.createElement("div", {
    className: "sx-statusrow"
  }, /*#__PURE__*/React.createElement("span", null, "Recep\xE7\xE3o"), /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--success-600)"
    }
  }, "Ativo"))))))));
}
window.SentinelDashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/Icons.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Lucide-style stroke icons (2px), inlined so the kit is self-contained.
   Icon paths derived from the open-source Lucide set (ISC). */
const I = ({
  d,
  size = 20,
  fill = "none",
  ...rest
}) => /*#__PURE__*/React.createElement("svg", _extends({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill,
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, rest), d);
const SentinelIcons = {
  ScanFace: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 7V5a2 2 0 0 1 2-2h2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M17 3h2a2 2 0 0 1 2 2v2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 17v2a2 2 0 0 1-2 2h-2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 21H5a2 2 0 0 1-2-2v-2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M9 9h.01"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M15 9h.01"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 14s1.5 2 4 2 4-2 4-2"
    }))
  })),
  Dashboard: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "9",
      x: "3",
      y: "3",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "5",
      x: "14",
      y: "3",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "9",
      x: "14",
      y: "12",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      width: "7",
      height: "5",
      x: "3",
      y: "16",
      rx: "1"
    }))
  })),
  Users: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "7",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 21v-2a4 4 0 0 0-3-3.87"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 3.13a4 4 0 0 1 0 7.75"
    }))
  })),
  Shield: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m9 12 2 2 4-4"
    }))
  })),
  Activity: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
    })
  })),
  Bell: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10.268 21a2 2 0 0 0 3.464 0"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
    }))
  })),
  Settings: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }))
  })),
  Search: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "8"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m21 21-4.3-4.3"
    }))
  })),
  LogOut: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
    }), /*#__PURE__*/React.createElement("polyline", {
      points: "16 17 21 12 16 7"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "21",
      x2: "9",
      y1: "12",
      y2: "12"
    }))
  })),
  Clock: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("polyline", {
      points: "12 6 12 12 16 14"
    }))
  })),
  CheckCircle: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21.801 10A10 10 0 1 1 17 3.335"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m9 11 3 3L22 4"
    }))
  })),
  XCircle: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m15 9-6 6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m9 9 6 6"
    }))
  })),
  DoorOpen: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M13 4h3a2 2 0 0 1 2 2v14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 20h3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 20h9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 12v.01"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.562Z"
    }))
  })),
  Camera: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "13",
      r: "3"
    }))
  })),
  ChevronRight: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "m9 18 6-6-6-6"
    })
  })),
  Plus: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 12h14"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14"
    }))
  })),
  Filter: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("polygon", {
      points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
    })
  })),
  MapPin: p => /*#__PURE__*/React.createElement(I, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "3"
    }))
  }))
};
window.SentinelIcons = SentinelIcons;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/Identities.jsx
try { (() => {
/* Sentinel — Identities: registered people directory. */
function IdentityCard({
  p
}) {
  const {
    Avatar,
    Badge
  } = window.FlauzinoDesignSystem_b9b227;
  const statusLabel = {
    online: "Online",
    away: "Ausente",
    offline: "Offline"
  }[p.status];
  const statusTone = {
    online: "success",
    away: "warning",
    offline: "neutral"
  }[p.status];
  return /*#__PURE__*/React.createElement("div", {
    className: "sx-idcard"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: p.name,
    size: "lg",
    status: p.status
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-idcard__main"
  }, /*#__PURE__*/React.createElement("b", null, p.name), /*#__PURE__*/React.createElement("span", null, p.role, " \xB7 ", p.dept)), /*#__PURE__*/React.createElement("div", {
    className: "sx-idcard__meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "Autoriza\xE7\xE3o"), /*#__PURE__*/React.createElement("dd", null, p.clearance)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "Desde"), /*#__PURE__*/React.createElement("dd", null, p.enrolled))), /*#__PURE__*/React.createElement(Badge, {
    variant: statusTone
  }, statusLabel));
}
function Identities() {
  const {
    Button,
    Input
  } = window.FlauzinoDesignSystem_b9b227;
  const {
    Filter,
    Plus
  } = window.SentinelIcons;
  const data = window.SENTINEL_DATA;
  return /*#__PURE__*/React.createElement(React.Fragment, null, window.SentinelTopbar && React.createElement(window.SentinelTopbar, {
    title: "Identidades",
    crumb: "Diretório de pessoas cadastradas"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-pagehead"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "Identidades cadastradas"), /*#__PURE__*/React.createElement("p", null, data.identities.length, " pessoas com biometria facial registrada")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16
  }), " Nova identidade")), /*#__PURE__*/React.createElement("div", {
    className: "sx-toolbar"
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Buscar por nome ou departamento\u2026",
    style: {
      maxWidth: 320
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "sx-iconbtn"
  }, /*#__PURE__*/React.createElement(Filter, {
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "sx-toolbar__spacer"
  })), /*#__PURE__*/React.createElement("div", {
    className: "sx-idgrid"
  }, data.identities.map((p, i) => /*#__PURE__*/React.createElement(IdentityCard, {
    p: p,
    key: i
  })))));
}
window.SentinelIdentities = Identities;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/Identities.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/Login.jsx
try { (() => {
/* Sentinel — Login screen: brand pane + credential form. */
function Login({
  onLogin
}) {
  const {
    Logo
  } = window.FlauzinoDesignSystem_b9b227;
  const {
    Button,
    Input
  } = window.FlauzinoDesignSystem_b9b227;
  const {
    ScanFace
  } = window.SentinelIcons;
  const [email, setEmail] = React.useState("iris.nunes@flauzino.com.br");
  const [pass, setPass] = React.useState("••••••••••");
  return /*#__PURE__*/React.createElement("div", {
    className: "sx-login"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-login__brandpane"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-login__grid"
  }), /*#__PURE__*/React.createElement(Logo, {
    variant: "lockup",
    size: 34,
    color: "#fff",
    tagline: "Sentinel"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sx-login__headline"
  }, "Reconhecimento facial de n\xEDvel institucional para o seu controle de acesso."), /*#__PURE__*/React.createElement("p", {
    className: "sx-login__sub"
  }, "Lat\xEAncia m\xE9dia de 284ms, auditoria completa de eventos e integra\xE7\xE3o com port\xF5es f\xEDsicos e digitais.")), /*#__PURE__*/React.createElement("div", {
    className: "sx-login__metrics"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-login__metric"
  }, /*#__PURE__*/React.createElement("b", null, "99.4%"), /*#__PURE__*/React.createElement("span", null, "Precis\xE3o de reconhecimento")), /*#__PURE__*/React.createElement("div", {
    className: "sx-login__metric"
  }, /*#__PURE__*/React.createElement("b", null, "284ms"), /*#__PURE__*/React.createElement("span", null, "Tempo m\xE9dio de resposta")), /*#__PURE__*/React.createElement("div", {
    className: "sx-login__metric"
  }, /*#__PURE__*/React.createElement("b", null, "24/7"), /*#__PURE__*/React.createElement("span", null, "Monitoramento cont\xEDnuo")))), /*#__PURE__*/React.createElement("div", {
    className: "sx-login__formpane"
  }, /*#__PURE__*/React.createElement("form", {
    className: "sx-login__form",
    onSubmit: e => {
      e.preventDefault();
      onLogin();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-login__eyebrow"
  }, "Acesso ao console"), /*#__PURE__*/React.createElement("div", {
    className: "sx-login__h"
  }, "Entrar no Sentinel"), /*#__PURE__*/React.createElement(Input, {
    label: "E-mail corporativo",
    value: email,
    onChange: e => setEmail(e.target.value)
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Senha",
    type: "password",
    value: pass,
    onChange: e => setPass(e.target.value)
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    type: "submit",
    style: {
      marginTop: 6
    }
  }, "Entrar"), /*#__PURE__*/React.createElement("div", {
    className: "sx-login__hint"
  }, /*#__PURE__*/React.createElement(ScanFace, {
    size: 14,
    style: {
      verticalAlign: "-2px",
      marginRight: 6
    }
  }), "Ou autentique-se com reconhecimento facial no leitor da recep\xE7\xE3o."))));
}
window.SentinelLogin = Login;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/Login.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/Sidebar.jsx
try { (() => {
/* Sentinel — left navigation rail. */
function Sidebar({
  page,
  onNavigate,
  onLogout
}) {
  const {
    Logo
  } = window.FlauzinoDesignSystem_b9b227;
  const {
    Dashboard,
    ScanFace,
    Users,
    Shield,
    Settings,
    LogOut
  } = window.SentinelIcons;
  const items = [{
    key: "dashboard",
    label: "Painel",
    icon: Dashboard
  }, {
    key: "events",
    label: "Reconhecimentos",
    icon: ScanFace
  }, {
    key: "identities",
    label: "Identidades",
    icon: Users
  }, {
    key: "access",
    label: "Controle de Acesso",
    icon: Shield
  }];
  return /*#__PURE__*/React.createElement("aside", {
    className: "sx-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-side__brand"
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "lockup",
    size: 30,
    color: "#fff",
    tagline: "Sentinel"
  })), /*#__PURE__*/React.createElement("nav", {
    className: "sx-nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sx-nav__section"
  }, "Monitoramento"), items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.key,
    className: "sx-nav__item" + (page === it.key ? " sx-nav__item--active" : ""),
    onClick: () => onNavigate(it.key)
  }, /*#__PURE__*/React.createElement(it.icon, {
    size: 17
  }), " ", it.label)), /*#__PURE__*/React.createElement("div", {
    className: "sx-nav__section"
  }, "Sistema"), /*#__PURE__*/React.createElement("button", {
    className: "sx-nav__item",
    onClick: () => onNavigate("settings")
  }, /*#__PURE__*/React.createElement(Settings, {
    size: 17
  }), " Configura\xE7\xF5es")), /*#__PURE__*/React.createElement("div", {
    className: "sx-side__foot"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: "50%",
      background: "var(--accent-600)",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      fontSize: 13,
      fontWeight: 600,
      flex: "none"
    }
  }, "IN"), /*#__PURE__*/React.createElement("div", {
    className: "sx-side__user"
  }, /*#__PURE__*/React.createElement("b", null, "Iris Nunes"), /*#__PURE__*/React.createElement("span", null, "Seguran\xE7a \xB7 Online")), /*#__PURE__*/React.createElement("button", {
    className: "sx-nav__item",
    style: {
      width: 34,
      flex: "none",
      padding: 8,
      marginLeft: "auto"
    },
    onClick: onLogout,
    title: "Sair"
  }, /*#__PURE__*/React.createElement(LogOut, {
    size: 16
  }))));
}
window.SentinelSidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/Topbar.jsx
try { (() => {
/* Sentinel — top bar with search + notifications. */
function Topbar({
  title,
  crumb
}) {
  const {
    Search,
    Bell
  } = window.SentinelIcons;
  return /*#__PURE__*/React.createElement("header", {
    className: "sx-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sx-top__title"
  }, title), crumb && /*#__PURE__*/React.createElement("div", {
    className: "sx-top__crumb"
  }, crumb)), /*#__PURE__*/React.createElement("div", {
    className: "sx-top__spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sx-search"
  }, /*#__PURE__*/React.createElement(Search, {
    size: 15
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar por nome, ID ou port\xE3o\u2026"
  })), /*#__PURE__*/React.createElement("button", {
    className: "sx-iconbtn"
  }, /*#__PURE__*/React.createElement(Bell, {
    size: 17
  }), /*#__PURE__*/React.createElement("span", {
    className: "sx-iconbtn__dot"
  })));
}
window.SentinelTopbar = Topbar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/Topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sentinel/data.js
try { (() => {
/* Fake data for the Sentinel access-control console. */
const SENTINEL_DATA = {
  events: [{
    id: "FZ-2C09",
    name: "Helena Braga",
    role: "Diretoria",
    gate: "Portão Principal",
    time: "09:41:07",
    conf: 99.2,
    status: "granted"
  }, {
    id: "FZ-2C08",
    name: "Rafael Lemos",
    role: "Engenharia",
    gate: "Laboratório 2",
    time: "09:38:55",
    conf: 98.7,
    status: "granted"
  }, {
    id: "FZ-2C07",
    name: "Desconhecido",
    role: "Não cadastrado",
    gate: "Doca de Carga",
    time: "09:36:12",
    conf: 41.3,
    status: "denied"
  }, {
    id: "FZ-2C06",
    name: "Iris Nunes",
    role: "Segurança",
    gate: "Portão Principal",
    time: "09:34:48",
    conf: 99.5,
    status: "granted"
  }, {
    id: "FZ-2C05",
    name: "Marcos API",
    role: "Visitante",
    gate: "Recepção",
    time: "09:31:20",
    conf: 95.1,
    status: "review"
  }, {
    id: "FZ-2C04",
    name: "Tânia Vasquez",
    role: "Financeiro",
    gate: "Andar 4",
    time: "09:29:03",
    conf: 99.0,
    status: "granted"
  }, {
    id: "FZ-2C03",
    name: "Bruno Carvalho",
    role: "Engenharia",
    gate: "Laboratório 1",
    time: "09:25:41",
    conf: 98.2,
    status: "granted"
  }],
  identities: [{
    name: "Helena Braga",
    role: "Diretoria",
    dept: "Executivo",
    clearance: "Total",
    status: "online",
    enrolled: "12/03/2024"
  }, {
    name: "Rafael Lemos",
    role: "Engenharia",
    dept: "Plataforma",
    clearance: "Elevado",
    status: "online",
    enrolled: "04/05/2024"
  }, {
    name: "Iris Nunes",
    role: "Segurança",
    dept: "Operações",
    clearance: "Elevado",
    status: "online",
    enrolled: "21/01/2024"
  }, {
    name: "Tânia Vasquez",
    role: "Financeiro",
    dept: "Corporativo",
    clearance: "Padrão",
    status: "away",
    enrolled: "08/07/2024"
  }, {
    name: "Bruno Carvalho",
    role: "Engenharia",
    dept: "Plataforma",
    clearance: "Padrão",
    status: "offline",
    enrolled: "15/09/2024"
  }, {
    name: "Camila Rocha",
    role: "Produto",
    dept: "Corporativo",
    clearance: "Padrão",
    status: "online",
    enrolled: "02/02/2025"
  }, {
    name: "Diego Antunes",
    role: "Infra",
    dept: "Operações",
    clearance: "Elevado",
    status: "offline",
    enrolled: "19/11/2024"
  }, {
    name: "Letícia Moraes",
    role: "Jurídico",
    dept: "Corporativo",
    clearance: "Padrão",
    status: "away",
    enrolled: "27/06/2024"
  }],
  stats: [{
    label: "Acessos hoje",
    value: "1.284",
    delta: "+8,2%",
    tone: "neutral"
  }, {
    label: "Taxa de autorização",
    value: "97,4%",
    delta: "+0,6%",
    tone: "success"
  }, {
    label: "Tempo médio",
    value: "284ms",
    delta: "−12ms",
    tone: "neutral"
  }, {
    label: "Tentativas negadas",
    value: "33",
    delta: "+5",
    tone: "warning"
  }]
};
window.SENTINEL_DATA = SENTINEL_DATA;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sentinel/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

})();
