/**
 * Dyslatéralisation settings section - Per-mode mirror training configuration
 *
 * iOS-like navigation:
 * - Root: pick a mode + access per-mode options
 * - Subpage: per-mode options (toggles/select)
 */

import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretRight, Check } from '@phosphor-icons/react';
import {
  Card,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
} from '@neurodual/ui';
import { gameModeRegistry } from '@neurodual/logic';
import { Link } from 'react-router';
import { useAlphaEnabled } from '../../../../hooks/use-beta-features';
import { useSettingsStore } from '../../../../stores';
import { GAME_MODES, type GameMode } from '../../config';

/** Local type alias for trace mode extensions (removed from @neurodual/logic public API). */
type TraceExtensions = Record<string, unknown>;

export function DyslateralisationSection(): ReactNode {
  const { t } = useTranslation();
  const alphaEnabled = useAlphaEnabled();
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);
  const [page, setPage] = useState<'root' | 'mode' | 'trace' | 'flow' | 'stroop'>('root');
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);

  // --- Place/Pick settings ---
  const placeModeSettings = useSettingsStore((s) => s.getModeSettings('dual-place'));
  const resolvedPlaceMode = useMemo(
    () => gameModeRegistry.resolveWithSettings('dual-place', placeModeSettings ?? {}),
    [placeModeSettings],
  );
  const placeExtensions = resolvedPlaceMode.spec.extensions as {
    mirrorTimeline: boolean;
    mirrorOnlyMode: boolean;
  };

  const setFlowMirrorTimeline = (enabled: boolean) => {
    setModeSettingFor('dual-place', 'mirrorTimeline', enabled);
    setModeSettingFor('dual-pick', 'mirrorTimeline', enabled);
  };
  const setMirrorOnlyMode = (enabled: boolean) => {
    setModeSettingFor('dual-place', 'mirrorOnlyMode', enabled);
    setModeSettingFor('dual-pick', 'mirrorOnlyMode', enabled);
  };

  // --- Trace settings ---
  const traceModeSettings = useSettingsStore((s) => s.getModeSettings('dual-trace'));
  const resolvedTraceMode = useMemo(
    () => gameModeRegistry.resolveWithSettings('dual-trace', traceModeSettings ?? {}),
    [traceModeSettings],
  );
  const traceExtensions = resolvedTraceMode.spec.extensions as unknown as TraceExtensions;
  const traceMirrorSwipe =
    (traceExtensions as any)?.['dyslatéralisation']?.['mirrorSwipe'] ?? false;
  const traceMirrorAxis =
    (traceExtensions as any)?.['dyslatéralisation']?.['mirrorAxis'] ?? 'horizontal';

  const setTraceMirrorSwipe = (enabled: boolean) => {
    setModeSettingFor('dual-trace', 'dyslatMirrorSwipe', enabled);
  };
  const setTraceMirrorAxis = (axis: 'horizontal' | 'vertical' | 'dynamic') => {
    setModeSettingFor('dual-trace', 'dyslatMirrorAxis', axis);
  };

  // --- Stroop settings ---
  const stroopDyslatEnabled =
    useSettingsStore((s) => s.getModeSettings('stroop'))?.stroopDyslatEnabled ?? false;

  const setStroopDyslatEnabled = (enabled: boolean) => {
    setModeSettingFor('stroop', 'stroopDyslatEnabled', enabled);
  };

  // Modes that have dyslat settings
  const supportedModes = new Set<GameMode>(['dual-trace', 'dual-place', 'dual-pick', 'stroop']);
  const selectedModeConfig = selectedMode
    ? GAME_MODES.find((mode) => mode.value === selectedMode)
    : null;
  const selectedModeTitle = selectedModeConfig
    ? t(selectedModeConfig.labelKey)
    : t('settings.dyslatéralisation.title');

  const traceAxisLabel =
    traceMirrorAxis === 'horizontal'
      ? t('settings.dyslatéralisation.axisHorizontal')
      : traceMirrorAxis === 'vertical'
        ? t('settings.dyslatéralisation.axisVertical')
        : t('settings.dyslatéralisation.axisDynamic');
  const traceSubtitle = traceMirrorSwipe
    ? `${t('common.on')} · ${traceAxisLabel}`
    : t('common.off');
  const flowSubtitle = placeExtensions.mirrorTimeline
    ? placeExtensions.mirrorOnlyMode
      ? `${t('common.on')} · ${t('settings.dyslatéralisation.mirrorOnly')}`
      : t('common.on')
    : t('common.off');

  const stroopSubtitle = stroopDyslatEnabled ? t('common.on') : t('common.off');

  const goToSettings = () => {
    if (selectedMode === 'dual-trace') setPage('trace');
    else if (selectedMode === 'dual-place' || selectedMode === 'dual-pick') setPage('flow');
    else if (selectedMode === 'stroop') setPage('stroop');
  };

  if (page === 'mode') {
    return (
      <div className="space-y-6">
        <Section title={t('settings.dyslatéralisation.selectMode')}>
          <Card className="space-y-0" padding="none">
            <div className="divide-y divide-border px-4">
              {GAME_MODES.filter((gm) => supportedModes.has(gm.value)).map((gm) => {
                const isSelected = selectedMode === gm.value;
                return (
                  <button
                    key={gm.value}
                    type="button"
                    onClick={() => {
                      setSelectedMode(gm.value);
                      setPage('root');
                    }}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground">{t(gm.labelKey)}</div>
                      <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                        {t('settings.dyslatéralisation.supportedDesc')}
                      </div>
                    </div>
                    {isSelected ? (
                      <Check size={18} weight="bold" className="shrink-0 text-primary" />
                    ) : (
                      <CaretRight
                        size={16}
                        weight="bold"
                        className="shrink-0 text-muted-foreground"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </Section>
      </div>
    );
  }

  if (page === 'trace') {
    return (
      <div className="space-y-6">
        <Section title={selectedModeTitle}>
          <Card className="space-y-0 divide-y divide-border" padding="none">
            <div className="px-4">
              <Toggle
                label={t('settings.dyslatéralisation.mirrorSwipe')}
                description={t('settings.dyslatéralisation.mirrorSwipeDesc')}
                checked={traceMirrorSwipe}
                onChange={setTraceMirrorSwipe}
                activeColor="primary"
              />
            </div>
            {traceMirrorSwipe ? (
              <div className="px-4 py-4 space-y-3">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  {t('settings.dyslatéralisation.mirrorAxisLabel')}
                </div>
                <Select
                  value={traceMirrorAxis}
                  onValueChange={(v) => setTraceMirrorAxis(v as never)}
                >
                  <SelectTrigger className="w-full h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">
                      {t('settings.dyslatéralisation.axisHorizontal')}
                    </SelectItem>
                    <SelectItem value="vertical">
                      {t('settings.dyslatéralisation.axisVertical')}
                    </SelectItem>
                    <SelectItem value="dynamic">
                      {t('settings.dyslatéralisation.axisDynamic')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </Card>
        </Section>
      </div>
    );
  }

  if (page === 'stroop') {
    return (
      <div className="space-y-6">
        <Section title={selectedModeTitle}>
          <Card className="space-y-0" padding="none">
            <div className="px-4">
              <Toggle
                label={t('settings.dyslatéralisation.stroopMirrorLabels')}
                description={t('settings.dyslatéralisation.stroopMirrorLabelsDesc')}
                checked={stroopDyslatEnabled}
                onChange={setStroopDyslatEnabled}
                activeColor="primary"
              />
            </div>
          </Card>
        </Section>
      </div>
    );
  }

  if (page === 'flow') {
    return (
      <div className="space-y-6">
        <Section title={selectedModeTitle}>
          <Card className="space-y-0 divide-y divide-border" padding="none">
            <div className="px-4">
              <Toggle
                label={t('settings.dyslatéralisation.mirrorTimeline')}
                description={t('settings.dyslatéralisation.mirrorTimelineDesc')}
                checked={placeExtensions.mirrorTimeline}
                onChange={setFlowMirrorTimeline}
                activeColor="primary"
              />
            </div>
            {placeExtensions.mirrorTimeline ? (
              <div className="px-4">
                <Toggle
                  label={t('settings.dyslatéralisation.mirrorOnly')}
                  description={t('settings.dyslatéralisation.mirrorOnlyDesc')}
                  checked={placeExtensions.mirrorOnlyMode}
                  onChange={setMirrorOnlyMode}
                  activeColor="primary"
                />
              </div>
            ) : null}
          </Card>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title={t('settings.dyslatéralisation.title')}>
        <Card className="space-y-0" padding="none">
          <div className="divide-y divide-border px-4">
            <button
              type="button"
              onClick={() => setPage('mode')}
              className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-bold text-foreground">
                  {t('settings.freeTrainingCards.mode')}
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                  {selectedModeConfig
                    ? t(selectedModeConfig.labelKey)
                    : t('settings.dyslatéralisation.modeNone')}
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
            </button>

            <button
              type="button"
              onClick={goToSettings}
              disabled={!selectedMode || !supportedModes.has(selectedMode)}
              className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <div className="min-w-0">
                <div className="font-bold text-foreground">
                  {t('settings.dyslatéralisation.options')}
                </div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                  {!selectedMode
                    ? t('settings.dyslatéralisation.optionsNone')
                    : selectedMode === 'dual-trace'
                      ? traceSubtitle
                      : selectedMode === 'dual-place' || selectedMode === 'dual-pick'
                        ? flowSubtitle
                        : selectedMode === 'stroop'
                          ? stroopSubtitle
                          : t('settings.dyslatéralisation.comingSoon')}
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
            </button>

            {alphaEnabled ? (
              <Link
                to="/mesker"
                className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-bold text-foreground">
                    {t('settings.dyslatéralisation.meskerPrototype', 'Prototype Mesker')}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                    {t(
                      'settings.dyslatéralisation.meskerPrototypeDesc',
                      'Tableau ouvert 3D avec tracé miroir temps reel.',
                    )}
                  </div>
                </div>
                <CaretRight size={16} weight="bold" className="shrink-0 text-muted-foreground" />
              </Link>
            ) : null}
          </div>
        </Card>
      </Section>
    </div>
  );
}
