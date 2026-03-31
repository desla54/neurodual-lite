/**
 * Badge Card
 *
 * Displays a single badge with its icon, name, and unlock status.
 * Nordic design system.
 */

import type { BadgeDefinition } from '@neurodual/logic';
import { useBadgeTranslation } from '../hooks/use-badge-translation';
import {
  Pulse,
  Anchor,
  Medal as Award,
  ChartBar,
  Brain,
  Calendar,
  CalendarCheck,
  ChartLine,
  CircleDashed,
  Clock,
  Crown,
  Diamond,
  Barbell,
  Eye,
  Flame,
  Crosshair as Focus,
  Eyeglasses,
  Hammer,
  Headphones,
  Heart,
  Infinity as InfinityIcon,
  Bank,
  Stack,
  Leaf,
  Medal,
  Moon,
  Mountains,
  Rocket,
  Scales,
  Shield,
  ShieldCheck,
  Snowflake,
  Sparkle,
  Star,
  SunHorizon,
  Target,
  Timer,
  TrendUp,
  Trophy,
  Waves,
  Wind,
  Lightning,
  type IconProps,
} from '@phosphor-icons/react';
import type { ReactNode, ComponentType } from 'react';
import { cn } from '../lib/utils';

// =============================================================================
// Badge Icon Mapping
// =============================================================================

const BADGE_ICONS: Record<string, ComponentType<IconProps>> = {
  // === Core ===
  brain: Brain,
  flame: Flame,
  fire: Flame,
  gem: Diamond,
  sunrise: SunHorizon,
  moon: Moon,
  activity: Pulse,
  target: Target,
  dumbbell: Barbell,
  trophy: Trophy,
  sparkles: Sparkle,
  sparkle: Sparkle,
  zap: Lightning,
  leaf: Leaf,
  anchor: Anchor,
  wind: Wind,
  hammer: Hammer,
  headphones: Headphones,
  eye: Eye,
  scale: Scales,
  scales: Scales,
  landmark: Bank,
  medal: Medal,
  award: Award,

  // === Volume/Milestones ===
  stack: Stack,
  layers: Stack,
  crown: Crown,
  diamond: Diamond,
  star: Star,
  rocket: Rocket,
  mountain: Mountains,
  mountains: Mountains,

  // === Performance ===
  crosshair: CircleDashed,
  lightning: Lightning,
  bolt: Lightning,
  'chart-bar': ChartBar,
  'bar-chart': ChartBar,
  'bar-chart-2': ChartBar,
  'bar-chart-3': ChartBar,
  'trend-up': TrendUp,
  'trending-up': TrendUp,
  'chart-line': ChartLine,
  'chart-line-up': ChartLine,

  // === Resilience ===
  shield: Shield,
  'shield-check': ShieldCheck,
  'arrow-up': TrendUp,

  // === Exploration ===
  infinity: InfinityIcon,
  'star-four': Star,

  // === Milestones ===
  pulse: Heart,
  heartbeat: Heart,
  heart: Heart,
  calendar: Calendar,
  'calendar-star': CalendarCheck,
  'calendar-check': CalendarCheck,

  // === Cognitive ===
  metronome: Timer,
  timer: Timer,
  clock: Clock,
  waves: Waves,
  snowflake: Snowflake,
  glasses: Eyeglasses,
  eyeglasses: Eyeglasses,
  focus: Focus,
};

export function BadgeIcon({
  iconName,
  className,
}: {
  iconName: string;
  className?: string;
}): ReactNode {
  const IconComponent = BADGE_ICONS[iconName];
  if (!IconComponent) {
    // Fallback: try to find a partial match
    const fallback = Object.keys(BADGE_ICONS).find((key) => iconName.includes(key));
    if (fallback) {
      const FallbackIcon = BADGE_ICONS[fallback];
      if (FallbackIcon) {
        return <FallbackIcon className={className} />;
      }
    }
    return <Star className={className} />; // Default fallback
  }
  return <IconComponent className={className} />;
}

// =============================================================================
// Badge Card
// =============================================================================

export interface BadgeCardProps {
  badge: BadgeDefinition;
  unlocked: boolean;
  unlockedAt?: Date;
  className?: string;
}

export function BadgeCard({ badge, unlocked, unlockedAt, className }: BadgeCardProps) {
  const { getName, getDescription } = useBadgeTranslation();

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200',
        unlocked
          ? 'bg-accent/10 border border-accent/30'
          : 'bg-secondary border border-border opacity-60 grayscale',
        className,
      )}
    >
      <BadgeIcon
        iconName={badge.icon}
        className={cn('w-8 h-8', unlocked ? 'text-accent' : 'text-muted-foreground')}
      />
      <span
        className={cn(
          'text-sm font-medium text-center',
          unlocked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {getName(badge)}
      </span>
      <span className="text-xs text-muted-foreground text-center line-clamp-2">
        {getDescription(badge)}
      </span>
      {unlocked && unlockedAt && (
        <span className="text-xs text-accent/70 mt-1">{unlockedAt.toLocaleDateString()}</span>
      )}
    </div>
  );
}
