/**
 * Journey presets selector (per journeyId)
 *
 * Stored inside SettingsStore UI blob so it persists locally (SQLite)
 * and syncs via cloud settings sync.
 */

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoSheet,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neurodual/ui';
import { FloppyDisk, Lock, PencilSimple, Trash } from '@phosphor-icons/react';
import {
  JOURNEY_DEFAULT_PRESET_ID,
  JOURNEY_RECOMMENDED_PRESET_ID,
  useSettingsStore,
  type FreeTrainingPreset,
} from '../../../../stores';
import { nonAuthInputProps } from '../../../../utils/non-auth-input-props';
import type { GameMode } from '../../config';

const NEW_VALUE = '__new__';

function getNextPresetName(existing: FreeTrainingPreset[], base: string) {
  if (existing.length === 0) return `${base} 1`;

  let max = 0;
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s+(\\d+)$`, 'i');
  for (const p of existing) {
    const m = re.exec(p.name.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${base} ${max + 1}`;
}

export function JourneyPresetSelector({
  journeyId,
  mode,
  preserveKeys,
  locked,
}: {
  journeyId: string;
  mode: GameMode;
  preserveKeys?: readonly string[];
  locked?: boolean;
}): ReactNode {
  const { t } = useTranslation();

  const presetsByJourneyId = useSettingsStore((s) => s.ui.journeyPresetsByJourneyId);
  const activeByJourneyId = useSettingsStore((s) => s.ui.journeyActivePresetIdByJourneyId);

  const ensureDefaultPreset = useSettingsStore((s) => s.ensureJourneyDefaultPreset);
  const applyRecommended = useSettingsStore((s) => s.applyJourneyRecommendedPreset);

  const applyPreset = useSettingsStore((s) => s.applyJourneyPreset);
  const createPreset = useSettingsStore((s) => s.createJourneyPreset);
  const overwritePreset = useSettingsStore((s) => s.overwriteJourneyPreset);
  const renamePreset = useSettingsStore((s) => s.renameJourneyPreset);
  const deletePreset = useSettingsStore((s) => s.deleteJourneyPreset);

  const presets = presetsByJourneyId[journeyId] ?? [];
  const activeId = activeByJourneyId[journeyId];
  const selectedId = activeId ?? JOURNEY_DEFAULT_PRESET_ID;

  useEffect(() => {
    ensureDefaultPreset(journeyId, mode);
  }, [ensureDefaultPreset, journeyId, mode]);

  useEffect(() => {
    const hasDefault = presets.some((p) => p.id === JOURNEY_DEFAULT_PRESET_ID);
    if (!hasDefault) return;

    if (activeId === JOURNEY_RECOMMENDED_PRESET_ID) return;
    if (activeId && presets.some((p) => p.id === activeId)) return;

    applyPreset(journeyId, JOURNEY_DEFAULT_PRESET_ID, preserveKeys ? { preserveKeys } : undefined);
  }, [activeId, applyPreset, journeyId, presets, preserveKeys]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? null,
    [presets, selectedId],
  );

  const userPresets = useMemo(
    () => presets.filter((p) => p.id !== JOURNEY_DEFAULT_PRESET_ID),
    [presets],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);

  const isDefaultSlot = selectedId === JOURNEY_DEFAULT_PRESET_ID;
  const isRecommended = selectedId === JOURNEY_RECOMMENDED_PRESET_ID;

  const canOverwrite = Boolean(selectedPreset) && !isRecommended;
  const canRenameDelete = Boolean(selectedPreset) && !isDefaultSlot;

  const handlePrimarySave = () => {
    if (isRecommended) {
      handleOpenCreate();
      return;
    }
    if (selectedPreset) {
      overwritePreset(journeyId, selectedPreset.id);
      return;
    }
    handleOpenCreate();
  };

  const handleOpenCreate = () => {
    setCreateName(getNextPresetName(userPresets, t('settings.presets.preset', 'Preset')));
    setCreateOpen(true);
  };

  const handleCreate = () => {
    const trimmed = createName.trim();
    if (!trimmed) return;
    createPreset(journeyId, trimmed, { setActive: true });
    setCreateOpen(false);
  };

  const handleOpenRename = () => {
    if (!selectedPreset) return;
    setRenameName(selectedPreset.name);
    setRenameOpen(true);
  };

  const handleRename = () => {
    if (!selectedPreset) return;
    const trimmed = renameName.trim();
    if (!trimmed) return;
    renamePreset(journeyId, selectedPreset.id, trimmed);
    setRenameOpen(false);
  };

  const handleDelete = () => {
    if (!selectedPreset) return;
    deletePreset(journeyId, selectedPreset.id);
    setDeleteOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          {t('settings.presets.title')}
        </p>
        <Button variant="ghost" size="sm" onClick={handlePrimarySave}>
          <FloppyDisk size={14} weight="regular" />
          {canOverwrite ? t('settings.presets.overwrite') : t('settings.presets.saveCurrent')}
        </Button>
      </div>

      {locked ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Lock size={14} className="text-muted-foreground shrink-0" />
            <div className="text-xs font-medium text-muted-foreground truncate">
              {t('journey.presets.lockedTitle')}
            </div>
            <InfoSheet iconSize={12}>{t('journey.presets.lockedDesc')}</InfoSheet>
          </div>
          <div className="text-3xs font-bold uppercase tracking-widest text-muted-foreground shrink-0">
            {t('journey.locked')}
          </div>
        </div>
      ) : null}

      <Select
        value={selectedId}
        onValueChange={(value) => {
          if (value === NEW_VALUE) {
            handleOpenCreate();
            return;
          }
          if (value === JOURNEY_RECOMMENDED_PRESET_ID) {
            applyRecommended(journeyId, mode, preserveKeys ? { preserveKeys } : undefined);
            return;
          }
          applyPreset(journeyId, value, preserveKeys ? { preserveKeys } : undefined);
        }}
      >
        <SelectTrigger className="w-full min-h-11 h-auto">
          <SelectValue placeholder={t('journey.presets.currentSlot')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={JOURNEY_RECOMMENDED_PRESET_ID}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">{t('settings.presets.recommended')}</span>
            </span>
          </SelectItem>

          <SelectItem value={JOURNEY_DEFAULT_PRESET_ID}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">{t('journey.presets.currentSlot')}</span>
            </span>
          </SelectItem>

          {userPresets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">{p.name}</span>
              </span>
            </SelectItem>
          ))}

          <SelectItem value={NEW_VALUE}>{t('settings.presets.new')}</SelectItem>
        </SelectContent>
      </Select>

      {canRenameDelete && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleOpenRename}>
            <PencilSimple size={14} weight="regular" />
            {t('settings.presets.rename')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash size={14} weight="regular" />
            {t('settings.presets.delete', 'Delete')}
          </Button>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.presets.createTitle')}</DialogTitle>
            <DialogDescription>{t('settings.presets.createDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {t('settings.presets.name')}
              </span>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-2 w-full h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                placeholder={t('settings.presets.namePlaceholder')}
                {...nonAuthInputProps}
              />
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 sm:space-x-3">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setCreateOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleCreate}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.presets.renameTitle')}</DialogTitle>
            <DialogDescription>{t('settings.presets.renameDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {t('settings.presets.name')}
              </span>
              <input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="mt-2 w-full h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                placeholder={t('settings.presets.namePlaceholder')}
                {...nonAuthInputProps}
              />
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 sm:space-x-3">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setRenameOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleRename}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.presets.deleteTitle', 'Delete preset')}</DialogTitle>
            <DialogDescription>
              {t('settings.presets.deleteDesc', 'This cannot be undone.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 sm:space-x-3">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setDeleteOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/40"
              onClick={handleDelete}
            >
              {t('settings.presets.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
