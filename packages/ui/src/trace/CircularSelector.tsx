/**
 * CircularSelector - Radial selection wheel
 *
 * Styled like the game writing zone (orange dashed border, ? at center).
 *
 * Flow:
 * 1. Empty state: orange dashed border + "?" at center, items in a circle
 * 2. Tap an item → it moves to center (large preview), ring items stay visible
 * 3. At center: tap the center item to change (re-select), or onValidate fires
 * 4. Clear button resets to empty state
 *
 * Works for shapes, emotions, colors, or any set of labeled items.
 */

import { type ReactNode, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface CircularSelectorItem {
  /** Unique key */
  readonly id: string;
  /** Display label */
  readonly label: string;
  /** Optional color (for color items) */
  readonly color?: string;
  /** Optional emoji or icon character */
  readonly emoji?: string;
}

export interface CircularSelectorProps {
  /** Items to display in the circle */
  items: readonly CircularSelectorItem[];
  /** Currently selected item id (null = none) */
  selected: string | null;
  /** Called when an item is selected */
  onSelect: (id: string) => void;
  /** Called when selection is cleared */
  onClear: () => void;
  /** Size of the selector in pixels */
  size?: number;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Hide the outer dashed border (when already inside a bordered zone) */
  borderless?: boolean;
  /** Render function for each item (default: colored circle or emoji) */
  renderItem?: (item: CircularSelectorItem, isSelected: boolean, size: number) => ReactNode;
  /** Render function for the center preview (default: selected item large) */
  renderCenter?: (item: CircularSelectorItem | null, size: number) => ReactNode;
}

function DefaultItemContent({
  item,
  fontSize,
}: {
  item: CircularSelectorItem;
  fontSize: number;
}): ReactNode {
  if (item.emoji) {
    return <span style={{ fontSize }}>{item.emoji}</span>;
  }
  if (!item.color) {
    return (
      <span
        className="text-woven-text font-medium truncate px-0.5"
        style={{ fontSize: fontSize * 0.6 }}
      >
        {item.label}
      </span>
    );
  }
  return null;
}

export function CircularSelector({
  items,
  selected,
  onSelect,
  onClear,
  size = 200,
  disabled = false,
  borderless = false,
  renderItem,
  renderCenter,
}: CircularSelectorProps): ReactNode {
  const { t } = useTranslation();
  const selectedItem = items.find((it) => it.id === selected) ?? null;
  // Track if the user has "confirmed" (tapped an item) — ring stays visible for re-selection
  const [confirmed, setConfirmed] = useState(false);

  const radius = size * 0.38;
  const itemSize = Math.max(28, size * 0.15);
  const centerSize = Math.max(44, size * 0.28);

  const handleItemClick = useCallback(
    (id: string) => {
      if (disabled) return;
      onSelect(id);
      setConfirmed(true);
    },
    [disabled, onSelect],
  );

  const handleCenterClick = useCallback(() => {
    if (disabled) return;
    if (selectedItem) {
      // Tap center when something is selected → deselect to re-choose
      onClear();
      setConfirmed(false);
    }
  }, [disabled, selectedItem, onClear]);

  const hasSelection = selectedItem !== null;

  return (
    <div
      className={`relative rounded-2xl ${borderless ? '' : 'bg-woven-surface border-2 border-dashed border-woven-focus'}`}
      style={{ width: size, height: size }}
    >
      {/* Center preview */}
      <button
        type="button"
        onClick={handleCenterClick}
        disabled={disabled}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full flex items-center justify-center transition-all duration-200"
        style={{ width: centerSize, height: centerSize }}
        aria-label={
          selectedItem ? `Selected: ${selectedItem.label} — tap to change` : 'No selection'
        }
      >
        {renderCenter ? (
          renderCenter(selectedItem, centerSize)
        ) : hasSelection ? (
          <div
            className="w-full h-full rounded-full flex items-center justify-center border-2 border-woven-focus shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: selectedItem.color }}
          >
            <DefaultItemContent item={selectedItem} fontSize={centerSize * 0.5} />
          </div>
        ) : (
          <div className="w-full h-full rounded-full border-2 border-dashed border-woven-border/40 flex items-center justify-center bg-woven-surface/50">
            <span className="text-woven-text-muted" style={{ fontSize: centerSize * 0.45 }}>
              ?
            </span>
          </div>
        )}
      </button>

      {/* Decorative ring */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-woven-border/15 pointer-events-none"
        style={{ width: radius * 2, height: radius * 2 }}
      />

      {/* Items arranged in a circle */}
      {items.map((item, index) => {
        const angle = (2 * Math.PI * index) / items.length - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const isSelected = item.id === selected;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleItemClick(item.id)}
            disabled={disabled}
            className={`absolute rounded-full flex items-center justify-center transition-all duration-200 ${
              isSelected
                ? 'ring-2 ring-woven-focus ring-offset-1 ring-offset-woven-surface scale-115 shadow-md z-20'
                : hasSelection && confirmed
                  ? 'opacity-50 hover:opacity-80 hover:scale-105'
                  : 'opacity-85 hover:opacity-100 hover:scale-110'
            } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
            style={{
              width: itemSize,
              height: itemSize,
              left: `calc(50% + ${x}px - ${itemSize / 2}px)`,
              top: `calc(50% + ${y}px - ${itemSize / 2}px)`,
              backgroundColor: item.color,
            }}
            aria-label={item.label}
          >
            {renderItem ? (
              renderItem(item, isSelected, itemSize)
            ) : (
              <DefaultItemContent item={item} fontSize={itemSize * 0.55} />
            )}
          </button>
        );
      })}

      {/* Clear button — bottom right corner, only visible when something is selected */}
      {hasSelection && (
        <button
          type="button"
          onClick={() => {
            onClear();
            setConfirmed(false);
          }}
          disabled={disabled}
          className="absolute bottom-2 right-2 z-20 w-7 h-7 rounded-full bg-woven-surface border border-woven-border/40 flex items-center justify-center text-woven-text-muted hover:text-woven-text hover:border-woven-border transition-colors"
          aria-label={t('aria.clearSelection')}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
