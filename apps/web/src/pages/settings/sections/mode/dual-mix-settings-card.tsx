import type { ReactNode } from 'react';
import {
  InfoSheet,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
} from '@neurodual/ui';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../../../stores';
import { NLevelSelect } from './plugins/shared';

const DUAL_MIX_MIN_LEVEL = 1;
const DUAL_MIX_MAX_LEVEL = 9;
const DUAL_MIX_DEFAULT_LEVEL = 2;
const DUAL_MIX_MIN_ROUNDS = 5;
const DUAL_MIX_MAX_ROUNDS = 60;
const DUAL_MIX_ROUNDS_STEP = 5;
const DUAL_MIX_DEFAULT_ROUNDS = 10;

export function DualMixSettingsCard(): ReactNode {
  const { t } = useTranslation();
  const modeSettings =
    useSettingsStore((s) => s.modes['dual-mix'] as Record<string, unknown> | undefined) ?? {};
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);

  const nLevel =
    typeof modeSettings['nLevel'] === 'number' && Number.isFinite(modeSettings['nLevel'])
      ? Math.max(
          DUAL_MIX_MIN_LEVEL,
          Math.min(DUAL_MIX_MAX_LEVEL, Math.round(modeSettings['nLevel'])),
        )
      : DUAL_MIX_DEFAULT_LEVEL;
  const rounds =
    typeof modeSettings['trialsCount'] === 'number' && Number.isFinite(modeSettings['trialsCount'])
      ? Math.max(
          DUAL_MIX_MIN_ROUNDS,
          Math.min(DUAL_MIX_MAX_ROUNDS, Math.round(modeSettings['trialsCount'])),
        )
      : DUAL_MIX_DEFAULT_ROUNDS;
  const includeGridlock =
    typeof modeSettings['dualMixIncludeGridlock'] === 'boolean'
      ? modeSettings['dualMixIncludeGridlock']
      : true;

  const roundOptions = Array.from(
    { length: (DUAL_MIX_MAX_ROUNDS - DUAL_MIX_MIN_ROUNDS) / DUAL_MIX_ROUNDS_STEP + 1 },
    (_, index) => DUAL_MIX_MIN_ROUNDS + index * DUAL_MIX_ROUNDS_STEP,
  );

  return (
    <CardShell>
      <NLevelSelect
        value={nLevel}
        onChange={(value) => setModeSettingFor('dual-mix', 'nLevel', value)}
        labelKey="settings.dualMix.level"
        descriptionKey="settings.dualMix.levelDesc"
        minLevel={DUAL_MIX_MIN_LEVEL}
        maxLevel={DUAL_MIX_MAX_LEVEL}
      />

      <div className="space-y-3">
        <div className="flex items-center gap-1 min-w-0">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
            {t('settings.dualMix.rounds', 'Rounds')}
          </p>
          <span className="shrink-0">
            <InfoSheet iconSize={12}>
              {t(
                'settings.dualMix.roundsDesc',
                'Each round runs the enabled micro-tasks once in sequence.',
              )}
            </InfoSheet>
          </span>
        </div>

        <Select
          value={String(rounds)}
          onValueChange={(value) =>
            setModeSettingFor('dual-mix', 'trialsCount', Math.round(Number(value)))
          }
        >
          <SelectTrigger
            className="h-11 w-full"
            aria-label={t('settings.dualMix.rounds', 'Rounds')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roundOptions.map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value} {t('settings.dualMix.roundsUnit', 'rounds')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Toggle
        label={t('settings.dualMix.includeGridlock', 'Include Gridlock')}
        description={t(
          'settings.dualMix.includeGridlockDesc',
          'Off: N-Back + Stroop Flex only. On: add one Gridlock move to each round.',
        )}
        checked={includeGridlock}
        onChange={(value) => setModeSettingFor('dual-mix', 'dualMixIncludeGridlock', value)}
      />
    </CardShell>
  );
}

function CardShell({ children }: { children: ReactNode }): ReactNode {
  return <div className="space-y-5">{children}</div>;
}
