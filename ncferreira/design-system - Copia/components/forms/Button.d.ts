import * as React from "react";

/**
 * Flauzino primary action button. Navy authority by default; use `accent`
 * for the single most important action on a view, `secondary`/`ghost` for
 * supporting actions.
 *
 * @startingPoint section="Core" subtitle="Button — navy / accent / secondary / ghost" viewport="700x140"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  /** Control height. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Stretch to full container width. */
  block?: boolean;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  /** Icon element rendered before the label. */
  iconLeft?: React.ReactNode;
  /** Icon element rendered after the label. */
  iconRight?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
