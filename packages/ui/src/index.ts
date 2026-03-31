// @neurodual/ui - Layer 3
// Composants React purs (dumb components)

// Toast notifications
export { Toaster, toast } from 'sonner';

// Bottom sheet / drawer
export { Drawer } from 'vaul';

// TanStack Query hooks and utilities
export * from './queries';

// Challenge (statistical daily challenge)
export { ChallengeCalendar, type ChallengeCalendarProps } from './challenge';
export { ChallengePath, type ChallengePathProps } from './challenge';

// Branding
export { Logo, type LogoProps } from './branding';
export { defaultUITranslations } from './context/default-translations';

// Context
export { UIProvider, type UITranslations, useUITranslations } from './context/UITranslations';

// Orientation helpers (used by app shells like LandscapeBlocker)
export {
  useIsLandscapeAllowed,
  useLandscapeAllowanceStore,
} from './orientation/landscape-allowance';

// Journey config context
export {
  JourneyConfigProvider,
  useJourneyConfig,
  useJourneyConfigSafe,
} from './context/JourneyConfigContext';

// Adapter hooks (use module-level adapters via NeurodualQueryProvider)
export { useHistoryAdapter, useOptionalHistoryAdapter } from './context/SessionHistoryContext';
export { useProgressionAdapter } from './context/ProgressionContext';
export { useProfileAdapter } from './context/ProfileContext';
export {
  useAuthAdapter,
  useAuthQuery,
  useCurrentUser,
  useIsAuthenticated,
} from './context/AuthContext';
export {
  useSubscriptionAdapter,
  useSubscriptionQuery,
  useHasPremiumAccess,
  useHasCloudSync,
  useCanAccessNLevel,
  useIsTrialing,
} from './context/SubscriptionContext';
export { useDailyPlaytimeGate, type DailyPlaytimeGate } from './queries/daily-playtime-gate';
export {
  useSyncAdapter,
  useSyncQuery,
  useIsSyncAvailable,
  useIsSyncing,
  usePendingCount,
  useSync,
} from './context/SyncContext';
export {
  usePaymentAdapter,
  useCustomerInfo,
  useIsPurchaseActive,
  useIsPaymentAvailable,
  useProducts,
  usePurchase,
  useRestorePurchases,
} from './context/PaymentContext';
export {
  useRewardAdapter,
  useGrantedRewards,
  usePendingRewards,
  useHasReward,
  useRewardState,
  useGrantReward,
  useQueueReward,
  useProcessPendingRewards,
  useRefreshRewards,
  useIsProcessingRewards,
  usePendingRewardsCount,
} from './context/RewardContext';
export {
  AudioProvider,
  type AudioProviderProps,
  useAudio,
  useAudioState,
  useAudioReady,
  useAudioUnlock,
  useAudioLoadingProgress,
} from './context/AudioContext';
export { AudioGate, type AudioGateProps } from './components/AudioGate';
export { AudioResumeHandler } from './components/AudioResumeHandler';
export {
  AppLifecycleProvider,
  type AppLifecycleProviderProps,
  useAppLifecycle,
  useAppLifecycleState,
  useAppReady,
  useAppRetry,
  useInitProgress,
  useAppError,
} from './context/AppLifecycleContext';

// Game components
export {
  ArithmeticDisplay,
  type ArithmeticDisplayProps,
  type GameControlItem,
  GameControls,
  type GameControlsProps,
  Grid,
  type GridProps,
  type GridStyle,
  GuidedTimeline,
  TimelineCard,
  ResponseButtons,
  type ResponseButtonsProps,
  StimulusDisplay,
  type StimulusDisplayProps,
  type StimulusStyle,
  TimerBar,
  type TimerBarProps,
  getTrialBorderColorForNLevel,
  getTrialBgColorForNLevel,
  getTrialColorIndex,
  getColorCountForNLevel,
  MiniGrid,
  MiniLetter,
  type MiniGridProps,
  type MiniLetterProps,
  StringArtPlus,
  GameHUD,
  type GameHUDProps,
  HUD_BADGE,
  HUD_BADGE_SM,
  HUD_BTN,
} from './game';

// Lib
export { cn } from './lib/utils';
export {
  getDevEffectProfilerSnapshot,
  profileDevEffectAsync,
  profileDevEffectSync,
  type DevEffectProfilerSnapshot,
} from './debug/dev-effect-profiler';

// Primitives
export {
  AVATARS,
  Avatar,
  type AvatarProps,
  BetaBadge,
  type BetaBadgeProps,
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  CanvasWeave,
  type CanvasWeaveProps,
  Card,
  type CardProps,
  SubCard,
  type SubCardProps,
  DatePicker,
  type DatePickerProps,
  TimePicker,
  type TimePickerProps,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  Disclosure,
  type DisclosureProps,
  EditableNumber,
  type EditableNumberProps,
  EditableSlider,
  type EditableSliderProps,
  Hatching,
  type HatchingProps,
  DrawerSheet,
  type DrawerSheetProps,
  InfoPopover,
  type InfoPopoverProps,
  InfoSheet,
  type InfoSheetProps,
  useDrawerDirection,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  ProgressBar,
  type ProgressBarProps,
  Section,
  type SectionProps,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SettingRow,
  type SettingRowProps,
  type SettingColorTheme,
  Spinner,
  type SpinnerProps,
  PullToRefresh,
  type PullToRefreshProps,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
  type ToggleProps,
} from './primitives';

// Stats components
export {
  // Core
  AccuracyGauge,
  type AccuracyGaugeProps,
  type ModalityStats,
  SessionReport,
  type SessionReportData,
  type SessionReportLabels,
  type SessionReportProps,
  StatCard,
  type StatCardProps,
  UnifiedSessionReport,
  type UnifiedSessionReportLabels,
  type UnifiedSessionReportProps,
  ReportHero,
  type ReportHeroProps,
  ReportPerformance,
  type ReportPerformanceProps,
  ProgressionIndicator,
  type ProgressionIndicatorProps,
  // Charts
  ScrollableChart,
  type ScrollableChartProps,
  FixedYAxis,
  type FixedYAxisProps,
  // Filters
  ModalityFilter,
  type ModalityFilterProps,
  ModeSelector,
  type ModeSelectorProps,
  JourneySelector,
  type JourneySelectorProps,
  DateFilter,
  type DateFilterProps,
  NLevelSelector,
  type NLevelSelectorProps,
  FiltersDropdown,
  type FiltersDropdownProps,
  type ModalityFilterSet,
  type ModeType,
  type JourneyFilterType,
  type FreeModeFilterType,
  type DateRangeOption,
  type CustomDateRange,
  type NLevelFilterSet,
  // History
  SessionCard,
  type SessionCardProps,
  DeleteConfirmModal,
  BulkDeleteModal,
  type DeleteConfirmModalProps,
  type BulkDeleteModalProps,
  HistoryView,
  type HistoryViewProps,
  // Tabs
  ProgressionTab,
  type ProgressionTabProps,
  SimpleStatsTab,
  AdvancedStatsTab,
  type StatsViewProps,
  // Helpers
  erfInv,
  getModalityIcon,
  formatDuration,
  isTempoLikeMode,
  isPlaceOrMemoMode,
  isGlobalView,
  getStartDateFromOption,
  projectReplayRunReportFromHistorySession,
  CustomTooltip,
} from './stats';

// Hooks
export {
  useGameSession,
  type GameSessionLike,
  useHistoryStats,
  useProgression,
  type UseProgressionReturn,
  useUserProfile,
  type UseUserProfileReturn,
  useEffectiveUserId,
  useRewardDetection,
  useNextReward,
  type NewlyGrantedReward,
  type UseRewardDetectionReturn,
  // Session Completion (Single Source of Truth for session completion)
  useSessionCompletion,
  type UseSessionCompletionOptions,
  type UseSessionCompletionReturn,
  // Trace Session Machine (XState)
  useTraceSessionMachine,
  type UseTraceSessionMachineResult,
  // Dual Label Session Machine (XState)
  useDualPickSessionMachine,
  type UseDualPickSessionMachineResult,
  // Memo Session Machine (XState)
  useMemoSessionMachine,
  type UseMemoSessionMachineResult,
  // Place Session Machine (XState)
  usePlaceSessionMachine,
  type UsePlaceSessionMachineResult,
  // PowerSync Status Hooks
  usePowerSyncStatus,
  usePowerSyncConnected,
  usePowerSyncSyncing,
  type PowerSyncStatusInfo,
  // Game Controls Hook (data-driven control generation)
  useGameControls,
  type UseGameControlsOptions,
  type UseGameControlsReturn,
  type GameDispatch,
  type GameDispatchEvent,
  type InputMethod,
  type ButtonPosition,
  type TranslationFn,
  // Session Decider Hook (Phase 0: shared contract for pure session machines)
  useSessionDecider,
  type UseSessionDeciderOptions,
  type UseSessionDeciderResult,
  useMountEffect,
  useScrollHints,
  type UseScrollHintsOptions,
  type UseScrollHintsReturn,
} from './hooks';

// Stats Context (for dependency injection)
export { StatsProvider, useStatsAdapter } from './context/StatsContext';

// Replay Context (for session replay)
export { ReplayProvider, useReplayAdapter } from './context/ReplayContext';

// Replay Interactif Context (for interactive replay)
export {
  ReplayInteractifProvider,
  useReplayInteractifAdapter,
  useOptionalReplayInteractifAdapter,
} from './context/ReplayInteractifContext';

export {
  HandwritingRecognizerProvider,
  useHandwritingRecognizerLoader,
  useOptionalHandwritingRecognizerLoader,
  type HandwritingRecognizer,
  type HandwritingRecognizerLoader,
  type HandwritingRecognitionResult,
  type HandwritingStrokePoint,
} from './context/HandwritingRecognizerContext';

export {
  DigitRecognizerProvider,
  useDigitRecognizerLoader,
  useOptionalDigitRecognizerLoader,
  type DigitRecognizer,
  type DigitRecognizerLoader,
  type DigitNumberRecognitionResult,
  type DigitRecognitionResult,
  type DigitStrokePoint,
  type RecognizeNumberOptions,
} from './context/DigitRecognizerContext';

// Progression components
export {
  BadgeCard,
  type BadgeCardProps,
  ProgressionView,
  type ProgressionViewLabels,
  type ProgressionViewProps,
  XPBar,
  type XPBarProps,
} from './progression';

// Journey components
export {
  JourneyPath,
  type JourneyPathProps,
  JourneySessionReport,
  type JourneySessionReportData,
  type JourneySessionReportLabels,
  type JourneySessionReportProps,
  type ModalityDetailedStats,
  JourneyStageCard,
  type JourneyStageCardProps,
} from './journey';

// Place components
export * from './place';

// Replay components
export * from './replay';

// Dual Pick components (BETA)
export * from './dual-pick';

// Handwriting recognition components
export * from './trace';

// Tutorial components
export * from './tutorial';

// Animation system
export * from './animations';

// Reactive helpers
export { useSubscribable } from './reactive/use-subscribable';

// Read model adapter wiring
export { getReadModelsAdapter, setReadModelsAdapter } from './queries/read-models';

// Theme (single source of truth for woven stimulus colors)
export {
  WOVEN_COLORS,
  type WovenColor,
  type WovenColorName,
  type ColorModalityTheme,
  wovenBg,
  wovenText,
  wovenCssVar,
  resolveModalityColor,
  resolveThemeColor,
} from './theme/woven-colors';
