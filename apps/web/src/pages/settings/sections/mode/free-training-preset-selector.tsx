/**
 * Free training presets selector (per mode)
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
import {
  FREE_TRAINING_DEFAULT_PRESET_ID,
  FREE_TRAINING_QUAD_PRESET_ID,
  FREE_TRAINING_RECOMMENDED_PRESET_ID,
  FREE_TRAINING_TRI_PRESET_ID,
  useSettingsStore,
  type FreeTrainingPreset,
} from '../../../../stores';
import { nonAuthInputProps } from '../../../../utils/non-auth-input-props';
import type { GameMode } from '../../config';

const NEW_VALUE = '__new__';

function getNextPresetName(existing: FreeTrainingPreset[], base: string) {
  if (existing.length === 0) return `${base} 1`;

  // Try to find "Préréglage N" max
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

export function FreeTrainingPresetSelector({
  mode,
  onPresetApplied,
}: {
  mode: GameMode;
  onPresetApplied?: () => void;
}): ReactNode {
  const { t } = useTranslation();

  const presetsByMode = useSettingsStore((s) => s.ui.freeTrainingPresetsByMode);
  const activeByMode = useSettingsStore((s) => s.ui.freeTrainingActivePresetIdByMode);

  const ensureDefaultPreset = useSettingsStore((s) => s.ensureFreeTrainingDefaultPreset);
  const applyRecommended = useSettingsStore((s) => s.applyFreeTrainingRecommendedPreset);
  const applyTemplate = useSettingsStore((s) => s.applyFreeTrainingTemplatePreset);

  const applyPreset = useSettingsStore((s) => s.applyFreeTrainingPreset);
  const createPreset = useSettingsStore((s) => s.createFreeTrainingPreset);
  const renamePreset = useSettingsStore((s) => s.renameFreeTrainingPreset);
  const deletePreset = useSettingsStore((s) => s.deleteFreeTrainingPreset);

  const presets = presetsByMode[mode] ?? [];
  const activeId = activeByMode[mode];
  const selectedId = activeId ?? FREE_TRAINING_DEFAULT_PRESET_ID;
  const isBuiltInTemplateId =
    activeId === FREE_TRAINING_RECOMMENDED_PRESET_ID ||
    activeId === FREE_TRAINING_TRI_PRESET_ID ||
    activeId === FREE_TRAINING_QUAD_PRESET_ID;

  // Ensure the built-in Default slot exists for this mode.
  useEffect(() => {
    ensureDefaultPreset(mode);
  }, [mode, ensureDefaultPreset]);

  // If user has no active selection (or a stale selection), auto-apply Default.
  // Skipped when a built-in template is active or activeId maps to an existing preset.
  useEffect(() => {
    const hasDefault = presets.some((p) => p.id === FREE_TRAINING_DEFAULT_PRESET_ID);
    if (!hasDefault) return;
    if (isBuiltInTemplateId) return;
    if (activeId && presets.some((p) => p.id === activeId)) return;

    applyPreset(mode, FREE_TRAINING_DEFAULT_PRESET_ID);
  }, [activeId, applyPreset, isBuiltInTemplateId, mode, presets]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? null,
    [presets, selectedId],
  );

  const userPresets = useMemo(
    () => presets.filter((p) => p.id !== FREE_TRAINING_DEFAULT_PRESET_ID),
    [presets],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const isDefaultSlot = selectedId === FREE_TRAINING_DEFAULT_PRESET_ID;
  const canRenameDelete = Boolean(selectedPreset) && !isDefaultSlot;

  const handleResetToPreset = () => {
    if (selectedId === FREE_TRAINING_RECOMMENDED_PRESET_ID) {
      applyRecommended(mode);
      return;
    }
    if (selectedId === FREE_TRAINING_TRI_PRESET_ID || selectedId === FREE_TRAINING_QUAD_PRESET_ID) {
      applyTemplate(mode, selectedId);
      return;
    }
    applyPreset(mode, selectedId);
  };

  const handleOpenCreate = () => {
    setCreateName(getNextPresetName(userPresets, t('settings.presets.preset', 'Preset')));
    setCreateOpen(true);
  };

  const handleCreate = () => {
    const trimmed = createName.trim();
    if (!trimmed) return;
    createPreset(mode, trimmed, { setActive: true });
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
    renamePreset(mode, selectedPreset.id, trimmed);
    setRenameOpen(false);
  };

  const handleDelete = () => {
    if (!selectedPreset) return;
    deletePreset(mode, selectedPreset.id);
    setDeleteOpen(false);
  };

  const handlePresetApplied = () => {
    // Parent can use this to reset the active settings tab to "Base".
    // No-op by default.
    onPresetApplied?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
            {t('settings.presets.title')}
          </p>
          <span className="shrink-0">
            <InfoSheet iconSize={12}>{t('settings.presets.help')}</InfoSheet>
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
          {t('settings.presets.reset')}
        </Button>
      </div>

      <Select
        value={selectedId}
        onValueChange={(value) => {
          if (value === NEW_VALUE) {
            handleOpenCreate();
            return;
          }
          if (value === FREE_TRAINING_RECOMMENDED_PRESET_ID) {
            applyRecommended(mode);
            handlePresetApplied();
            return;
          }
          if (value === FREE_TRAINING_TRI_PRESET_ID || value === FREE_TRAINING_QUAD_PRESET_ID) {
            applyTemplate(mode, value);
            handlePresetApplied();
            return;
          }
          applyPreset(mode, value);
          handlePresetApplied();
        }}
      >
        <SelectTrigger className="w-full min-h-11 h-auto">
          <SelectValue placeholder={t('settings.presets.default')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FREE_TRAINING_RECOMMENDED_PRESET_ID}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">
                {mode === 'sim-brainworkshop'
                  ? t('settings.presets.dualNBack', 'Dual N-Back')
                  : t('settings.presets.recommended')}
              </span>
            </span>
          </SelectItem>

          {mode === 'sim-brainworkshop' ? (
            <>
              <SelectItem value={FREE_TRAINING_TRI_PRESET_ID}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{t('settings.presets.tri', 'Tri N-Back')}</span>
                </span>
              </SelectItem>
              <SelectItem value={FREE_TRAINING_QUAD_PRESET_ID}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{t('settings.presets.quad', 'Quad N-Back')}</span>
                </span>
              </SelectItem>
            </>
          ) : null}

          <SelectItem value={FREE_TRAINING_DEFAULT_PRESET_ID}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">{t('settings.presets.default')}</span>
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
            {t('settings.presets.rename')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            {t('settings.presets.delete', 'Delete')}
          </Button>
        </div>
      )}

      {/* Create dialog */}
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

      {/* Reset dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.presets.resetTitle')}</DialogTitle>
            <DialogDescription>{t('settings.presets.resetDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                handleResetToPreset();
                handlePresetApplied();
                setResetOpen(false);
              }}
            >
              {t('common.apply', 'Apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.presets.renameTitle')}</DialogTitle>
          </DialogHeader>

          <label className="block">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {t('settings.presets.name')}
            </span>
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              className="mt-2 w-full h-11 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              {...nonAuthInputProps}
            />
          </label>

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

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.presets.deleteTitle', 'Delete this preset?')}</DialogTitle>
            <DialogDescription>
              {t('settings.presets.deleteDesc', 'This action is irreversible.')}
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
            <Button className="w-full sm:w-auto" onClick={handleDelete}>
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
