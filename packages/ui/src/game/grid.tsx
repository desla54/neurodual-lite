/**
 * Grid component - 3x3 position grid for Dual N-Back.
 *
 * Design unifié "Woven Ink" avec texture canvas.
 *
 * Multi-stimulus support:
 * - activePositions: Map<modalityId, position> for 2-4 simultaneous positions
 * - multiMode: 'color' | 'image' for visual differentiation
 */

import { memo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IMAGE_MODALITY_SHAPES,
  MULTI_STIMULUS_COLORS,
  MULTI_STIMULUS_SHAPES,
} from '@neurodual/logic';
import { useUITranslations } from '../context/UITranslations';
import { cn } from '../lib/utils';
import { CanvasWeave } from '../primitives/canvas-weave';
import { Popover, PopoverAnchor, PopoverContent } from '../primitives/popover';
import { StringArtPlus } from './string-art-plus';
import {
  type WovenColor,
  WOVEN_COLORS,
  wovenBg,
  wovenText,
  wovenCssVar,
} from '../theme/woven-colors';

export type StimulusStyle = 'full' | 'dots' | 'stringart' | 'custom';
export type GridStyle = 'classic' | 'trace';

/** Multi-stimulus mode for visual differentiation */
export type MultiStimulusMode = 'color' | 'image';

export interface GridProps {
  readonly activePosition: number | null;
  readonly showStimulus?: boolean;
  readonly stimulusStyle?: StimulusStyle;
  readonly className?: string;
  readonly color?: string;
  readonly borderColor?: string;
  readonly paused?: boolean;
  readonly showPlayButton?: boolean;
  readonly onPlay?: () => void;
  readonly onResume?: () => void;
  /** Optional: make the center focus cross/cell clickable (e.g., open N-back timeline). */
  readonly onFocusCrossPress?: () => void;
  /** Optional aria-label for the clickable focus cross/cell. */
  readonly focusCrossAriaLabel?: string;
  readonly hideCross?: boolean;
  readonly customImageUrl?: string;
  readonly stringArtPoints?: number;
  /** Optional text or symbolic value to render inside the active cell. */
  readonly activeStimulusText?: string | null;
  /** Optional shape to render inside the active cell (e.g., BW image modality) */
  readonly activeStimulusShape?: (typeof IMAGE_MODALITY_SHAPES)[number] | null;
  /** Optional text or symbolic value to render at the center overlay. */
  readonly centerStimulusText?: string | null;
  /** Optional shape to render at the center overlay (for modes without position) */
  readonly centerStimulusShape?: (typeof IMAGE_MODALITY_SHAPES)[number] | null;
  /**
   * Durée de transition du stimulus en ms.
   * Pour une synchronisation RT-grade, privilégier 0 (apparition/disparition instantanées).
   */
  readonly transitionDurationMs?: number;
  /** Grid visual style */
  readonly gridStyle?: GridStyle;

  // Multi-stimulus support (Brain Workshop mode)
  /**
   * Multi-stimulus: Map of modalityId to position value.
   * When provided, overrides activePosition for multi-position display.
   * Keys: 'position', 'position2', 'position3', 'position4'
   */
  readonly activePositions?: ReadonlyMap<string, number>;
  /**
   * Multi-stimulus differentiation mode.
   * - 'color': Each position stream has a different color
   * - 'image': Each position stream has a different shape
   */
  readonly multiMode?: MultiStimulusMode;

  /**
   * Multi-stimulus vis values (Brain Workshop multi-stimulus color/image replacement).
   * Keys: 'vis1'..'vis4'
   * Values: 0-7 (index in the 8-item visual pool)
   */
  readonly activeVisValues?: ReadonlyMap<string, number>;
}

const ARROW_ROTATION: Record<string, number> = {
  up: 0,
  'up-right': 45,
  right: 90,
  'down-right': 135,
  down: 180,
  'down-left': 225,
  left: 270,
  'up-left': 315,
};

const EMOTION_EMOJI: Record<string, string> = {
  joy: '😊',
  sadness: '😢',
  anger: '😠',
  fear: '😨',
  disgust: '🤢',
  surprise: '😲',
  contempt: '😤',
  neutral: '😐',
};

const WORD_DISPLAY_FALLBACK: Record<string, string> = {
  'word-hand': 'main',
  'word-cat': 'chat',
  'word-moon': 'lune',
  'word-fire': 'feu',
  'word-water': 'eau',
  'word-king': 'roi',
  'word-key': 'clé',
  'word-wind': 'vent',
};

function isArrowDirection(value: string): boolean {
  return value in ARROW_ROTATION;
}

function isDigitValue(value: string): boolean {
  return /^\d+$/.test(value);
}

function getStimulusDisplayLabel(value: string, wordLabels?: Record<string, string>): string {
  if (isDigitValue(value)) return value;
  if (value in EMOTION_EMOJI) return EMOTION_EMOJI[value] ?? value;
  const wordMap = wordLabels ?? WORD_DISPLAY_FALLBACK;
  if (value in wordMap) return wordMap[value] ?? value;
  return value;
}

function StimulusValueDisplay({
  value,
  color,
  wordLabels,
}: {
  value: string;
  color?: string;
  wordLabels?: Record<string, string>;
}): ReactNode {
  if (isArrowDirection(value)) {
    const rotation = ARROW_ROTATION[value] ?? 0;

    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="w-16 h-16 sm:w-20 sm:h-20"
        fill={color ?? 'currentColor'}
      >
        <g transform={`rotate(${rotation} 12 12)`}>
          <path d="M12 4l-6 8h4v8h4v-8h4z" />
        </g>
      </svg>
    );
  }

  const isDigit = isDigitValue(value);

  return (
    <span
      className={cn(
        'flex items-center justify-center font-extrabold leading-none',
        isDigit ? 'text-6xl sm:text-7xl' : 'text-4xl sm:text-5xl',
      )}
      style={color ? { color } : undefined}
    >
      {getStimulusDisplayLabel(value, wordLabels)}
    </span>
  );
}

function NineDotsPattern({ color }: { color?: string }): ReactNode {
  const dotColorClass = wovenBg(color);

  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-1 p-2">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((dotIdx) => (
        <div key={`dot-${dotIdx}`} className="flex items-center justify-center">
          <div
            className={cn('rounded-full', dotColorClass)}
            style={{
              width: '50%',
              height: '50%',
              aspectRatio: '1',
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Shape component for multi-stimulus 'image' mode differentiation */
function MultiStimulusShape({
  shape,
  color,
}: {
  shape: (typeof MULTI_STIMULUS_SHAPES)[number];
  color: string;
}): ReactNode {
  const svgProps = {
    className: 'w-3/4 h-3/4',
    fill: color,
  };

  switch (shape) {
    case 'circle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <rect x="2" y="2" width="20" height="20" rx="2" />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <path d="M12 2L22 20H2L12 2Z" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <path d="M12 2L22 12L12 22L2 12L12 2Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

/** Shape component for Brain Workshop 8-item visual pool (vis1..4) */
function VisPoolShape({ valueIndex, color }: { valueIndex: number; color: string }): ReactNode {
  const shape =
    IMAGE_MODALITY_SHAPES[Math.max(0, Math.min(IMAGE_MODALITY_SHAPES.length - 1, valueIndex))];

  const svgProps = {
    className: 'w-2/3 h-2/3',
    fill: color,
  };

  switch (shape) {
    case 'circle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <path d="M12 2L22 20H2L12 2Z" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <path d="M12 2L22 12L12 22L2 12L12 2Z" />
        </svg>
      );
    case 'pentagon':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <polygon points="12,2 22,9 18,22 6,22 2,9" />
        </svg>
      );
    case 'hexagon':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case 'cross':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...svgProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

/**
 * Get the multi-stimulus index for a modality ID.
 * Returns 0 for 'position', 1 for 'position2', etc.
 */
function getModalityIndex(modalityId: string): number {
  if (modalityId === 'position') return 0;
  const match = modalityId.match(/^position(\d+)$/);
  if (match?.[1]) return Number.parseInt(match[1], 10) - 1;
  return 0;
}

export const Grid = memo(function Grid({
  activePosition,
  showStimulus = true,
  stimulusStyle = 'full',
  className,
  color,
  borderColor,
  paused = false,
  showPlayButton = false,
  onPlay,
  onResume,
  onFocusCrossPress,
  focusCrossAriaLabel,
  hideCross = false,
  customImageUrl,
  stringArtPoints = 10,
  activeStimulusText = null,
  activeStimulusShape = null,
  centerStimulusText = null,
  centerStimulusShape = null,
  transitionDurationMs = 0,
  gridStyle = 'classic',
  // Multi-stimulus props
  activePositions,
  multiMode,
  activeVisValues,
}: GridProps): ReactNode {
  const t = useUITranslations();
  const { t: tCommon } = useTranslation();
  const wordLabels = t.grid.wordLabels;
  const [showFocusHint, setShowFocusHint] = useState(false);
  const allowPauseOverlayClickThrough = Boolean(onFocusCrossPress);
  const colorHex = wovenCssVar(color);
  const transitionMs =
    typeof transitionDurationMs === 'number' && Number.isFinite(transitionDurationMs)
      ? Math.max(0, transitionDurationMs)
      : 0;
  const transitionClass = transitionMs === 0 ? 'transition-none' : 'transition-opacity ease-out';
  const transitionStyle =
    transitionMs === 0 ? undefined : { transitionDuration: `${transitionMs}ms` };
  const stimulusVisibilityOpacity = 'var(--nd-stimulus-visibility, 1)';
  const isTraceGridStyle = gridStyle === 'trace';
  // Mapping Grid (0-8) -> Logic (0-7). Le centre (4) est null.
  const gridMap = [0, 1, 2, 3, null, 4, 5, 6, 7];

  /**
   * Get active modalities for a given position.
   * Returns array of { modalityId, index } for multi-stimulus mode,
   * or single entry for standard mode.
   */
  const getActiveModalities = (
    pos: number,
  ): Array<{ modalityId: string; index: number }> | null => {
    if (!showStimulus) return null;

    // Multi-stimulus mode: check all position modalities
    if (activePositions && activePositions.size > 0) {
      const activeModalities: Array<{ modalityId: string; index: number }> = [];
      for (const [modalityId, value] of activePositions) {
        if (value === pos) {
          activeModalities.push({
            modalityId,
            index: getModalityIndex(modalityId),
          });
        }
      }
      return activeModalities.length > 0 ? activeModalities : null;
    }

    // Standard mode: use activePosition prop
    if (activePosition === pos) {
      return [{ modalityId: 'position', index: 0 }];
    }

    return null;
  };

  return (
    <div className={cn('relative aspect-square rounded-2xl isolate', className)}>
      {/* Classic style keeps the crosshair overlay */}
      {!hideCross && !isTraceGridStyle && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 opacity-60">
          <svg
            viewBox="0 0 24 24"
            className="w-8 h-8 text-woven-focus"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            role="img"
            aria-label={t.grid.fixationCross}
          >
            <path d="M12 8v8M8 12h8" strokeLinecap="round" />
          </svg>
        </div>
      )}

      <div
        role="grid"
        aria-label={t.grid.gridLabel}
        data-capture-surface="game-grid"
        className={cn(
          'relative grid grid-cols-3 grid-rows-3 aspect-square',
          isTraceGridStyle
            ? 'bg-woven-grid border border-woven-border gap-3 p-4 rounded-2xl overflow-hidden shadow-[0_8px_28px_-6px_hsl(var(--woven-border)/0.45),0_1px_3px_0_hsl(var(--woven-border)/0.2),inset_0_1px_0_0_var(--glass-highlight)]'
            : 'bg-woven-grid border border-woven-border rounded-2xl overflow-hidden shadow-[0_8px_28px_-6px_hsl(var(--woven-border)/0.45),0_1px_3px_0_hsl(var(--woven-border)/0.2),inset_0_1px_0_0_var(--glass-highlight)]',
          borderColor && !isTraceGridStyle && 'border-4',
          borderColor,
        )}
      >
        {!isTraceGridStyle && <CanvasWeave opacity={0.08} className="stroke-neutral-400" />}
        {isTraceGridStyle && <CanvasWeave opacity={0.15} className="stroke-neutral-400" />}

        {gridMap.map((logicPos, gridIndex) => {
          if (logicPos === null) {
            // Center cell - just shows the border lines
            const sharedClassName = cn(
              'relative',
              isTraceGridStyle
                ? 'z-10 rounded-xl overflow-hidden flex items-center justify-center'
                : 'border-r border-b border-woven-border last:border-r-0 [&:nth-child(3)]:border-r-0 [&:nth-child(6)]:border-r-0 [&:nth-child(7)]:border-b-0 [&:nth-child(8)]:border-b-0 [&:nth-child(9)]:border-b-0',
            );
            const sharedStyle = {
              borderRightWidth: isTraceGridStyle ? undefined : gridIndex % 3 === 2 ? 0 : 1,
              borderBottomWidth: isTraceGridStyle ? undefined : gridIndex >= 6 ? 0 : 1,
            };
            const focusIndicator =
              isTraceGridStyle && !hideCross ? (
                <span
                  className="w-6 h-0.5 rounded-sm bg-woven-focus pointer-events-none"
                  aria-hidden="true"
                />
              ) : null;

            if (!hideCross && onFocusCrossPress) {
              return (
                <Popover key="center" open={showFocusHint} onOpenChange={setShowFocusHint}>
                  <PopoverAnchor asChild>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        setShowFocusHint(false);
                        e.preventDefault();
                        e.stopPropagation();
                        onFocusCrossPress();
                      }}
                      onClick={(e) => {
                        setShowFocusHint(false);
                        e.preventDefault();
                        e.stopPropagation();
                        // Keyboard activation dispatches click with detail=0.
                        if (e.detail === 0) {
                          onFocusCrossPress();
                        }
                      }}
                      onPointerEnter={() => setShowFocusHint(true)}
                      onPointerLeave={() => setShowFocusHint(false)}
                      onFocus={() => setShowFocusHint(true)}
                      onBlur={() => setShowFocusHint(false)}
                      aria-label={focusCrossAriaLabel ?? t.grid.fixationCross}
                      className={cn(
                        sharedClassName,
                        'z-[99] w-full h-full cursor-pointer pointer-events-auto touch-manipulation focus:outline-none focus:ring-2 focus:ring-primary/60 hover:bg-woven-cell-rest/25 active:bg-woven-cell-rest/35',
                      )}
                      data-capture-cell="grid-center"
                      style={sharedStyle}
                      data-testid="grid-center-clickable"
                    >
                      {focusIndicator}
                    </button>
                  </PopoverAnchor>
                  <PopoverContent
                    side="top"
                    align="center"
                    sideOffset={8}
                    className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground pointer-events-none select-none"
                  >
                    {focusCrossAriaLabel ?? t.grid.fixationCross}
                  </PopoverContent>
                </Popover>
              );
            }

            return (
              <div
                key="center"
                className={sharedClassName}
                data-capture-cell="grid-center"
                style={sharedStyle}
              >
                {focusIndicator}
              </div>
            );
          }

          const position = logicPos;
          const activeModalities = getActiveModalities(position);
          const isActive = activeModalities !== null;

          const useLegacyColor =
            !multiMode &&
            !activePositions &&
            isActive &&
            color &&
            (WOVEN_COLORS as Record<string, WovenColor>)[color];

          return (
            <div
              key={position}
              role="gridcell"
              aria-label={`${t.grid.cellLabel} ${position + 1}`}
              aria-current={isActive ? 'true' : 'false'}
              data-testid={isActive ? 'active-cell' : 'cell'}
              data-position={position}
              data-capture-cell="grid-node"
              data-capture-state={isActive ? 'active' : 'idle'}
              className={cn(
                'relative z-10 border-woven-border',
                !isTraceGridStyle && 'bg-woven-cell-rest',
                isTraceGridStyle &&
                  'rounded-xl border border-woven-border overflow-hidden bg-woven-cell-rest',
              )}
              style={{
                borderRightWidth: isTraceGridStyle ? undefined : gridIndex % 3 === 2 ? 0 : 1,
                borderBottomWidth: isTraceGridStyle ? undefined : gridIndex >= 6 ? 0 : 1,
                borderStyle: isTraceGridStyle ? undefined : 'solid',
                borderColor: isTraceGridStyle ? undefined : 'hsl(var(--woven-border))',
              }}
            >
              {/* Standard stimulus overlay (single position mode) */}
              {!multiMode && (
                <div
                  className={cn(
                    'absolute inset-0 flex items-center justify-center nd-stimulus-layer',
                    transitionClass,
                    stimulusStyle === 'full' &&
                      !activeStimulusText &&
                      !activeStimulusShape &&
                      (useLegacyColor && color ? wovenBg(color) : 'bg-visual'),
                  )}
                  style={
                    stimulusStyle === 'full' &&
                    !activeStimulusText &&
                    !activeStimulusShape &&
                    colorHex
                      ? {
                          ...transitionStyle,
                          backgroundColor: colorHex,
                          opacity: isActive ? stimulusVisibilityOpacity : 0,
                        }
                      : {
                          ...transitionStyle,
                          opacity: isActive ? stimulusVisibilityOpacity : 0,
                        }
                  }
                >
                  {stimulusStyle === 'dots' && !activeStimulusText && !activeStimulusShape && (
                    <NineDotsPattern {...(color ? { color } : {})} />
                  )}
                  {stimulusStyle === 'stringart' && !activeStimulusText && !activeStimulusShape && (
                    <div className="absolute inset-1 flex items-center justify-center">
                      <StringArtPlus
                        size="full"
                        numPoints={stringArtPoints}
                        className={cn('w-full h-full', wovenText(color))}
                      />
                    </div>
                  )}
                  {stimulusStyle === 'custom' &&
                    customImageUrl &&
                    !activeStimulusText &&
                    !activeStimulusShape && (
                      <img
                        src={customImageUrl}
                        alt={tCommon('aria.customStimulus')}
                        className="absolute inset-1 w-full h-full object-contain"
                      />
                    )}
                  {activeStimulusShape && isActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <VisPoolShape
                        valueIndex={Math.max(0, IMAGE_MODALITY_SHAPES.indexOf(activeStimulusShape))}
                        color={colorHex ?? 'hsl(var(--foreground))'}
                      />
                    </div>
                  )}
                  {activeStimulusText && isActive && (
                    <StimulusValueDisplay
                      value={activeStimulusText}
                      color={colorHex ?? undefined}
                      wordLabels={wordLabels}
                    />
                  )}
                </div>
              )}

              {/* Multi-stimulus overlay (color mode) */}
              {multiMode === 'color' &&
                activeModalities?.map(({ modalityId, index }) => (
                  <div
                    key={modalityId}
                    className={cn(
                      'absolute inset-0 flex items-center justify-center nd-stimulus-layer',
                      transitionClass,
                    )}
                    style={{
                      ...transitionStyle,
                      opacity: stimulusVisibilityOpacity,
                      backgroundColor: MULTI_STIMULUS_COLORS[index] ?? MULTI_STIMULUS_COLORS[0],
                    }}
                  >
                    {activeVisValues?.get(`vis${index + 1}`) !== undefined && (
                      <VisPoolShape
                        valueIndex={activeVisValues.get(`vis${index + 1}`) ?? 0}
                        color="#FFFFFF"
                      />
                    )}
                  </div>
                ))}

              {/* Multi-stimulus overlay (image/shape mode) */}
              {multiMode === 'image' &&
                activeModalities?.map(({ modalityId, index }) => (
                  <div
                    key={modalityId}
                    className={cn(
                      'absolute inset-0 flex items-center justify-center nd-stimulus-layer',
                      transitionClass,
                      'bg-woven-cell-active',
                    )}
                    style={{ ...transitionStyle, opacity: stimulusVisibilityOpacity }}
                  >
                    <MultiStimulusShape
                      shape={MULTI_STIMULUS_SHAPES[index] ?? 'circle'}
                      color={(() => {
                        const bwColors = [
                          '#3B82F6',
                          '#06B6D4',
                          '#22C55E',
                          '#6B7280',
                          '#D946EF',
                          '#EF4444',
                          '#FFFFFF',
                          '#EAB308',
                        ] as const;
                        const visValue = activeVisValues?.get(`vis${index + 1}`);
                        const idx = visValue ?? 0;
                        return bwColors[idx] ?? bwColors[0];
                      })()}
                    />
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* Center stimulus overlay (for modes without position) */}
      {(centerStimulusText || centerStimulusShape) &&
        showStimulus &&
        !activePositions &&
        !multiMode && (
          <div
            className={cn(
              'absolute inset-0 z-25 flex items-center justify-center pointer-events-none nd-stimulus-layer',
              transitionClass,
              'scale-100',
            )}
            style={{ ...transitionStyle, opacity: stimulusVisibilityOpacity }}
          >
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-woven-cell-rest border border-woven-border shadow-[0_2px_12px_-2px_hsl(var(--woven-border)/0.2)] flex items-center justify-center"
              data-capture-surface="grid-center-stimulus"
            >
              {centerStimulusShape && (
                <VisPoolShape
                  valueIndex={Math.max(0, IMAGE_MODALITY_SHAPES.indexOf(centerStimulusShape))}
                  color={colorHex ?? 'hsl(var(--foreground))'}
                />
              )}
              {centerStimulusText && (
                <StimulusValueDisplay
                  value={centerStimulusText}
                  color={colorHex ?? undefined}
                  wordLabels={wordLabels}
                />
              )}
            </div>
          </div>
        )}

      {/* Pause overlay - bouton Play pour reprendre */}
      {paused && (
        <div
          className={cn(
            'absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] overflow-hidden',
            // When the focus cross is clickable (replay timeline), don't let the pause veil block clicks.
            allowPauseOverlayClickThrough && 'pointer-events-none',
          )}
          data-capture-overlay="grid-pause"
        >
          <div className="absolute inset-0 bg-woven-bg/58" />
          <div className="absolute inset-0 bg-gradient-to-br from-white/28 via-white/10 to-white/18 dark:from-white/12 dark:via-white/5 dark:to-white/10" />
          <div className="absolute inset-0 border border-white/24 dark:border-white/10" />
          <button
            type="button"
            onClick={onResume}
            className={cn(
              'relative z-10 w-16 h-16 rounded-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 flex items-center justify-center transition-transform duration-100 hover:scale-105 active:scale-95 shadow-lg',
              allowPauseOverlayClickThrough ? 'pointer-events-none' : 'pointer-events-auto',
            )}
            data-capture-control="grid-play-button"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-white dark:text-neutral-900 ml-1"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}

      {/* Play button - sur la case centrale uniquement */}
      {showPlayButton && !onFocusCrossPress && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              if (e.button !== 0) return;
              onPlay?.();
            }}
            className="w-16 h-16 rounded-full bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 flex items-center justify-center transition-transform duration-100 hover:scale-105 active:scale-95 pointer-events-auto touch-manipulation will-change-transform"
            data-capture-control="grid-play-button"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-white dark:text-neutral-900 ml-1"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});
