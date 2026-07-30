import * as React from "react";

/** Circular avatar — shows an image, or auto-derived initials from `name`. */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — used for initials and the title tooltip. */
  name?: string;
  /** Image URL; when present it replaces the initials. */
  src?: string;
  /** Size. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Presence dot. */
  status?: "online" | "away" | "offline" | null;
}

export function Avatar(props: AvatarProps): JSX.Element;
