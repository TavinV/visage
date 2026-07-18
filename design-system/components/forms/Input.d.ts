import * as React from "react";

/** Labeled text input with hint/error states and an optional leading icon. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label rendered above the control. */
  label?: string;
  /** Helper text below the field. */
  hint?: string;
  /** Error message — overrides hint and applies the error style. */
  error?: string;
  /** Show a required asterisk on the label. */
  required?: boolean;
  /** Leading icon element. */
  icon?: React.ReactNode;
}

export function Input(props: InputProps): JSX.Element;
