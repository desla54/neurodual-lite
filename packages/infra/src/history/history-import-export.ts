/**
 * History Import/Export
 *
 * Handles serialization and deserialization of session history.
 * Uses Zod validation at boundaries for safety.
 */

import {
  safeParseWithLog,
  SessionHistoryExportSchema,
  migrateAndValidateEvent,
  type EventInput,
  type RawVersionedEvent,
  type GeneratorName,
  type SessionHistoryExport,
  type ImportResult,
  type SessionHistoryItem,
  type PersistencePort,
} from '@neurodual/logic';
import { historyLog } from '../logger';
import { insertSessionSummaryFromEvent } from './history-projection';

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function normalizeImportedGenerator(
  generator: string,
  gameMode: string | undefined,
): GeneratorName {
  if (
    generator === 'Aleatoire' ||
    generator === 'BrainWorkshop' ||
    generator === 'DualnbackClassic' ||
    generator === 'Sequence'
  ) {
    return generator;
  }

  // Backward compatibility: older exports used informal generator strings (e.g. "standard").
  if (gameMode === 'dualnback-classic') return 'DualnbackClassic';
  if (gameMode === 'sim-brainworkshop') return 'BrainWorkshop';
  return 'Aleatoire';
}

// =============================================================================
// Export
// =============================================================================

/**
 * Export all sessions to a portable JSON format.
 */
export function exportSessionsToJSON(sessions: SessionHistoryItem[]): SessionHistoryExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      nLevel: s.nLevel,
      dPrime: s.dPrime,
      passed: s.passed,
      trialsCount: s.trialsCount,
      durationMs: s.durationMs,
      byModality: s.byModality,
      generator: s.generator,
      gameMode: s.gameMode,
      activeModalities: s.activeModalities,
      reason: s.reason,
      journeyStageId: s.journeyStageId,
      journeyId: s.journeyId,
      playContext: s.playContext,
      // Score metrics
      upsScore: s.upsScore,
      upsAccuracy: s.upsAccuracy,
      upsConfidence: s.upsConfidence,
      // Confidence metrics (only included if present)
      flowConfidenceScore: s.flowConfidenceScore,
      flowDirectnessRatio: s.flowDirectnessRatio,
      flowWrongSlotDwellMs: s.flowWrongSlotDwellMs,
      recallConfidenceScore: s.recallConfidenceScore,
      recallFluencyScore: s.recallFluencyScore,
      recallCorrectionsCount: s.recallCorrectionsCount,
      // Timing metrics (for stats without events)
      avgResponseTimeMs: s.avgResponseTimeMs,
      medianResponseTimeMs: s.medianResponseTimeMs,
      responseTimeStdDev: s.responseTimeStdDev,
      avgPressDurationMs: s.avgPressDurationMs,
      pressDurationStdDev: s.pressDurationStdDev,
      responsesDuringStimulus: s.responsesDuringStimulus,
      responsesAfterStimulus: s.responsesAfterStimulus,
      // Focus metrics
      focusLostCount: s.focusLostCount,
      focusLostTotalMs: s.focusLostTotalMs,
    })),
  };
}

// =============================================================================
// Import
// =============================================================================

/**
 * Import sessions from a JSON export.
 * Validates data at boundary using Zod schema.
 */
export async function importSessionsFromJSON(
  persistence: PersistencePort,
  data: SessionHistoryExport,
  existingSessions: SessionHistoryItem[],
  options?: { targetUserId?: string | null },
): Promise<ImportResult> {
  // Zod validation at boundary
  const parseResult = safeParseWithLog(SessionHistoryExportSchema, data, 'importSessions');
  if (!parseResult.success) {
    const errorMessages = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    return {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [`Invalid import data: ${errorMessages.join(', ')}`],
    };
  }
  const validatedData = parseResult.data;

  const existingIds = new Set(existingSessions.map((s) => s.id));
  const errors: string[] = [];

  // Count existing vs new
  let existingCount = 0;
  for (const session of validatedData.sessions) {
    if (existingIds.has(session.id)) {
      existingCount++;
    }
  }
  const newCount = validatedData.sessions.length - existingCount;

  // Build all imported events upfront.
  const eventsToInsert: EventInput[] = [];
  const targetUserId = options?.targetUserId ?? undefined;

  for (const session of validatedData.sessions) {
    // Content-addressed deterministic ID:
    // - same payload => same ID (idempotent re-import),
    // - changed payload => new event (preserves full event-sourced history).
    const payloadSignature = JSON.stringify({
      id: session.id,
      createdAt: session.createdAt,
      nLevel: session.nLevel,
      dPrime: session.dPrime,
      passed: session.passed,
      trialsCount: session.trialsCount,
      durationMs: session.durationMs,
      generator: session.generator,
      gameMode: session.gameMode,
      activeModalities: session.activeModalities,
      byModality: session.byModality,
      reason: session.reason,
      journeyStageId: session.journeyStageId,
      journeyId: session.journeyId,
      playContext: session.playContext,
      upsScore: session.upsScore,
      upsAccuracy: session.upsAccuracy,
      upsConfidence: session.upsConfidence,
      flowConfidenceScore: session.flowConfidenceScore,
      flowDirectnessRatio: session.flowDirectnessRatio,
      flowWrongSlotDwellMs: session.flowWrongSlotDwellMs,
      recallConfidenceScore: session.recallConfidenceScore,
      recallFluencyScore: session.recallFluencyScore,
      recallCorrectionsCount: session.recallCorrectionsCount,
      avgResponseTimeMs: session.avgResponseTimeMs,
      medianResponseTimeMs: session.medianResponseTimeMs,
      responseTimeStdDev: session.responseTimeStdDev,
      avgPressDurationMs: session.avgPressDurationMs,
      pressDurationStdDev: session.pressDurationStdDev,
      responsesDuringStimulus: session.responsesDuringStimulus,
      responsesAfterStimulus: session.responsesAfterStimulus,
      focusLostCount: session.focusLostCount,
      focusLostTotalMs: session.focusLostTotalMs,
    });
    const payloadHash = hashString(payloadSignature);
    const eventId = targetUserId
      ? `imported:${targetUserId}:${session.id}:${payloadHash}`
      : `imported:local:${session.id}:${payloadHash}`;

    // Build event
    eventsToInsert.push({
      id: eventId,
      userId: targetUserId,
      sessionId: session.id,
      type: 'SESSION_IMPORTED',
      timestamp: Date.now(),
      payload: {
        nLevel: session.nLevel,
        dPrime: session.dPrime,
        passed: session.passed,
        trialsCount: session.trialsCount,
        durationMs: session.durationMs,
        generator: normalizeImportedGenerator(session.generator, session.gameMode),
        gameMode: session.gameMode,
        activeModalities: session.activeModalities,
        byModality: session.byModality,
        originalCreatedAt: session.createdAt,
        reason: session.reason ?? 'completed',
        journeyStageId: session.journeyStageId,
        journeyId: session.journeyId,
        playContext: session.playContext,
        upsScore: session.upsScore,
        upsAccuracy: session.upsAccuracy,
        upsConfidence: session.upsConfidence,
        flowConfidenceScore: session.flowConfidenceScore,
        flowDirectnessRatio: session.flowDirectnessRatio,
        flowWrongSlotDwellMs: session.flowWrongSlotDwellMs,
        recallConfidenceScore: session.recallConfidenceScore,
        recallFluencyScore: session.recallFluencyScore,
        recallCorrectionsCount: session.recallCorrectionsCount,
        avgResponseTimeMs: session.avgResponseTimeMs,
        medianResponseTimeMs: session.medianResponseTimeMs,
        responseTimeStdDev: session.responseTimeStdDev,
        avgPressDurationMs: session.avgPressDurationMs,
        pressDurationStdDev: session.pressDurationStdDev,
        responsesDuringStimulus: session.responsesDuringStimulus,
        responsesAfterStimulus: session.responsesAfterStimulus,
        focusLostCount: session.focusLostCount,
        focusLostTotalMs: session.focusLostTotalMs,
      },
    });
  }

  // Batch insert in chunks
  const CHUNK_SIZE = 100;
  const startTime = performance.now();
  let totalAffected = 0;

  for (let i = 0; i < eventsToInsert.length; i += CHUNK_SIZE) {
    const eventsChunk = eventsToInsert.slice(i, i + CHUNK_SIZE);

    try {
      let projectedCount = 0;
      for (const importedEvent of eventsChunk) {
        const rawEvent: RawVersionedEvent = {
          id: importedEvent.id,
          sessionId: importedEvent.sessionId,
          type: importedEvent.type,
          timestamp: importedEvent.timestamp,
          schemaVersion: (importedEvent.payload['schemaVersion'] as number) ?? 1,
          ...importedEvent.payload,
        };

        let validated: ReturnType<typeof migrateAndValidateEvent>;
        try {
          validated = migrateAndValidateEvent(rawEvent, {
            strict: true,
            logErrors: true,
            targetVersion: 1,
          });
        } catch (validationError) {
          errors.push(
            `Import event validation failed for session ${importedEvent.sessionId}: ${String(validationError)}`,
          );
          continue;
        }
        if (!validated.success) {
          errors.push(
            `Import event validation failed for session ${importedEvent.sessionId}: ${validated.error}`,
          );
          continue;
        }

        await insertSessionSummaryFromEvent(persistence, validated.event);
        projectedCount++;
      }

      totalAffected += projectedCount;
    } catch (err) {
      errors.push(`Failed to import chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${err}`);
    }
  }

  const imported = newCount;
  const updated = existingCount;

  historyLog.info(
    `Import: ${imported} new, ${updated} updated in ${(performance.now() - startTime).toFixed(0)}ms`,
  );

  // Note: totalAffected is used by the caller to decide whether to refresh cache
  const result: ImportResult & { totalAffected: number } = {
    imported,
    updated,
    skipped: 0,
    errors,
    totalAffected,
  };
  return result;
}
