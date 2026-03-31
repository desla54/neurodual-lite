import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import type { ExpectedClassification } from '@neurodual/logic';

/**
 * i18n key mapping for position buttons.
 */
const POSITION_KEYS = {
  HAUT: 'tutorial.pick.buttons.top',
  MILIEU: 'tutorial.pick.buttons.middle',
  BAS: 'tutorial.pick.buttons.bottom',
} as const;

/**
 * i18n key mapping for sound buttons.
 */
const SOUND_KEYS = {
  VOYELLE: 'tutorial.pick.buttons.vowel',
  CONSONNE: 'tutorial.pick.buttons.consonant',
} as const;

interface DualPickControlsProps {
  /** Callback when user selects a classification */
  onRespond: (type: 'position' | 'audio', value: string) => void;
  /** Currently selected classification (for highlighting) */
  activeSelection: ExpectedClassification;
  /** Mode: position only, audio only, or dual (both enabled) */
  mode?: 'position' | 'audio' | 'dual';
  /** Disable all interactions */
  disabled?: boolean;
}

export function DualPickControls({
  onRespond,
  activeSelection,
  mode = 'dual',
  disabled = false,
}: DualPickControlsProps) {
  const { t } = useTranslation();

  const positionDisabled = disabled || mode === 'audio';
  const audioDisabled = disabled || mode === 'position';

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
      {/* Position Group (Haut/Milieu/Bas) */}
      <div className="flex gap-2 w-full">
        {(['HAUT', 'MILIEU', 'BAS'] as const).map((pos) => {
          const isSelected = activeSelection.position === pos;
          const variant = isSelected ? 'primary' : 'secondary';

          return (
            <Button
              key={pos}
              variant={variant}
              disabled={positionDisabled}
              className={cn(
                'flex-1',
                isSelected && 'bg-visual hover:bg-visual/90 border-visual',
                positionDisabled && 'opacity-30 cursor-not-allowed',
              )}
              onClick={() => onRespond('position', pos)}
            >
              {t(POSITION_KEYS[pos], pos)}
            </Button>
          );
        })}
      </div>

      {/* Audio Group (Voyelle/Consonne) */}
      <div className="flex gap-2 w-full">
        {(['VOYELLE', 'CONSONNE'] as const).map((sound) => {
          const isSelected = activeSelection.sound === sound;
          const variant = isSelected ? 'primary' : 'secondary';

          return (
            <Button
              key={sound}
              variant={variant}
              disabled={audioDisabled}
              className={cn(
                'flex-1',
                isSelected && 'bg-audio hover:bg-audio/90 border-audio',
                audioDisabled && 'opacity-30 cursor-not-allowed',
              )}
              onClick={() => onRespond('audio', sound)}
            >
              {t(SOUND_KEYS[sound], sound)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
