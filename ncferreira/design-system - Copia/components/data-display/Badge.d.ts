import * as React from "react";

/** Compact status or category label. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color/tone. @default "neutral" */
  variant?: "neutral" | "accent" | "success" | "warning" | "danger" | "solid";
  /** Show a leading status dot. */
  dot?: boolean;
  /** Square corners instead of pill. */
  square?: boolean;
}

export function Badge(props: BadgeProps): JSX.Element;
