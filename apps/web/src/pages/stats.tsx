/**
 * Stats page - Session history and player statistics
 * 4 tabs: Simple | Advanced | History | Progression
 */

import {
  SessionHistoryExportSchema,
  generateContextualMessageData,
  getModeI18nKey,
  type JourneyConfig,
  type SessionEndReportModel,
  type SessionHistoryExport,
  type SessionHistoryItem,
} from '@neurodual/logic';
import {
  // Primitives
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Hatching,
  PageTransition,
  // Stats components (imported from @neurodual/ui)
  UnifiedSessionReport,
  FiltersDropdown,
  HistoryView,
  ProgressionTab,
  SimpleStatsTab,
  AdvancedStatsTab,
  type ModeType,
  type DateRangeOption,
  type CustomDateRange,
  type ModalityFilterSet,
  type NLevelFilterSet,
  type JourneyFilterType,
  type FreeModeFilterType,
  // Helpers
  getStartDateFromOption,
  projectReplayRunReportFromHistorySession,
  // Hooks
  useSessionDetailsQuery,
  useSessionStoredReportQuery,
  useAvailableJourneyIdsQuery,
  useLatestJourneySessionQuery,
  useSessionSummariesHeaderCountsQuery,
  useDeleteSession,
  useDeleteSessions,
  useExportSessions,
  useImportSessions,
  useOptionalReplayInteractifAdapter,
  useReplayRunEventsQuery,
  Spinner,
  PullToRefresh,
} from '@neurodual/ui';
import { StroopSessionReport } from '../components/reports/stroop-session-report';
import { OspanSessionReport } from '../components/reports/ospan-session-report';
import { Pulse, UploadSimple, DownloadSimple, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { logger } from '../lib';
import { getRouteForMode, type GameModeId } from '../lib/mode-metadata';
import { getStatsPresetForReport } from '../lib/stats-preset';
import {
  createFreePlayIntent,
  createJourneyPlayIntent,
  nextSessionToPlayIntent,
} from '../lib/play-intent';
import { buildJourneyConfigSnapshot } from '../lib/journey-config';
import { useSettingsStore } from '../stores/settings-store';
import { useAppPorts } from '../providers';
import { useHaptic } from '../hooks/use-haptic';
import { useAlphaEnabled, useBetaEnabled, useBetaScoringEnabled } from '../hooks/use-beta-features';
import { useUnifiedReportLabels } from '../hooks/use-unified-report-labels';
import { useReportVariant } from '../hooks/use-report-variant';
import { translateContextualMessage } from '../utils/contextual-message';

// =============================================================================
// Main Page
// =============================================================================

type TabValue = 'simple' | 'advanced' | 'history' | 'progression';
const VALID_TABS: TabValue[] = ['simple', 'advanced', 'history', 'progression'];
const SHOW_STATS_CONTEXT_SUBFILTERS = false;

export function StatsPage(): ReactNode {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const betaEnabled = useBetaScoringEnabled();
  const betaAccessEnabled = useBetaEnabled();
  const alphaAccessEnabled = useAlphaEnabled();
  const reportVariant = useReportVariant();
  const unifiedReportLabels = useUnifiedReportLabels();

  // Build gameModeLabels dynamically from specs (SSOT)
  // Uses getModeI18nKey to derive translation keys from mode IDs
  const gameModeLabels = useMemo<Record<string, string>>(() => {
    const buildLabel = (gameMode: string): string => {
      const key = getModeI18nKey(gameMode);
      return key ? t(key) : gameMode;
    };
    return {
      'dual-catch': buildLabel('dual-catch'),
      'dual-place': buildLabel('dual-place'),
      'dual-memo': buildLabel('dual-memo'),
      'dual-pick': buildLabel('dual-pick'),
      'dual-trace': buildLabel('dual-trace'),
      'dual-track': buildLabel('dual-track'),
      'dualnback-classic': buildLabel('dualnback-classic'),
      'sim-brainworkshop': buildLabel('sim-brainworkshop'),
      tower: buildLabel('tower'),
      stroop: buildLabel('stroop'),
      ospan: buildLabel('ospan'),
      flanker: buildLabel('flanker'),
      custom: buildLabel('custom'),
    };
  }, [t]);
  // ==========================================================================
  // Store-persisted filters (survive navigation and refresh)
  // ==========================================================================

  const VALID_MODES: ModeType[] = [
    'all',
    'DualTempo',
    'DualPlace',
    'DualMemo',
    'DualPick',
    'DualTrace',
    'DualnbackClassic',
    'BrainWorkshop',
    'Libre',
    'Journey',
  ];

  // Read filters from store
  // Note: arrays need useShallow to prevent re-renders on unrelated store changes
  const storedMode = useSettingsStore((s) => s.ui.statsMode);
  const storedNLevels = useSettingsStore(useShallow((s) => s.ui.statsNLevels));
  const storedModalities = useSettingsStore(useShallow((s) => s.ui.statsModalities));
  const storedDateOption = useSettingsStore((s) => s.ui.statsDateOption);
  const storedTab = useSettingsStore((s) => s.ui.statsTab);
  const storedJourneyFilter = useSettingsStore((s) => s.ui.statsJourneyFilter);
  const storedFreeModeFilter = useSettingsStore((s) => s.ui.statsFreeModeFilter);

  // Store actions
  const setStatsMode = useSettingsStore((s) => s.setStatsMode);
  const setStatsNLevels = useSettingsStore((s) => s.setStatsNLevels);
  const setStatsModalities = useSettingsStore((s) => s.setStatsModalities);
  const setStatsDateOption = useSettingsStore((s) => s.setStatsDateOption);
  const setStatsTab = useSettingsStore((s) => s.setStatsTab);
  const setStatsJourneyFilter = useSettingsStore((s) => s.setStatsJourneyFilter);
  const setStatsFreeModeFilter = useSettingsStore((s) => s.setStatsFreeModeFilter);
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);
  const expandJourneyStartLevel = useSettingsStore((s) => s.expandJourneyStartLevel);
  const savedJourneys = useSettingsStore((s) => s.savedJourneys);
  const journeyModeSettingsByJourneyId = useSettingsStore(
    (s) => s.ui.journeyModeSettingsByJourneyId,
  );

  // Tab (validated)
  const activeTab: TabValue = VALID_TABS.includes(storedTab as TabValue)
    ? (storedTab as TabValue)
    : 'history';

  const handleTabChange = (value: string) => {
    setStatsTab(value);
  };

  // Mode filter (validated) - default to 'all'
  const mode: ModeType = VALID_MODES.includes(storedMode as ModeType)
    ? (storedMode as ModeType)
    : 'all';
  const effectiveMode: ModeType =
    !SHOW_STATS_CONTEXT_SUBFILTERS && (mode === 'Journey' || mode === 'Libre') ? 'all' : mode;

  const setMode = useCallback(
    (newMode: ModeType) => {
      setStatsMode(newMode);
    },
    [setStatsMode],
  );

  // Journey filter (used when mode === 'Journey')
  const journeyFilter: JourneyFilterType = storedJourneyFilter || 'all';
  const effectiveJourneyFilter: JourneyFilterType = SHOW_STATS_CONTEXT_SUBFILTERS
    ? journeyFilter
    : 'all';

  const setJourneyFilter = useCallback(
    (newFilter: JourneyFilterType) => {
      setStatsJourneyFilter(newFilter);
    },
    [setStatsJourneyFilter],
  );

  const freeModeFilter: FreeModeFilterType = storedFreeModeFilter
    ? (storedFreeModeFilter as FreeModeFilterType)
    : 'all';
  const effectiveFreeModeFilter: FreeModeFilterType = SHOW_STATS_CONTEXT_SUBFILTERS
    ? freeModeFilter
    : 'all';

  const setFreeModeFilter = useCallback(
    (newFilter: FreeModeFilterType) => {
      setStatsFreeModeFilter(newFilter);
    },
    [setStatsFreeModeFilter],
  );

  const featureAccess = useMemo(
    () => ({
      betaEnabled: betaAccessEnabled,
      alphaEnabled: alphaAccessEnabled,
      prototypesEnabled: false,
    }),
    [alphaAccessEnabled, betaAccessEnabled],
  );

  // N-levels filter (convert array to Set for UI)
  const nLevels: NLevelFilterSet = useMemo(() => new Set(storedNLevels), [storedNLevels]);

  const setNLevels = useCallback(
    (newLevels: NLevelFilterSet) => {
      setStatsNLevels([...newLevels].sort((a: number, b: number) => a - b));
    },
    [setStatsNLevels],
  );

  // Modality filter (convert array to Set for UI)
  const modalityFilter: ModalityFilterSet = useMemo(
    () => new Set(storedModalities),
    [storedModalities],
  );

  const setModalityFilter = useCallback(
    (newModalities: ModalityFilterSet) => {
      setStatsModalities(Array.from(newModalities));
    },
    [setStatsModalities],
  );

  // Date option (validated)
  const dateOption: DateRangeOption =
    storedDateOption === 'all' ||
    storedDateOption === 'today' ||
    storedDateOption === 'week' ||
    storedDateOption === 'month' ||
    storedDateOption === 'custom'
      ? (storedDateOption as DateRangeOption)
      : 'all';

  const setDateOption = useCallback(
    (option: DateRangeOption) => {
      setStatsDateOption(option);
    },
    [setStatsDateOption],
  );

  // Custom date range (local state only - not persisted)
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({
    startDate: null,
    endDate: null,
  });

  // Memoized date filters to prevent infinite render loops
  // (getStartDateFromOption creates new Date objects on each call)
  const startDate = useMemo(() => {
    return dateOption === 'custom' ? customDateRange.startDate : getStartDateFromOption(dateOption);
  }, [dateOption, customDateRange.startDate]);

  const endDate = useMemo(() => {
    return dateOption === 'custom' ? customDateRange.endDate : null;
  }, [dateOption, customDateRange.endDate]);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Replay adapter for deleting runs
  const replayAdapter = useOptionalReplayInteractifAdapter();

  const { data: storedReport, isPending: storedReportPending } =
    useSessionStoredReportQuery(selectedSessionId);
  const storedReportStatus: 'idle' | 'loading' | 'ready' = !selectedSessionId
    ? 'idle'
    : storedReportPending
      ? 'loading'
      : 'ready';

  const { data: selectedSessionDetails } = useSessionDetailsQuery(selectedSessionId ?? '__none__');
  const {
    data: selectedRunEvents,
    isPending: selectedRunEventsPending,
    error: selectedRunEventsError,
  } = useReplayRunEventsQuery(selectedRunId, replayAdapter);
  const selectedRunReportPending =
    selectedRunId !== null &&
    (!selectedSessionDetails ||
      selectedSessionDetails.id !== selectedSessionId ||
      !replayAdapter ||
      selectedRunEventsPending);
  const selectedRunReport = useMemo<SessionEndReportModel | null>(() => {
    if (!selectedRunId) return null;
    if (!selectedSessionDetails || selectedSessionDetails.id !== selectedSessionId) return null;
    if (!replayAdapter || selectedRunEventsPending) return null;
    return projectReplayRunReportFromHistorySession(
      selectedSessionDetails,
      selectedRunEvents,
      (gameMode) => gameModeLabels[gameMode] ?? gameMode,
    );
  }, [
    gameModeLabels,
    replayAdapter,
    selectedRunEvents,
    selectedRunEventsPending,
    selectedRunId,
    selectedSessionDetails,
    selectedSessionId,
  ]);

  useEffect(() => {
    if (!selectedRunEventsError) return;
    logger.userError(
      'Chargement correction impossible',
      'Run report projection failed',
      selectedRunEventsError,
    );
  }, [selectedRunEventsError]);

  const deleteSessionMutation = useDeleteSession();
  const deleteSessionsMutation = useDeleteSessions();
  const exportSessionsMutation = useExportSessions();
  const importSessionsMutation = useImportSessions();

  const deleteSession = useCallback(
    (sessionId: string) => {
      // Close modal if we're deleting the currently viewed session
      if (sessionId === selectedSessionId) {
        setSelectedSessionId(null);
        setSelectedRunId(null);
      }
      void deleteSessionMutation.mutateAsync(sessionId);
    },
    [deleteSessionMutation, selectedSessionId],
  );

  const bulkDeleteSessions = useCallback(
    (sessionIds: string[]) => {
      // Close modal if we're deleting the currently viewed session
      if (selectedSessionId && sessionIds.includes(selectedSessionId)) {
        setSelectedSessionId(null);
        setSelectedRunId(null);
      }
      void deleteSessionsMutation.mutateAsync(sessionIds);
    },
    [deleteSessionsMutation, selectedSessionId],
  );

  const exportSessions = useCallback(async () => {
    return exportSessionsMutation.mutateAsync();
  }, [exportSessionsMutation]);

  const importSessions = useCallback(
    async (data: SessionHistoryExport) => {
      return importSessionsMutation.mutateAsync(data);
    },
    [importSessionsMutation],
  );

  const isRunReportView = selectedRunId !== null;

  // Freshness: détecter si la session affichée n'est pas la plus récente du parcours
  const journeyIdForFreshness = !isRunReportView
    ? (storedReport?.journeyId ??
      storedReport?.journeyContext?.journeyId ??
      selectedSessionDetails?.journeyId ??
      selectedSessionDetails?.journeyContext?.journeyId ??
      null)
    : null;
  const { data: latestJourneySession, isPending: latestJourneySessionPending } =
    useLatestJourneySessionQuery(journeyIdForFreshness);
  const reportJourneyConfig: JourneyConfig = useMemo(() => {
    if (!journeyIdForFreshness) {
      return {
        journeyId: '',
        startLevel: 1,
        targetLevel: 1,
      };
    }
    const journey = savedJourneys.find((entry) => entry.id === journeyIdForFreshness);
    if (!journey) {
      return {
        journeyId: '',
        startLevel: 1,
        targetLevel: 1,
      };
    }
    const scopedSettings = journeyModeSettingsByJourneyId[journey.id];
    return buildJourneyConfigSnapshot({
      journeyId: journey.id,
      savedJourney: journey,
      startLevel: journey.startLevel,
      targetLevel: journey.targetLevel,
      legacyJourneyModeSettings: scopedSettings,
    });
  }, [journeyIdForFreshness, journeyModeSettingsByJourneyId, savedJourneys]);
  const currentJourneyState = null as any;
  const currentNextJourneySession = null as any;

  const { journeyIds: journeyIdsFromDb } = useAvailableJourneyIdsQuery();
  // Sort: known journeys first (classic, dualnback-classic, sim-brainworkshop), then custom.
  const availableJourneys: readonly string[] = useMemo(() => {
    const known = ['classic', 'dualnback-classic-journey', 'sim-brainworkshop-journey'];
    return [...journeyIdsFromDb].sort((a, b) => {
      const aKnown = known.indexOf(a);
      const bKnown = known.indexOf(b);
      if (aKnown !== -1 && bKnown !== -1) return aKnown - bKnown;
      if (aKnown !== -1) return -1;
      if (bKnown !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [journeyIdsFromDb]);

  // Note: journeyFilter supports 'all' (all journey sessions).

  const handleSelectSession = useCallback((session: SessionHistoryItem) => {
    setSelectedSessionId(session.id);
    setSelectedRunId(null);
  }, []);

  const handleRunClick = useCallback((sessionId: string, runId: string | null) => {
    setSelectedSessionId(sessionId);
    setSelectedRunId(runId);
  }, []);

  // Handle run deletion
  const handleDeleteRun = useCallback(
    async (sessionId: string, runId: string | null) => {
      if (runId === null) {
        // Delete the original session (P1) = delete entire session
        deleteSession(sessionId);
      } else if (replayAdapter) {
        // Delete a correction run (P2, P3, P4)
        try {
          await replayAdapter.deleteRun(runId);
          if (selectedRunId === runId) {
            setSelectedRunId(null);
          }
          // Cache invalidation is handled by HistoryView via TanStack Query
        } catch (err) {
          logger.userError('Delete failed', 'Delete failed', err);
        }
      }
    },
    [deleteSession, replayAdapter, selectedRunId],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeDetailModal = useCallback(() => {
    setSelectedSessionId(null);
    setSelectedRunId(null);
  }, []);

  const continueJourneyFromReport = useCallback(
    (report: SessionEndReportModel, stageId: number, nLevel: number) => {
      const journeyId = report.journeyId ?? report.journeyContext?.journeyId ?? undefined;
      const suggestedStartLevel = report.journeyContext?.suggestedStartLevel;
      const dualTrackDetails = report.modeDetails?.kind === 'track' ? report.modeDetails : null;
      if (
        typeof journeyId === 'string' &&
        typeof suggestedStartLevel === 'number' &&
        Number.isFinite(suggestedStartLevel)
      ) {
        expandJourneyStartLevel(journeyId, suggestedStartLevel);
      }
      closeDetailModal();
      const targetModeId =
        report.journeyContext?.nextSessionGameMode ??
        currentJourneyState?.nextSessionGameMode ??
        reportJourneyConfig.gameMode ??
        report.gameMode;
      navigate(getRouteForMode(targetModeId as GameModeId), {
        state: createJourneyPlayIntent(stageId, journeyId, {
          gameModeId: targetModeId,
          journeyNLevel: nLevel,
          journeyStartLevel: reportJourneyConfig.startLevel,
          journeyTargetLevel: reportJourneyConfig.targetLevel,
          journeyGameModeId: reportJourneyConfig.gameMode ?? report.gameMode,
          journeyStrategyConfig: reportJourneyConfig.strategyConfig,
          dualTrackJourneyTargetCount: dualTrackDetails?.nextTargetCountStage,
          dualTrackJourneyTierIndex: dualTrackDetails?.nextDifficultyTier,
        }),
      });
    },
    [
      closeDetailModal,
      currentJourneyState?.nextSessionGameMode,
      expandJourneyStartLevel,
      navigate,
      reportJourneyConfig.gameMode,
      reportJourneyConfig.startLevel,
      reportJourneyConfig.strategyConfig,
      reportJourneyConfig.targetLevel,
    ],
  );

  const historyFilters = useMemo(
    () => ({
      mode: effectiveMode,
      journeyFilter: effectiveJourneyFilter,
      freeModeFilter: effectiveFreeModeFilter,
      modalities: modalityFilter,
      startDate,
      endDate,
      nLevels,
    }),
    [
      effectiveMode,
      effectiveJourneyFilter,
      effectiveFreeModeFilter,
      modalityFilter,
      startDate,
      endDate,
      nLevels,
    ],
  );

  const {
    filteredCount: filteredSessionsCount,
    totalCount: totalSessionsCount,
    isPending: headerCountsPending,
    error: headerCountsError,
  } = useSessionSummariesHeaderCountsQuery(historyFilters);
  // Read-model "ready" is advisory and may stay false during PowerSync catch-up.
  // Only show the counter spinner while the header counts query is actually pending.
  const isFiltering = headerCountsPending;
  const hasCounterError = Boolean(headerCountsError);

  useEffect(() => {
    if (!hasCounterError) return;
    logger.warn('[Stats] Header counter query error', {
      error: headerCountsError ? String(headerCountsError) : null,
      totalSessionsCount,
      filteredSessionsCount,
      mode: effectiveMode,
      journeyFilter: effectiveJourneyFilter,
      freeModeFilter: effectiveFreeModeFilter,
    });
  }, [
    hasCounterError,
    headerCountsError,
    totalSessionsCount,
    filteredSessionsCount,
    effectiveMode,
    effectiveJourneyFilter,
    effectiveFreeModeFilter,
  ]);

  // Export handler
  const handleExport = useCallback(async () => {
    try {
      const data = await exportSessions();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `neurodual-history-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.userError('Export echoue', 'Export failed', err);
    }
  }, [exportSessions]);

  // Import handler
  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parseResult = SessionHistoryExportSchema.safeParse(JSON.parse(text));
        if (!parseResult.success) {
          throw new Error('Invalid format');
        }
        const result = await importSessions(parseResult.data);
        logger.debug('Import completed', {
          imported: result.imported,
          skipped: result.skipped,
        });
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        logger.userError('Import echoue', 'Import failed', err);
      }
    },
    [importSessions],
  );

  const { sync } = useAppPorts();
  const haptic = useHaptic();
  const handlePullToRefresh = useCallback(async () => {
    if (sync.getState().isAvailable) {
      await sync.sync();
    }
  }, [sync]);
  const handlePullHaptic = useCallback(() => {
    haptic.impact('light');
  }, [haptic]);

  return (
    <PullToRefresh onRefresh={handlePullToRefresh} onHaptic={handlePullHaptic}>
      <PageTransition className="pt-4 pb-8 space-y-6">
        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          data-testid="stats-import-file"
          className="hidden"
        />

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-foreground/10 text-foreground">
              <Pulse size={24} />
            </div>
            <h2 className="text-2xl font-bold text-foreground">{t('stats.title')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`text-sm text-muted-foreground font-medium px-3 py-1 bg-surface rounded-full border border-border flex items-center gap-2 transition-opacity duration-150 ${isFiltering ? 'opacity-60' : ''}`}
            >
              {isFiltering && <Spinner size={12} className="inline-block" />}
              {filteredSessionsCount}/{totalSessionsCount} {t('stats.simple.sessions')}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExport}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                title={t('common.export')}
              >
                <DownloadSimple size={18} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                title={t('common.import')}
              >
                <UploadSimple size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <FiltersDropdown
          modalityFilter={modalityFilter}
          onModalityFilterChange={setModalityFilter}
          mode={effectiveMode}
          onModeChange={setMode}
          journeyFilter={journeyFilter}
          onJourneyFilterChange={setJourneyFilter}
          freeModeFilter={freeModeFilter}
          onFreeModeFilterChange={setFreeModeFilter}
          availableJourneys={availableJourneys}
          dateOption={dateOption}
          onDateChange={setDateOption}
          customDateRange={customDateRange}
          onCustomDateRangeChange={setCustomDateRange}
          nLevels={nLevels}
          onNLevelsChange={setNLevels}
          betaEnabled={betaEnabled}
          featureAccess={featureAccess}
          showContextSubfilters={SHOW_STATS_CONTEXT_SUBFILTERS}
        />

        {/* Tabs Card */}
        <div className="surface-card-typography bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden shadow-[0_2px_16px_-4px_hsl(var(--border)/0.15)]">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full rounded-none border-0 bg-transparent p-2">
              <TabsTrigger value="simple" className="flex-1 rounded-xl">
                {t('stats.tabs.simple')}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex-1 rounded-xl">
                {t('stats.tabs.advanced')}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 rounded-xl">
                {t('stats.tabs.history')}
              </TabsTrigger>
              <TabsTrigger value="progression" className="flex-1 rounded-xl">
                {t('stats.tabs.progression')}
              </TabsTrigger>
            </TabsList>

            <Hatching id="stats-tabs-hatch" className="text-foreground" />

            <TabsContent value="simple" className="mt-0 p-4">
              <SimpleStatsTab
                mode={effectiveMode}
                journeyFilter={effectiveJourneyFilter}
                modalities={modalityFilter}
                startDate={startDate}
                endDate={endDate}
                nLevels={nLevels}
                betaEnabled={betaEnabled}
                alphaEnabled={alphaAccessEnabled}
              />
            </TabsContent>

            <TabsContent value="advanced" className="mt-0 p-4">
              <AdvancedStatsTab
                mode={effectiveMode}
                journeyFilter={effectiveJourneyFilter}
                modalities={modalityFilter}
                startDate={startDate}
                endDate={endDate}
                nLevels={nLevels}
                betaEnabled={betaEnabled}
                alphaEnabled={alphaAccessEnabled}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0 p-4">
              <HistoryView
                filters={historyFilters}
                filteredCount={filteredSessionsCount}
                onDelete={deleteSession}
                onBulkDelete={bulkDeleteSessions}
                onSelect={handleSelectSession}
                onRunClick={handleRunClick}
                onDeleteRun={handleDeleteRun}
                betaEnabled={betaEnabled}
              />
            </TabsContent>

            <TabsContent value="progression" className="mt-0 p-4">
              <ProgressionTab showRewardMilestones />
            </TabsContent>
          </Tabs>
        </div>

        {/* Session Detail Modal - Fullscreen on mobile, rendered via Portal to escape stacking context */}
        {selectedSessionId &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center md:p-4">
              {/* Backdrop - hidden on mobile (fullscreen) */}
              <div
                role="button"
                tabIndex={0}
                aria-label={t('common.close')}
                className="absolute inset-0 bg-black/60 backdrop-blur-md hidden md:block"
                onClick={closeDetailModal}
                onKeyDown={(e) => e.key === 'Escape' && closeDetailModal()}
              />

              {/* Modal wrapper - used to position the desktop close button outside the report frame */}
              <div className="relative w-full h-full md:h-auto md:max-w-md md:max-h-[90vh]">
                {/* Close button (desktop) */}
                <button
                  type="button"
                  onClick={closeDetailModal}
                  aria-label={t('common.close')}
                  className="hidden md:flex items-center justify-center absolute -top-3 -right-3 p-2 bg-woven-bg text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-20 border border-border shadow-sm"
                >
                  <X size={20} />
                </button>

                {/* Modal - Fullscreen on mobile, centered modal on desktop */}
                <div className="relative safe-fullscreen-inset bg-woven-bg md:border md:border-border md:rounded-2xl w-full h-full md:max-h-[90vh] overflow-y-auto animate-in fade-in md:zoom-in-95 duration-200">
                  {/* Close button (mobile) */}
                  <button
                    type="button"
                    onClick={closeDetailModal}
                    aria-label={t('common.close')}
                    className="md:hidden absolute page-floating-dismiss-button p-2 text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-20"
                  >
                    <X size={20} />
                  </button>

                  {/* Report - stored snapshot is the single source of truth */}
                  {(() => {
                    if (isRunReportView && selectedRunReportPending) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
                            <Pulse size={32} className="text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                        </div>
                      );
                    }

                    if (!isRunReportView && storedReportStatus === 'loading') {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
                            <Pulse size={32} className="text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                        </div>
                      );
                    }

                    const reportData: SessionEndReportModel | null = isRunReportView
                      ? selectedRunReport
                      : storedReport;
                    if (!reportData) {
                      if (isRunReportView) {
                        return (
                          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                            <p className="text-sm text-muted-foreground">
                              {t(
                                'stats.report.runUnavailable',
                                'Rapport de correction indisponible pour ce run.',
                              )}
                            </p>
                          </div>
                        );
                      }
                      if (storedReportStatus === 'loading') {
                        return (
                          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
                              <Pulse size={32} className="text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 px-8">
                          <p className="text-sm text-muted-foreground">
                            {t(
                              'stats.report.sessionUnavailable',
                              'Rapport indisponible pour cette session.',
                            )}
                          </p>
                        </div>
                      );
                    }
                    // Journey context derivation removed (NeuroDual Lite)
                    const reportWithComputedJourney: SessionEndReportModel = reportData;
                    const message = translateContextualMessage(
                      t,
                      generateContextualMessageData(reportWithComputedJourney, {
                        style: reportVariant === 'beta' ? 'analyst' : 'simple',
                        variant: reportVariant,
                      }),
                    );

                    // Build xpData from report if xpBreakdown is available
                    // For historical sessions, we don't have leveledUp/newBadges info
                    const xpData = reportWithComputedJourney.xpBreakdown
                      ? {
                          xpBreakdown: reportWithComputedJourney.xpBreakdown,
                          leveledUp: false, // Unknown for historical sessions
                          newLevel: 1, // Unknown for historical sessions
                          newBadges: [] as const, // Unknown for historical sessions
                        }
                      : undefined;

                    const runIdQuery = selectedRunId
                      ? `?runId=${encodeURIComponent(selectedRunId)}`
                      : '';
                    const interactiveQuery = selectedRunId
                      ? `?mode=interactive&runId=${encodeURIComponent(selectedRunId)}`
                      : '?mode=interactive';

                    // Notice "session plus récente" pour les parcours
                    const reportSessionJourneyId =
                      reportWithComputedJourney.journeyId ??
                      reportWithComputedJourney.journeyContext?.journeyId ??
                      null;
                    const isOutdatedJourneyReport =
                      !isRunReportView &&
                      !latestJourneySessionPending &&
                      latestJourneySession != null &&
                      reportSessionJourneyId != null &&
                      latestJourneySession.id !== selectedSessionId;

                    const journeyNotice: ReactNode | undefined = isOutdatedJourneyReport
                      ? (() => {
                          if (!latestJourneySession.createdAt) return undefined;
                          const formatted = latestJourneySession.createdAt.toLocaleString(
                            i18n.language,
                            {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          );
                          return (
                            <>
                              {t(
                                'stats.unifiedReport.journeyMoreRecentSessionNotice',
                                'You have a more recent session in this journey: N-{{level}} ({{date}}).',
                                {
                                  level: latestJourneySession.nLevel,
                                  date: formatted,
                                },
                              )}{' '}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRunId(null);
                                  setSelectedSessionId(latestJourneySession.id);
                                }}
                                className="text-primary underline underline-offset-2 hover:text-primary/90"
                              >
                                {t(
                                  'stats.unifiedReport.journeyMoreRecentSessionLink',
                                  'View the more recent session',
                                )}
                              </button>
                            </>
                          );
                        })()
                      : undefined;
                    const currentJourneyStageId =
                      currentNextJourneySession && !currentNextJourneySession.isComplete
                        ? currentNextJourneySession.stageId
                        : null;
                    const currentJourneyModeId =
                      currentNextJourneySession && !currentNextJourneySession.isComplete
                        ? currentNextJourneySession.gameMode
                        : null;
                    const reportRecommendedStageId =
                      reportWithComputedJourney.journeyContext?.nextPlayableStage ??
                      reportWithComputedJourney.journeyContext?.stageId ??
                      reportWithComputedJourney.journeyStageId ??
                      null;
                    const reportRecommendedModeId =
                      reportWithComputedJourney.journeyContext?.nextSessionGameMode ??
                      reportWithComputedJourney.gameMode;
                    const isMismatchedJourneyRecommendation =
                      !isRunReportView &&
                      !isOutdatedJourneyReport &&
                      reportJourneyConfig.journeyId.length > 0 &&
                      currentJourneyStageId !== null &&
                      (currentJourneyStageId !== reportRecommendedStageId ||
                        (currentJourneyModeId !== null &&
                          currentJourneyModeId !== reportRecommendedModeId));
                    const reportForDisplay: SessionEndReportModel = reportWithComputedJourney;
                    const openCurrentJourneySession = () => {
                      if (!currentNextJourneySession || currentNextJourneySession.isComplete)
                        return;
                      closeDetailModal();
                      navigate(currentNextJourneySession.route, {
                        state: nextSessionToPlayIntent(currentNextJourneySession),
                      });
                    };
                    const effectiveJourneyNotice: ReactNode | undefined =
                      journeyNotice ??
                      (isMismatchedJourneyRecommendation ? (
                        latestJourneySession &&
                        latestJourneySession.id !== selectedSessionId &&
                        latestJourneySession.createdAt ? (
                          (() => {
                            const formatted = latestJourneySession.createdAt.toLocaleString(
                              i18n.language,
                              {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            );
                            return (
                              <>
                                {t(
                                  'stats.unifiedReport.journeyMoreRecentSessionNotice',
                                  'You have a more recent session in this journey: N-{{level}} ({{date}}).',
                                  {
                                    level: latestJourneySession.nLevel,
                                    date: formatted,
                                  },
                                )}{' '}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRunId(null);
                                    setSelectedSessionId(latestJourneySession.id);
                                  }}
                                  className="text-primary underline underline-offset-2 hover:text-primary/90"
                                >
                                  {t(
                                    'stats.unifiedReport.journeyMoreRecentSessionLink',
                                    'View the more recent session',
                                  )}
                                </button>
                              </>
                            );
                          })()
                        ) : (
                          <>
                            {t(
                              'stats.unifiedReport.journeyCurrentStateNotice',
                              'This report is no longer aligned with the current journey state. Start from the current journey step instead.',
                            )}{' '}
                            <button
                              type="button"
                              onClick={openCurrentJourneySession}
                              className="text-primary underline underline-offset-2 hover:text-primary/90"
                            >
                              {t(
                                'stats.unifiedReport.journeyCurrentStateLink',
                                'Open the current journey session',
                              )}
                            </button>
                          </>
                        )
                      ) : undefined);

                    if (
                      reportForDisplay.taskType === 'stroop' ||
                      reportForDisplay.taskType === 'stroop-flex'
                    ) {
                      return (
                        <div className="p-0 md:p-6">
                          <StroopSessionReport
                            report={reportForDisplay}
                            onPlayAgain={closeDetailModal}
                            onBackToHome={() => navigate('/')}
                          />
                        </div>
                      );
                    }

                    if (reportForDisplay.taskType === 'ospan') {
                      return (
                        <div className="p-0 md:p-6">
                          <OspanSessionReport
                            report={reportForDisplay}
                            onPlayAgain={closeDetailModal}
                            onBackToHome={() => navigate('/')}
                          />
                        </div>
                      );
                    }

                    return (
                      <div>
                        <UnifiedSessionReport
                          data={reportForDisplay}
                          message={message}
                          labels={{
                            ...unifiedReportLabels,
                            modeScoreLabel: t(reportForDisplay.modeScore.labelKey),
                            modeScoreTooltip: reportForDisplay.modeScore.tooltipKey
                              ? t(reportForDisplay.modeScore.tooltipKey)
                              : undefined,
                          }}
                          xpData={xpData}
                          onPlayAgain={closeDetailModal}
                          onBackToHome={() => navigate('/')}
                          onStartAtLevel={(level) => {
                            const gameMode = reportForDisplay.gameMode ?? 'dual-catch';
                            setModeSettingFor(gameMode, 'nLevel', Math.max(1, Math.round(level)));
                            closeDetailModal();
                            navigate(getRouteForMode(gameMode), {
                              state: createFreePlayIntent(gameMode),
                            });
                          }}
                          onGoToJourneyStage={(stageId, nLevel) => {
                            continueJourneyFromReport(reportForDisplay, stageId, nLevel);
                          }}
                          onGoToStats={(report) => {
                            const preset = getStatsPresetForReport(report);
                            setStatsTab(preset.tab);
                            setStatsMode(preset.mode);
                            setStatsJourneyFilter(preset.journeyFilter);
                            setStatsNLevels([]);
                            setStatsModalities([]);
                            setStatsDateOption('all');
                            setStatsFreeModeFilter('all');
                            closeDetailModal();
                          }}
                          onReplay={() => navigate(`/replay/${selectedSessionId}${runIdQuery}`)}
                          onCorrect={
                            [
                              'dual-catch',
                              'dualnback-classic',
                              'sim-brainworkshop',
                              'custom',
                              'dual-place',
                              'dual-memo',
                            ].includes(reportData.gameMode ?? '')
                              ? () => navigate(`/replay/${selectedSessionId}${interactiveQuery}`)
                              : undefined
                          }
                          showMobileCloseButton={false}
                          betaEnabled={betaEnabled}
                          journeyNotice={effectiveJourneyNotice}
                          className="p-0 md:p-6"
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>,
            document.body,
          )}
      </PageTransition>
    </PullToRefresh>
  );
}
