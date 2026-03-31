import type {
  DigitValue,
  EmotionValue,
  ImageShape,
  Position,
  SpatialDirection,
  WordValue,
} from '@neurodual/logic';
import type { ReactNode } from 'react';
import { getStimulusDisplayLabel, getStimulusTextFontSize } from './dual-track-stimulus-display';

export type TrackPositionPrompt = `position-${Position}`;
export type TrackDigitPrompt = `${DigitValue}`;
export type TrackVisualIdentityPrompt =
  | ImageShape
  | SpatialDirection
  | EmotionValue
  | WordValue
  | TrackDigitPrompt
  | TrackPositionPrompt;

interface TrackIdentityPromptSvgOptions {
  readonly inactiveColor?: string;
  readonly centerColor?: string;
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

const POSITION_GRID_CELLS = [
  { position: 0, row: 0, col: 0 },
  { position: 1, row: 0, col: 1 },
  { position: 2, row: 0, col: 2 },
  { position: 3, row: 1, col: 0 },
  { position: 4, row: 1, col: 2 },
  { position: 5, row: 2, col: 0 },
  { position: 6, row: 2, col: 1 },
  { position: 7, row: 2, col: 2 },
] as const;

const POSITION_GRID_ORIGIN = 2;
const POSITION_GRID_SIZE = 20;
const POSITION_GRID_CELL_SIZE = POSITION_GRID_SIZE / 3;
const POSITION_GRID_ACTIVE_INSET = 1.05;
const POSITION_GRID_ACTIVE_RADIUS = 1.35;
const POSITION_GRID_SEPARATOR_A = POSITION_GRID_ORIGIN + POSITION_GRID_CELL_SIZE;
const POSITION_GRID_SEPARATOR_B = POSITION_GRID_ORIGIN + POSITION_GRID_CELL_SIZE * 2;

function getPositionHighlightRect(position: Position): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const slot =
    POSITION_GRID_CELLS.find((cell) => cell.position === position) ?? POSITION_GRID_CELLS[0];

  return {
    x: POSITION_GRID_ORIGIN + slot.col * POSITION_GRID_CELL_SIZE + POSITION_GRID_ACTIVE_INSET,
    y: POSITION_GRID_ORIGIN + slot.row * POSITION_GRID_CELL_SIZE + POSITION_GRID_ACTIVE_INSET,
    width: POSITION_GRID_CELL_SIZE - POSITION_GRID_ACTIVE_INSET * 2,
    height: POSITION_GRID_CELL_SIZE - POSITION_GRID_ACTIVE_INSET * 2,
  };
}

function isArrowDirection(value: string): value is SpatialDirection {
  return value in ARROW_ROTATION;
}

export function toTrackPositionPrompt(position: Position): TrackPositionPrompt {
  return `position-${position}`;
}

export function toTrackDigitPrompt(value: DigitValue): TrackDigitPrompt {
  return `${value}`;
}

function parseTrackPositionPrompt(prompt: string): Position | null {
  const match = /^position-([0-7])$/.exec(prompt);
  if (!match) return null;
  return Number(match[1]) as Position;
}

function PositionGridIcon({
  position,
  size,
  activeColor,
  gridColor,
  centerColor,
}: {
  position: Position;
  size: number;
  activeColor: string;
  gridColor: string;
  centerColor: string;
}): ReactNode {
  const activeRect = getPositionHighlightRect(position);

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {/* Thin grid lines — no outer border, no rounded corners, no opacity */}
      <line
        x1={POSITION_GRID_SEPARATOR_A}
        y1={POSITION_GRID_ORIGIN}
        x2={POSITION_GRID_SEPARATOR_A}
        y2={POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}
        stroke={gridColor}
        strokeWidth="0.5"
      />
      <line
        x1={POSITION_GRID_SEPARATOR_B}
        y1={POSITION_GRID_ORIGIN}
        x2={POSITION_GRID_SEPARATOR_B}
        y2={POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}
        stroke={gridColor}
        strokeWidth="0.5"
      />
      <line
        x1={POSITION_GRID_ORIGIN}
        y1={POSITION_GRID_SEPARATOR_A}
        x2={POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}
        y2={POSITION_GRID_SEPARATOR_A}
        stroke={gridColor}
        strokeWidth="0.5"
      />
      <line
        x1={POSITION_GRID_ORIGIN}
        y1={POSITION_GRID_SEPARATOR_B}
        x2={POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}
        y2={POSITION_GRID_SEPARATOR_B}
        stroke={gridColor}
        strokeWidth="0.5"
      />
      {/* Active position dot */}
      <rect
        x={activeRect.x}
        y={activeRect.y}
        width={activeRect.width}
        height={activeRect.height}
        rx={POSITION_GRID_ACTIVE_RADIUS}
        fill={activeColor}
      />
      {/* Center focus cross */}
      <line
        x1="10.5"
        y1="12"
        x2="13.5"
        y2="12"
        stroke={centerColor}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="10.5"
        x2="12"
        y2="13.5"
        stroke={centerColor}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getPositionGridSvgHtml(
  position: Position,
  size: number,
  activeColor: string,
  options?: TrackIdentityPromptSvgOptions,
): string {
  const gridColor = options?.inactiveColor ?? 'rgba(15, 23, 42, 0.5)';
  const centerColor = options?.centerColor ?? '#f59e0b';
  const activeRect = getPositionHighlightRect(position);

  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><line x1="${POSITION_GRID_SEPARATOR_A}" y1="${POSITION_GRID_ORIGIN}" x2="${POSITION_GRID_SEPARATOR_A}" y2="${POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}" stroke="${gridColor}" stroke-width="0.5" /><line x1="${POSITION_GRID_SEPARATOR_B}" y1="${POSITION_GRID_ORIGIN}" x2="${POSITION_GRID_SEPARATOR_B}" y2="${POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}" stroke="${gridColor}" stroke-width="0.5" /><line x1="${POSITION_GRID_ORIGIN}" y1="${POSITION_GRID_SEPARATOR_A}" x2="${POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}" y2="${POSITION_GRID_SEPARATOR_A}" stroke="${gridColor}" stroke-width="0.5" /><line x1="${POSITION_GRID_ORIGIN}" y1="${POSITION_GRID_SEPARATOR_B}" x2="${POSITION_GRID_ORIGIN + POSITION_GRID_SIZE}" y2="${POSITION_GRID_SEPARATOR_B}" stroke="${gridColor}" stroke-width="0.5" /><rect x="${activeRect.x}" y="${activeRect.y}" width="${activeRect.width}" height="${activeRect.height}" rx="${POSITION_GRID_ACTIVE_RADIUS}" fill="${activeColor}" /><line x1="10.5" y1="12" x2="13.5" y2="12" stroke="${centerColor}" stroke-width="1.3" stroke-linecap="round" /><line x1="12" y1="10.5" x2="12" y2="13.5" stroke="${centerColor}" stroke-width="1.3" stroke-linecap="round" /></svg>`;
}

function renderFallbackShape(prompt: string, size: number, color: string): ReactNode {
  const style = { width: size, height: size };

  switch (prompt) {
    case 'circle':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case 'triangle':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <path d="M12 2L22 20H2L12 2Z" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <path d="M12 2L22 12L12 22L2 12L12 2Z" />
        </svg>
      );
    case 'pentagon':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <polygon points="12,2 22,9 18,22 6,22 2,9" />
        </svg>
      );
    case 'hexagon':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case 'cross':
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill={color} style={style}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

function renderFallbackShapeSvgHtml(prompt: string, size: number, color: string): string {
  const dimensions = `width="${size}" height="${size}"`;

  switch (prompt) {
    case 'circle':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><circle cx="12" cy="12" r="10" /></svg>`;
    case 'square':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>`;
    case 'triangle':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><path d="M12 2L22 20H2L12 2Z" /></svg>`;
    case 'diamond':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><path d="M12 2L22 12L12 22L2 12L12 2Z" /></svg>`;
    case 'pentagon':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><polygon points="12,2 22,9 18,22 6,22 2,9" /></svg>`;
    case 'hexagon':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><polygon points="12,2 22,8 22,16 12,22 2,16 2,8" /></svg>`;
    case 'star':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>`;
    case 'cross':
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z" /></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="${color}" ${dimensions}><circle cx="12" cy="12" r="10" /></svg>`;
  }
}

export function TrackIdentityPromptIcon({
  prompt,
  size,
  color,
  inactiveColor = 'rgba(15, 23, 42, 0.5)',
  centerColor = '#f59e0b',
}: {
  prompt: TrackVisualIdentityPrompt;
  size: number;
  color: string;
  inactiveColor?: string;
  centerColor?: string;
}): ReactNode {
  const position = parseTrackPositionPrompt(prompt);
  if (position !== null) {
    return (
      <PositionGridIcon
        position={position}
        size={size}
        activeColor={color}
        gridColor={inactiveColor}
        centerColor={centerColor}
      />
    );
  }

  if (isArrowDirection(prompt)) {
    const rotation = ARROW_ROTATION[prompt] ?? 0;
    return (
      <svg viewBox="0 0 24 24" fill={color} style={{ width: size, height: size }}>
        <g transform={`rotate(${rotation} 12 12)`}>
          <path d="M12 4l-6 8h4v8h4v-8h4z" />
        </g>
      </svg>
    );
  }

  const displayLabel = getStimulusDisplayLabel(prompt);
  if (displayLabel !== prompt || /^\d+$/.test(prompt)) {
    const fontSize = getStimulusTextFontSize(displayLabel);
    return (
      <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
        <text
          x="12"
          y="13"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontFamily="system-ui, sans-serif"
          fontWeight="700"
          fill={color}
        >
          {displayLabel}
        </text>
      </svg>
    );
  }

  return renderFallbackShape(prompt, size, color);
}

export function getTrackIdentityPromptSvgHtml(
  prompt: TrackVisualIdentityPrompt,
  size: number,
  color: string,
  options?: TrackIdentityPromptSvgOptions,
): string {
  const position = parseTrackPositionPrompt(prompt);
  if (position !== null) {
    return getPositionGridSvgHtml(position, size, color, options);
  }

  if (isArrowDirection(prompt)) {
    const rotation = ARROW_ROTATION[prompt] ?? 0;
    return `<svg viewBox="0 0 24 24" fill="${color}" width="${size}" height="${size}"><g transform="rotate(${rotation} 12 12)"><path d="M12 4l-6 8h4v8h4v-8h4z"/></g></svg>`;
  }

  const displayLabel = getStimulusDisplayLabel(prompt);
  if (displayLabel !== prompt || /^\d+$/.test(prompt)) {
    const fontSize = getStimulusTextFontSize(displayLabel);
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><text x="12" y="13" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-family="system-ui, sans-serif" font-weight="700" fill="${color}">${displayLabel}</text></svg>`;
  }

  return renderFallbackShapeSvgHtml(prompt, size, color);
}
