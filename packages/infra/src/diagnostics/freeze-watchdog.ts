/**
 * Freeze Watchdog - Détecte les freezes du main thread
 *
 * Utilise un heartbeat pour détecter quand le main thread est bloqué.
 * Capture des infos de diagnostic au moment du déblocage.
 */

import { freezeWatchdogLog } from '../logger';

export interface FreezeEvent {
  timestamp: number;
  durationMs: number;
  lastContext: string | null;
  contextSource?: 'active' | 'recent' | 'unknown';
  pendingStepContext?: string | null;
  pendingStepAgeMs?: number;
  pendingStepStack?: string | null;
  stack: string | null;
}

export interface LongTaskEvent {
  timestamp: number;
  durationMs: number;
  context: string | null;
  name: string;
}

export interface WatchdogStepEvent {
  timestamp: number;
  durationMs: number;
  context: string;
  stack: string | null;
}

type FreezeListener = (event: FreezeEvent) => void;
type LongTaskListener = (event: LongTaskEvent) => void;
type WatchdogStepListener = (event: WatchdogStepEvent) => void;

type ContextFrame = {
  id: number;
  context: string;
  // Optional callsite stack for debugging; gated behind a local flag.
  stack: string | null;
  pushedAtMs: number;
};

type ContextLogEntry = {
  atMs: number;
  action: 'push' | 'pop' | 'update';
  context: string;
  id: number;
};

type PendingStepFrame = {
  id: number;
  context: string;
  stack: string | null;
  startedAtMs: number;
};

// État global du watchdog
let isRunning = false;
let lastTick = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentContext: string | null = null;
let recentlyClearedContext: { value: string; clearedAtMs: number } | null = null;
const contextFrames: ContextFrame[] = [];
let nextContextFrameId = 1;
let manualContextFrameId: number | null = null;
const pendingStepFrames: PendingStepFrame[] = [];
let nextPendingStepFrameId = 1;
let visibilityHandler: (() => void) | null = null;
let focusHandler: (() => void) | null = null;
let resumeHandler: (() => void) | null = null;
let ignoreUntilMs = 0;
// Tracks whether the page was hidden at any point since the last interval tick.
// Solves the race where setInterval fires before visibilitychange when Chrome
// foregrounds a background tab: visibilityState is already 'visible' but lastTick
// is stale from ~60s ago (Chrome's intensive timer throttling).
let wasHidden = false;
const listeners: Set<FreezeListener> = new Set();
const longTaskListeners: Set<LongTaskListener> = new Set();
const stepListeners: Set<WatchdogStepListener> = new Set();
const freezeHistory: FreezeEvent[] = [];
let captureContextStacksCache: boolean | null = null;
let longTaskConsoleLogsCache: boolean | null = null;

const CONTEXT_LOG_MAX = 60;
const contextLog: ContextLogEntry[] = [];

function readLocalStorageSetting(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function shouldCaptureContextStacks(): boolean {
  if (captureContextStacksCache !== null) {
    return captureContextStacksCache;
  }

  // Context stacks are intentionally opt-in.
  // They are expensive when contexts are pushed/popped at high frequency.
  // Enable locally with localStorage.setItem('ND_FREEZE_CONTEXT_STACKS', '1').
  const override = readLocalStorageSetting('ND_FREEZE_CONTEXT_STACKS');
  if (override === '1') {
    captureContextStacksCache = true;
    return true;
  }
  if (override === '0') {
    captureContextStacksCache = false;
    return false;
  }

  captureContextStacksCache = false;
  return false;
}

function shouldLogLongTasks(): boolean {
  if (longTaskConsoleLogsCache !== null) {
    return longTaskConsoleLogsCache;
  }

  // Verbose long-task logging is opt-in to avoid console flood and overhead.
  // Enable locally with localStorage.setItem('ND_LOG_LONGTASKS', '1').
  const override = readLocalStorageSetting('ND_LOG_LONGTASKS');
  if (override === '1') {
    longTaskConsoleLogsCache = true;
    return true;
  }
  if (override === '0') {
    longTaskConsoleLogsCache = false;
    return false;
  }

  longTaskConsoleLogsCache = false;
  return false;
}

function logContextEvent(entry: ContextLogEntry): void {
  contextLog.push(entry);
  if (contextLog.length > CONTEXT_LOG_MAX) {
    contextLog.splice(0, contextLog.length - CONTEXT_LOG_MAX);
  }
}

// Seuils configurables
const FREEZE_THRESHOLD_MS = 2000; // Considéré comme freeze si > 2s
const CHECK_INTERVAL_MS = 500; // Vérifie toutes les 500ms
const MAX_HISTORY = 10; // Garde les 10 derniers freezes
// Cold start is intentionally expensive in this app (OPFS + SQLite + PowerSync init).
// Do not classify startup recovery work as a "freeze".
const STARTUP_GRACE_MS = 12_000;
const RESUME_GRACE_MS = 5_000;
// Any reported "freeze" longer than this is certainly timer throttling, not a real
// main-thread block. A genuine 30s freeze would make the browser show an "unresponsive
// page" dialog, so the user would have killed or refreshed the tab long before.
const MAX_CREDIBLE_FREEZE_MS = 30_000;

function nowTickMs(): number {
  // Prefer monotonic clock: unlike Date.now(), performance.now() is not affected by wall-clock jumps.
  // On many platforms it also doesn't advance during system suspend, which avoids false "freeze" reports
  // when the device is put to sleep.
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function extendIgnoreWindow(durationMs: number): void {
  ignoreUntilMs = nowTickMs() + Math.max(0, durationMs);
}

function getFreezeContext(nowMs: number): {
  context: string | null;
  source: 'active' | 'recent' | 'unknown';
} {
  if (currentContext) {
    return { context: currentContext, source: 'active' };
  }

  // If a context was cleared very recently, it may still be the true culprit:
  // a synchronous long block can finish and clear the context before the watchdog
  // callback gets CPU time again.
  if (recentlyClearedContext) {
    const ageMs = nowMs - recentlyClearedContext.clearedAtMs;
    if (ageMs >= 0 && ageMs <= 1000) {
      return { context: recentlyClearedContext.value, source: 'recent' };
    }
  }

  return { context: null, source: 'unknown' };
}

function setCurrentContextFromFrames(removedContext?: string): void {
  const top = contextFrames[contextFrames.length - 1] ?? null;
  if (top) {
    currentContext = top.context;
    recentlyClearedContext = null;
    return;
  }

  currentContext = null;
  if (removedContext) {
    recentlyClearedContext = {
      value: removedContext,
      clearedAtMs: nowTickMs(),
    };
  }
}

function pushContextFrame(context: string): number {
  const id = nextContextFrameId++;
  const stack = shouldCaptureContextStacks() ? (new Error().stack ?? null) : null;
  contextFrames.push({ id, context, stack, pushedAtMs: nowTickMs() });
  currentContext = context;
  recentlyClearedContext = null;
  logContextEvent({ atMs: nowTickMs(), action: 'push', context, id });
  return id;
}

function popContextFrame(id: number): void {
  const idx = contextFrames.findIndex((frame) => frame.id === id);
  if (idx === -1) return;
  const removed = contextFrames[idx];
  contextFrames.splice(idx, 1);
  setCurrentContextFromFrames(removed?.context);
  logContextEvent({ atMs: nowTickMs(), action: 'pop', context: removed?.context ?? '', id });
}

function updateContextFrame(id: number, context: string): void {
  const frame = contextFrames.find((entry) => entry.id === id);
  if (!frame) return;
  frame.context = context;
  const top = contextFrames[contextFrames.length - 1];
  if (top?.id === id) {
    currentContext = context;
    recentlyClearedContext = null;
  }
  logContextEvent({ atMs: nowTickMs(), action: 'update', context, id });
}

function formatContextStackForLog(maxFrames = 6): string {
  const frames = contextFrames.slice(-maxFrames);
  if (frames.length === 0) return '[]';
  return `[${frames.map((f) => f.context).join(' > ')}]`;
}

function formatContextAgesForLog(nowMs: number, maxFrames = 6): string {
  const frames = contextFrames.slice(-maxFrames);
  if (frames.length === 0) return '[]';
  return `[${frames
    .map((f) => `${f.context}:${Math.max(0, Math.round(nowMs - f.pushedAtMs))}ms`)
    .join(' > ')}]`;
}

function formatRecentContextLogForLog(maxEntries = 20): string {
  const rows = contextLog.slice(-maxEntries);
  if (rows.length === 0) return '(no context transitions)';
  const t0 = rows[0]?.atMs ?? 0;
  return rows
    .map((e) => {
      const dt = Math.round((e.atMs - t0) as number);
      return `${dt}ms ${e.action}#${e.id} ${e.context}`;
    })
    .join('\n');
}

function pushPendingStepFrame(context: string): number {
  const id = nextPendingStepFrameId++;
  pendingStepFrames.push({
    id,
    context,
    stack: shouldCaptureContextStacks() ? (new Error().stack ?? null) : null,
    startedAtMs: nowTickMs(),
  });
  return id;
}

function popPendingStepFrame(id: number): PendingStepFrame | null {
  const idx = pendingStepFrames.findIndex((frame) => frame.id === id);
  if (idx === -1) return null;
  return pendingStepFrames.splice(idx, 1)[0] ?? null;
}

function getPendingStepFrame(): PendingStepFrame | null {
  return pendingStepFrames[pendingStepFrames.length - 1] ?? null;
}

/**
 * Démarre le watchdog de freeze.
 * Appeler une seule fois au démarrage de l'app.
 */
export function startFreezeWatchdog(): void {
  if (isRunning) {
    console.warn('[FreezeWatchdog] Already running');
    return;
  }

  // Allow runtime toggles between sessions without reloading the app.
  captureContextStacksCache = null;
  longTaskConsoleLogsCache = null;

  isRunning = true;
  lastTick = nowTickMs();
  extendIgnoreWindow(STARTUP_GRACE_MS);
  wasHidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
  contextFrames.length = 0;
  manualContextFrameId = null;
  nextContextFrameId = 1;
  pendingStepFrames.length = 0;
  nextPendingStepFrameId = 1;
  currentContext = null;
  recentlyClearedContext = null;

  // Reset lastTick when returning from background to avoid false positives
  // (e.g., app backgrounded for 10h would otherwise trigger a "freeze")
  if (typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        wasHidden = false;
        lastTick = nowTickMs();
        extendIgnoreWindow(RESUME_GRACE_MS);
      } else {
        wasHidden = true;
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    // Page Lifecycle API (supported in Chromium): helps distinguish suspend/resume from a true main-thread block.
    // Safe to attach even if unsupported.
    resumeHandler = () => {
      lastTick = nowTickMs();
      extendIgnoreWindow(RESUME_GRACE_MS);
    };
    document.addEventListener('resume', resumeHandler as EventListener);
    document.addEventListener('freeze', resumeHandler as EventListener);
  }

  if (typeof window !== 'undefined') {
    // Focus typically changes on screen lock/unlock; resetting avoids false positives on wake.
    focusHandler = () => {
      lastTick = nowTickMs();
      extendIgnoreWindow(RESUME_GRACE_MS);
    };
    window.addEventListener('focus', focusHandler);
    window.addEventListener('pageshow', focusHandler);
  }

  intervalId = setInterval(() => {
    const now = nowTickMs();
    // Ignore timer throttling while backgrounded (otherwise it looks like a "freeze")
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      wasHidden = true;
      lastTick = now;
      return;
    }
    // Race condition guard: when Chrome foregrounds a background tab, setInterval
    // can fire BEFORE the visibilitychange event. At that point visibilityState is
    // already 'visible' but lastTick is stale (e.g. ~60s old from Chrome's intensive
    // timer throttling). The wasHidden flag catches this: it was set when the tab went
    // hidden, and visibilitychange hasn't cleared it yet.
    if (wasHidden) {
      wasHidden = false;
      lastTick = now;
      return;
    }
    if (now < ignoreUntilMs) {
      lastTick = now;
      return;
    }
    const elapsed = now - lastTick;
    // elapsed includes the normal polling interval (CHECK_INTERVAL_MS).
    // Subtract it to estimate the actual main-thread blocking time.
    const blockedMs = Math.max(0, elapsed - CHECK_INTERVAL_MS);

    // Safety net: any "freeze" beyond MAX_CREDIBLE_FREEZE_MS is certainly not a real
    // main-thread block — it's timer drift from sleep, suspend, or an edge case we
    // didn't anticipate. Silently discard.
    if (blockedMs > MAX_CREDIBLE_FREEZE_MS) {
      lastTick = now;
      return;
    }

    if (blockedMs > FREEZE_THRESHOLD_MS) {
      const freezeContext = getFreezeContext(now);
      const pendingStep = getPendingStepFrame();
      const pendingStepAgeMs = pendingStep ? Math.max(0, now - pendingStep.startedAtMs) : undefined;
      const freezeEvent: FreezeEvent = {
        timestamp: Date.now(),
        durationMs: blockedMs,
        lastContext: freezeContext.context,
        contextSource: freezeContext.source,
        pendingStepContext: pendingStep?.context ?? null,
        pendingStepAgeMs,
        pendingStepStack: pendingStep?.stack ?? null,
        stack: new Error().stack ?? null,
      };

      const top = contextFrames[contextFrames.length - 1] ?? null;
      const ctxStack = formatContextStackForLog();
      const ctxAges = formatContextAgesForLog(now);
      const recentCtx = formatRecentContextLogForLog();

      // Log immédiat
      console.error(
        `[FreezeWatchdog] 🚨 Main thread was blocked for ${blockedMs}ms`,
        `\n  Last context: ${freezeContext.context ?? 'unknown'} (${freezeContext.source})`,
        pendingStep
          ? `\n  Pending async step: ${pendingStep.context} (${Math.round(pendingStepAgeMs ?? 0)}ms)`
          : '',
        `\n  Context stack: ${ctxStack}`,
        `\n  Context ages: ${ctxAges}`,
        `\n  Recent context transitions:\n${recentCtx}`,
        pendingStep?.stack ? `\n  Pending async step callsite:\n${pendingStep.stack}` : '',
        top?.stack ? `\n  Context callsite (top frame):\n${top.stack}` : '',
        `\n  Stack at unblock:`,
        freezeEvent.stack,
      );

      // Historique
      freezeHistory.push(freezeEvent);
      if (freezeHistory.length > MAX_HISTORY) {
        freezeHistory.shift();
      }

      // Notifier listeners
      for (const listener of listeners) {
        try {
          listener(freezeEvent);
        } catch (e) {
          console.error('[FreezeWatchdog] Listener error:', e);
        }
      }
    }

    lastTick = now;
  }, CHECK_INTERVAL_MS);

  freezeWatchdogLog.info('Started - monitoring for freezes > 2s');
}

/**
 * Arrête le watchdog.
 */
export function stopFreezeWatchdog(): void {
  if (!isRunning) return;

  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  // Remove visibility listener
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (resumeHandler && typeof document !== 'undefined') {
    document.removeEventListener('resume', resumeHandler as EventListener);
    document.removeEventListener('freeze', resumeHandler as EventListener);
    resumeHandler = null;
  }
  if (focusHandler && typeof window !== 'undefined') {
    window.removeEventListener('focus', focusHandler);
    window.removeEventListener('pageshow', focusHandler);
    focusHandler = null;
  }

  isRunning = false;
  wasHidden = false;
  ignoreUntilMs = 0;
  contextFrames.length = 0;
  contextLog.length = 0;
  manualContextFrameId = null;
  nextContextFrameId = 1;
  pendingStepFrames.length = 0;
  nextPendingStepFrameId = 1;
  currentContext = null;
  recentlyClearedContext = null;
  freezeWatchdogLog.info('Stopped');
}

/**
 * Met à jour le contexte actuel (pour savoir où on était avant le freeze).
 * Appeler avant les opérations potentiellement longues.
 *
 * @example
 * setWatchdogContext('GameSession.start');
 * await session.start();
 * clearWatchdogContext();
 */
export function setWatchdogContext(context: string): void {
  if (manualContextFrameId === null) {
    manualContextFrameId = pushContextFrame(context);
    return;
  }
  updateContextFrame(manualContextFrameId, context);
}

/**
 * Efface le contexte actuel.
 */
export function clearWatchdogContext(): void {
  if (manualContextFrameId !== null) {
    const id = manualContextFrameId;
    manualContextFrameId = null;
    popContextFrame(id);
    return;
  }

  // Fallback for callers that clear without an explicit manual frame:
  // pop the current top frame if any.
  const top = contextFrames[contextFrames.length - 1];
  if (top) {
    popContextFrame(top.id);
  }
}

export function getWatchdogContext(): string | null {
  return currentContext;
}

export function getPendingWatchdogStepContext(): string | null {
  return getPendingStepFrame()?.context ?? null;
}

/**
 * Wrapper pour instrumenter une fonction avec le contexte.
 */
export function withWatchdogContext<T>(context: string, fn: () => T): T {
  const frameId = pushContextFrame(context);
  try {
    return fn();
  } finally {
    popContextFrame(frameId);
  }
}

/**
 * Wrapper async pour instrumenter une fonction avec le contexte.
 *
 * Important: do not keep the active context alive for the full promise lifecycle.
 * Once an async function hits an `await`, unrelated work may run on the main thread
 * before the promise resumes. Keeping the context active across that gap causes
 * false freeze attribution. This wrapper therefore tags only the synchronous slice
 * that starts the async work; instrument later CPU-heavy slices explicitly.
 */
export function withWatchdogContextAsync<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return withWatchdogContext(context, fn);
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function withWatchdogStepAsync<T>(
  context: string,
  fn: () => Promise<T>,
  options?: {
    /** Log a warning if the step takes longer than this. Defaults to 250ms. */
    readonly warnAfterMs?: number;
  },
): Promise<T> {
  const warnAfterMs = Math.max(0, options?.warnAfterMs ?? 250);
  const startedAt = nowTickMs();
  const pendingStepFrameId = pushPendingStepFrame(context);
  try {
    return await withWatchdogContextAsync(context, fn);
  } finally {
    const pendingStep = popPendingStepFrame(pendingStepFrameId);
    const endedAt = nowTickMs();
    const durationMs = Math.max(0, endedAt - startedAt);

    if (durationMs >= warnAfterMs) {
      const stepEvent: WatchdogStepEvent = {
        timestamp: Date.now(),
        durationMs,
        context,
        stack: pendingStep?.stack ?? new Error().stack ?? null,
      };
      console.warn(`[WatchdogStep] ${context} took ${Math.round(durationMs)}ms`);
      for (const listener of stepListeners) {
        try {
          listener(stepEvent);
        } catch (e) {
          console.error('[WatchdogStep] Listener error:', e);
        }
      }
    }
  }
}

/**
 * Ajoute un listener pour les événements de freeze.
 * Utile pour envoyer à Sentry ou autre monitoring.
 */
export function onFreeze(listener: FreezeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ajoute un listener pour les événements de long task (>100ms).
 * Utile pour tracker la qualité de session (psychometric data reliability).
 */
export function onLongTask(listener: LongTaskListener): () => void {
  longTaskListeners.add(listener);
  return () => longTaskListeners.delete(listener);
}

export function onWatchdogStep(listener: WatchdogStepListener): () => void {
  stepListeners.add(listener);
  return () => stepListeners.delete(listener);
}

/**
 * Retourne l'historique des freezes.
 */
export function getFreezeHistory(): readonly FreezeEvent[] {
  return freezeHistory;
}

/**
 * Vérifie si le watchdog est actif.
 */
export function isWatchdogRunning(): boolean {
  return isRunning;
}

// Long Tasks API (complémentaire au watchdog)
let longTaskObserver: PerformanceObserver | null = null;
let longTaskLogSuppressedCount = 0;
let longTaskLastLogAtMs = 0;
const LONG_TASK_LOG_THROTTLE_MS = 1500;

/**
 * Active l'observation des Long Tasks via Performance API.
 * Capture les tâches > 50ms (seuil standard).
 */
export function enableLongTaskObserver(): void {
  if (longTaskObserver) return;
  if (typeof PerformanceObserver === 'undefined') {
    console.warn('[FreezeWatchdog] PerformanceObserver not available');
    return;
  }

  // Check if 'longtask' is supported (not available in Firefox)
  const supportedTypes = PerformanceObserver.supportedEntryTypes ?? [];
  if (!supportedTypes.includes('longtask')) {
    // Silently skip - Firefox doesn't support longtask, this is expected
    return;
  }

  try {
    longTaskLogSuppressedCount = 0;
    longTaskLastLogAtMs = 0;
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 100) {
          if (shouldLogLongTasks()) {
            const now = nowTickMs();
            if (now - longTaskLastLogAtMs >= LONG_TASK_LOG_THROTTLE_MS) {
              const suppressedSuffix =
                longTaskLogSuppressedCount > 0
                  ? ` (+${longTaskLogSuppressedCount} suppressed)`
                  : '';
              console.warn(
                `[LongTask] ${entry.duration.toFixed(0)}ms${suppressedSuffix}`,
                `context: ${currentContext ?? 'unknown'}`,
                entry.name !== 'self' ? `(${entry.name})` : '',
              );
              longTaskLogSuppressedCount = 0;
              longTaskLastLogAtMs = now;
            } else {
              longTaskLogSuppressedCount += 1;
            }
          }

          // Notify listeners
          const longTaskEvent: LongTaskEvent = {
            timestamp: Date.now(),
            durationMs: entry.duration,
            context: currentContext,
            name: entry.name,
          };
          for (const listener of longTaskListeners) {
            try {
              listener(longTaskEvent);
            } catch (e) {
              console.error('[LongTask] Listener error:', e);
            }
          }
        }
      }
    });

    longTaskObserver.observe({ entryTypes: ['longtask'] });
    freezeWatchdogLog.info('Long Task observer enabled');
  } catch (e) {
    console.warn('[FreezeWatchdog] Failed to enable Long Task observer:', e);
  }
}

/**
 * Désactive l'observation des Long Tasks.
 */
export function disableLongTaskObserver(): void {
  if (longTaskObserver) {
    longTaskObserver.disconnect();
    longTaskObserver = null;
  }
  longTaskLogSuppressedCount = 0;
  longTaskLastLogAtMs = 0;
}
