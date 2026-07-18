import * as React from "react";

/**
 * Surface container with optional header (eyebrow + title + action) and footer.
 *
 * @startingPoint section="Core" subtitle="Card — white surface, navy-tinted shadow" viewport="700x260"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Header title. */
  title?: string;
  /** Uppercase kicker above the title. */
  eyebrow?: string;
  /** Element pinned to the top-right of the header. */
  headerAction?: React.ReactNode;
  /** Footer content. */
  footer?: React.ReactNode;
  /** Add hover lift + pointer cursor. */
  interactive?: boolean;
  /** Remove the shadow. */
  flat?: boolean;
  /** Navy authority surface with light text. */
  inverse?: boolean;
}

export function Card(props: CardProps): JSX.Element;
