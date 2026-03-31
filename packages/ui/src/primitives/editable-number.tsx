/**
 * Editable number component - click to edit numeric input
 *
 * Handles edge cases properly:
 * - Empty input doesn't crash (validates on blur)
 * - Clamps value between min/max
 * - Enter to confirm, Escape to cancel
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface EditableNumberProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly suffix?: string;
  readonly className?: string;
}

export function EditableNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  suffix = '',
  className = '',
}: EditableNumberProps): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select all when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditValue(String(value));
    setIsEditing(true);
  };

  const handleFinishEdit = () => {
    const parsed = Number.parseInt(editValue, 10);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
    }
    // If invalid, just revert to previous value
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
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
          className="w-16 h-10 px-2 text-center font-mono font-bold bg-muted border-2 border-primary rounded-lg outline-none"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleStartEdit}
        disabled={disabled}
        className={`w-16 h-10 px-2 text-center font-mono font-bold bg-muted border border-border rounded-lg transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary cursor-pointer'
        }`}
      >
        {value}
      </button>
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}
