import type { ImageShape, TraceModality, TraceTrial } from '@neurodual/logic';
import { IMAGE_MODALITY_SHAPES } from '@neurodual/logic';
import type { ReactNode } from 'react';

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

const WORD_DISPLAY: Record<string, string> = {
  'word-hand': '✋',
  'word-cat': '🐱',
  'word-moon': '🌙',
  'word-fire': '🔥',
  'word-water': '💧',
  'word-king': '👑',
  'word-key': '🔑',
  'word-wind': '💨',
};

export interface TraceStimulusVisual {
  readonly shape: ImageShape | null;
  readonly text: string | null;
}

export function getTraceStimulusVisual(
  stimulus: TraceTrial | null,
  enabledModalities: readonly TraceModality[],
): TraceStimulusVisual {
  if (!stimulus) {
    return { shape: null, text: null };
  }

  for (const modality of enabledModalities) {
    switch (modality) {
      case 'image':
        if (stimulus.image) {
          return { shape: stimulus.image, text: null };
        }
        break;
      case 'spatial':
        if (stimulus.spatialDirection) {
          return { shape: null, text: stimulus.spatialDirection };
        }
        break;
      case 'digits':
        if (typeof stimulus.digit === 'number') {
          return { shape: null, text: String(stimulus.digit) };
        }
        break;
      case 'emotions':
        if (stimulus.emotion) {
          return { shape: null, text: stimulus.emotion };
        }
        break;
      case 'words':
        if (stimulus.word) {
          return { shape: null, text: stimulus.word };
        }
        break;
      default:
        break;
    }
  }

  return { shape: null, text: null };
}

function isArrowDirection(value: string): boolean {
  return value in ARROW_ROTATION;
}

function getStimulusDisplayLabel(value: string): string {
  if (/^\d+$/.test(value)) return value;
  if (value in EMOTION_EMOJI) return EMOTION_EMOJI[value] ?? value;
  if (value in WORD_DISPLAY) return WORD_DISPLAY[value] ?? value;
  return value;
}

export function TraceStimulusValueDisplay({
  value,
  color,
  className,
}: {
  value: string;
  color?: string;
  className?: string;
}): ReactNode {
  if (isArrowDirection(value)) {
    const rotation = ARROW_ROTATION[value] ?? 0;

    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={className ?? 'w-16 h-16 sm:w-20 sm:h-20'}
        fill={color ?? 'currentColor'}
      >
        <g transform={`rotate(${rotation} 12 12)`}>
          <path d="M12 4l-6 8h4v8h4v-8h4z" />
        </g>
      </svg>
    );
  }

  return (
    <span
      className={
        className ??
        'flex items-center justify-center font-extrabold text-4xl leading-none sm:text-5xl'
      }
      style={color ? { color } : undefined}
    >
      {getStimulusDisplayLabel(value)}
    </span>
  );
}

export function TraceStimulusShape({
  shape,
  color,
  className,
}: {
  shape: ImageShape;
  color: string;
  className?: string;
}): ReactNode {
  const svgProps = {
    className: className ?? 'w-2/3 h-2/3',
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

export function isTraceStimulusShape(value: string | null): value is ImageShape {
  return value !== null && IMAGE_MODALITY_SHAPES.includes(value as ImageShape);
}
