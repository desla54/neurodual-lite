/**
 * Modality mixer component - toggle position/color/audio modalities
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowsOutCardinal,
  Eye,
  Hash,
  LinkSimple,
  LinkSimpleHorizontal,
  MathOperations,
  MusicNotes,
  Shapes,
  Smiley,
  Sparkle,
  SpeakerHigh,
  TextAa,
} from '@phosphor-icons/react';
import type { ModalityId } from '@neurodual/logic';

interface ModalityMixerProps {
  activeModalities: ModalityId[];
  onToggle: (modality: ModalityId) => void;
  disabled?: boolean;
  disabledModalities?: ModalityId[];
  /** Modalités à masquer complètement (pour les modes simulateurs) */
  hiddenModalities?: ModalityId[];
  /** IDs des modalités qui sont groupées visuellement (badge lien affiché) */
  linkedGroupIds?: readonly string[];
}

const ALL_MODALITIES: { id: ModalityId; icon: typeof Eye; labelKey: string; color: string }[] = [
  { id: 'position', icon: Eye, labelKey: 'common.position', color: 'bg-blue-500' },
  { id: 'color', icon: Sparkle, labelKey: 'common.color', color: 'bg-pink-500' },
  { id: 'audio', icon: SpeakerHigh, labelKey: 'common.audio', color: 'bg-amber-500' },
  { id: 'image', icon: Shapes, labelKey: 'common.image', color: 'bg-purple-500' },
  { id: 'spatial', icon: ArrowsOutCardinal, labelKey: 'common.spatial', color: 'bg-emerald-500' },
  { id: 'digits', icon: Hash, labelKey: 'common.digits', color: 'bg-cyan-500' },
  { id: 'emotions', icon: Smiley, labelKey: 'common.emotions', color: 'bg-rose-500' },
  { id: 'words', icon: TextAa, labelKey: 'common.words', color: 'bg-lime-500' },
  { id: 'tones', icon: MusicNotes, labelKey: 'common.tones', color: 'bg-violet-500' },
  { id: 'arithmetic', icon: MathOperations, labelKey: 'common.arithmetic', color: 'bg-orange-500' },
  // Brain Workshop combination modalities (visvis/visaudio/audiovis)
  { id: 'visvis', icon: LinkSimple, labelKey: 'common.visvis', color: 'bg-sky-500' },
  { id: 'visaudio', icon: LinkSimpleHorizontal, labelKey: 'common.visaudio', color: 'bg-teal-500' },
  {
    id: 'audiovis',
    icon: LinkSimpleHorizontal,
    labelKey: 'common.audiovis',
    color: 'bg-indigo-500',
  },
];

export function ModalityMixer({
  activeModalities,
  onToggle,
  disabled = false,
  disabledModalities = [],
  hiddenModalities = [],
  linkedGroupIds,
}: ModalityMixerProps): ReactNode {
  const { t } = useTranslation();

  // Filtrer les modalités masquées
  const items = ALL_MODALITIES.filter((item) => !hiddenModalities.includes(item.id));

  return (
    <div
      className={`grid w-full ${items.length === 2 ? 'grid-cols-2 gap-5' : 'grid-cols-3 gap-3'}`}
    >
      {items.map((item) => {
        const isActive = activeModalities.includes(item.id);
        const isModalityDisabled = disabledModalities.includes(item.id);
        // A modality that is both active AND disabled is "locked on" — show it as active, not greyed out
        const isLockedOn = isActive && isModalityDisabled;
        const isDisabled = disabled || isModalityDisabled;
        const isLinked = linkedGroupIds?.includes(item.id) ?? false;
        const showActive = isActive && (!isModalityDisabled || isLockedOn);
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onToggle(item.id)}
            className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-all duration-300 border-2 h-28 ${
              showActive
                ? 'bg-card border-transparent shadow-lg scale-105 z-10'
                : 'bg-muted border-transparent opacity-60 hover:opacity-80 hover:scale-[1.02]'
            } ${isDisabled && !isLockedOn ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''} ${isLockedOn ? 'cursor-default pointer-events-none' : ''}`}
          >
            {/* Active Indicator Ring */}
            {showActive && (
              <div
                className={`absolute inset-0 rounded-xl border-2 opacity-20 ${item.color.replace('bg-', 'border-')}`}
              />
            )}

            {/* Link badge — coin haut gauche, indique que ce bouton est groupé */}
            {isLinked && (
              <div className="absolute top-2 left-2 opacity-50">
                <LinkSimple size={10} weight="bold" />
              </div>
            )}

            <div
              className={`p-3 rounded-full transition-colors duration-300 ${
                showActive
                  ? `${item.color} text-white shadow-md`
                  : 'bg-muted-foreground/20 text-muted-foreground'
              }`}
            >
              <Icon size={24} weight="regular" />
            </div>
            <span
              className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                showActive ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {t(item.labelKey)}
            </span>

            {/* Checkmark badge for active state */}
            {showActive && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500 shadow-sm animate-in zoom-in duration-300" />
            )}
          </button>
        );
      })}
    </div>
  );
}
