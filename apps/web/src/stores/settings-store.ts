/**
 * SettingsStore - User preferences state
 *
 * Architecture:
 * - currentMode: le mode de jeu actif
 * - modes: settings spécifiques par mode (isolés les uns des autres)
 * - ui: préférences visuelles/audio partagées entre tous les modes
 *
 * Chaque mode ne voit que SES propres settings, pas ceux des autres.
 *
 * PERSISTENCE:
 * - Settings are stored in SQLite (not localStorage)
 * - This enables sync with Supabase and consistent cross-platform behavior
 * - Call initSettingsStore() at app startup to load settings from SQLite
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  gameModeRegistry,
  BUILT_IN_JOURNEYS,
  DEFAULT_JOURNEY_ID as DEFAULT_JOURNEY_ID_FROM_LOGIC,
  DUALNBACK_CLASSIC_JOURNEY_ID as DUALNBACK_CLASSIC_JOURNEY_ID_FROM_LOGIC,
  BRAINWORKSHOP_JOURNEY_ID as BRAINWORKSHOP_JOURNEY_ID_FROM_LOGIC,
  NEURODUAL_MIX_JOURNEY_ID as NEURODUAL_MIX_JOURNEY_ID_FROM_LOGIC,
  DUAL_TRACE_JOURNEY_ID as DUAL_TRACE_JOURNEY_ID_FROM_LOGIC,
  DUAL_TRACK_EASY_JOURNEY_ID as DUAL_TRACK_EASY_JOURNEY_ID_FROM_LOGIC,
  DUAL_TRACK_MEDIUM_JOURNEY_ID as DUAL_TRACK_MEDIUM_JOURNEY_ID_FROM_LOGIC,
  DUAL_TRACK_JOURNEY_ID as DUAL_TRACK_JOURNEY_ID_FROM_LOGIC,
  DUAL_TRACK_DNB_JOURNEY_ID as DUAL_TRACK_DNB_JOURNEY_ID_FROM_LOGIC,
  DUAL_TRACK_DNB_HYBRID_MODE_ID,
  type GameModeId,
  type JourneyStrategyConfig,
  type ModeSettings,
  type UserSettings,
  type SettingsPort,
} from '@neurodual/logic';
import { featureFlags } from '../config/feature-flags';
import {
  getReliabilityForGameMode as getReliabilityForGameModeFromConfig,
  isGameModeVisibleForAccess as isGameModeVisibleForAccessFromConfig,
  isReliabilityVisible as isReliabilityVisibleFromConfig,
  type FeatureAccessFlags,
  type ReliabilityLevel,
} from '../config/mode-reliability';
import { persistThemeHint, updateNativeTheme } from '../utils/native-theme';

export type { FeatureAccessFlags, ReliabilityLevel };
// =============================================================================
// Zone Layout Types (2D free-form layout editor)
// =============================================================================

/** Absolute pixel position/size for a single game zone */
export interface ZoneRect {
  x: number; // px from container left
  y: number; // px from container top
  w: number; // px width
  h: number; // px height
}

/** Per-zone 2D layouts (null = default CSS grid layout) */
export interface GameZoneLayouts {
  header: ZoneRect;
  game: ZoneRect;
  controls?: ZoneRect; // optional — Dual Trace has no controls zone
}

// Module-level adapter storage (injected via initSettingsStore)
let _settingsAdapter: SettingsPort | null = null;

// =============================================================================
// Types
// =============================================================================

const EMPTY_MODE_SETTINGS: ModeSettings = Object.freeze({});

export type StimulusStyle = 'full' | 'dots' | 'stringart' | 'custom';
export type TempoGridStyle = 'classic' | 'trace';
export type StimulusColor =
  | 'black'
  | 'gray'
  | 'blue'
  | 'red'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'magenta';
export type TrainingReminderWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TraceWritingInputMethod = 'auto' | 'keyboard' | 'handwriting';

const DEFAULT_TRAINING_REMINDER_TIME = '20:00';
const DEFAULT_TRAINING_REMINDER_WEEKDAYS: TrainingReminderWeekday[] = [2, 3, 4, 5, 6];

function normalizeReminderTime(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return DEFAULT_TRAINING_REMINDER_TIME;
  return `${match[1]}:${match[2]}`;
}

function normalizeReminderWeekdays(weekdays: number[]): TrainingReminderWeekday[] {
  const unique = new Set<TrainingReminderWeekday>();
  for (const day of weekdays) {
    if (day >= 1 && day <= 7) {
      unique.add(day as TrainingReminderWeekday);
    }
  }
  return [...unique].sort((a, b) => a - b);
}

function normalizeStimulusColor(value: unknown, fallback: StimulusColor): StimulusColor {
  if (value === 'grey') return 'gray';
  const allowed: ReadonlySet<StimulusColor> = new Set([
    'black',
    'gray',
    'blue',
    'red',
    'green',
    'yellow',
    'purple',
    'orange',
    'cyan',
    'magenta',
  ]);
  return typeof value === 'string' && allowed.has(value as StimulusColor)
    ? (value as StimulusColor)
    : fallback;
}

/**
 * Algorithm versions for adaptive progression
 * - adaptive: Contrôleur adaptatif temps réel (ajustement trial-par-trial)
 * - meta-learning: Meta-learning 3 couches (profil + politique + contrôleur)
 * - jitter-adaptive: ISI variable avec jitter adaptatif (empêche le timing mental)
 */
export type ProgressionAlgorithmId = 'adaptive' | 'meta-learning' | 'jitter-adaptive';
// Reliability/access types are centralized in config/mode-reliability.ts

export type ColorModalityTheme = 'woven' | 'vivid';
export type UiAccentPreset = 'theme' | 'amber' | StimulusColor;
export type UiVisualThemePreset = 'default' | 'capture-hybrid';

export type UiTextScaleQuickPreset = 'system' | 'smaller' | 'larger' | 'largest';

export const UI_TEXT_SCALE_PERCENT_MIN = 80;
export const UI_TEXT_SCALE_PERCENT_MAX = 130;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeTextScalePercent(value: unknown, fallback = 100): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampInt(value, UI_TEXT_SCALE_PERCENT_MIN, UI_TEXT_SCALE_PERCENT_MAX);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return clampInt(parsed, UI_TEXT_SCALE_PERCENT_MIN, UI_TEXT_SCALE_PERCENT_MAX);
    }
  }
  return clampInt(fallback, UI_TEXT_SCALE_PERCENT_MIN, UI_TEXT_SCALE_PERCENT_MAX);
}

function quickPresetToPercent(preset: UiTextScaleQuickPreset): number {
  switch (preset) {
    case 'system':
      return 100;
    case 'smaller':
      return 92;
    case 'larger':
      return 108;
    case 'largest':
      return 116;
  }
}

function normalizeAccentPreset(value: unknown, fallback: UiAccentPreset = 'theme'): UiAccentPreset {
  // Backward compat: older builds stored a non-stimulus preset like 'default'.
  // Interpret it as "follow theme defaults".
  if (value === 'default' || value === 'theme') return 'theme';
  if (value === 'amber') return 'amber';
  const stimulusFallback: StimulusColor =
    fallback === 'theme' || fallback === 'amber' ? 'black' : fallback;
  return normalizeStimulusColor(value, stimulusFallback);
}

function normalizeVisualThemePreset(
  value: unknown,
  fallback: UiVisualThemePreset = 'default',
): UiVisualThemePreset {
  if (value === 'capture-hybrid') return 'capture-hybrid';
  if (value === 'default') return 'default';
  return fallback;
}

/**
 * Saved journey definition
 */
export interface SavedJourney {
  id: string;
  name: string;
  /** Optional i18n key for built-in journeys (preferred over `name`) */
  nameKey?: string;
  startLevel: number;
  targetLevel: number;
  isDefault: boolean;
  createdAt: number;
  /** Reliability level for this journey */
  reliability?: ReliabilityLevel;
  /**
   * Game mode for simulator journeys (e.g., 'dualnback-classic', 'sim-brainworkshop').
   * If set, the journey uses only this mode at each level (1 stage per level).
   * If undefined, uses the 4 journey modes (label, flow, rappel, reflexe).
   */
  gameMode?: string;
  /**
   * Current stage progress (1-indexed).
   * Synced from JourneyState projection when this journey is active.
   */
  currentStage?: number;
  /** Dedicated journey strategy config (preferred over legacy mode-scoped storage). */
  strategyConfig?: JourneyStrategyConfig;
}

// =============================================================================
// Free Training Presets (per mode)
// =============================================================================

/** UI patch captured alongside a preset (only mode-specific UI knobs). */
export interface FreeTrainingPresetUiPatch {
  traceIsiMs?: number;
  traceStimulusDurationMs?: number;
  traceFeedbackDurationMs?: number;
  traceRuleDisplayMs?: number;
  traceIntervalMs?: number;
  traceAdaptiveTimingEnabled?: boolean;
  traceWritingInputMethod?: TraceWritingInputMethod;
}

export interface FreeTrainingPreset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Snapshot of mode settings (what lives under `modes[modeId]`). */
  modeSettings: ModeSettings;
  /** Snapshot of UI-only knobs needed to fully restore some modes (e.g. Dual Trace). */
  uiPatch?: FreeTrainingPresetUiPatch;
  /** Optional journey-level strategy snapshot (used by journey presets). */
  journeyStrategyConfig?: JourneyStrategyConfig;
}

/** Built-in free training preset IDs (reserved). */
export const FREE_TRAINING_DEFAULT_PRESET_ID = '__free_training_default__';
export const FREE_TRAINING_RECOMMENDED_PRESET_ID = '__free_training_recommended__';
export const FREE_TRAINING_TRI_PRESET_ID = '__free_training_tri__';
export const FREE_TRAINING_QUAD_PRESET_ID = '__free_training_quad__';

/** Built-in journey preset IDs (reserved). */
export const JOURNEY_DEFAULT_PRESET_ID = '__journey_default__';
export const JOURNEY_RECOMMENDED_PRESET_ID = '__journey_recommended__';

/** Default journey IDs */
export const DEFAULT_JOURNEY_ID = DEFAULT_JOURNEY_ID_FROM_LOGIC;
export const DUALNBACK_CLASSIC_JOURNEY_ID = DUALNBACK_CLASSIC_JOURNEY_ID_FROM_LOGIC;
export const BRAINWORKSHOP_JOURNEY_ID = BRAINWORKSHOP_JOURNEY_ID_FROM_LOGIC;
export const NEURODUAL_MIX_JOURNEY_ID = NEURODUAL_MIX_JOURNEY_ID_FROM_LOGIC;
export const DUAL_TRACE_JOURNEY_ID = DUAL_TRACE_JOURNEY_ID_FROM_LOGIC;
export const DUAL_TRACK_JOURNEY_ID = DUAL_TRACK_JOURNEY_ID_FROM_LOGIC;
export const DUAL_TRACK_DNB_JOURNEY_ID = DUAL_TRACK_DNB_JOURNEY_ID_FROM_LOGIC;

const LEGACY_TO_CANONICAL_JOURNEY_ID: Record<string, string> = {
  // Legacy IDs used by older builds / stats UI
  classic: DEFAULT_JOURNEY_ID,
  'dualnback-classic': DUALNBACK_CLASSIC_JOURNEY_ID,
  'brainworkshop-journey': BRAINWORKSHOP_JOURNEY_ID,
  'sim-brainworkshop': BRAINWORKSHOP_JOURNEY_ID,
  'dual-trace': DUAL_TRACE_JOURNEY_ID,
  [DUAL_TRACK_EASY_JOURNEY_ID_FROM_LOGIC]: DUAL_TRACK_JOURNEY_ID,
  [DUAL_TRACK_MEDIUM_JOURNEY_ID_FROM_LOGIC]: DUAL_TRACK_JOURNEY_ID,
  'dual-track': DUAL_TRACK_JOURNEY_ID,
  [DUAL_TRACK_DNB_HYBRID_MODE_ID]: DUAL_TRACK_DNB_JOURNEY_ID,
};

function normalizeJourneyId(id: string): string {
  return LEGACY_TO_CANONICAL_JOURNEY_ID[id] ?? id;
}

export function getReliabilityForGameMode(gameMode?: string): ReliabilityLevel {
  return getReliabilityForGameModeFromConfig(gameMode);
}

export function isReliabilityVisible(
  reliability: ReliabilityLevel,
  access: FeatureAccessFlags,
): boolean {
  return isReliabilityVisibleFromConfig(reliability, access);
}

export function isGameModeVisibleForAccess(
  gameMode: string | undefined,
  access: FeatureAccessFlags,
): boolean {
  return isGameModeVisibleForAccessFromConfig(gameMode, access);
}

/**
 * Settings UI partagés entre tous les modes
 */
export interface UISettings {
  stimulusStyle: StimulusStyle;
  stimulusColor: StimulusColor;
  /** Color theme for the color modality: 'woven' (muted) or 'vivid' (bright) */
  colorModalityTheme: ColorModalityTheme;
  /** Custom image URL for stimulus (base64 data URL) */
  customImageUrl: string | null;
  /** String Art: number of points per branch (4-20) */
  stringArtPoints: number;
  /** UI click sounds (buttons, toggles, etc.) */
  buttonSoundsEnabled: boolean;
  /** Gameplay feedback sounds (correct/incorrect, etc.) */
  soundEnabled: boolean;
  voiceId: number;
  audioLanguage: string;
  /** Audio sync preset (removed — always 'default') */
  audioSyncPreset: 'default';
  /** Whether the user reports using Bluetooth headphones (UX hint, no detection) */
  usingBluetoothHeadphones: boolean;
  /** Runtime pink noise level (0.0–0.5, used with any sync_* preset) */
  pinkNoiseLevel: number;
  /** Binaural carrier frequency (fixed to 200 Hz for mobile compatibility) */
  binauralCarrierHz: 200;
  /** Whether the user has seen the one-time pink noise toast */
  hasSeenPinkNoiseToast: boolean;
  hapticEnabled: boolean;
  /**
   * Haptic strength preference (mainly affects web vibration).
   * - low: subtle feedback
   * - medium: default
   * - high: pronounced feedback (useful for eyes-free gameplay)
   */
  hapticIntensity: 'low' | 'medium' | 'high';
  /** Weekly local training reminders (native only) */
  trainingRemindersEnabled: boolean;
  /** Reminder time in HH:mm format */
  trainingReminderTime: string;
  /** Reminder weekdays (1=Sunday ... 7=Saturday) */
  trainingReminderWeekdays: TrainingReminderWeekday[];
  language: string;
  tutorialCompleted: boolean;
  /** Home onboarding overlay completed */
  homeOnboardingCompleted: boolean;
  journeyActive: boolean;
  /** Home: selected primary tab */
  homeTab: 'journey' | 'free' | 'challenge' | 'synergy';
  /** Challenge: duration in days (e.g. 20). */
  challengeTotalDays: number;
  /** Challenge: goal in minutes per day (e.g. 15). */
  challengeTargetMinutesPerDay: number;
  /**
   * Challenge: local day key (YYYY-MM-DD) when the challenge was started.
   * - null => not started yet (settings can still increase)
   * - set => challenge started (settings can only decrease)
   */
  challengeStartedAtDay: string | null;
  /**
   * Challenge: whether progression has started (any training logged since startedAtDay).
   * Used to lock minutes-per-day increases while preserving the ability to preview settings.
   */
  challengeHasProgress: boolean;
  /** Journey start level (1-10, default 1 = N-1) */
  journeyStartLevel: number;
  /** Journey target level (1-10, default 5 = N-5) */
  journeyTargetLevel: number;
  /** Beta features enabled (activated via /beta) */
  betaEnabled: boolean;
  /** Alpha features enabled (activated via secret code at /alpha) */
  alphaEnabled: boolean;
  /** Admin dashboard enabled (activated via secret code at /admin) */
  adminEnabled: boolean;
  /** Dev-only marker to apply experimental defaults once (does not affect store builds). */
  devExperimentalUnlocked?: boolean;
  /** Active journey ID */
  activeJourneyId: string;
  /** Dark mode preference */
  darkMode: boolean;
  /** UI accent preset (changes primary button/highlight color) */
  accentPreset: UiAccentPreset;
  /** Visual preset for screenshot-oriented captures */
  visualThemePreset: UiVisualThemePreset;

  /** App text size percent (multiplies typography tokens) */
  textScalePercent: number;

  /** Show the floating theme toggle during gameplay */
  showThemeToggleInGame: boolean;
  /** Reduce motion/animations for accessibility */
  reducedMotion: boolean;
  /** Offer local session recovery prompt after refresh/crash */
  sessionRecoveryEnabled: boolean;
  /** Dual Trace: inter-stimulus interval in ms (1500-10000) - for timed mode */
  traceIsiMs: number;
  /** Dual Trace: stimulus duration in ms (500-5000) - for self-paced mode */
  traceStimulusDurationMs: number;
  /** Dual Trace: feedback duration in ms (500-3000) - for self-paced mode */
  traceFeedbackDurationMs: number;
  /** Dual Trace: rule display duration in ms (500-3000) - for self-paced mode */
  traceRuleDisplayMs: number;
  /** Dual Trace: interval (blank gap) between trials in ms (0-2000) - for self-paced mode */
  traceIntervalMs: number;
  /** Dual Trace: adaptive timing enabled (auto-adjusts difficulty based on performance) */
  traceAdaptiveTimingEnabled: boolean;
  /** Dual Trace: writing/arithmetic input method (handwriting vs keyboard) */
  traceWritingInputMethod: TraceWritingInputMethod;
  /** Local profile: display name (used when not authenticated) */
  localDisplayName: string;
  /** Local profile: avatar ID (used when not authenticated) */
  localAvatarId: string;
  /** Unique player ID (UUID, generated on first launch, never changes) */
  playerId: string;
  /** Share anonymous stats for leaderboards/comparisons (opt-out, default true) */
  shareAnonymousStats: boolean;
  /** List of completed tutorial spec IDs */
  completedTutorials: string[];
  /** Sidebar pinned on desktop (persists across refreshes) */
  sidebarPinned: boolean;

  // ==========================================================================
  // Free Training Presets (sync + local)
  // ==========================================================================

  /** Presets by game mode (stored in settings UI blob so it syncs via settings cloud sync). */
  freeTrainingPresetsByMode: Partial<Record<GameModeId, FreeTrainingPreset[]>>;
  /** Currently selected preset ID for each mode (optional). */
  freeTrainingActivePresetIdByMode: Partial<Record<GameModeId, string>>;
  /** Optional default preset ID for each mode (used when no active preset is selected). */
  freeTrainingDefaultPresetIdByMode: Partial<Record<GameModeId, string>>;

  // ==========================================================================
  // Journey Presets + Settings (per journeyId)
  // ==========================================================================

  /** Presets by journeyId (stored in settings UI blob so it syncs). */
  journeyPresetsByJourneyId: Partial<Record<string, FreeTrainingPreset[]>>;
  /** Currently selected preset ID for each journey (optional). */
  journeyActivePresetIdByJourneyId: Partial<Record<string, string>>;
  /** Optional default preset ID for each journey (used when no active preset is selected). */
  journeyDefaultPresetIdByJourneyId: Partial<Record<string, string>>;
  /** Mode settings overrides scoped to a journey (journey simulator only). */
  journeyModeSettingsByJourneyId: Partial<Record<string, ModeSettings>>;

  // ==========================================================================
  // Layout Scale Settings
  // ==========================================================================

  /** Grid scale factor (0.7 - 1.3, default 1.0) */
  gridScale: number;
  /** Controls (buttons) scale factor (0.7 - 1.3, default 1.0) */
  controlsScale: number;
  /** Tempo session grid style */
  tempoGridStyle: TempoGridStyle;

  // ==========================================================================
  // Layout Order Settings (customizable game layout)
  // ==========================================================================

  /**
   * Order of the 3 game zones: 'header' (HUD), 'game' (grid), 'controls' (buttons)
   * Default: ['header', 'game', 'controls'] (HUD top, grid middle, buttons bottom)
   */
  gameLayoutOrder: ('header' | 'game' | 'controls')[];

  /**
   * Order of control buttons by modality ID
   * Default: null (uses effectiveModalities order from mode spec)
   * When set, overrides the default order for the active modalities
   */
  gameButtonOrder: string[] | null;

  /**
   * Custom zone heights as flex values (proportions)
   * Default: null (uses automatic sizing from useGameLayout)
   * When set, zones are sized proportionally based on these values
   * e.g., { header: 1, game: 4, controls: 2 } = header takes 1/7, game takes 4/7, controls takes 2/7
   */
  gameZoneHeights: { header: number; game: number; controls: number } | null;

  /**
   * Custom 2D zone layouts (absolute pixel positions/sizes).
   * Default: null (uses CSS grid with gameLayoutOrder + gameZoneHeights)
   * When set, zones are rendered with position:absolute using these values.
   */
  gameZoneLayouts: GameZoneLayouts | null;

  /**
   * Per-button absolute positions (used when gameZoneLayouts is set).
   * Keys are modality IDs (e.g. 'position', 'audio', 'color').
   * null = buttons render grouped in controls zone
   */
  gameButtonLayouts: Record<string, ZoneRect> | null;

  // ==========================================================================
  // Stats Page Filters (persisted preferences)
  // ==========================================================================

  /** Stats: Mode filter ('all' | 'DualTempo' | 'DualnbackClassic' | etc.) */
  statsMode: string;
  /** Stats: N-levels filter (empty = all, otherwise specific levels) */
  statsNLevels: number[];
  /** Stats: Modality filter (empty = all, otherwise specific modalities) */
  statsModalities: string[];
  /** Stats: Date range option ('all' | 'today' | 'week' | 'month') */
  statsDateOption: string;
  /** Stats: Active tab ('simple' | 'advanced' | 'history' | 'progression') */
  statsTab: string;
  /** Stats: Journey filter when mode is 'Journey' ('all' = all journeys, or specific journeyId) */
  statsJourneyFilter: string;
  /** Stats: Free training sub-filter when mode is 'Libre' ('all' = all game modes) */
  statsFreeModeFilter: string;
  /** How many sessions the binaural mute floating pill has been shown (0-3, hidden at 3) */
  binauralMuteShownCount: number;
  /** Favorite modes shown on Home free training carousel */
  favoriteModes: GameModeId[];
  /** Favorite journeys highlighted in settings */
  favoriteJourneyIds: string[];
  /** Selected tier filter in mode selector ('all' | 'incontournable' | 'notable' | 'catalogue') */
  modeTierFilter: string;
  /** Disabled calibration modalities (empty = all enabled). Using disabled list so new modalities are auto-enabled. */
  disabledCalibrationModalities: string[];
  /** Max calibration level (2-5, default 5). Caps how high the profile can progress. */
  calibrationMaxLevel: number;
}

export interface FreeTrainingSelectionState {
  selectedModeId: GameModeId;
}

export interface JourneyUiSelectionState {
  selectedJourneyId: string;
}

/**
 * State complet du store
 */
export interface SettingsState {
  // Loading state
  _initialized: boolean;

  /** Timestamp (ms) of last local settings change — used for LWW cloud sync. */
  _settingsUpdatedAt: number;

  // Legacy/current free-training mode (kept temporarily for backward compatibility)
  currentMode: GameModeId;

  // Explicit UI selection slices
  freeTraining: FreeTrainingSelectionState;
  journeyUi: JourneyUiSelectionState;

  // Saved journeys
  savedJourneys: SavedJourney[];

  // Settings par mode (chaque mode a son namespace isolé)
  modes: Record<GameModeId, ModeSettings>;

  // Settings UI partagés
  ui: UISettings;

  // Actions - Mode
  setCurrentMode: (mode: GameModeId) => void;

  // Actions - Mode Settings (modifie UNIQUEMENT le mode actif)
  setModeSetting: <K extends keyof ModeSettings>(key: K, value: ModeSettings[K]) => void;
  setModeSettingFor: <K extends keyof ModeSettings>(
    modeId: GameModeId,
    key: K,
    value: ModeSettings[K],
  ) => void;
  getModeSettings: (modeId?: GameModeId) => ModeSettings;

  // Actions - UI Settings
  setStimulusStyle: (style: StimulusStyle) => void;
  setStimulusColor: (color: StimulusColor) => void;
  setColorModalityTheme: (theme: ColorModalityTheme) => void;
  setCustomImageUrl: (url: string | null) => void;
  setStringArtPoints: (points: number) => void;
  setButtonSoundsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setVoiceId: (id: number) => void;
  setAudioLanguage: (lang: string) => void;
  setAudioSyncPreset: (preset: 'default') => void;
  setUsingBluetoothHeadphones: (using: boolean) => void;
  setPinkNoiseLevel: (level: number) => void;
  setBinauralCarrierHz: (hz: 200) => void;
  setHasSeenPinkNoiseToast: (seen: boolean) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setHapticIntensity: (intensity: UISettings['hapticIntensity']) => void;
  setTrainingRemindersEnabled: (enabled: boolean) => void;
  setTrainingReminderTime: (time: string) => void;
  setTrainingReminderWeekdays: (weekdays: TrainingReminderWeekday[]) => void;
  toggleTrainingReminderWeekday: (weekday: TrainingReminderWeekday) => void;
  setLanguage: (lang: string) => void;
  setTutorialCompleted: (completed: boolean) => void;
  setHomeOnboardingCompleted: (completed: boolean) => void;
  setJourneyActive: (active: boolean) => void;
  setHomeTab: (tab: 'journey' | 'free' | 'challenge' | 'synergy') => void;
  setChallengeTotalDays: (days: number) => void;
  setChallengeTargetMinutesPerDay: (minutes: number) => void;
  setChallengeStartedAtDay: (day: string | null) => void;
  setChallengeHasProgress: (hasProgress: boolean) => void;
  setJourneyStartLevel: (level: number) => void;
  setJourneyTargetLevel: (level: number) => void;
  setBetaEnabled: (enabled: boolean) => void;
  setAlphaEnabled: (enabled: boolean) => void;
  setAdminEnabled: (enabled: boolean) => void;
  setDarkMode: (enabled: boolean) => void;
  setAccentPreset: (preset: UiAccentPreset) => void;
  setVisualThemePreset: (preset: UiVisualThemePreset) => void;
  setTextScalePercent: (percent: number) => void;
  setTextScaleQuickPreset: (preset: UiTextScaleQuickPreset) => void;
  setShowThemeToggleInGame: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setSessionRecoveryEnabled: (enabled: boolean) => void;
  setTraceIsiMs: (value: number) => void;
  setTraceStimulusDurationMs: (value: number) => void;
  setTraceFeedbackDurationMs: (value: number) => void;
  setTraceRuleDisplayMs: (value: number) => void;
  setTraceIntervalMs: (value: number) => void;
  setTraceAdaptiveTimingEnabled: (enabled: boolean) => void;
  setTraceWritingInputMethod: (value: TraceWritingInputMethod) => void;
  setLocalDisplayName: (name: string) => void;
  setLocalAvatarId: (id: string) => void;
  setShareAnonymousStats: (enabled: boolean) => void;
  setSidebarPinned: (pinned: boolean) => void;
  addCompletedTutorial: (specId: string) => void;
  toggleFavoriteMode: (modeId: GameModeId) => void;
  toggleFavoriteJourney: (journeyId: string) => void;
  setModeTierFilter: (filter: string) => void;
  toggleCalibrationModality: (modality: string) => void;
  setCalibrationMaxLevel: (level: number) => void;

  // Actions - Free Training Presets
  /** Ensure the built-in "Default" preset exists for this mode and is set as the default preset ID. */
  ensureFreeTrainingDefaultPreset: (modeId: GameModeId) => void;
  /** Apply the built-in "Recommended" preset (not persisted as a user preset). */
  applyFreeTrainingRecommendedPreset: (modeId: GameModeId) => void;
  applyFreeTrainingTemplatePreset: (
    modeId: GameModeId,
    templateId:
      | typeof FREE_TRAINING_RECOMMENDED_PRESET_ID
      | typeof FREE_TRAINING_TRI_PRESET_ID
      | typeof FREE_TRAINING_QUAD_PRESET_ID,
  ) => void;
  createFreeTrainingPreset: (
    modeId: GameModeId,
    name: string,
    options?: { setActive?: boolean; setAsDefault?: boolean },
  ) => string;
  applyFreeTrainingPreset: (modeId: GameModeId, presetId: string) => void;
  clearFreeTrainingPresetSelection: (modeId: GameModeId) => void;
  overwriteFreeTrainingPreset: (modeId: GameModeId, presetId: string) => void;
  renameFreeTrainingPreset: (modeId: GameModeId, presetId: string, name: string) => void;
  deleteFreeTrainingPreset: (modeId: GameModeId, presetId: string) => void;
  setDefaultFreeTrainingPreset: (modeId: GameModeId, presetId: string | null) => void;

  // Actions - Journey (Parcours) Settings + Presets
  getJourneyModeSettings: (journeyId: string) => ModeSettings;
  setJourneyModeSetting: <K extends keyof ModeSettings>(
    journeyId: string,
    key: K,
    value: ModeSettings[K],
  ) => void;
  getJourneyStrategyConfig: (journeyId: string) => JourneyStrategyConfig | undefined;
  setJourneyStrategyConfig: (journeyId: string, strategyConfig: JourneyStrategyConfig) => void;
  ensureJourneyDefaultPreset: (journeyId: string, modeId: GameModeId) => void;
  applyJourneyRecommendedPreset: (
    journeyId: string,
    modeId: GameModeId,
    options?: { preserveKeys?: readonly string[] },
  ) => void;
  /**
   * Import a free-training preset (profile) into a journey-scoped preset, and apply it.
   * Returns the created journey preset id, or null if the source preset cannot be found.
   */
  importFreeTrainingPresetToJourney: (
    journeyId: string,
    modeId: GameModeId,
    freeTrainingPresetId: string,
  ) => string | null;
  /**
   * Apply a free-training profile/template to a journey's mode settings (journey-scoped).
   * Keeps the source of truth centralized in free-training presets.
   */
  applyJourneyModeSettingsFromFreeTrainingProfile: (
    journeyId: string,
    modeId: GameModeId,
    profileId:
      | typeof FREE_TRAINING_DEFAULT_PRESET_ID
      | typeof FREE_TRAINING_RECOMMENDED_PRESET_ID
      | typeof FREE_TRAINING_TRI_PRESET_ID
      | typeof FREE_TRAINING_QUAD_PRESET_ID
      | string,
  ) => void;
  createJourneyPreset: (
    journeyId: string,
    name: string,
    options?: { setActive?: boolean; setAsDefault?: boolean },
  ) => string;
  applyJourneyPreset: (
    journeyId: string,
    presetId: string,
    options?: { preserveKeys?: readonly string[] },
  ) => void;
  clearJourneyPresetSelection: (journeyId: string) => void;
  overwriteJourneyPreset: (journeyId: string, presetId: string) => void;
  renameJourneyPreset: (journeyId: string, presetId: string, name: string) => void;
  deleteJourneyPreset: (journeyId: string, presetId: string) => void;
  setDefaultJourneyPreset: (journeyId: string, presetId: string | null) => void;

  // Actions - Layout Scale
  setGridScale: (scale: number) => void;
  setControlsScale: (scale: number) => void;
  setTempoGridStyle: (style: TempoGridStyle) => void;

  // Actions - Layout Order
  setGameLayoutOrder: (order: ('header' | 'game' | 'controls')[]) => void;
  setGameButtonOrder: (order: string[] | null) => void;
  setGameZoneHeights: (heights: { header: number; game: number; controls: number } | null) => void;
  setGameZoneLayouts: (layouts: GameZoneLayouts | null) => void;
  setGameButtonLayouts: (layouts: Record<string, ZoneRect> | null) => void;
  resetGameLayout: () => void;

  // Actions - Stats Page Filters
  setStatsMode: (mode: string) => void;
  setStatsNLevels: (levels: number[]) => void;
  setStatsModalities: (modalities: string[]) => void;
  setStatsDateOption: (option: string) => void;
  setStatsTab: (tab: string) => void;
  setStatsJourneyFilter: (filter: string) => void;
  setStatsFreeModeFilter: (filter: string) => void;
  setBinauralMuteShownCount: (count: number) => void;

  // Actions - Journey Management
  createJourney: (
    name: string,
    startLevel: number,
    targetLevel: number,
    gameMode?: string,
  ) => string;
  renameJourney: (id: string, name: string) => void;
  deleteJourney: (id: string) => void;
  activateJourney: (id: string) => void;
  getActiveJourney: () => SavedJourney | undefined;
  updateActiveJourneyLevels: (startLevel: number, targetLevel: number) => void;
  /**
   * Expand a journey downward when projections detect that the user regressed below the configured
   * startLevel (e.g., BrainWorkshop 3 strikes at level 1 of a journey starting at N=2).
   *
   * This is idempotent and will only lower the startLevel (never raise it).
   */
  expandJourneyStartLevel: (journeyId: string, suggestedStartLevel: number) => void;
  updateJourneyProgress: (journeyId: string, currentStage: number) => void;

  // Internal - Load from SQLite
  _loadSettings: (settings: UserSettings) => void;
}

// =============================================================================
// Player ID Generation
// =============================================================================

/** Generate a unique player ID (UUID v4) */
function generatePlayerId(): string {
  return crypto.randomUUID();
}

function generatePresetId(): string {
  try {
    // crypto.randomUUID is supported on modern browsers.
    return crypto.randomUUID();
  } catch {
    return `preset_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function getPresetUiPatchForMode(modeId: GameModeId, ui: UISettings): FreeTrainingPresetUiPatch {
  // Only capture UI-only knobs that materially change the selected mode behavior.
  if (modeId !== 'dual-trace' && modeId !== 'custom') {
    return {};
  }
  return {
    traceIsiMs: ui.traceIsiMs,
    traceStimulusDurationMs: ui.traceStimulusDurationMs,
    traceFeedbackDurationMs: ui.traceFeedbackDurationMs,
    traceRuleDisplayMs: ui.traceRuleDisplayMs,
    traceIntervalMs: ui.traceIntervalMs,
    traceAdaptiveTimingEnabled: ui.traceAdaptiveTimingEnabled,
    traceWritingInputMethod: ui.traceWritingInputMethod,
  };
}

function normalizeFreeTrainingPresetsByMode(
  value: unknown,
): Partial<Record<GameModeId, FreeTrainingPreset[]>> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;

  const result: Partial<Record<GameModeId, FreeTrainingPreset[]>> = {};
  for (const [modeId, presets] of Object.entries(obj)) {
    if (!Array.isArray(presets)) continue;
    const normalized: FreeTrainingPreset[] = [];

    for (const p of presets) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as Record<string, unknown>;
      const id = typeof rec['id'] === 'string' ? (rec['id'] as string) : null;
      const name = typeof rec['name'] === 'string' ? (rec['name'] as string) : null;
      const createdAt = typeof rec['createdAt'] === 'number' ? (rec['createdAt'] as number) : 0;
      const updatedAt =
        typeof rec['updatedAt'] === 'number' ? (rec['updatedAt'] as number) : createdAt;
      const modeSettings = (rec['modeSettings'] as ModeSettings | undefined) ?? {};

      if (!id || !name) continue;
      normalized.push({
        id,
        name,
        createdAt,
        updatedAt,
        modeSettings,
        journeyStrategyConfig:
          rec['journeyStrategyConfig'] && typeof rec['journeyStrategyConfig'] === 'object'
            ? (rec['journeyStrategyConfig'] as JourneyStrategyConfig)
            : undefined,
        uiPatch:
          rec['uiPatch'] && typeof rec['uiPatch'] === 'object'
            ? (rec['uiPatch'] as FreeTrainingPresetUiPatch)
            : undefined,
      });
    }

    if (normalized.length > 0) {
      result[modeId as GameModeId] = normalized;
    }
  }

  return result;
}

function normalizePresetIdMap(value: unknown): Partial<Record<GameModeId, string>> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const result: Partial<Record<GameModeId, string>> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > 0) {
      result[k as GameModeId] = v;
    }
  }
  return result;
}

function normalizeStringIdMap(value: unknown): Partial<Record<string, string>> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const result: Partial<Record<string, string>> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > 0) {
      result[k] = v;
    }
  }
  return result;
}

function normalizeJourneyPresetsByJourneyId(
  value: unknown,
): Partial<Record<string, FreeTrainingPreset[]>> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;

  const result: Partial<Record<string, FreeTrainingPreset[]>> = {};
  for (const [journeyId, presets] of Object.entries(obj)) {
    if (!Array.isArray(presets)) continue;
    const normalized: FreeTrainingPreset[] = [];

    for (const p of presets) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as Record<string, unknown>;
      const id = typeof rec['id'] === 'string' ? (rec['id'] as string) : null;
      const name = typeof rec['name'] === 'string' ? (rec['name'] as string) : null;
      const createdAt = typeof rec['createdAt'] === 'number' ? (rec['createdAt'] as number) : 0;
      const updatedAt =
        typeof rec['updatedAt'] === 'number' ? (rec['updatedAt'] as number) : createdAt;
      const modeSettings = (rec['modeSettings'] as ModeSettings | undefined) ?? {};

      if (!id || !name) continue;
      normalized.push({
        id,
        name,
        createdAt,
        updatedAt,
        modeSettings,
        journeyStrategyConfig:
          rec['journeyStrategyConfig'] && typeof rec['journeyStrategyConfig'] === 'object'
            ? (rec['journeyStrategyConfig'] as JourneyStrategyConfig)
            : undefined,
        uiPatch:
          rec['uiPatch'] && typeof rec['uiPatch'] === 'object'
            ? (rec['uiPatch'] as FreeTrainingPresetUiPatch)
            : undefined,
      });
    }

    if (normalized.length > 0) {
      result[journeyId] = normalized;
    }
  }

  return result;
}

function normalizeModeSettingsByJourneyId(value: unknown): Partial<Record<string, ModeSettings>> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const result: Partial<Record<string, ModeSettings>> = {};
  for (const [journeyId, settings] of Object.entries(obj)) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) continue;
    result[journeyId] = settings as ModeSettings;
  }
  return result;
}

function normalizeJourneyStrategyConfig(
  value: unknown,
  _gameMode?: string,
  _legacyModeSettings?: ModeSettings,
): JourneyStrategyConfig | undefined {
  const strategyCandidate =
    value && typeof value === 'object' ? (value as JourneyStrategyConfig) : undefined;
  return strategyCandidate;
}

function migrateJourneyWithStrategy(
  journey: SavedJourney,
  legacyModeSettings?: ModeSettings,
): SavedJourney {
  if (journey.gameMode !== DUAL_TRACK_DNB_HYBRID_MODE_ID) {
    return journey;
  }
  return {
    ...journey,
    strategyConfig:
      normalizeJourneyStrategyConfig(
        journey.strategyConfig,
        journey.gameMode,
        legacyModeSettings,
      ) ?? ({ trackSessionsPerBlock: 3, dnbSessionsPerBlock: 3 } as JourneyStrategyConfig),
  };
}

/** Generate default display name from player ID */
function generateDefaultDisplayName(playerId: string): string {
  // Use last 4 characters of UUID (hex digits)
  const suffix = playerId.slice(-4).toUpperCase();
  return `Joueur ${suffix}`;
}

// Generate once at module load (will be overwritten by persisted value if exists)
const INITIAL_PLAYER_ID = generatePlayerId();
const INITIAL_DISPLAY_NAME = generateDefaultDisplayName(INITIAL_PLAYER_ID);

// =============================================================================
// Defaults par mode (initialisés depuis le registry)
// =============================================================================

function getDefaultModeSettings(): Record<GameModeId, ModeSettings> {
  const defaults: Record<GameModeId, ModeSettings> = {} as Record<GameModeId, ModeSettings>;

  for (const mode of gameModeRegistry.getAll()) {
    const settings: ModeSettings = {};

    // Initialiser uniquement les settings configurables du mode
    for (const key of mode.configurableSettings) {
      if (key === 'algorithm') {
        settings.algorithm = 'rules-v1';
      } else if (
        // Brain Workshop: these values are derived automatically from the protocol
        // (ticks + trials formula). Storing them as explicit defaults would count as
        // a user override and would prevent faithful auto-adjustments.
        mode.id === 'sim-brainworkshop' &&
        (key === 'intervalSeconds' || key === 'stimulusDurationSeconds' || key === 'trialsCount')
      ) {
      } else if (key in mode.defaultConfig) {
        (settings as Record<string, unknown>)[key] =
          mode.defaultConfig[key as keyof typeof mode.defaultConfig];
      }
    }

    defaults[mode.id] = settings;
  }

  return defaults;
}

function getFreeTrainingTemplateModeSettings(
  modeId: GameModeId,
  templateId:
    | typeof FREE_TRAINING_RECOMMENDED_PRESET_ID
    | typeof FREE_TRAINING_TRI_PRESET_ID
    | typeof FREE_TRAINING_QUAD_PRESET_ID,
): ModeSettings {
  const base = getDefaultModeSettings()[modeId] ?? EMPTY_MODE_SETTINGS;

  if (modeId !== 'sim-brainworkshop') return base;

  if (templateId === FREE_TRAINING_TRI_PRESET_ID) {
    return { ...base, activeModalities: ['position', 'audio', 'color'] };
  }
  if (templateId === FREE_TRAINING_QUAD_PRESET_ID) {
    return { ...base, activeModalities: ['position', 'audio', 'color', 'image'] };
  }
  return base;
}

function sanitizeJourneyImportedModeSettings(
  modeId: GameModeId,
  input: ModeSettings,
): ModeSettings {
  if (modeId !== 'sim-brainworkshop') return input;
  const next = { ...input };
  // Brain Workshop faithful: these values are derived from the protocol and should not be persisted
  // as explicit overrides (would prevent auto-adjustments).
  delete (next as Partial<Record<string, unknown>>)['intervalSeconds'];
  delete (next as Partial<Record<string, unknown>>)['stimulusDurationSeconds'];
  delete (next as Partial<Record<string, unknown>>)['trialsCount'];
  return next;
}

const DEV_EXPERIMENTAL_DEFAULTS_ENABLED =
  featureFlags.devAppEnabled && featureFlags.experimentalModesEnabled;

function getDefaultJourneyModeSettingsByJourneyId(): Partial<Record<string, ModeSettings>> {
  return {
    [DUAL_TRACK_DNB_JOURNEY_ID]: {
      trackingLetterAudioEnabled: true,
      trialsCount: 5,
      crowdingMode: 'low',
      trackingSpeedMode: 'auto',
      motionComplexity: 'standard',
      trackingDurationMode: 'manual',
      trackingDurationMs: 6000,
    },
  };
}

const DEFAULT_UI_SETTINGS: UISettings = {
  stimulusStyle: 'full',
  stimulusColor: 'black',
  colorModalityTheme: 'vivid',
  customImageUrl: null,
  stringArtPoints: 10,
  buttonSoundsEnabled: true,
  soundEnabled: false,
  voiceId: 1,
  audioLanguage: 'auto',
  audioSyncPreset: 'default',
  pinkNoiseLevel: 0.15,
  binauralCarrierHz: 200,
  usingBluetoothHeadphones: false,
  hasSeenPinkNoiseToast: false,
  hapticEnabled: true,
  hapticIntensity: 'medium',
  trainingRemindersEnabled: false, // Off by default (opt-in)
  trainingReminderTime: DEFAULT_TRAINING_REMINDER_TIME, // Default reminder time: 20:00
  trainingReminderWeekdays: [...DEFAULT_TRAINING_REMINDER_WEEKDAYS], // Default: weekdays
  language: 'fr',
  tutorialCompleted: false,
  homeOnboardingCompleted: false,
  journeyActive: true, // Journey enabled by default for new users
  homeTab: 'free',
  challengeTotalDays: 20,
  challengeTargetMinutesPerDay: 15,
  challengeStartedAtDay: null,
  challengeHasProgress: false,
  journeyStartLevel: 1, // Default start: N-1
  journeyTargetLevel: 5, // Default target: N-5 (20 stages)
  betaEnabled: DEV_EXPERIMENTAL_DEFAULTS_ENABLED, // Dev app: enabled by default
  alphaEnabled: DEV_EXPERIMENTAL_DEFAULTS_ENABLED, // Dev app: enabled by default
  adminEnabled: false, // Admin dashboard disabled by default
  activeJourneyId: DUAL_TRACK_DNB_JOURNEY_ID, // Default journey: Dual Track + Dual N-Back
  darkMode: false, // Light mode by default
  accentPreset: 'theme',
  visualThemePreset: 'default',
  textScalePercent: 100,
  showThemeToggleInGame: true, // Show in-game theme toggle by default
  reducedMotion: false, // Full animations by default
  sessionRecoveryEnabled: false, // Recovery prompt disabled by default (opt-in)
  traceIsiMs: 2500, // Default ISI: 2.5 seconds (range: 1500-10000)
  traceStimulusDurationMs: 1000, // Default stimulus duration: 1 second
  traceFeedbackDurationMs: 1000, // Default feedback duration: 1 second
  traceRuleDisplayMs: 1000, // Default rule display: 1 second
  traceIntervalMs: 500, // Default interval (blank gap): 0.5 second
  traceAdaptiveTimingEnabled: false, // Adaptive timing disabled by default
  traceWritingInputMethod: 'auto', // Auto: keyboard on desktop, handwriting on mobile
  localDisplayName: INITIAL_DISPLAY_NAME, // "Joueur XXXX" based on playerId
  localAvatarId: 'glasses', // Default avatar
  playerId: INITIAL_PLAYER_ID, // UUID generated at first launch
  shareAnonymousStats: true, // Opt-out by default (enabled)
  completedTutorials: [], // No tutorials completed initially
  sidebarPinned: false, // Sidebar not pinned by default
  // Free training presets
  freeTrainingPresetsByMode: {},
  freeTrainingActivePresetIdByMode: Object.fromEntries(
    gameModeRegistry.getAll().map((m) => [m.id, FREE_TRAINING_RECOMMENDED_PRESET_ID]),
  ),
  freeTrainingDefaultPresetIdByMode: {},
  // Journey presets + settings
  journeyPresetsByJourneyId: {},
  journeyActivePresetIdByJourneyId: {
    [DUALNBACK_CLASSIC_JOURNEY_ID]: JOURNEY_RECOMMENDED_PRESET_ID,
    [BRAINWORKSHOP_JOURNEY_ID]: JOURNEY_RECOMMENDED_PRESET_ID,
    [DUAL_TRACE_JOURNEY_ID]: JOURNEY_RECOMMENDED_PRESET_ID,
    [DUAL_TRACK_JOURNEY_ID]: JOURNEY_RECOMMENDED_PRESET_ID,
    [DUAL_TRACK_DNB_JOURNEY_ID]: JOURNEY_RECOMMENDED_PRESET_ID,
  },
  journeyDefaultPresetIdByJourneyId: {},
  journeyModeSettingsByJourneyId: getDefaultJourneyModeSettingsByJourneyId(),
  // Layout scale settings
  gridScale: 1.0, // Default: 100% (range: 0.7-1.3)
  controlsScale: 1.0, // Default: 100% (range: 0.7-1.3)
  tempoGridStyle: 'classic', // Default keeps existing tempo visual behavior
  // Layout order settings
  gameLayoutOrder: ['header', 'game', 'controls'], // Default: HUD top, grid middle, buttons bottom
  gameButtonOrder: null, // null = use effectiveModalities order from mode spec
  gameZoneHeights: null, // null = use automatic sizing from useGameLayout
  gameZoneLayouts: null, // null = use default CSS grid layout
  gameButtonLayouts: null, // null = buttons render as group in controls zone
  // Favorite modes (shown on Home free training carousel)
  favoriteModes: [
    'dualnback-classic',
    'sim-brainworkshop',
    'dual-track',
    'dual-trace',
  ] as GameModeId[],
  favoriteJourneyIds: [DUAL_TRACK_DNB_JOURNEY_ID, BRAINWORKSHOP_JOURNEY_ID, DUAL_TRACK_JOURNEY_ID],
  modeTierFilter: 'all',
  disabledCalibrationModalities: [], // All modalities enabled by default
  calibrationMaxLevel: 5, // Default max level: N-5
  // Stats page filters
  statsMode: 'all', // Default: show all sessions
  statsNLevels: [], // Show all N-levels by default (empty = all)
  statsModalities: [], // Show all modalities by default (empty = all)
  statsDateOption: 'all', // Show all time by default
  statsTab: 'history', // History tab by default
  statsJourneyFilter: 'all', // Default journey filter (used when mode is 'Journey')
  statsFreeModeFilter: 'all', // Default free training sub-filter (used when mode is 'Libre')
  binauralMuteShownCount: 0, // Floating mute pill shown count (hidden at ≥3)
};

/** Default journey definitions (SSOT in @neurodual/logic). */
const DEFAULT_JOURNEYS: SavedJourney[] = BUILT_IN_JOURNEYS.map((j) => ({
  id: j.id,
  name: j.name,
  nameKey: j.nameKey,
  startLevel: j.startLevel,
  targetLevel: j.targetLevel,
  isDefault: true,
  createdAt: 0,
  gameMode: j.gameMode,
  strategyConfig: j.strategyConfig,
  reliability: j.reliability,
}));

const FALLBACK_STABLE_MODE: GameModeId = 'dualnback-classic';

function getJourneyReliability(journey: SavedJourney): ReliabilityLevel {
  return journey.reliability ?? getReliabilityForGameMode(journey.gameMode);
}

function isJourneyVisibleForAccess(journey: SavedJourney, access: FeatureAccessFlags): boolean {
  return isReliabilityVisible(getJourneyReliability(journey), access);
}

function normalizeCurrentModeForAccess(
  currentMode: GameModeId,
  access: FeatureAccessFlags,
): GameModeId {
  return isGameModeVisibleForAccess(currentMode, access) ? currentMode : FALLBACK_STABLE_MODE;
}

function resolveActiveJourneyForAccess(
  savedJourneys: SavedJourney[],
  activeJourneyId: string,
  access: FeatureAccessFlags,
): SavedJourney | undefined {
  const normalizedActiveJourneyId = normalizeJourneyId(activeJourneyId);
  const activeJourney = savedJourneys.find((journey) => journey.id === normalizedActiveJourneyId);
  if (activeJourney && isJourneyVisibleForAccess(activeJourney, access)) {
    return activeJourney;
  }
  return savedJourneys.find((journey) => isJourneyVisibleForAccess(journey, access));
}

function sanitizeExperimentalFlags(ui: UISettings): UISettings {
  if (featureFlags.experimentalModesEnabled) {
    return ui;
  }
  return {
    ...ui,
    betaEnabled: false,
    alphaEnabled: false,
    adminEnabled: false,
  };
}

function resolveFeatureAccess(ui: UISettings): FeatureAccessFlags {
  return {
    betaEnabled: ui.betaEnabled,
    alphaEnabled: ui.alphaEnabled,
    prototypesEnabled: featureFlags.prototypesEnabled,
  };
}

function applyFeatureAccessGuards(
  currentMode: GameModeId,
  savedJourneys: SavedJourney[],
  ui: UISettings,
): { currentMode: GameModeId; ui: UISettings } {
  const sanitizedUi = sanitizeExperimentalFlags(ui);
  const access = resolveFeatureAccess(sanitizedUi);
  const guardedMode = normalizeCurrentModeForAccess(currentMode, access);
  const guardedJourney = resolveActiveJourneyForAccess(
    savedJourneys,
    sanitizedUi.activeJourneyId,
    access,
  );

  if (!guardedJourney) {
    return { currentMode: guardedMode, ui: sanitizedUi };
  }

  return {
    currentMode: guardedMode,
    ui: {
      ...sanitizedUi,
      activeJourneyId: guardedJourney.id,
      journeyStartLevel: guardedJourney.startLevel,
      journeyTargetLevel: guardedJourney.targetLevel,
    },
  };
}

function applyDocumentUiSettings(ui: Partial<UISettings> | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const isDarkMode = Boolean(ui?.darkMode);
  root.classList.toggle('dark', isDarkMode);

  const accentPreset = normalizeAccentPreset(ui?.accentPreset, 'theme');
  if (accentPreset === 'theme') {
    delete root.dataset['accent'];
  } else {
    root.dataset['accent'] = accentPreset;
  }

  const visualThemePreset = normalizeVisualThemePreset(ui?.visualThemePreset, 'default');
  if (visualThemePreset === 'default') {
    delete root.dataset['visualTheme'];
  } else {
    root.dataset['visualTheme'] = visualThemePreset;
  }

  root.classList.toggle('reduce-transparency-effects', visualThemePreset === 'capture-hybrid');

  const textScalePercent = normalizeTextScalePercent(ui?.textScalePercent, 100);
  root.style.setProperty('--ui-text-scale', String(textScalePercent / 100));
  root.classList.toggle('reduce-motion', Boolean(ui?.reducedMotion));
}

// =============================================================================
// Store
// =============================================================================

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    _initialized: false,
    _settingsUpdatedAt: 0,
    currentMode: FALLBACK_STABLE_MODE,
    freeTraining: { selectedModeId: FALLBACK_STABLE_MODE },
    journeyUi: { selectedJourneyId: DEFAULT_UI_SETTINGS.activeJourneyId },
    savedJourneys: [...DEFAULT_JOURNEYS],
    modes: getDefaultModeSettings(),
    ui: DEFAULT_UI_SETTINGS,

    // Actions - Mode
    setCurrentMode: (mode) =>
      set({ currentMode: mode, freeTraining: { selectedModeId: mode } }),

    // Actions - Mode Settings
    setModeSetting: (key, value) =>
      set((state) => ({
        modes: {
          ...state.modes,
          [state.currentMode]: {
            ...state.modes[state.currentMode],
            [key]: value,
          },
        },
      })),
    setModeSettingFor: (modeId, key, value) =>
      set((state) => ({
        modes: {
          ...state.modes,
          [modeId]: {
            ...state.modes[modeId],
            [key]: value,
          },
        },
      })),

    getModeSettings: (modeId) => {
      const state = get();
      const id = modeId ?? state.freeTraining.selectedModeId;
      return state.modes[id] ?? EMPTY_MODE_SETTINGS;
    },

    // Actions - Journey-scoped mode settings (isolated from free training)
    getJourneyModeSettings: (journeyId) => {
      const state = get();
      return state.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS;
    },
    setJourneyModeSetting: (journeyId, key, value) =>
      set((state) => {
        const prev = state.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS;
        return {
          ui: {
            ...state.ui,
            journeyModeSettingsByJourneyId: {
              ...state.ui.journeyModeSettingsByJourneyId,
              [journeyId]: {
                ...prev,
                [key]: value,
              },
            },
          },
        };
      }),
    getJourneyStrategyConfig: (journeyId) => {
      const state = get();
      const journey = state.savedJourneys.find((entry) => entry.id === journeyId);
      return journey?.strategyConfig;
    },
    setJourneyStrategyConfig: (journeyId, strategyConfig) =>
      set((state) => ({
        savedJourneys: state.savedJourneys.map((journey) =>
          journey.id === journeyId ? { ...journey, strategyConfig } : journey,
        ),
      })),

    // Actions - UI Settings
    setStimulusStyle: (style) => set((state) => ({ ui: { ...state.ui, stimulusStyle: style } })),
    setStimulusColor: (color) => set((state) => ({ ui: { ...state.ui, stimulusColor: color } })),
    setColorModalityTheme: (theme) =>
      set((state) => ({ ui: { ...state.ui, colorModalityTheme: theme } })),
    setCustomImageUrl: (url) => set((state) => ({ ui: { ...state.ui, customImageUrl: url } })),
    setStringArtPoints: (points) =>
      set((state) => ({ ui: { ...state.ui, stringArtPoints: points } })),
    setButtonSoundsEnabled: (enabled) =>
      set((state) => ({ ui: { ...state.ui, buttonSoundsEnabled: enabled } })),
    setSoundEnabled: (enabled) => set((state) => ({ ui: { ...state.ui, soundEnabled: enabled } })),
    setVoiceId: (id) => set((state) => ({ ui: { ...state.ui, voiceId: id } })),
    setAudioLanguage: (lang) => set((state) => ({ ui: { ...state.ui, audioLanguage: lang } })),
    setAudioSyncPreset: (preset) =>
      set((state) => ({ ui: { ...state.ui, audioSyncPreset: preset } })),
    setUsingBluetoothHeadphones: (using) =>
      set((state) => ({ ui: { ...state.ui, usingBluetoothHeadphones: using } })),
    setPinkNoiseLevel: (level) =>
      set((state) => ({ ui: { ...state.ui, pinkNoiseLevel: Math.max(0, Math.min(0.5, level)) } })),
    setBinauralCarrierHz: () => set((state) => ({ ui: { ...state.ui, binauralCarrierHz: 200 } })),
    setHasSeenPinkNoiseToast: (seen) =>
      set((state) => ({ ui: { ...state.ui, hasSeenPinkNoiseToast: seen } })),
    setHapticEnabled: (enabled) =>
      set((state) => ({ ui: { ...state.ui, hapticEnabled: enabled } })),
    setHapticIntensity: (intensity) =>
      set((state) => ({ ui: { ...state.ui, hapticIntensity: intensity } })),
    setTrainingRemindersEnabled: (enabled) =>
      set((state) => ({ ui: { ...state.ui, trainingRemindersEnabled: enabled } })),
    setTrainingReminderTime: (time) =>
      set((state) => ({
        ui: { ...state.ui, trainingReminderTime: normalizeReminderTime(time) },
      })),
    setTrainingReminderWeekdays: (weekdays) =>
      set((state) => {
        const normalized = normalizeReminderWeekdays(weekdays);
        return normalized.length === 0
          ? state
          : {
              ui: { ...state.ui, trainingReminderWeekdays: normalized },
            };
      }),
    toggleTrainingReminderWeekday: (weekday) =>
      set((state) => {
        const current = normalizeReminderWeekdays(state.ui.trainingReminderWeekdays);
        const exists = current.includes(weekday);

        // Keep at least one selected day to avoid "enabled but never fires".
        if (exists && current.length === 1) return state;

        const next = exists
          ? current.filter((day) => day !== weekday)
          : [...current, weekday].sort((a, b) => a - b);

        return {
          ui: { ...state.ui, trainingReminderWeekdays: next },
        };
      }),

    // Actions - Free Training Presets
    ensureFreeTrainingDefaultPreset: (modeId) =>
      set((state) => {
        const presets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const existingDefault = presets.find((p) => p.id === FREE_TRAINING_DEFAULT_PRESET_ID);

        // Always pin the "default preset id" pointer to the built-in Default slot.
        const isPinnedAlready =
          state.ui.freeTrainingDefaultPresetIdByMode[modeId] === FREE_TRAINING_DEFAULT_PRESET_ID;
        const nextDefaultMap = {
          ...state.ui.freeTrainingDefaultPresetIdByMode,
          [modeId]: FREE_TRAINING_DEFAULT_PRESET_ID,
        };

        if (existingDefault) {
          if (isPinnedAlready) return state;

          return {
            ui: {
              ...state.ui,
              freeTrainingDefaultPresetIdByMode: nextDefaultMap,
            },
          };
        }

        // Migration: if user had a legacy "default preset" selected, copy its snapshot
        // into the new Default slot so their experience stays consistent.
        const legacyDefaultId = state.ui.freeTrainingDefaultPresetIdByMode[modeId];
        const legacyPreset = legacyDefaultId ? presets.find((p) => p.id === legacyDefaultId) : null;

        const recommendedModeSettings = getDefaultModeSettings()[modeId] ?? EMPTY_MODE_SETTINGS;
        const recommendedUiPatch = getPresetUiPatchForMode(modeId, DEFAULT_UI_SETTINGS);

        const now = Date.now();
        const nextPreset: FreeTrainingPreset = {
          id: FREE_TRAINING_DEFAULT_PRESET_ID,
          name: 'Default',
          createdAt: now,
          updatedAt: now,
          modeSettings: legacyPreset?.modeSettings ?? recommendedModeSettings,
          uiPatch:
            legacyPreset?.uiPatch ??
            (Object.keys(recommendedUiPatch).length > 0 ? recommendedUiPatch : undefined),
        };

        const nextPresetsByMode = {
          ...state.ui.freeTrainingPresetsByMode,
          [modeId]: [nextPreset, ...presets],
        };

        return {
          ui: {
            ...state.ui,
            freeTrainingPresetsByMode: nextPresetsByMode,
            freeTrainingDefaultPresetIdByMode: nextDefaultMap,
          },
        };
      }),

    applyFreeTrainingRecommendedPreset: (modeId) =>
      set((state) => {
        const recommendedModeSettings = getFreeTrainingTemplateModeSettings(
          modeId,
          FREE_TRAINING_RECOMMENDED_PRESET_ID,
        );
        const recommendedUiPatch = getPresetUiPatchForMode(modeId, DEFAULT_UI_SETTINGS);

        return {
          modes: {
            ...state.modes,
            [modeId]: recommendedModeSettings,
          },
          ui: {
            ...state.ui,
            ...(recommendedUiPatch ?? {}),
            freeTrainingActivePresetIdByMode: {
              ...state.ui.freeTrainingActivePresetIdByMode,
              [modeId]: FREE_TRAINING_RECOMMENDED_PRESET_ID,
            },
          },
        };
      }),

    applyFreeTrainingTemplatePreset: (modeId, templateId) =>
      set((state) => {
        const modeSettings = getFreeTrainingTemplateModeSettings(modeId, templateId);
        const uiPatch = getPresetUiPatchForMode(modeId, DEFAULT_UI_SETTINGS);

        return {
          modes: {
            ...state.modes,
            [modeId]: modeSettings,
          },
          ui: {
            ...state.ui,
            ...(uiPatch ?? {}),
            freeTrainingActivePresetIdByMode: {
              ...state.ui.freeTrainingActivePresetIdByMode,
              [modeId]: templateId,
            },
          },
        };
      }),

    createFreeTrainingPreset: (modeId, rawName, options) => {
      const name = String(rawName ?? '').trim() || 'Preset';
      const setActive = options?.setActive ?? true;
      const setAsDefault = options?.setAsDefault ?? false;

      const id = generatePresetId();
      const now = Date.now();

      set((state) => {
        const currentModeSettings = state.modes[modeId] ?? EMPTY_MODE_SETTINGS;
        // Snapshot: prefer structuredClone if available, fallback to JSON clone.
        const snapshot: ModeSettings = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return structuredClone(currentModeSettings) as ModeSettings;
          } catch {
            return JSON.parse(JSON.stringify(currentModeSettings)) as ModeSettings;
          }
        })();

        const uiPatch = getPresetUiPatchForMode(modeId, state.ui);
        const nextPreset: FreeTrainingPreset = {
          id,
          name,
          createdAt: now,
          updatedAt: now,
          modeSettings: snapshot,
          uiPatch: Object.keys(uiPatch).length > 0 ? uiPatch : undefined,
        };

        const existing = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const nextPresetsByMode = {
          ...state.ui.freeTrainingPresetsByMode,
          [modeId]: [...existing, nextPreset],
        };

        const nextActive = setActive
          ? { ...state.ui.freeTrainingActivePresetIdByMode, [modeId]: id }
          : state.ui.freeTrainingActivePresetIdByMode;
        const nextDefault = setAsDefault
          ? { ...state.ui.freeTrainingDefaultPresetIdByMode, [modeId]: id }
          : state.ui.freeTrainingDefaultPresetIdByMode;

        return {
          ui: {
            ...state.ui,
            freeTrainingPresetsByMode: nextPresetsByMode,
            freeTrainingActivePresetIdByMode: nextActive,
            freeTrainingDefaultPresetIdByMode: nextDefault,
          },
        };
      });

      return id;
    },

    applyFreeTrainingPreset: (modeId, presetId) =>
      set((state) => {
        const presets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const preset = presets.find((p) => p.id === presetId);
        if (!preset) return state;

        const nextModeSettings = (preset.modeSettings ?? EMPTY_MODE_SETTINGS) as ModeSettings;

        return {
          modes: {
            ...state.modes,
            [modeId]: nextModeSettings,
          },
          ui: {
            ...state.ui,
            ...(preset.uiPatch ?? {}),
            freeTrainingActivePresetIdByMode: {
              ...state.ui.freeTrainingActivePresetIdByMode,
              [modeId]: preset.id,
            },
          },
        };
      }),

    clearFreeTrainingPresetSelection: (modeId) =>
      set((state) => {
        const next = { ...state.ui.freeTrainingActivePresetIdByMode };
        delete next[modeId];
        return {
          ui: { ...state.ui, freeTrainingActivePresetIdByMode: next },
        };
      }),

    overwriteFreeTrainingPreset: (modeId, presetId) =>
      set((state) => {
        const presets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const idx = presets.findIndex((p) => p.id === presetId);
        if (idx < 0) return state;

        const currentModeSettings = state.modes[modeId] ?? EMPTY_MODE_SETTINGS;
        const snapshot: ModeSettings = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return structuredClone(currentModeSettings) as ModeSettings;
          } catch {
            return JSON.parse(JSON.stringify(currentModeSettings)) as ModeSettings;
          }
        })();

        const uiPatch = getPresetUiPatchForMode(modeId, state.ui);
        const now = Date.now();
        const nextPresets = presets.map((p, i) =>
          i === idx
            ? {
                ...p,
                updatedAt: now,
                modeSettings: snapshot,
                uiPatch: Object.keys(uiPatch).length > 0 ? uiPatch : undefined,
              }
            : p,
        );

        return {
          ui: {
            ...state.ui,
            freeTrainingPresetsByMode: {
              ...state.ui.freeTrainingPresetsByMode,
              [modeId]: nextPresets,
            },
          },
        };
      }),

    renameFreeTrainingPreset: (modeId, presetId, rawName) =>
      set((state) => {
        if (presetId === FREE_TRAINING_DEFAULT_PRESET_ID) return state;
        const name = String(rawName ?? '').trim();
        if (!name) return state;
        const presets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const idx = presets.findIndex((p) => p.id === presetId);
        if (idx < 0) return state;
        const now = Date.now();
        const nextPresets = presets.map((p, i) => (i === idx ? { ...p, name, updatedAt: now } : p));
        return {
          ui: {
            ...state.ui,
            freeTrainingPresetsByMode: {
              ...state.ui.freeTrainingPresetsByMode,
              [modeId]: nextPresets,
            },
          },
        };
      }),

    deleteFreeTrainingPreset: (modeId, presetId) =>
      set((state) => {
        if (presetId === FREE_TRAINING_DEFAULT_PRESET_ID) return state;
        const presets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const nextPresets = presets.filter((p) => p.id !== presetId);

        const nextPresetsByMode = { ...state.ui.freeTrainingPresetsByMode };
        if (nextPresets.length === 0) {
          delete nextPresetsByMode[modeId];
        } else {
          nextPresetsByMode[modeId] = nextPresets;
        }

        const nextActive = { ...state.ui.freeTrainingActivePresetIdByMode };
        if (nextActive[modeId] === presetId) {
          delete nextActive[modeId];
        }

        const nextDefault = { ...state.ui.freeTrainingDefaultPresetIdByMode };
        if (nextDefault[modeId] === presetId) {
          delete nextDefault[modeId];
        }

        return {
          ui: {
            ...state.ui,
            freeTrainingPresetsByMode: nextPresetsByMode,
            freeTrainingActivePresetIdByMode: nextActive,
            freeTrainingDefaultPresetIdByMode: nextDefault,
          },
        };
      }),

    setDefaultFreeTrainingPreset: (modeId, presetId) =>
      set((state) => {
        const nextDefault = { ...state.ui.freeTrainingDefaultPresetIdByMode };
        if (!presetId) {
          delete nextDefault[modeId];
        } else {
          nextDefault[modeId] = presetId;
        }
        return {
          ui: { ...state.ui, freeTrainingDefaultPresetIdByMode: nextDefault },
        };
      }),

    // Actions - Journey (Parcours) Settings + Presets
    ensureJourneyDefaultPreset: (journeyId, modeId) =>
      set((state) => {
        const presets = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const existingDefault = presets.find((p) => p.id === JOURNEY_DEFAULT_PRESET_ID);
        const journey = state.savedJourneys.find((entry) => entry.id === journeyId);

        const nextDefaultMap = {
          ...state.ui.journeyDefaultPresetIdByJourneyId,
          [journeyId]: JOURNEY_DEFAULT_PRESET_ID,
        };

        if (existingDefault) {
          return {
            ui: {
              ...state.ui,
              journeyDefaultPresetIdByJourneyId: nextDefaultMap,
            },
          };
        }

        const recommendedModeSettings = getDefaultModeSettings()[modeId] ?? EMPTY_MODE_SETTINGS;
        const now = Date.now();
        const nextPreset: FreeTrainingPreset = {
          id: JOURNEY_DEFAULT_PRESET_ID,
          name: 'Default',
          createdAt: now,
          updatedAt: now,
          modeSettings: recommendedModeSettings,
          journeyStrategyConfig: journey?.strategyConfig,
        };

        const nextPresetsByJourneyId = {
          ...state.ui.journeyPresetsByJourneyId,
          [journeyId]: [nextPreset, ...presets],
        };

        return {
          ui: {
            ...state.ui,
            journeyPresetsByJourneyId: nextPresetsByJourneyId,
            journeyDefaultPresetIdByJourneyId: nextDefaultMap,
          },
        };
      }),

    applyJourneyRecommendedPreset: (journeyId, modeId, options) =>
      set((state) => {
        const journeyDefaults = getDefaultJourneyModeSettingsByJourneyId()[journeyId];
        const recommendedModeSettings = {
          ...(getDefaultModeSettings()[modeId] ?? EMPTY_MODE_SETTINGS),
          ...journeyDefaults,
        };
        const journey = state.savedJourneys.find((entry) => entry.id === journeyId);
        const preserveKeys = options?.preserveKeys ?? [];
        const prev = state.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS;

        const nextModeSettings: ModeSettings = { ...recommendedModeSettings };
        for (const key of preserveKeys) {
          const prevValue = (prev as Record<string, unknown>)[key];
          if (prevValue !== undefined) {
            (nextModeSettings as Record<string, unknown>)[key] = prevValue;
          }
        }

        return {
          ui: {
            ...state.ui,
            journeyModeSettingsByJourneyId: {
              ...state.ui.journeyModeSettingsByJourneyId,
              [journeyId]: nextModeSettings,
            },
            journeyActivePresetIdByJourneyId: {
              ...state.ui.journeyActivePresetIdByJourneyId,
              [journeyId]: JOURNEY_RECOMMENDED_PRESET_ID,
            },
          },
          savedJourneys: state.savedJourneys.map((entry) =>
            entry.id === journeyId && journey?.strategyConfig
              ? { ...entry, strategyConfig: journey.strategyConfig }
              : entry,
          ),
        };
      }),

    importFreeTrainingPresetToJourney: (journeyId, modeId, freeTrainingPresetId) => {
      const id = generatePresetId();
      const now = Date.now();
      let created: string | null = null;

      set((state) => {
        const freePresets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
        const src = freePresets.find((p) => p.id === freeTrainingPresetId);
        if (!src) return state;

        const snapshotRaw: ModeSettings = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return structuredClone((src.modeSettings ?? EMPTY_MODE_SETTINGS) as ModeSettings);
          } catch {
            return JSON.parse(
              JSON.stringify(src.modeSettings ?? EMPTY_MODE_SETTINGS),
            ) as ModeSettings;
          }
        })();
        const snapshot = sanitizeJourneyImportedModeSettings(modeId, snapshotRaw);

        const nextPreset: FreeTrainingPreset = {
          id,
          name: src.name,
          createdAt: now,
          updatedAt: now,
          modeSettings: snapshot,
        };

        const existingJourneyPresets = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const nextPresetsByJourneyId = {
          ...state.ui.journeyPresetsByJourneyId,
          [journeyId]: [...existingJourneyPresets, nextPreset],
        };

        created = id;
        return {
          ui: {
            ...state.ui,
            journeyModeSettingsByJourneyId: {
              ...state.ui.journeyModeSettingsByJourneyId,
              [journeyId]: snapshot,
            },
            journeyPresetsByJourneyId: nextPresetsByJourneyId,
            journeyActivePresetIdByJourneyId: {
              ...state.ui.journeyActivePresetIdByJourneyId,
              [journeyId]: id,
            },
          },
        };
      });

      return created;
    },

    applyJourneyModeSettingsFromFreeTrainingProfile: (journeyId, modeId, profileId) =>
      set((state) => {
        const snapshotRaw: ModeSettings | null = (() => {
          if (
            profileId === FREE_TRAINING_RECOMMENDED_PRESET_ID ||
            profileId === FREE_TRAINING_TRI_PRESET_ID ||
            profileId === FREE_TRAINING_QUAD_PRESET_ID
          ) {
            return getFreeTrainingTemplateModeSettings(modeId, profileId);
          }

          const freePresets = state.ui.freeTrainingPresetsByMode[modeId] ?? [];
          const src = freePresets.find((p) => p.id === profileId);
          if (!src) return null;
          return (src.modeSettings ?? EMPTY_MODE_SETTINGS) as ModeSettings;
        })();
        if (!snapshotRaw) return state;

        const snapshot = sanitizeJourneyImportedModeSettings(modeId, snapshotRaw);
        return {
          ui: {
            ...state.ui,
            journeyModeSettingsByJourneyId: {
              ...state.ui.journeyModeSettingsByJourneyId,
              [journeyId]: snapshot,
            },
            journeyActivePresetIdByJourneyId: {
              ...state.ui.journeyActivePresetIdByJourneyId,
              [journeyId]: profileId,
            },
          },
        };
      }),

    createJourneyPreset: (journeyId, rawName, options) => {
      const name = String(rawName ?? '').trim() || 'Preset';
      const setActive = options?.setActive ?? true;
      const setAsDefault = options?.setAsDefault ?? false;

      const id = generatePresetId();
      const now = Date.now();

      set((state) => {
        const currentJourneySettings =
          state.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS;
        const currentJourney = state.savedJourneys.find((entry) => entry.id === journeyId);
        const snapshot: ModeSettings = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return structuredClone(currentJourneySettings) as ModeSettings;
          } catch {
            return JSON.parse(JSON.stringify(currentJourneySettings)) as ModeSettings;
          }
        })();

        const nextPreset: FreeTrainingPreset = {
          id,
          name,
          createdAt: now,
          updatedAt: now,
          modeSettings: snapshot,
          journeyStrategyConfig: currentJourney?.strategyConfig,
        };

        const existing = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const nextPresetsByJourneyId = {
          ...state.ui.journeyPresetsByJourneyId,
          [journeyId]: [...existing, nextPreset],
        };

        const nextActive = setActive
          ? { ...state.ui.journeyActivePresetIdByJourneyId, [journeyId]: id }
          : state.ui.journeyActivePresetIdByJourneyId;
        const nextDefault = setAsDefault
          ? { ...state.ui.journeyDefaultPresetIdByJourneyId, [journeyId]: id }
          : state.ui.journeyDefaultPresetIdByJourneyId;

        return {
          ui: {
            ...state.ui,
            journeyPresetsByJourneyId: nextPresetsByJourneyId,
            journeyActivePresetIdByJourneyId: nextActive,
            journeyDefaultPresetIdByJourneyId: nextDefault,
          },
        };
      });

      return id;
    },

    applyJourneyPreset: (journeyId, presetId, options) =>
      set((state) => {
        const presets = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const preset = presets.find((p) => p.id === presetId);
        if (!preset) return state;

        const preserveKeys = options?.preserveKeys ?? [];
        const prev = state.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS;

        const nextModeSettings: ModeSettings = {
          ...((preset.modeSettings ?? EMPTY_MODE_SETTINGS) as ModeSettings),
        };
        for (const key of preserveKeys) {
          const prevValue = (prev as Record<string, unknown>)[key];
          if (prevValue !== undefined) {
            (nextModeSettings as Record<string, unknown>)[key] = prevValue;
          }
        }

        return {
          savedJourneys: state.savedJourneys.map((journey) =>
            journey.id === journeyId
              ? {
                  ...journey,
                  strategyConfig: preset.journeyStrategyConfig ?? journey.strategyConfig,
                }
              : journey,
          ),
          ui: {
            ...state.ui,
            journeyModeSettingsByJourneyId: {
              ...state.ui.journeyModeSettingsByJourneyId,
              [journeyId]: nextModeSettings,
            },
            journeyActivePresetIdByJourneyId: {
              ...state.ui.journeyActivePresetIdByJourneyId,
              [journeyId]: preset.id,
            },
          },
        };
      }),

    clearJourneyPresetSelection: (journeyId) =>
      set((state) => {
        const next = { ...state.ui.journeyActivePresetIdByJourneyId };
        delete next[journeyId];
        return {
          ui: { ...state.ui, journeyActivePresetIdByJourneyId: next },
        };
      }),

    overwriteJourneyPreset: (journeyId, presetId) =>
      set((state) => {
        const presets = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const idx = presets.findIndex((p) => p.id === presetId);
        if (idx < 0) return state;

        const currentJourneySettings =
          state.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS;
        const currentJourney = state.savedJourneys.find((entry) => entry.id === journeyId);
        const snapshot: ModeSettings = (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return structuredClone(currentJourneySettings) as ModeSettings;
          } catch {
            return JSON.parse(JSON.stringify(currentJourneySettings)) as ModeSettings;
          }
        })();

        const now = Date.now();
        const nextPresets = presets.map((p, i) =>
          i === idx
            ? {
                ...p,
                updatedAt: now,
                modeSettings: snapshot,
                journeyStrategyConfig: currentJourney?.strategyConfig,
                uiPatch: undefined,
              }
            : p,
        );

        return {
          ui: {
            ...state.ui,
            journeyPresetsByJourneyId: {
              ...state.ui.journeyPresetsByJourneyId,
              [journeyId]: nextPresets,
            },
          },
        };
      }),

    renameJourneyPreset: (journeyId, presetId, rawName) =>
      set((state) => {
        if (presetId === JOURNEY_DEFAULT_PRESET_ID) return state;
        const name = String(rawName ?? '').trim();
        if (!name) return state;
        const presets = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const idx = presets.findIndex((p) => p.id === presetId);
        if (idx < 0) return state;
        const now = Date.now();
        const nextPresets = presets.map((p, i) => (i === idx ? { ...p, name, updatedAt: now } : p));
        return {
          ui: {
            ...state.ui,
            journeyPresetsByJourneyId: {
              ...state.ui.journeyPresetsByJourneyId,
              [journeyId]: nextPresets,
            },
          },
        };
      }),

    deleteJourneyPreset: (journeyId, presetId) =>
      set((state) => {
        if (presetId === JOURNEY_DEFAULT_PRESET_ID) return state;
        const presets = state.ui.journeyPresetsByJourneyId[journeyId] ?? [];
        const nextPresets = presets.filter((p) => p.id !== presetId);

        const nextPresetsByJourneyId = { ...state.ui.journeyPresetsByJourneyId };
        if (nextPresets.length === 0) {
          delete nextPresetsByJourneyId[journeyId];
        } else {
          nextPresetsByJourneyId[journeyId] = nextPresets;
        }

        const nextActive = { ...state.ui.journeyActivePresetIdByJourneyId };
        if (nextActive[journeyId] === presetId) {
          delete nextActive[journeyId];
        }

        const nextDefault = { ...state.ui.journeyDefaultPresetIdByJourneyId };
        if (nextDefault[journeyId] === presetId) {
          delete nextDefault[journeyId];
        }

        return {
          ui: {
            ...state.ui,
            journeyPresetsByJourneyId: nextPresetsByJourneyId,
            journeyActivePresetIdByJourneyId: nextActive,
            journeyDefaultPresetIdByJourneyId: nextDefault,
          },
        };
      }),

    setDefaultJourneyPreset: (journeyId, presetId) =>
      set((state) => {
        const nextDefault = { ...state.ui.journeyDefaultPresetIdByJourneyId };
        if (!presetId) {
          delete nextDefault[journeyId];
        } else {
          nextDefault[journeyId] = presetId;
        }
        return {
          ui: { ...state.ui, journeyDefaultPresetIdByJourneyId: nextDefault },
        };
      }),

    setLanguage: (lang) => set((state) => ({ ui: { ...state.ui, language: lang } })),
    setTutorialCompleted: (completed) =>
      set((state) => ({ ui: { ...state.ui, tutorialCompleted: completed } })),
    setHomeOnboardingCompleted: (completed) =>
      set((state) => ({ ui: { ...state.ui, homeOnboardingCompleted: completed } })),
    setJourneyActive: (active) => set((state) => ({ ui: { ...state.ui, journeyActive: active } })),
    setHomeTab: (tab) =>
      set((state) => ({
        ui: {
          ...state.ui,
          homeTab: tab,
          // Keep legacy boolean in sync (Home historically used journeyActive).
          journeyActive: tab === 'journey',
        },
      })),
    setChallengeTotalDays: (days) =>
      set((state) => {
        const next = Math.max(1, Math.min(365, Math.floor(days)));
        return { ui: { ...state.ui, challengeTotalDays: next } };
      }),
    setChallengeTargetMinutesPerDay: (minutes) =>
      set((state) => {
        const next = Math.max(1, Math.min(240, Math.floor(minutes)));
        const locked = state.ui.challengeHasProgress;
        const value = locked ? state.ui.challengeTargetMinutesPerDay : next;
        return { ui: { ...state.ui, challengeTargetMinutesPerDay: value } };
      }),
    setChallengeStartedAtDay: (day) =>
      set((state) => ({
        ui: { ...state.ui, challengeStartedAtDay: day ? String(day) : null },
      })),
    setChallengeHasProgress: (hasProgress) =>
      set((state) => ({
        ui: { ...state.ui, challengeHasProgress: Boolean(hasProgress) },
      })),
    setJourneyStartLevel: (level) =>
      set((state) => {
        const clampedLevel = Math.max(1, Math.min(10, level));
        // Ensure target >= start
        const newTarget = Math.max(clampedLevel, state.ui.journeyTargetLevel);
        return {
          ui: { ...state.ui, journeyStartLevel: clampedLevel, journeyTargetLevel: newTarget },
        };
      }),
    setJourneyTargetLevel: (level) =>
      set((state) => {
        const clampedLevel = Math.max(1, Math.min(10, level));
        // Ensure start <= target
        const newStart = Math.min(clampedLevel, state.ui.journeyStartLevel);
        return {
          ui: { ...state.ui, journeyTargetLevel: clampedLevel, journeyStartLevel: newStart },
        };
      }),
    setBetaEnabled: (enabled) =>
      set((state) => {
        const nextUi = { ...state.ui, betaEnabled: enabled };
        const guarded = applyFeatureAccessGuards(state.currentMode, state.savedJourneys, nextUi);
        return {
          currentMode: guarded.currentMode,
          ui: guarded.ui,
        };
      }),
    setAlphaEnabled: (enabled) =>
      set((state) => {
        const nextUi = { ...state.ui, alphaEnabled: enabled };
        const guarded = applyFeatureAccessGuards(state.currentMode, state.savedJourneys, nextUi);
        return {
          currentMode: guarded.currentMode,
          ui: guarded.ui,
        };
      }),
    setAdminEnabled: (enabled) =>
      set((state) => ({ ui: sanitizeExperimentalFlags({ ...state.ui, adminEnabled: enabled }) })),
    setDarkMode: (enabled) => {
      applyDocumentUiSettings({ ...get().ui, darkMode: enabled });
      persistThemeHint(enabled);
      void updateNativeTheme(enabled);
      set((state) => ({ ui: { ...state.ui, darkMode: enabled } }));
    },
    setAccentPreset: (preset) => {
      const normalized = normalizeAccentPreset(preset);
      applyDocumentUiSettings({ ...get().ui, accentPreset: normalized });
      set((state) => ({ ui: { ...state.ui, accentPreset: normalized } }));
    },
    setVisualThemePreset: (preset) => {
      const normalized = normalizeVisualThemePreset(preset);
      applyDocumentUiSettings({ ...get().ui, visualThemePreset: normalized });
      set((state) => ({ ui: { ...state.ui, visualThemePreset: normalized } }));
    },
    setTextScalePercent: (percent) => {
      const normalized = normalizeTextScalePercent(percent, 100);
      applyDocumentUiSettings({ ...get().ui, textScalePercent: normalized });
      set((state) => ({ ui: { ...state.ui, textScalePercent: normalized } }));
    },
    setTextScaleQuickPreset: (preset) => {
      const normalized = normalizeTextScalePercent(quickPresetToPercent(preset), 100);
      applyDocumentUiSettings({ ...get().ui, textScalePercent: normalized });
      set((state) => ({ ui: { ...state.ui, textScalePercent: normalized } }));
    },
    setShowThemeToggleInGame: (enabled) =>
      set((state) => ({ ui: { ...state.ui, showThemeToggleInGame: enabled } })),
    setReducedMotion: (enabled) => {
      applyDocumentUiSettings({ ...get().ui, reducedMotion: enabled });
      set((state) => ({ ui: { ...state.ui, reducedMotion: enabled } }));
    },
    setSessionRecoveryEnabled: (enabled) =>
      set((state) => ({ ui: { ...state.ui, sessionRecoveryEnabled: enabled } })),
    setTraceIsiMs: (value) =>
      set((state) => ({
        ui: { ...state.ui, traceIsiMs: Math.max(1500, Math.min(10000, value)) },
      })),
    setTraceStimulusDurationMs: (value) =>
      set((state) => ({
        ui: { ...state.ui, traceStimulusDurationMs: Math.max(200, Math.min(5000, value)) },
      })),
    setTraceFeedbackDurationMs: (value) =>
      set((state) => ({
        ui: { ...state.ui, traceFeedbackDurationMs: Math.max(200, Math.min(3000, value)) },
      })),
    setTraceRuleDisplayMs: (value) =>
      set((state) => ({
        ui: { ...state.ui, traceRuleDisplayMs: Math.max(200, Math.min(3000, value)) },
      })),
    setTraceIntervalMs: (value) =>
      set((state) => ({
        ui: { ...state.ui, traceIntervalMs: Math.max(0, Math.min(2000, value)) },
      })),
    setTraceAdaptiveTimingEnabled: (enabled) =>
      set((state) => ({
        ui: { ...state.ui, traceAdaptiveTimingEnabled: enabled },
      })),
    setTraceWritingInputMethod: (value) =>
      set((state) => ({
        ui: { ...state.ui, traceWritingInputMethod: value },
      })),
    setLocalDisplayName: (name) =>
      set((state) => ({ ui: { ...state.ui, localDisplayName: name.slice(0, 20) } })),
    setLocalAvatarId: (id) => set((state) => ({ ui: { ...state.ui, localAvatarId: id } })),
    setShareAnonymousStats: (enabled) =>
      set((state) => ({ ui: { ...state.ui, shareAnonymousStats: enabled } })),
    setSidebarPinned: (pinned) => set((state) => ({ ui: { ...state.ui, sidebarPinned: pinned } })),
    setGridScale: (scale) =>
      set((state) => ({
        ui: { ...state.ui, gridScale: Math.max(0.7, Math.min(1.3, scale)) },
      })),
    setControlsScale: (scale) =>
      set((state) => ({
        ui: { ...state.ui, controlsScale: Math.max(0.7, Math.min(1.3, scale)) },
      })),
    setTempoGridStyle: (style) =>
      set((state) => ({
        ui: { ...state.ui, tempoGridStyle: style },
      })),
    setGameLayoutOrder: (order) => {
      // Validate that all 3 zones are present
      const validZones = ['header', 'game', 'controls'] as const;
      const isValid = order.length === 3 && validZones.every((zone) => order.includes(zone));
      if (!isValid) return;
      set((state) => ({ ui: { ...state.ui, gameLayoutOrder: order } }));
    },
    setGameButtonOrder: (order) =>
      set((state) => ({ ui: { ...state.ui, gameButtonOrder: order } })),
    setGameZoneHeights: (heights) =>
      set((state) => ({ ui: { ...state.ui, gameZoneHeights: heights } })),
    setGameZoneLayouts: (layouts: GameZoneLayouts | null) =>
      set((state) => ({ ui: { ...state.ui, gameZoneLayouts: layouts } })),
    setGameButtonLayouts: (layouts: Record<string, ZoneRect> | null) =>
      set((state) => ({ ui: { ...state.ui, gameButtonLayouts: layouts } })),
    resetGameLayout: () =>
      set((state) => ({
        ui: {
          ...state.ui,
          gameLayoutOrder: ['header', 'game', 'controls'],
          gameButtonOrder: null,
          gameZoneHeights: null,
          gameZoneLayouts: null,
          gameButtonLayouts: null,
          gridScale: 1.0,
          controlsScale: 1.0,
        },
      })),
    addCompletedTutorial: (specId) =>
      set((state) => {
        if (state.ui.completedTutorials.includes(specId)) return state;
        return {
          ui: {
            ...state.ui,
            completedTutorials: [...state.ui.completedTutorials, specId],
          },
        };
      }),

    toggleFavoriteMode: (modeId) =>
      set((state) => {
        const current = state.ui.favoriteModes ?? [];
        const next = current.includes(modeId)
          ? current.filter((m) => m !== modeId)
          : [...current, modeId];
        return { ui: { ...state.ui, favoriteModes: next } };
      }),

    setModeTierFilter: (filter) =>
      set((state) => ({ ui: { ...state.ui, modeTierFilter: filter } })),

    toggleFavoriteJourney: (journeyId) =>
      set((state) => {
        const normalizedId = normalizeJourneyId(journeyId);
        const exists = state.savedJourneys.some((journey) => journey.id === normalizedId);
        if (!exists) return state;
        const current = state.ui.favoriteJourneyIds ?? [];
        const next = current.includes(normalizedId)
          ? current.filter((id) => id !== normalizedId)
          : [...current, normalizedId];
        return { ui: { ...state.ui, favoriteJourneyIds: next } };
      }),

    toggleCalibrationModality: (modality) =>
      set((state) => {
        const current = state.ui.disabledCalibrationModalities ?? [];
        const next = current.includes(modality)
          ? current.filter((m) => m !== modality)
          : [...current, modality];
        return { ui: { ...state.ui, disabledCalibrationModalities: next } };
      }),

    setCalibrationMaxLevel: (level) =>
      set((state) => ({
        ui: { ...state.ui, calibrationMaxLevel: Math.min(5, Math.max(2, level)) },
      })),

    // Actions - Stats Page Filters
    setStatsMode: (mode) => set((state) => ({ ui: { ...state.ui, statsMode: mode } })),
    setStatsNLevels: (levels) => set((state) => ({ ui: { ...state.ui, statsNLevels: levels } })),
    setStatsModalities: (modalities) =>
      set((state) => ({ ui: { ...state.ui, statsModalities: modalities } })),
    setStatsDateOption: (option) =>
      set((state) => ({ ui: { ...state.ui, statsDateOption: option } })),
    setStatsTab: (tab) => set((state) => ({ ui: { ...state.ui, statsTab: tab } })),
    setStatsJourneyFilter: (filter) =>
      set((state) => ({ ui: { ...state.ui, statsJourneyFilter: filter } })),
    setStatsFreeModeFilter: (filter) =>
      set((state) => ({ ui: { ...state.ui, statsFreeModeFilter: filter } })),
    setBinauralMuteShownCount: (count) =>
      set((state) => ({ ui: { ...state.ui, binauralMuteShownCount: count } })),

    // Actions - Journey Management
    createJourney: (name, startLevel, targetLevel, gameMode) => {
      const id = `journey-${Date.now()}`;
      const newJourney: SavedJourney = {
        id,
        name,
        startLevel,
        targetLevel,
        isDefault: false,
        createdAt: Date.now(),
        gameMode,
        strategyConfig:
          gameMode === DUAL_TRACK_DNB_HYBRID_MODE_ID
            ? ({ trackSessionsPerBlock: 3, dnbSessionsPerBlock: 3 } as JourneyStrategyConfig)
            : undefined,
        reliability: getReliabilityForGameMode(gameMode),
      };
      set((state) => ({
        savedJourneys: [...state.savedJourneys, newJourney],
        ui: {
          ...state.ui,
          activeJourneyId: id,
          journeyStartLevel: startLevel,
          journeyTargetLevel: targetLevel,
        },
      }));
      return id;
    },

    renameJourney: (id, rawName) =>
      set((state) => {
        const normalizedId = normalizeJourneyId(id);
        const name = String(rawName ?? '').trim();
        if (!name) return state;
        const idx = state.savedJourneys.findIndex((j) => j.id === normalizedId);
        if (idx < 0) return state;
        const journey = state.savedJourneys[idx];
        if (!journey || journey.isDefault) return state;

        const nextJourneys = state.savedJourneys.map((j) =>
          j.id === normalizedId ? { ...j, name, nameKey: undefined } : j,
        );
        return { savedJourneys: nextJourneys };
      }),

    deleteJourney: (id) => {
      set((state) => {
        const journey = state.savedJourneys.find((j) => j.id === id);
        // Can't delete default journey
        if (!journey || journey.isDefault) return state;

        const newJourneys = state.savedJourneys.filter((j) => j.id !== id);
        // If deleting active journey, switch to default
        const isActive = state.ui.activeJourneyId === id;
        const defaultJourney = newJourneys.find((j) => j.isDefault) ?? newJourneys[0];

        return {
          savedJourneys: newJourneys,
          journeyUi:
            isActive && defaultJourney
              ? { selectedJourneyId: defaultJourney.id }
              : state.journeyUi,
          ui:
            isActive && defaultJourney
              ? {
                  ...state.ui,
                  activeJourneyId: defaultJourney.id,
                  favoriteJourneyIds: (state.ui.favoriteJourneyIds ?? []).filter(
                    (journeyId) => journeyId !== id,
                  ),
                  journeyStartLevel: defaultJourney.startLevel,
                  journeyTargetLevel: defaultJourney.targetLevel,
                }
              : {
                  ...state.ui,
                  favoriteJourneyIds: (state.ui.favoriteJourneyIds ?? []).filter(
                    (journeyId) => journeyId !== id,
                  ),
                },
        };
      });
    },

    activateJourney: (id) => {
      set((state) => {
        const normalizedId = normalizeJourneyId(id);
        const journey = state.savedJourneys.find((j) => j.id === normalizedId);
        if (!journey) return state;

        return {
          journeyUi: {
            selectedJourneyId: normalizedId,
          },
          ui: {
            ...state.ui,
            activeJourneyId: normalizedId,
            journeyStartLevel: journey.startLevel,
            journeyTargetLevel: journey.targetLevel,
          },
        };
      });
    },

    getActiveJourney: () => {
      const state = get();
      return state.savedJourneys.find((j) => j.id === state.ui.activeJourneyId);
    },

    updateActiveJourneyLevels: (startLevel, targetLevel) => {
      set((state) => {
        const activeId = state.ui.activeJourneyId;
        const clampedStart = Math.max(1, Math.min(10, startLevel));
        const clampedTarget = Math.max(clampedStart, Math.min(10, targetLevel));

        return {
          savedJourneys: state.savedJourneys.map((j) =>
            j.id === activeId ? { ...j, startLevel: clampedStart, targetLevel: clampedTarget } : j,
          ),
          ui: {
            ...state.ui,
            journeyStartLevel: clampedStart,
            journeyTargetLevel: clampedTarget,
          },
        };
      });
    },

    expandJourneyStartLevel: (journeyId, suggestedStartLevel) => {
      set((state) => {
        const normalizedId = normalizeJourneyId(journeyId);
        const journey = state.savedJourneys.find((j) => j.id === normalizedId);
        if (!journey) return state;

        const suggested = Math.max(1, Math.min(10, Math.trunc(suggestedStartLevel)));
        const nextStartLevel = Math.min(journey.startLevel, suggested);
        if (nextStartLevel === journey.startLevel) return state;

        const nextSavedJourneys = state.savedJourneys.map((j) =>
          j.id === normalizedId
            ? {
                ...j,
                startLevel: nextStartLevel,
                targetLevel: Math.max(nextStartLevel, j.targetLevel),
              }
            : j,
        );

        const nextUi =
          state.ui.activeJourneyId === normalizedId
            ? {
                ...state.ui,
                journeyStartLevel: nextStartLevel,
                journeyTargetLevel: Math.max(nextStartLevel, state.ui.journeyTargetLevel),
              }
            : state.ui;

        return { savedJourneys: nextSavedJourneys, ui: nextUi };
      });
    },

    updateJourneyProgress: (journeyId, currentStage) => {
      set((state) => ({
        savedJourneys: state.savedJourneys.map((j) =>
          j.id === journeyId ? { ...j, currentStage } : j,
        ),
      }));
    },

    // Internal - Load from SQLite
    _loadSettings: (settings: UserSettings) => {
      const ui = settings.ui as UISettings | undefined;
      applyDocumentUiSettings(ui);
      persistThemeHint(ui?.darkMode ?? false);
      void updateNativeTheme(ui?.darkMode ?? false);

      // Merge persisted journeys with defaults (defaults always take precedence for isDefault journeys)
      const persistedJourneysRaw = (settings.savedJourneys as SavedJourney[]) ?? [];
      const defaultJourneys = [...DEFAULT_JOURNEYS];
      const defaultIds = new Set(defaultJourneys.map((j) => j.id));

      // Normalize legacy journey IDs BEFORE merging, so older IDs get canonicalized
      // and default journeys are properly replaced by the code definitions.
      const persistedJourneys = persistedJourneysRaw
        .filter((j) => j && typeof j.id === 'string')
        .map((j) => ({
          ...j,
          id: normalizeJourneyId(j.id),
        }));

      // Keep user-created journeys, replace defaults with code definitions.
      // Also dedupe by id to avoid weird UI when legacy+canonical coexist.
      const userById = new Map<string, SavedJourney>();
      for (const j of persistedJourneys) {
        if (defaultIds.has(j.id)) continue;
        const prev = userById.get(j.id);
        if (!prev) {
          userById.set(j.id, j);
          continue;
        }
        // Prefer the most recent payload when duplicates exist.
        const prevCreatedAt = typeof prev.createdAt === 'number' ? prev.createdAt : 0;
        const nextCreatedAt = typeof j.createdAt === 'number' ? j.createdAt : 0;
        if (nextCreatedAt >= prevCreatedAt) {
          userById.set(j.id, j);
        }
      }
      const userJourneys = Array.from(userById.values());
      const mergedJourneys = [...defaultJourneys, ...userJourneys];

      set((state) => {
        const mergedUi = { ...state.ui, ...ui } as UISettings;
        mergedUi.visualThemePreset = normalizeVisualThemePreset(
          mergedUi.visualThemePreset,
          DEFAULT_UI_SETTINGS.visualThemePreset,
        );

        // Backward compatibility: older/invalid payloads could contain voiceId outside the shipped packs.
        // Current app assets only ship voiceId 1 (female) and 2 (male).
        mergedUi.voiceId = mergedUi.voiceId === 2 ? 2 : 1;
        // Legacy sync presets → migrate to default (sync feature removed)
        if (mergedUi.audioSyncPreset !== 'default') {
          mergedUi.audioSyncPreset = 'default';
        }
        mergedUi.binauralCarrierHz = 200;

        // Backward compatibility: older builds only had journeyActive boolean.
        // New builds use a 3-state homeTab.
        if (
          mergedUi.homeTab !== 'journey' &&
          mergedUi.homeTab !== 'free' &&
          mergedUi.homeTab !== 'challenge' &&
          mergedUi.homeTab !== 'synergy'
        ) {
          mergedUi.homeTab = mergedUi.journeyActive ? 'journey' : 'free';
        }
        mergedUi.journeyActive = mergedUi.homeTab === 'journey';

        if (
          mergedUi.hapticIntensity !== 'low' &&
          mergedUi.hapticIntensity !== 'medium' &&
          mergedUi.hapticIntensity !== 'high'
        ) {
          mergedUi.hapticIntensity = DEFAULT_UI_SETTINGS.hapticIntensity;
        }

        // Normalize challenge settings when loading older/invalid payloads.
        mergedUi.challengeTotalDays = Math.max(
          1,
          Math.min(
            365,
            Math.floor(mergedUi.challengeTotalDays ?? DEFAULT_UI_SETTINGS.challengeTotalDays),
          ),
        );
        mergedUi.challengeTargetMinutesPerDay = Math.max(
          1,
          Math.min(
            240,
            Math.floor(
              mergedUi.challengeTargetMinutesPerDay ??
                DEFAULT_UI_SETTINGS.challengeTargetMinutesPerDay,
            ),
          ),
        );
        mergedUi.challengeStartedAtDay =
          typeof mergedUi.challengeStartedAtDay === 'string'
            ? mergedUi.challengeStartedAtDay
            : null;
        mergedUi.challengeHasProgress = Boolean(mergedUi.challengeHasProgress);

        // Normalize presets payload (older builds / malformed sync payloads)
        const persistedPresetsByMode = (ui as unknown as { freeTrainingPresetsByMode?: unknown })
          ?.freeTrainingPresetsByMode;
        const persistedActivePresetIdByMode = (
          ui as unknown as { freeTrainingActivePresetIdByMode?: unknown }
        )?.freeTrainingActivePresetIdByMode;
        const persistedDefaultPresetIdByMode = (
          ui as unknown as { freeTrainingDefaultPresetIdByMode?: unknown }
        )?.freeTrainingDefaultPresetIdByMode;

        mergedUi.freeTrainingPresetsByMode =
          normalizeFreeTrainingPresetsByMode(persistedPresetsByMode);
        mergedUi.freeTrainingActivePresetIdByMode = normalizePresetIdMap(
          persistedActivePresetIdByMode,
        );
        mergedUi.freeTrainingDefaultPresetIdByMode = normalizePresetIdMap(
          persistedDefaultPresetIdByMode,
        );

        const persistedJourneyPresetsByJourneyId = (
          ui as unknown as { journeyPresetsByJourneyId?: unknown }
        )?.journeyPresetsByJourneyId;
        const persistedJourneyActivePresetIdByJourneyId = (
          ui as unknown as { journeyActivePresetIdByJourneyId?: unknown }
        )?.journeyActivePresetIdByJourneyId;
        const persistedJourneyDefaultPresetIdByJourneyId = (
          ui as unknown as { journeyDefaultPresetIdByJourneyId?: unknown }
        )?.journeyDefaultPresetIdByJourneyId;
        const persistedJourneyModeSettingsByJourneyId = (
          ui as unknown as { journeyModeSettingsByJourneyId?: unknown }
        )?.journeyModeSettingsByJourneyId;

        mergedUi.journeyPresetsByJourneyId = normalizeJourneyPresetsByJourneyId(
          persistedJourneyPresetsByJourneyId,
        );
        mergedUi.journeyActivePresetIdByJourneyId = normalizeStringIdMap(
          persistedJourneyActivePresetIdByJourneyId,
        );
        mergedUi.journeyDefaultPresetIdByJourneyId = normalizeStringIdMap(
          persistedJourneyDefaultPresetIdByJourneyId,
        );
        mergedUi.journeyModeSettingsByJourneyId = {
          ...getDefaultJourneyModeSettingsByJourneyId(),
          ...normalizeModeSettingsByJourneyId(persistedJourneyModeSettingsByJourneyId),
        };
        const persistedTrainingReminderTime = (
          ui as unknown as { trainingReminderTime?: unknown } | undefined
        )?.trainingReminderTime;
        const persistedTrainingReminderWeekdays = (
          ui as unknown as { trainingReminderWeekdays?: unknown } | undefined
        )?.trainingReminderWeekdays;

        // Backward compatibility: if buttonSoundsEnabled wasn't persisted yet,
        // default it to the legacy soundEnabled value to preserve behavior.
        const persistedButtonSounds = (
          ui as unknown as { buttonSoundsEnabled?: unknown } | undefined
        )?.buttonSoundsEnabled;
        if (typeof persistedButtonSounds !== 'boolean') {
          mergedUi.buttonSoundsEnabled = mergedUi.soundEnabled;
        }

        // Ensure reminder settings stay valid when loaded from older/invalid payloads.
        mergedUi.trainingReminderTime = normalizeReminderTime(
          typeof persistedTrainingReminderTime === 'string'
            ? persistedTrainingReminderTime
            : mergedUi.trainingReminderTime,
        );
        mergedUi.trainingReminderWeekdays = normalizeReminderWeekdays(
          Array.isArray(persistedTrainingReminderWeekdays)
            ? (persistedTrainingReminderWeekdays as number[])
            : mergedUi.trainingReminderWeekdays,
        );
        if (mergedUi.trainingReminderWeekdays.length === 0) {
          mergedUi.trainingReminderWeekdays = [...DEFAULT_TRAINING_REMINDER_WEEKDAYS];
        }

        // Backward compatibility: accept legacy/invalid stimulusColor values.
        mergedUi.stimulusColor = normalizeStimulusColor(
          (ui as unknown as { stimulusColor?: unknown } | undefined)?.stimulusColor,
          mergedUi.stimulusColor,
        );

        // Backward compatibility: colorModalityTheme (new setting)
        const persistedColorModalityTheme = (
          ui as unknown as { colorModalityTheme?: unknown } | undefined
        )?.colorModalityTheme;
        if (persistedColorModalityTheme === 'woven' || persistedColorModalityTheme === 'vivid') {
          mergedUi.colorModalityTheme = persistedColorModalityTheme;
        }

        // Backward compatibility: traceWritingInputMethod (new setting)
        const persistedInputMethod = (
          ui as unknown as { traceWritingInputMethod?: unknown } | undefined
        )?.traceWritingInputMethod;
        if (
          persistedInputMethod === 'auto' ||
          persistedInputMethod === 'keyboard' ||
          persistedInputMethod === 'handwriting'
        ) {
          mergedUi.traceWritingInputMethod = persistedInputMethod;
        } else {
          mergedUi.traceWritingInputMethod = mergedUi.traceWritingInputMethod ?? 'auto';
        }

        const migratedJourneys = mergedJourneys.map((journey) =>
          migrateJourneyWithStrategy(journey, mergedUi.journeyModeSettingsByJourneyId[journey.id]),
        );
        const raw = settings as unknown as Record<string, unknown>;
        const persistedFreeTrainingMode =
          (raw['freeTraining'] as { selectedModeId?: GameModeId } | undefined)?.selectedModeId;
        const persistedJourneyUiId =
          (raw['journeyUi'] as { selectedJourneyId?: string } | undefined)?.selectedJourneyId;
        const persistedCurrentMode =
          persistedFreeTrainingMode ?? ((settings.currentMode as GameModeId) ?? state.currentMode);
        const guarded = applyFeatureAccessGuards(persistedCurrentMode, migratedJourneys, mergedUi);

        // Restore persisted LWW timestamp (defaults to 0 for pre-existing data)
        const persistedUpdatedAt =
          typeof raw['_settingsUpdatedAt'] === 'number' ? (raw['_settingsUpdatedAt'] as number) : 0;

        return {
          _initialized: true,
          _settingsUpdatedAt: persistedUpdatedAt,
          currentMode: guarded.currentMode,
          freeTraining: {
            selectedModeId: guarded.currentMode,
          },
          journeyUi: {
            selectedJourneyId:
              persistedJourneyUiId ?? guarded.ui.activeJourneyId ?? state.journeyUi.selectedJourneyId,
          },
          savedJourneys: migratedJourneys,
          modes: {
            ...state.modes,
            ...(settings.modes as Record<GameModeId, ModeSettings>),
          },
          ui: {
            ...guarded.ui,
            activeJourneyId:
              persistedJourneyUiId ?? guarded.ui.activeJourneyId ?? state.journeyUi.selectedJourneyId,
          },
        };
      });
    },
  })),
);

// =============================================================================
// SQLite Persistence (auto-save on state changes)
// =============================================================================

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let unsubscribePersistence: (() => void) | null = null;

// Subscribe to state changes and save to SQLite (debounced)
unsubscribePersistence = useSettingsStore.subscribe(
  (state) => ({
    currentMode: state.currentMode,
    freeTraining: state.freeTraining,
    journeyUi: state.journeyUi,
    savedJourneys: state.savedJourneys,
    modes: state.modes,
    ui: state.ui,
  }),
  (current, prev) => {
    // Skip if not initialized (loading from SQLite)
    if (!useSettingsStore.getState()._initialized) return;

    // Skip if nothing changed
    if (
      current.currentMode === prev.currentMode &&
      current.freeTraining === prev.freeTraining &&
      current.journeyUi === prev.journeyUi &&
      current.savedJourneys === prev.savedJourneys &&
      current.modes === prev.modes &&
      current.ui === prev.ui
    ) {
      return;
    }

    // Debounce saves (100ms)
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!_settingsAdapter) return;
      const now = Date.now();
      useSettingsStore.setState({ _settingsUpdatedAt: now });
      const state = useSettingsStore.getState();
      _settingsAdapter
        .saveSettings({
          currentMode: state.currentMode,
          freeTraining: state.freeTraining,
          journeyUi: state.journeyUi,
          savedJourneys: state.savedJourneys,
          modes: state.modes as Record<string, Record<string, unknown>>,
          ui: state.ui,
          _settingsUpdatedAt: state._settingsUpdatedAt,
        } as UserSettings)
        .catch((err: unknown) => {
          console.error('[SettingsStore] Failed to save settings:', err);
        });
    }, 100);
  },
  { equalityFn: Object.is },
);

// =============================================================================
// Initialization (call this at app startup)
// =============================================================================

/**
 * Get current domain type for language detection.
 * Returns 'com' for .com domains, 'fr' for .fr domains, 'other' for localhost/dev.
 */
function getCurrentDomainType(): 'com' | 'fr' | 'other' {
  const hostname = window.location.hostname;
  if (hostname.endsWith('.com')) return 'com';
  if (hostname.endsWith('.fr')) return 'fr';
  return 'other';
}

/**
 * Get default language for a domain type.
 * - .com → English
 * - .fr → French
 * - other (Capacitor, localhost) → detect from browser/system locale
 */
function getLanguageForDomain(domainType: 'com' | 'fr' | 'other'): string {
  if (domainType === 'com') return 'en';
  if (domainType === 'fr') return 'fr';
  // Capacitor / localhost: detect from system locale
  const rawLang = typeof navigator !== 'undefined' ? (navigator.language ?? '') : '';
  const browserLang = rawLang.split('-')[0]?.toLowerCase() ?? '';
  const supported = new Set([
    'fr',
    'en',
    'es',
    'de',
    'pl',
    'it',
    'pt',
    'zh',
    'ja',
    'ko',
    'ru',
    'ar',
    'hi',
  ]);
  return supported.has(browserLang) ? browserLang : 'en';
}

/**
 * Initialize settings store from SQLite.
 * Call this once at app startup (e.g., in SystemProvider after SQLite init).
 *
 * Handles domain-based language:
 * - neurodual.fr → French
 * - neurodual.com → English
 * - If user switches domain, language adapts automatically
 *
 * @param settingsAdapter - The SettingsPort adapter (injected from createAdapters)
 */
export async function initSettingsStore(settingsAdapter: SettingsPort): Promise<void> {
  // Store adapter for subscription use
  _settingsAdapter = settingsAdapter;

  const currentDomain = getCurrentDomainType();
  const domainLanguage = getLanguageForDomain(currentDomain);

  try {
    const settings = await settingsAdapter.getSettings();

    if (settings) {
      // Load persisted settings
      useSettingsStore.getState()._loadSettings(settings);

      // Dev app: ensure alpha/beta are enabled once (without affecting store builds).
      if (DEV_EXPERIMENTAL_DEFAULTS_ENABLED) {
        const state = useSettingsStore.getState();
        if (!state.ui.devExperimentalUnlocked) {
          const nextUi: UISettings = {
            ...state.ui,
            betaEnabled: true,
            alphaEnabled: true,
            devExperimentalUnlocked: true,
          };
          useSettingsStore.setState({ ui: nextUi });
          await settingsAdapter.saveSettings({
            currentMode: state.currentMode,
            freeTraining: state.freeTraining,
            journeyUi: state.journeyUi,
            savedJourneys: state.savedJourneys,
            modes: state.modes as Record<string, Record<string, unknown>>,
            ui: nextUi,
          } as UserSettings);
        }
      }

      // Check if domain changed - adapt language if user hasn't manually changed it
      const ui = settings.ui as { lastDomain?: string; language?: string } | undefined;
      const lastDomain = ui?.lastDomain as 'com' | 'fr' | 'other' | undefined;
      const currentLanguage = ui?.language ?? 'fr';

      // For existing users without lastDomain, infer it from their current language
      const inferredLastDomain = lastDomain ?? (currentLanguage === 'en' ? 'com' : 'fr');

      if (inferredLastDomain !== currentDomain) {
        const oldDomainLanguage = getLanguageForDomain(inferredLastDomain);
        if (currentLanguage === oldDomainLanguage) {
          // User was using domain's default language, switch to new domain's default
          useSettingsStore.setState((state) => ({
            ui: { ...state.ui, language: domainLanguage, lastDomain: currentDomain },
          }));
        } else {
          // User manually changed language, just update lastDomain
          useSettingsStore.setState((state) => ({
            ui: { ...state.ui, lastDomain: currentDomain },
          }));
        }
      } else if (!lastDomain) {
        // Same domain, just save tracking
        useSettingsStore.setState((state) => ({
          ui: { ...state.ui, lastDomain: currentDomain },
        }));
      }
    } else {
      // First launch - detect language from domain and system theme
      const state = useSettingsStore.getState();
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const uiWithDomainLanguage = {
        ...state.ui,
        language: domainLanguage,
        darkMode: prefersDark,
        lastDomain: currentDomain,
      };

      applyDocumentUiSettings(uiWithDomainLanguage);
      persistThemeHint(prefersDark);
      void updateNativeTheme(prefersDark);

      await settingsAdapter.saveSettings({
        currentMode: state.currentMode,
        freeTraining: state.freeTraining,
        journeyUi: state.journeyUi,
        savedJourneys: state.savedJourneys,
        modes: state.modes as Record<string, Record<string, unknown>>,
        ui: uiWithDomainLanguage,
      } as UserSettings);
      useSettingsStore.setState({
        _initialized: true,
        freeTraining: { selectedModeId: state.currentMode },
        journeyUi: { selectedJourneyId: state.ui.activeJourneyId },
        ui: uiWithDomainLanguage,
      });
    }
  } catch (err) {
    console.error('[SettingsStore] Failed to init settings:', err);
    // Mark as initialized anyway to allow the app to work
    useSettingsStore.setState({ _initialized: true });
  }
}

// =============================================================================
// Selector hooks (convenience)
// =============================================================================

/** Hook pour obtenir les settings du mode actif */
export const useCurrentModeSettings = () => {
  return useSettingsStore((s) => s.modes[s.freeTraining.selectedModeId] ?? EMPTY_MODE_SETTINGS);
};

/** Hook pour obtenir les settings du parcours (scopés par journeyId). */
export const useJourneyModeSettings = (journeyId: string) => {
  return useSettingsStore(
    (s) => s.ui.journeyModeSettingsByJourneyId[journeyId] ?? EMPTY_MODE_SETTINGS,
  );
};

// =============================================================================
// HMR Cleanup
// =============================================================================

/**
 * Reset store state for HMR. Call this in import.meta.hot.dispose().
 * Clears pending save timeout, unsubscribes persistence listener, and resets initialized flag.
 */
export function resetSettingsStoreHMR(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  // Unsubscribe persistence listener to prevent accumulation on HMR
  if (unsubscribePersistence) {
    unsubscribePersistence();
    unsubscribePersistence = null;
  }
  // Reset initialized flag so next init works correctly
  useSettingsStore.setState({ _initialized: false });
}

// Auto-cleanup on HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetSettingsStoreHMR();
  });
}
