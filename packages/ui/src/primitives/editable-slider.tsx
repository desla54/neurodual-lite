/**
 * Editable slider component - slider with editable numeric input
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

const getFractionDigits = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const text = value.toString().toLowerCase();
  if (text.includes('e-')) {
    const [base, exponentPart] = text.split('e-');
    const exponent = Number(exponentPart);
    const baseDecimals = base?.split('.')[1]?.length ?? 0;
    return Number.isFinite(exponent) ? exponent + baseDecimals : baseDecimals;
  }
  return text.split('.')[1]?.length ?? 0;
};

export interface EditableSliderProps {
  readonly label: string;
  readonly labelRight?: ReactNode;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly unit?: string;
  readonly suffix?: string;
  readonly decimals?: number;
  readonly colorClass?: string;
  readonly trackClass?: string;
  readonly accentClass?: string;
  readonly hint?: string;
}

export function EditableSlider({
  label,
  labelRight,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  unit = '',
  suffix = '',
  decimals,
  colorClass = 'bg-woven-surface text-woven-text border border-woven-border/70',
  trackClass = 'bg-woven-cell-rest border border-woven-border/70',
  accentClass = 'accent-woven-text',
  hint,
}: EditableSliderProps): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const safeValue = Number.isFinite(value) ? value : min;
  const effectiveDecimals = Math.max(0, decimals ?? getFractionDigits(step));
  const displayValue = new Intl.NumberFormat(undefined, {
    useGrouping: false,
    minimumFractionDigits: effectiveDecimals,
    maximumFractionDigits: effectiveDecimals,
  }).format(safeValue);
  const editableValue =
    effectiveDecimals > 0 ? safeValue.toFixed(effectiveDecimals) : String(safeValue);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditValue(editableValue);
    setIsEditing(true);
  };

  const handleFinishEdit = () => {
    const normalizedInput = editValue.replace(',', '.');
    const parsed = Number.parseFloat(normalizedInput);
    if (!Number.isNaN(parsed)) {
      // Clamp between min/max
      const clamped = Math.min(max, Math.max(min, parsed));
      // Round according to decimals
      const factor = 10 ** effectiveDecimals;
      const rounded = Math.round(clamped * factor) / factor;
      onChange(rounded);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          {labelRight ? <span className="shrink-0">{labelRight}</span> : null}
        </div>
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={handleKeyDown}
            min={min}
            max={max}
            step={step}
            className={`font-mono text-xs font-bold px-2 py-1 rounded-md w-20 text-center ${colorClass} outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
          />
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            disabled={disabled}
            className={`font-mono text-xs font-bold px-2 py-1 rounded-md ${colorClass} ${!disabled ? 'cursor-pointer hover:ring-2 hover:ring-primary/30' : ''}`}
          >
            {unit}
            {displayValue}
            {suffix}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={`w-full h-3 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed ${trackClass} ${accentClass}`}
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
