import type { TooltipProps } from 'recharts';
import type { NameType, Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';

export interface CustomTooltipProps
  extends Omit<TooltipProps<ValueType, NameType>, 'labelFormatter'> {
  /** Optional custom formatter for the value */
  valueFormatter?: (value: number) => string;
  /** Optional custom formatter for the label (title) */
  labelFormatter?: (label: string) => string;
  /** Whether to hide the label (title) */
  hideLabel?: boolean;
  // Explicitly define Recharts injected props to avoid TS issues
  active?: boolean;
  payload?: Payload<ValueType, NameType>[];
  label?: ValueType;
}

function getPayloadValue(payload: unknown, dataKey: string | number): ValueType | null | undefined {
  if (!payload || typeof payload !== 'object') return undefined;

  const path = String(dataKey).split('.');
  let current: unknown = payload;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current as ValueType | null | undefined;
}

function resolveTooltipEntryValue(
  entry: Payload<ValueType, NameType>,
): ValueType | null | undefined {
  if (typeof entry.dataKey === 'string' || typeof entry.dataKey === 'number') {
    return getPayloadValue(entry.payload, entry.dataKey);
  }

  return entry.value;
}

export function CustomTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
  hideLabel,
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const visiblePayload = payload
    .map((entry) => ({ entry, resolvedValue: resolveTooltipEntryValue(entry) }))
    .filter(
      (item): item is { entry: Payload<ValueType, NameType>; resolvedValue: ValueType } =>
        item.resolvedValue !== null && item.resolvedValue !== undefined,
    );

  if (!visiblePayload.length) {
    return null;
  }

  const formattedLabel =
    labelFormatter && typeof label === 'string' ? labelFormatter(label) : label;

  // Build accessible description for screen readers
  const accessibleDescription = visiblePayload
    .map(({ entry, resolvedValue }) => {
      const value = valueFormatter ? valueFormatter(Number(resolvedValue)) : resolvedValue;
      return `${entry.name}: ${value}`;
    })
    .join(', ');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="bg-popover/95 backdrop-blur-sm border border-border/50 shadow-xl rounded-xl p-3 text-xs min-w-[140px]"
    >
      {/* Screen reader only: full description */}
      <span className="sr-only">
        {formattedLabel ? `${formattedLabel}: ` : ''}
        {accessibleDescription}
      </span>

      {/* Visual content */}
      {!hideLabel && (
        <div className="mb-2 pb-2 border-b border-border/50" aria-hidden="true">
          <p className="font-semibold text-foreground">{formattedLabel}</p>
        </div>
      )}
      <div className="space-y-1.5" aria-hidden="true">
        {visiblePayload.map(({ entry, resolvedValue }) => (
          <div
            key={`${entry.dataKey}-${entry.color}`}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shadow-sm ring-1 ring-white/10"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground capitalize font-medium">{entry.name}</span>
            </div>
            <span className="font-mono font-bold text-foreground">
              {valueFormatter ? valueFormatter(Number(resolvedValue)) : resolvedValue}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
