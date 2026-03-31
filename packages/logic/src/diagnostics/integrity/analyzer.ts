/**
 * IntegrityAnalyzer - Analyse post-hoc des sessions
 *
 * Analyse une liste d'events et génère des rapports
 * d'intégrité sans toucher au code de production.
 */

import type {
  GameEvent,
  MemoSessionEndedEvent,
  MemoSessionStartedEvent,
  SessionEndedEvent,
  SessionStartedEvent,
} from '../../engine/events';
import { generateId } from '../../domain/random';
import type {
  IntegrityCheck,
  IntegrityReport,
  IntegrityReportSummary,
  IntegrityStatus,
  RecalculatedStats,
  EventCounts,
} from './types';

// Type aliases for session events
type AnyStartEvent = SessionStartedEvent | MemoSessionStartedEvent;
type AnyEndEvent = SessionEndedEvent | MemoSessionEndedEvent;

// =============================================================================
// Helpers
// =============================================================================

function worstStatus(statuses: IntegrityStatus[]): IntegrityStatus {
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

function getEventType(event: GameEvent): string {
  return event.type;
}

function isPlaceSession(events: readonly GameEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === 'SESSION_STARTED' || e.type === 'TRIAL_PRESENTED' || e.type === 'USER_RESPONDED',
  );
}

function isMemoSession(events: readonly GameEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === 'RECALL_SESSION_STARTED' ||
      e.type === 'RECALL_STIMULUS_SHOWN' ||
      e.type === 'RECALL_PICKED',
  );
}

// =============================================================================
// Event Counting
// =============================================================================

function countEvents(events: readonly GameEvent[]): EventCounts {
  const byType: Record<string, number> = {};

  for (const event of events) {
    const type = getEventType(event);
    byType[type] = (byType[type] ?? 0) + 1;
  }

  return {
    total: events.length,
    byType,
  };
}

// =============================================================================
// Stats Recalculation - Flow Mode
// =============================================================================

function recalculateFlowStats(events: readonly GameEvent[]): RecalculatedStats {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;
  let trialsPresented = 0;
  let userResponses = 0;
  let startTime: number | null = null;
  let endTime: number | null = null;
  const reactionTimes: number[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'SESSION_STARTED':
        startTime = event.timestamp;
        break;

      case 'SESSION_ENDED':
        endTime = event.timestamp;
        break;

      case 'TRIAL_PRESENTED':
        trialsPresented++;
        break;

      case 'USER_RESPONDED': {
        userResponses++;
        const resp = event as GameEvent & {
          outcome?: string;
          reactionTimeMs?: number;
        };
        if (resp.outcome === 'hit') hits++;
        else if (resp.outcome === 'miss') misses++;
        else if (resp.outcome === 'false_alarm') falseAlarms++;
        else if (resp.outcome === 'correct_rejection') correctRejections++;

        if (resp.reactionTimeMs !== undefined) {
          reactionTimes.push(resp.reactionTimeMs);
        }
        break;
      }
    }
  }

  const total = hits + misses + falseAlarms + correctRejections;
  const correct = hits + correctRejections;
  const accuracy = total > 0 ? correct / total : 0;

  // d' calculation (simplified)
  const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0.5;
  const faRate =
    falseAlarms + correctRejections > 0 ? falseAlarms / (falseAlarms + correctRejections) : 0.5;

  // Clamp to avoid infinite z-scores
  const clampedHitRate = Math.max(0.01, Math.min(0.99, hitRate));
  const clampedFaRate = Math.max(0.01, Math.min(0.99, faRate));

  // Z-score approximation
  const zHit = Math.sqrt(2) * inverseErf(2 * clampedHitRate - 1);
  const zFa = Math.sqrt(2) * inverseErf(2 * clampedFaRate - 1);
  const dPrime = zHit - zFa;

  const durationMs = startTime && endTime ? endTime - startTime : 0;
  const avgReactionTimeMs =
    reactionTimes.length > 0
      ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
      : null;

  return {
    trialsPresented,
    userResponses,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    accuracy,
    dPrime: Number.isFinite(dPrime) ? dPrime : null,
    durationMs,
    avgReactionTimeMs,
  };
}

// =============================================================================
// Stats Recalculation - Memo Mode
// =============================================================================

function recalculateMemoStats(events: readonly GameEvent[]): RecalculatedStats {
  let trialsPresented = 0;
  let windowsCommitted = 0;
  let totalPicks = 0;
  let startTime: number | null = null;
  let endTime: number | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'RECALL_SESSION_STARTED':
        startTime = event.timestamp;
        break;

      case 'RECALL_SESSION_ENDED':
        endTime = event.timestamp;
        break;

      case 'RECALL_STIMULUS_SHOWN':
        trialsPresented++;
        break;

      case 'RECALL_WINDOW_COMMITTED':
        windowsCommitted++;
        break;

      case 'RECALL_PICKED': {
        // Count non-correction picks
        const pickEvent = event as GameEvent & { isCorrection?: boolean };
        if (!pickEvent.isCorrection) {
          totalPicks++;
        }
        break;
      }
    }
  }

  // For memo mode, we can't easily determine correct vs incorrect from events alone
  // The accuracy would need to come from the projector. For now, we estimate.
  const durationMs = startTime && endTime ? endTime - startTime : 0;

  return {
    trialsPresented,
    userResponses: windowsCommitted,
    hits: totalPicks, // We count all picks as attempts
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
    accuracy: windowsCommitted > 0 ? 1 : 0, // Placeholder - real accuracy needs projector
    dPrime: null,
    durationMs,
    avgReactionTimeMs: null,
  };
}

// =============================================================================
// Invariant Checks
// =============================================================================

function checkTimestampsAscending(events: readonly GameEvent[]): IntegrityCheck {
  let previousTimestamp = 0;
  let violations = 0;

  for (const event of events) {
    if (event.timestamp < previousTimestamp) {
      violations++;
    }
    previousTimestamp = event.timestamp;
  }

  return {
    name: 'timestamps_ascending',
    description: 'Les timestamps des events sont croissants',
    status: violations === 0 ? 'ok' : 'error',
    message: violations > 0 ? `${violations} violation(s) détectée(s)` : undefined,
    expected: 0,
    actual: violations,
  };
}

function checkNoMissingSessionEnd(events: readonly GameEvent[]): IntegrityCheck {
  const hasStart = events.some(
    (e) => e.type === 'SESSION_STARTED' || e.type === 'RECALL_SESSION_STARTED',
  );
  const hasEnd = events.some(
    (e) => e.type === 'SESSION_ENDED' || e.type === 'RECALL_SESSION_ENDED',
  );

  if (!hasStart) {
    return {
      name: 'session_boundaries',
      description: 'La session a un début et une fin',
      status: 'error',
      message: 'Aucun event de début de session trouvé',
    };
  }

  return {
    name: 'session_boundaries',
    description: 'La session a un début et une fin',
    status: hasEnd ? 'ok' : 'warning',
    message: hasEnd ? undefined : 'Session non terminée (abandon ou en cours)',
  };
}

function checkAccuracyInRange(stats: RecalculatedStats): IntegrityCheck {
  const inRange = stats.accuracy >= 0 && stats.accuracy <= 1;

  return {
    name: 'accuracy_range',
    description: 'Accuracy dans [0, 1]',
    status: inRange ? 'ok' : 'error',
    expected: '[0, 1]',
    actual: stats.accuracy,
    message: inRange ? undefined : `Accuracy hors limites: ${stats.accuracy}`,
  };
}

function checkDPrimeInRange(stats: RecalculatedStats): IntegrityCheck {
  if (stats.dPrime === null) {
    return {
      name: 'dprime_range',
      description: "d' dans [-2, 5] (plage normale)",
      status: 'ok',
      message: "d' non applicable pour ce mode",
    };
  }

  const inRange = stats.dPrime >= -2 && stats.dPrime <= 5;

  return {
    name: 'dprime_range',
    description: "d' dans [-2, 5] (plage normale)",
    status: inRange ? 'ok' : 'warning',
    expected: '[-2, 5]',
    actual: stats.dPrime.toFixed(2),
    message: inRange ? undefined : `d' inhabituel: ${stats.dPrime.toFixed(2)}`,
  };
}

function checkTrialResponseBalance(
  stats: RecalculatedStats,
  sessionType: 'flow' | 'memo' | 'unknown',
): IntegrityCheck {
  if (sessionType === 'memo') {
    // In memo mode, we check windows committed vs trials
    return {
      name: 'trial_response_balance',
      description: 'Équilibre trials/réponses',
      status: 'ok',
      message: `${stats.trialsPresented} trials, ${stats.userResponses} windows`,
    };
  }

  // Flow mode: responses should roughly match trials (minus buffer)
  const diff = Math.abs(stats.trialsPresented - stats.userResponses);
  const tolerance = Math.max(3, stats.trialsPresented * 0.1); // 10% or 3

  return {
    name: 'trial_response_balance',
    description: 'Nombre de réponses cohérent avec les trials',
    status: diff <= tolerance ? 'ok' : 'warning',
    expected: stats.trialsPresented,
    actual: stats.userResponses,
    message: diff > tolerance ? `Écart de ${diff} entre trials et réponses` : undefined,
  };
}

function checkNoNegativeValues(stats: RecalculatedStats): IntegrityCheck {
  const negatives: string[] = [];

  if (stats.hits < 0) negatives.push('hits');
  if (stats.misses < 0) negatives.push('misses');
  if (stats.falseAlarms < 0) negatives.push('falseAlarms');
  if (stats.correctRejections < 0) negatives.push('correctRejections');
  if (stats.durationMs < 0) negatives.push('durationMs');

  return {
    name: 'no_negative_values',
    description: 'Aucune valeur négative dans les stats',
    status: negatives.length === 0 ? 'ok' : 'error',
    message: negatives.length > 0 ? `Valeurs négatives: ${negatives.join(', ')}` : undefined,
  };
}

function checkReasonableDuration(stats: RecalculatedStats): IntegrityCheck {
  const minDuration = 10_000; // 10 seconds minimum
  const maxDuration = 3_600_000; // 1 hour maximum

  if (stats.durationMs === 0) {
    return {
      name: 'reasonable_duration',
      description: 'Durée de session raisonnable',
      status: 'warning',
      message: 'Durée de session = 0 (session non terminée ?)',
    };
  }

  const isReasonable = stats.durationMs >= minDuration && stats.durationMs <= maxDuration;

  return {
    name: 'reasonable_duration',
    description: 'Durée de session raisonnable (10s - 1h)',
    status: isReasonable ? 'ok' : 'warning',
    expected: '10s - 1h',
    actual: `${(stats.durationMs / 1000).toFixed(0)}s`,
    message: isReasonable
      ? undefined
      : `Durée inhabituelle: ${(stats.durationMs / 1000).toFixed(0)}s`,
  };
}

// =============================================================================
// Inverse Error Function (for d' calculation)
// =============================================================================

function inverseErf(x: number): number {
  // Approximation of inverse error function
  const a = 0.147;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const ln1MinusX2 = Math.log(1 - absX * absX);
  const term1 = 2 / (Math.PI * a) + ln1MinusX2 / 2;
  const term2 = ln1MinusX2 / a;

  return sign * Math.sqrt(Math.sqrt(term1 * term1 - term2) - term1);
}

// =============================================================================
// Main Analyzer
// =============================================================================

export function analyzeSessionEvents(
  sessionId: string,
  sessionEvents: readonly GameEvent[],
): IntegrityReport {
  if (sessionEvents.length === 0) return createEmptyReport(sessionId);

  // Determine session type
  const sessionType: 'flow' | 'memo' | 'unknown' = isMemoSession(sessionEvents)
    ? 'memo'
    : isPlaceSession(sessionEvents)
      ? 'flow'
      : 'unknown';

  // Count events
  const eventCounts = countEvents(sessionEvents);

  // Recalculate stats
  const recalculatedStats =
    sessionType === 'memo'
      ? recalculateMemoStats(sessionEvents)
      : recalculateFlowStats(sessionEvents);

  // Extract metadata with type guards
  const startEvent = sessionEvents.find(
    (e): e is AnyStartEvent => e.type === 'SESSION_STARTED' || e.type === 'RECALL_SESSION_STARTED',
  );
  const endEvent = sessionEvents.find(
    (e): e is AnyEndEvent => e.type === 'SESSION_ENDED' || e.type === 'RECALL_SESSION_ENDED',
  );

  // Type-safe access: SessionStartedEvent has nLevel, MemoSessionStartedEvent has config.nLevel
  const nLevel = startEvent
    ? 'nLevel' in startEvent
      ? startEvent.nLevel
      : startEvent.config.nLevel
    : 0;
  const completed = endEvent !== undefined && endEvent.reason !== 'abandoned';

  // Run all checks
  const checks: IntegrityCheck[] = [
    checkTimestampsAscending(sessionEvents),
    checkNoMissingSessionEnd(sessionEvents),
    checkAccuracyInRange(recalculatedStats),
    checkDPrimeInRange(recalculatedStats),
    checkTrialResponseBalance(recalculatedStats, sessionType),
    checkNoNegativeValues(recalculatedStats),
    checkReasonableDuration(recalculatedStats),
  ];

  // Determine overall status
  const overallStatus = worstStatus(checks.map((c) => c.status));

  // Generate summary
  const failedChecks = checks.filter((c) => c.status !== 'ok');
  const summary =
    failedChecks.length === 0
      ? 'Toutes les vérifications passent'
      : `${failedChecks.length} problème(s) détecté(s): ${failedChecks.map((c) => c.name).join(', ')}`;

  return {
    reportId: generateId(),
    generatedAt: Date.now(),
    sessionId,
    sessionType,
    nLevel,
    startedAt: startEvent?.timestamp ?? 0,
    endedAt: endEvent?.timestamp ?? null,
    completed,
    eventCounts,
    recalculatedStats,
    checks,
    overallStatus,
    summary,
  };
}

function createEmptyReport(sessionId: string): IntegrityReport {
  return {
    reportId: generateId(),
    generatedAt: Date.now(),
    sessionId,
    sessionType: 'unknown',
    nLevel: 0,
    startedAt: 0,
    endedAt: null,
    completed: false,
    eventCounts: { total: 0, byType: {} },
    recalculatedStats: {
      trialsPresented: 0,
      userResponses: 0,
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
      accuracy: 0,
      dPrime: null,
      durationMs: 0,
      avgReactionTimeMs: null,
    },
    checks: [
      {
        name: 'session_exists',
        description: 'La session existe',
        status: 'error',
        message: 'Aucun event trouvé pour cette session',
      },
    ],
    overallStatus: 'error',
    summary: 'Session introuvable',
  };
}

// =============================================================================
// Analyze All Sessions
// =============================================================================

export function analyzeAllSessionsFromEvents(
  allEvents: readonly GameEvent[],
): IntegrityReportSummary[] {
  const bySessionId = new Map<string, GameEvent[]>();
  for (const event of allEvents) {
    const sessionId = event.sessionId?.trim();
    if (!sessionId) continue;
    const existing = bySessionId.get(sessionId) ?? [];
    existing.push(event);
    bySessionId.set(sessionId, existing);
  }

  const summaries: IntegrityReportSummary[] = [];

  for (const [sessionId, sessionEvents] of bySessionId) {
    const report = analyzeSessionEvents(sessionId, sessionEvents);
    summaries.push({
      reportId: report.reportId,
      sessionId: report.sessionId,
      sessionType: report.sessionType,
      nLevel: report.nLevel,
      generatedAt: report.generatedAt,
      overallStatus: report.overallStatus,
      checksCount: report.checks.length,
      failedChecksCount: report.checks.filter((c) => c.status !== 'ok').length,
    });
  }

  // Sort by most recent first
  summaries.sort((a, b) => b.generatedAt - a.generatedAt);

  return summaries;
}
