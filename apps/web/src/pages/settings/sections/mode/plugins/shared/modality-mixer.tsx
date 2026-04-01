/**
 * Modality mixer component - toggle position/color/audio modalities
 * Separates original BW modalities from added (non-original) ones.
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
  hiddenModalities?: ModalityId[];
  linkedGroupIds?: readonly string[];
}

type ModalityDef = { id: ModalityId; icon: typeof Eye; labelKey: string; color: string };

/** Original N-Back / Brain Workshop modalities */
const CORE_MODALITIES: ModalityDef[] = [
  { id: 'position', icon: Eye, labelKey: 'common.position', color: 'bg-blue-500' },
  { id: 'color', icon: Sparkle, labelKey: 'common.color', color: 'bg-pink-500' },
  { id: 'audio', icon: SpeakerHigh, labelKey: 'common.audio', color: 'bg-amber-500' },
  { id: 'image', icon: Shapes, labelKey: 'common.image', color: 'bg-purple-500' },
  { id: 'arithmetic', icon: MathOperations, labelKey: 'common.arithmetic', color: 'bg-orange-500' },
  // Brain Workshop combination modalities
  { id: 'visvis', icon: LinkSimple, labelKey: 'common.visvis', color: 'bg-sky-500' },
  { id: 'visaudio', icon: LinkSimpleHorizontal, labelKey: 'common.visaudio', color: 'bg-teal-500' },
  {
    id: 'audiovis',
    icon: LinkSimpleHorizontal,
    labelKey: 'common.audiovis',
    color: 'bg-indigo-500',
  },
];

/** Added modalities — not present in original Brain Workshop */
const EXTRA_MODALITIES: ModalityDef[] = [
  { id: 'spatial', icon: ArrowsOutCardinal, labelKey: 'common.spatial', color: 'bg-emerald-500' },
  { id: 'digits', icon: Hash, labelKey: 'common.digits', color: 'bg-cyan-500' },
  { id: 'emotions', icon: Smiley, labelKey: 'common.emotions', color: 'bg-rose-500' },
  { id: 'words', icon: TextAa, labelKey: 'common.words', color: 'bg-lime-500' },
  { id: 'tones', icon: MusicNotes, labelKey: 'common.tones', color: 'bg-violet-500' },
];

function ModalityButton({
  item,
  isActive,
  isDisabled,
  isLockedOn,
  isLinked,
  onToggle,
  t,
}: {
  item: ModalityDef;
  isActive: boolean;
  isDisabled: boolean;
  isLockedOn: boolean;
  isLinked: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}): ReactNode {
  const showActive = isActive && (!isDisabled || isLockedOn);
  const Icon = item.icon;

  return (
    <button
      key={item.id}
      type="button"
      disabled={isDisabled}
      onClick={onToggle}
      className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-all duration-300 border-2 h-28 ${
        showActive
          ? 'bg-card border-transparent shadow-lg scale-105 z-10'
          : 'bg-muted border-transparent opacity-60 hover:opacity-80 hover:scale-[1.02]'
      } ${isDisabled && !isLockedOn ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''} ${isLockedOn ? 'cursor-default pointer-events-none' : ''}`}
    >
      {showActive && (
        <div
          className={`absolute inset-0 rounded-xl border-2 opacity-20 ${item.color.replace('bg-', 'border-')}`}
        />
      )}
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
      {showActive && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500 shadow-sm animate-in zoom-in duration-300" />
      )}
    </button>
  );
}

export function ModalityMixer({
  activeModalities,
  onToggle,
  disabled = false,
  disabledModalities = [],
  hiddenModalities = [],
  linkedGroupIds,
}: ModalityMixerProps): ReactNode {
  const { t } = useTranslation();

  const coreItems = CORE_MODALITIES.filter((item) => !hiddenModalities.includes(item.id));
  const extraItems = EXTRA_MODALITIES.filter((item) => !hiddenModalities.includes(item.id));

  const renderItem = (item: ModalityDef) => {
    const isActive = activeModalities.includes(item.id);
    const isModalityDisabled = disabledModalities.includes(item.id);
    const isLockedOn = isActive && isModalityDisabled;

    return (
      <ModalityButton
        key={item.id}
        item={item}
        isActive={isActive}
        isDisabled={disabled || isModalityDisabled}
        isLockedOn={isLockedOn}
        isLinked={linkedGroupIds?.includes(item.id) ?? false}
        onToggle={() => onToggle(item.id)}
        t={t}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div
        className={`grid w-full ${coreItems.length === 2 ? 'grid-cols-2 gap-5' : 'grid-cols-3 gap-3'}`}
      >
        {coreItems.map(renderItem)}
      </div>

      {extraItems.length > 0 && (
        <>
          <div className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest text-center pt-1">
            {t('settings.modalities.extra', 'Added modalities (not in original version)')}
          </div>
          <div className="grid w-full grid-cols-3 gap-3">{extraItems.map(renderItem)}</div>
        </>
      )}
    </div>
  );
}
