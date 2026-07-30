import * as React from "react";

/**
 * Flauzino logo — heraldic eagle mark, optionally locked up with the Poppins
 * wordmark. Inherits color from `currentColor`/`color`.
 *
 * @startingPoint section="Brand" subtitle="Logo — eagle mark + wordmark" viewport="700x140"
 */
export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Layout. @default "lockup" */
  variant?: "mark" | "lockup" | "stacked";
  /** Mark height in px (wordmark scales from it). @default 40 */
  size?: number;
  /** Tagline under the wordmark; pass "" to hide. */
  tagline?: string;
  /** Override color (defaults to navy). */
  color?: string;
}

export function Logo(props: LogoProps): JSX.Element;
