import type { ControlColor } from '@neurodual/logic';

export interface GameControlItem {
  id: string;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  color: ControlColor;
  /** Highlight this button with pulse effect (for tutorials) */
  highlighted?: boolean;
  /** Flash error state (for tutorials) */
  error?: boolean;
}
