/**
 * Avatar - Icon-based avatar with themed backgrounds
 * Nordic design system
 */

import {
  Atom,
  Robot,
  Cat,
  Circuitry,
  Cpu,
  Dog,
  Eyeglasses,
  Ghost,
  Globe,
  Heartbeat,
  Lightbulb,
  type IconProps,
  Microphone,
  Moon,
  MusicNote,
  PuzzlePiece,
  Rocket,
  Sparkle,
  Star,
  Sun,
  Lightning,
} from '@phosphor-icons/react';
import type { ReactNode, ComponentType } from 'react';
import { cn } from '../lib/utils';

interface AvatarData {
  id: string;
  icon: ComponentType<IconProps>;
  /** HSL values: [hue, saturation%, lightness%] for light mode */
  hsl: [number, number, number];
  /** HSL values for dark mode */
  hslDark: [number, number, number];
}

// Woven treatment: saturation 30-40%, muted tones like woven-correct/woven-incorrect
export const AVATARS: AvatarData[] = [
  { id: 'glasses', icon: Eyeglasses, hsl: [270, 35, 35], hslDark: [270, 40, 60] },
  { id: 'sparkles', icon: Sparkle, hsl: [40, 38, 35], hslDark: [40, 42, 58] },
  { id: 'zap', icon: Lightning, hsl: [48, 36, 34], hslDark: [48, 40, 56] },
  { id: 'atom', icon: Atom, hsl: [200, 35, 32], hslDark: [200, 40, 58] },
  { id: 'cpu', icon: Cpu, hsl: [210, 15, 38], hslDark: [210, 18, 58] },
  { id: 'circuit-board', icon: Circuitry, hsl: [160, 35, 30], hslDark: [160, 40, 55] },
  { id: 'bot', icon: Robot, hsl: [230, 35, 35], hslDark: [230, 38, 60] },
  { id: 'rocket', icon: Rocket, hsl: [350, 38, 38], hslDark: [350, 42, 58] },
  { id: 'star', icon: Star, hsl: [270, 32, 36], hslDark: [270, 38, 60] },
  { id: 'puzzle', icon: PuzzlePiece, hsl: [90, 30, 32], hslDark: [90, 35, 55] },
  { id: 'lightbulb', icon: Lightbulb, hsl: [28, 40, 36], hslDark: [28, 42, 56] },
  { id: 'heart-pulse', icon: Heartbeat, hsl: [0, 40, 39], hslDark: [0, 45, 55] },
  { id: 'sun', icon: Sun, hsl: [40, 36, 38], hslDark: [40, 40, 60] },
  { id: 'moon', icon: Moon, hsl: [220, 15, 36], hslDark: [220, 18, 60] },
  { id: 'globe', icon: Globe, hsl: [185, 35, 32], hslDark: [185, 38, 55] },
  { id: 'mic', icon: Microphone, hsl: [30, 12, 38], hslDark: [30, 15, 58] },
  { id: 'music', icon: MusicNote, hsl: [300, 30, 36], hslDark: [300, 35, 58] },
  { id: 'ghost', icon: Ghost, hsl: [280, 30, 36], hslDark: [280, 35, 58] },
  { id: 'cat', icon: Cat, hsl: [22, 36, 38], hslDark: [22, 40, 58] },
  { id: 'dog', icon: Dog, hsl: [30, 10, 38], hslDark: [30, 12, 58] },
];

export interface AvatarProps {
  id: string;
  className?: string;
  size?: number;
}

function hslStr(hsl: [number, number, number]): string {
  return `hsl(${hsl[0]} ${hsl[1]}% ${hsl[2]}%)`;
}

function hslBg(hsl: [number, number, number], alpha: number): string {
  return `hsl(${hsl[0]} ${hsl[1]}% ${hsl[2]}% / ${alpha})`;
}

export function Avatar({ id, className, size = 24 }: AvatarProps): ReactNode {
  const avatar = AVATARS.find((a) => a.id === id) ?? AVATARS[0];

  if (!avatar) {
    return null;
  }

  const Icon = avatar.icon;
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const hsl = isDark ? avatar.hslDark : avatar.hsl;

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center border border-border/60 shadow-none',
        className,
      )}
      style={{
        width: size * 1.8,
        height: size * 1.8,
        backgroundColor: hslBg(hsl, 0.12),
      }}
    >
      <Icon size={size} style={{ color: hslStr(hsl) }} />
    </div>
  );
}
