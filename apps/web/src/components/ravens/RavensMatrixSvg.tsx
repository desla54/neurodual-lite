import { useTranslation } from 'react-i18next';
import type { CellSpec, ConfigId, PerceptualComplexity } from '@neurodual/logic';
import { RavensCellSvg } from './RavensCellSvg';

interface RavensMatrixSvgProps {
  grid: CellSpec[][];
  cellSize: number;
  gap?: number;
  /** Config ID for layout decisions on multi-component cells */
  configId?: ConfigId;
  /** Optional preview cell to render in the missing (bottom-right) position */
  preview?: CellSpec | null;
  /** S7: perceptual complexity parameters */
  perceptual?: PerceptualComplexity;
}

export function RavensMatrixSvg({
  grid,
  cellSize,
  gap = 4,
  configId,
  preview,
  perceptual,
}: RavensMatrixSvgProps) {
  const { t } = useTranslation();
  const totalSize = cellSize * 3 + gap * 2;

  return (
    <svg
      width={totalSize}
      height={totalSize}
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      className="overflow-visible"
      role="img"
      aria-label={t('aria.ravensMatrix')}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const x = c * (cellSize + gap);
          const y = r * (cellSize + gap);
          const isMissing = r === 2 && c === 2;

          return (
            <g key={`${r}-${c}`}>
              {/* Cell background */}
              <rect
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={4}
                fill={isMissing ? 'none' : 'var(--color-woven-surface, #1a1a2e)'}
                stroke={
                  isMissing ? 'var(--color-woven-border, #444)' : 'var(--color-woven-border, #333)'
                }
                strokeWidth={isMissing ? 2 : 1}
                strokeDasharray={isMissing ? '6 3' : undefined}
                opacity={isMissing ? 0.6 : 1}
              />
              {/* Cell content */}
              {!isMissing && (
                <g transform={`translate(${x}, ${y})`}>
                  <RavensCellSvg
                    cell={cell}
                    size={cellSize}
                    configId={configId}
                    perceptual={perceptual}
                  />
                </g>
              )}
              {/* Preview in missing cell */}
              {isMissing && preview && (
                <g transform={`translate(${x}, ${y})`} opacity={0.85}>
                  <RavensCellSvg cell={preview} size={cellSize} configId={configId} />
                </g>
              )}
              {/* Question mark when no preview */}
              {isMissing && !preview && (
                <text
                  x={x + cellSize / 2}
                  y={y + cellSize / 2 + 6}
                  textAnchor="middle"
                  fontSize={cellSize * 0.35}
                  fontWeight="bold"
                  fill="var(--color-woven-text-muted, #888)"
                >
                  ?
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
