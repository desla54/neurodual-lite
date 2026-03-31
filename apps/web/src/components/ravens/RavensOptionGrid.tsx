import { cn } from '@neurodual/ui';
import type { CellSpec, ConfigId, PerceptualComplexity } from '@neurodual/logic';
import { RavensCellSvg } from './RavensCellSvg';

interface RavensOptionGridProps {
  options: CellSpec[];
  selectedIndex: number | null;
  correctIndex: number;
  showFeedback: boolean;
  cellSize: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
  /** Config ID passed to RavensCellSvg for consistent multi-entity layout */
  configId?: ConfigId;
  /** S7: perceptual complexity parameters */
  perceptual?: PerceptualComplexity;
}

export function RavensOptionGrid({
  options,
  selectedIndex,
  correctIndex,
  showFeedback,
  cellSize,
  onSelect,
  disabled,
  configId,
  perceptual,
}: RavensOptionGridProps) {
  const cols = options.length <= 4 ? 2 : options.length <= 6 ? 3 : 4;

  return (
    <div
      className="inline-grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, ${cellSize}px)` }}
    >
      {options.map((option, i) => {
        const isSelected = selectedIndex === i;
        const isCorrect = i === correctIndex;

        let borderClass: string;
        if (showFeedback) {
          if (isSelected && isCorrect) {
            borderClass = 'border-2 border-woven-correct bg-woven-correct/10';
          } else if (isSelected && !isCorrect) {
            borderClass = 'border-2 border-woven-incorrect bg-woven-incorrect/10';
          } else if (isCorrect) {
            borderClass = 'border-2 border-woven-correct/50';
          } else {
            borderClass = 'border border-woven-border bg-woven-surface';
          }
        } else if (isSelected) {
          borderClass = 'border-2 border-primary bg-primary/10 shadow-md';
        } else {
          borderClass = 'border border-woven-border bg-woven-surface hover:border-primary/50';
        }

        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            className={cn(
              'rounded-lg transition-all duration-150',
              borderClass,
              !disabled && 'cursor-pointer active:scale-95',
              disabled && 'cursor-default',
            )}
            style={{ width: cellSize, height: cellSize }}
            onClick={() => !disabled && onSelect(i)}
          >
            <svg
              width={cellSize}
              height={cellSize}
              viewBox={`0 0 ${cellSize} ${cellSize}`}
              className="overflow-visible"
              role="img"
              aria-label={`Option ${i + 1}`}
            >
              <RavensCellSvg
                cell={option}
                size={cellSize}
                configId={configId}
                perceptual={perceptual}
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
