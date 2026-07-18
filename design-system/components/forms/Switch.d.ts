import * as React from "react";

/** On/off switch for a binary setting. */
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Optional text label after the track. */
  label?: string;
}

export function Switch(props: SwitchProps): JSX.Element;
