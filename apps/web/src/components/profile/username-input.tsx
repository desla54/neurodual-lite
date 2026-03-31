/**
 * UsernameInput - Styled username input field
 * Nordic design system
 */

import type { ReactNode } from 'react';
import { nonAuthInputProps } from '../../utils/non-auth-input-props';

interface UsernameInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  maxLength?: number;
}

export function UsernameInput({
  value,
  onChange,
  label,
  placeholder,
  maxLength = 20,
}: UsernameInputProps): ReactNode {
  return (
    <div className="space-y-3">
      <label
        htmlFor="username"
        className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1"
      >
        {label}
      </label>
      <input
        id="username"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-4 rounded-2xl bg-background border-2 border-transparent focus:border-visual/20 text-primary font-bold text-lg placeholder:text-slate-300 focus:outline-none focus:bg-white transition-all"
        placeholder={placeholder}
        maxLength={maxLength}
        {...nonAuthInputProps}
      />
    </div>
  );
}
