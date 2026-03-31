/**
 * SettingRow - Unified layout for settings with icon, label, description and control
 *
 * Used for Select, Slider, or any control that follows the pattern:
 * [icon] [label + description] [control]
 */

import { useCallback, useRef, type ReactNode } from 'react';

export type SettingColorTheme = 'primary' | 'audio' | 'visual' | 'mode';

export interface SettingRowProps {
  readonly label: string;
  readonly labelRight?: ReactNode;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly colorTheme?: SettingColorTheme;
  /** Custom color classes for icon background (overrides colorTheme) */
  readonly iconBgClass?: string;
  /** Custom color classes for icon text (overrides colorTheme) */
  readonly iconTextClass?: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}

const THEME_CLASSES: Record<SettingColorTheme, { bg: string; text: string }> = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  audio: { bg: 'bg-audio/10', text: 'text-audio' },
  visual: { bg: 'bg-visual/10', text: 'text-visual' },
  mode: { bg: 'bg-violet-100 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
};

export function SettingRow({
  label,
  labelRight,
  description,
  icon,
  children,
  colorTheme = 'primary',
  iconBgClass,
  iconTextClass,
  onClick,
  disabled,
}: SettingRowProps): ReactNode {
  const themeClasses = THEME_CLASSES[colorTheme];
  const bgClass = iconBgClass ?? themeClasses.bg;
  const textClass = iconTextClass ?? themeClasses.text;
  const pressRef = useRef<HTMLDivElement>(null);
  const isInteractive = Boolean(onClick);

  const onPointerDown = useCallback(() => {
    if (!isInteractive || disabled) return;
    pressRef.current?.classList.add('pressable--pressed');
  }, [isInteractive, disabled]);

  const clearPressed = useCallback(() => {
    pressRef.current?.classList.remove('pressable--pressed');
  }, []);

  return (
    <div
      ref={pressRef}
      className={`flex items-center justify-between gap-3 py-3${isInteractive ? ' pressable' : ''}${disabled ? ' pressable--disabled' : ''}`}
      onPointerDown={isInteractive ? onPointerDown : undefined}
      onPointerUp={isInteractive ? clearPressed : undefined}
      onPointerLeave={isInteractive ? clearPressed : undefined}
      onPointerCancel={isInteractive ? clearPressed : undefined}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className={`p-2.5 rounded-2xl shrink-0 ${bgClass} ${textClass}`}>{icon}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <div className="font-medium text-foreground truncate">{label}</div>
            {labelRight ? <span className="shrink-0">{labelRight}</span> : null}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground font-medium mt-0.5">{description}</div>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
