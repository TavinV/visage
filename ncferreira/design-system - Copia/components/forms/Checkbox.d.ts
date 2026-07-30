import * as React from "react";

/** Checkbox with an accessible label and optional description line. */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Primary label next to the box. */
  label?: string;
  /** Secondary description line below the label. */
  description?: string;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
