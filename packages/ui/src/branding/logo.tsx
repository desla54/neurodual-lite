/**
 * Logo - NeuroDual brand logo with Phosphor-thin aesthetic
 * Minimal line-art style, no shadows, no heavy fills
 * Two variants: icon (grid only) and full (grid + text)
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface LogoProps {
  readonly className?: string;
  readonly variant?: 'icon' | 'full';
  readonly size?: number;
  readonly ariaLabel?: string;
  /** Show a premium badge overlay on the logo */
  readonly showPremiumBadge?: boolean;
}

export function Logo({
  className,
  variant = 'full',
  size = 100,
  ariaLabel = 'NeuroDual Logo',
  showPremiumBadge = false,
}: LogoProps): ReactNode {
  // Adaptive colors - inherits from parent's text color
  const ink = 'currentColor';
  const inkMuted = 'currentColor'; // opacity handled inline

  // ViewBox - ajusté pour centrer le contenu visuel
  // Contenu: icône (x=6 à 94) + texte (x=108 à ~265) = ~259px
  // ViewBox décalé pour équilibrer les marges
  const viewBox = variant === 'icon' ? '0 0 100 100' : '2 0 268 100';

  // Grid parameters - plus compact
  // Stroke plus épais pour icon (petit) vs full (grand)
  const thinStroke = variant === 'icon' ? 1.5 : 1;
  const cellSize = 16;
  const cellGap = 3;
  const gridSize = cellSize * 3 + cellGap * 2;
  const radius = 4;

  return (
    <svg
      className={cn('select-none', className)}
      width={size * (variant === 'icon' ? 1 : 2.68)}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      // Ensure the logo (especially SVG <text>) stays LTR even when the app is RTL (e.g. Arabic).
      // Otherwise the SVG text uses RTL direction, which can overlap the icon.
      style={{ direction: 'ltr' }}
    >
      <defs>
        {/* Pattern weave pour le fond - grille subtile comme l'icône */}
        <pattern id="weave-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
          <line x1="0" y1="5" x2="10" y2="5" stroke={ink} strokeWidth="0.4" opacity="0.12" />
          <line x1="5" y1="0" x2="5" y2="10" stroke={ink} strokeWidth="0.4" opacity="0.12" />
        </pattern>
        <clipPath id="circle-clip">
          <circle cx="0" cy="0" r="43" />
        </clipPath>
      </defs>

      {/* Groupe Principal : Icône — data-logo-icon for external GSAP targeting */}
      <g transform="translate(50, 50)" data-logo-icon>
        {/* Fond adapté au thème (surface) + texture weave */}
        <circle cx="0" cy="0" r="43" fill="hsl(var(--neuro-bg-surface))" />
        <circle cx="0" cy="0" r="43" fill="url(#weave-pattern)" />

        {/* Cercle extérieur - trait fin */}
        <circle
          cx="0"
          cy="0"
          r="44"
          stroke={inkMuted}
          strokeWidth={thinStroke}
          fill="none"
          opacity={0.3}
        />

        {/* Grille 3x3 - centrée, avec focus central */}
        <g transform={`translate(${-gridSize / 2}, ${-gridSize / 2})`}>
          {/* 8 cases autour (pas de case centrale) */}
          {[
            { x: 0, y: 0, active: true },
            { x: cellSize + cellGap, y: 0, active: false },
            { x: (cellSize + cellGap) * 2, y: 0, active: false },
            { x: 0, y: cellSize + cellGap, active: false },
            // Centre omis - remplacé par le trait focus
            { x: (cellSize + cellGap) * 2, y: cellSize + cellGap, active: false },
            { x: 0, y: (cellSize + cellGap) * 2, active: false },
            { x: cellSize + cellGap, y: (cellSize + cellGap) * 2, active: false },
            { x: (cellSize + cellGap) * 2, y: (cellSize + cellGap) * 2, active: true },
          ].map((cell) => (
            <rect
              key={`${cell.x}-${cell.y}`}
              x={cell.x}
              y={cell.y}
              width={cellSize}
              height={cellSize}
              rx={radius}
              stroke={ink}
              strokeWidth={thinStroke}
              fill={cell.active ? ink : 'none'}
              opacity={cell.active ? 1 : 0.3}
            />
          ))}
        </g>
      </g>

      {/* Trait focus central (horizontal) — outside data-logo-icon so it stays horizontal during GSAP rotation */}
      <g transform="translate(50, 50)">
        <line x1={-3} y1={0} x2={3} y2={0} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
      </g>

      {/* Texte (Seulement si variant === 'full') */}
      {variant === 'full' && (
        <g
          fontFamily="system-ui, -apple-system, sans-serif"
          style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
        >
          <text x="108" y="56" fill={ink} fontWeight="600" fontSize="30" letterSpacing="-0.5">
            NeuroDual
          </text>
          <text
            x="183"
            y="74"
            fill={inkMuted}
            fontWeight="600"
            fontSize="12"
            letterSpacing="2.5"
            textAnchor="middle"
            opacity={0.6}
          >
            BRAIN TRAINING
          </text>
        </g>
      )}

      {/* Premium Badge - Positioned at bottom-right of the circle */}
      {showPremiumBadge && (
        <g transform="translate(50, 50)">
          {/* Badge background circle */}
          <circle cx="32" cy="32" r="14" fill="#f59e0b" />
          {/* Crown icon - simplified, elegant */}
          <g transform="translate(32, 32)">
            {/* Crown shape */}
            <path
              d="M-7 3 L-7 -2 L-4 1 L0 -5 L4 1 L7 -2 L7 3 L-7 3 Z"
              fill="white"
              strokeLinejoin="round"
            />
            {/* Crown base */}
            <rect x="-7" y="3" width="14" height="3" rx="1" fill="white" />
          </g>
        </g>
      )}
    </svg>
  );
}
