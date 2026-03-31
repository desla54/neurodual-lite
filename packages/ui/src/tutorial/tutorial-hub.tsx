/**
 * Tutorial Hub Component
 *
 * Consistent with app design patterns (like Social/Classement page).
 */

import { TutorialSpecs, TUTORIAL_HUB_ORDER, type TutorialSpecId } from '@neurodual/logic';
import {
  ChalkboardTeacher,
  CheckCircle,
  Database,
  Fingerprint,
  GraduationCap,
  Lock,
  MapPin,
  Tag,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

// Icon mapping - matches game mode icons
const ICON_MAP: Record<string, Icon> = {
  GraduationCap, // dual-catch (basics)
  MapPin, // dual-place
  Tag, // dual-pick
  Fingerprint, // dual-trace
  Database, // dual-memo
};

// Color mapping - matches game mode colors
const COLOR_MAP: Record<string, { text: string; bg: string }> = {
  GraduationCap: { text: 'text-violet-600', bg: 'bg-violet-100' },
  MapPin: { text: 'text-orange-600', bg: 'bg-orange-100' },
  Tag: { text: 'text-pink-600', bg: 'bg-pink-100' },
  Fingerprint: { text: 'text-teal-600', bg: 'bg-teal-100' },
  Database: { text: 'text-blue-600', bg: 'bg-blue-100' },
};

interface TutorialHubProps {
  onSelect: (specId: TutorialSpecId) => void;
  completedTutorials: readonly string[];
  /** Mode IDs that are locked (beta modes when beta is disabled) */
  lockedModeIds?: readonly string[];
  /** Extra cards rendered after the tutorial specs grid */
  extraCards?: ReactNode;
  className?: string;
}

export function TutorialHub({
  onSelect,
  completedTutorials,
  lockedModeIds = [],
  extraCards,
  className,
}: TutorialHubProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className={cn('pt-4 pb-8 space-y-6', className)}>
      {/* Header - Aligned left with icon like other pages */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-foreground/10 text-foreground">
          <ChalkboardTeacher size={24} weight="regular" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {t('tutorial.hub.title', 'Tutoriels')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('tutorial.hub.subtitle', 'Choisissez un mode pour apprendre')}
          </p>
        </div>
      </div>

      {/* Tutorial Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TUTORIAL_HUB_ORDER.map((specId) => {
          const spec = TutorialSpecs[specId];
          const hasSteps = spec.steps.length > 0;
          const isModeLocked = spec.associatedModeId
            ? lockedModeIds.includes(spec.associatedModeId)
            : false;
          // Hide locked tutorials entirely instead of showing them greyed out
          if (!hasSteps || isModeLocked) return null;
          const isCompleted = completedTutorials.includes(specId);
          const isAvailable = true;
          const IconComponent = ICON_MAP[spec.iconName] ?? GraduationCap;
          const colors = COLOR_MAP[spec.iconName] ?? { text: 'text-primary', bg: 'bg-primary/10' };

          return (
            <button
              key={specId}
              type="button"
              onClick={() => isAvailable && onSelect(specId)}
              disabled={!isAvailable}
              className={cn(
                'group relative flex items-center gap-4 text-left p-4 rounded-2xl transition-all duration-200',
                'border border-border bg-card',
                isAvailable
                  ? 'hover:bg-secondary/50 hover:border-primary/20 active:scale-[0.98] cursor-pointer'
                  : 'opacity-50 cursor-not-allowed',
              )}
            >
              {/* Icon - Mode-specific colors */}
              <div
                className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
                  isAvailable ? colors.bg : 'bg-secondary',
                )}
              >
                <IconComponent
                  size={22}
                  weight="regular"
                  className={isAvailable ? colors.text : 'text-muted-foreground'}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className={cn(
                      'text-base font-semibold truncate',
                      isAvailable ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t(spec.titleKey, spec.id)}
                  </h3>

                  {isCompleted && (
                    <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0" />
                  )}

                  {isModeLocked && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-500 text-white text-xxs font-bold rounded-full uppercase shrink-0">
                      <Lock size={9} weight="bold" />
                      {t('common.comingSoon')}
                    </span>
                  )}

                  {!hasSteps && !isModeLocked && (
                    <Lock size={14} className="text-muted-foreground shrink-0" />
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                  {t(spec.descriptionKey)}
                </p>
              </div>
            </button>
          );
        })}
        {extraCards}
      </div>
    </div>
  );
}
