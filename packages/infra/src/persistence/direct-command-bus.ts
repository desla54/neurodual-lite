/**
 * DirectCommandBus — drop-in replacement for the Emmett CommandBus.
 *
 * Implements CommandBusPort but writes directly to SQLite read-model tables
 * instead of going through EventStore → ProcessorEngine → Projections.
 *
 * Mid-session events (RECORD_TRIAL, RECORD_RESPONSE, RECORD_TELEMETRY) are
 * no-ops — the events are already accumulated in the XState machine's
 * context.sessionEvents array in memory.
 *
 * SESSION/END triggers SessionWriter.finalizeSession() which atomically
 * writes all read-model tables.
 *
 * BADGE_UNLOCKED and XP_BREAKDOWN_COMPUTED are no-ops — these are computed
 * inline during finalizeSession().
 *
 * CALIBRATION/* commands are handled via the existing applyDirectly() functions.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { CommandBusPort } from '@neurodual/logic';
import { createSessionWriter } from './session-writer';
import {
  applyBaselineDirectly,
  applyResetDirectly,
} from '../projections/cognitive-profile-projection';

// =============================================================================
// Types
// =============================================================================

export interface DirectCommandBusOptions {
  readonly db: AbstractPowerSyncDatabase;
}

// =============================================================================
// Implementation
// =============================================================================

export function createDirectCommandBus(options: DirectCommandBusOptions): CommandBusPort {
  const { db } = options;
  const writer = createSessionWriter({ db });

  // Cache of session events accumulated in memory.
  // Populated by SESSION/START and mid-session commands.
  // Consumed and cleared by SESSION/END.
  const sessionEventsCache = new Map<string, Record<string, unknown>[]>();

  const bus: CommandBusPort & { setSessionEndWorkflowRunner?: (runner: unknown) => void } = {
    // No-op: DirectCommandBus doesn't use a workflow runner (badges/XP computed inline).
    setSessionEndWorkflowRunner(_runner: unknown) {},

    async handle(command) {
      const { type, data } = command;
      const sessionId = data['sessionId'] as string | undefined;

      switch (type) {
        // =====================================================================
        // Session lifecycle
        // =====================================================================

        case 'SESSION/START': {
          // Cache the start event. The actual write happens at SESSION/END.
          if (sessionId) {
            const event = data['event'] as Record<string, unknown> | undefined;
            if (event) {
              sessionEventsCache.set(sessionId, [event]);
            }
          }
          return { events: [], fromCache: false };
        }

        case 'SESSION/RECORD_TRIAL':
        case 'SESSION/RECORD_RESPONSE':
        case 'SESSION/RECORD_TELEMETRY': {
          // No-op: events are already in context.sessionEvents in memory.
          // We also cache them here for the SESSION/END finalization.
          if (sessionId) {
            const event = data['event'] as Record<string, unknown> | undefined;
            if (event) {
              const events = sessionEventsCache.get(sessionId) ?? [];
              events.push(event);
              sessionEventsCache.set(sessionId, events);
            }
          }
          return { events: [], fromCache: false };
        }

        case 'SESSION/RECORD_EVENTS_BATCH': {
          // Batch variant of RECORD_TRIAL
          if (sessionId) {
            const batchEvents = data['events'] as readonly Record<string, unknown>[] | undefined;
            if (batchEvents) {
              const events = sessionEventsCache.get(sessionId) ?? [];
              events.push(...batchEvents);
              sessionEventsCache.set(sessionId, events);
            }
          }
          return { events: [], fromCache: false };
        }

        case 'SESSION/END': {
          if (!sessionId) {
            console.warn('[DirectCommandBus] SESSION/END without sessionId');
            return { events: [], fromCache: false };
          }

          // Get events from cache or from data.event
          let allEvents = sessionEventsCache.get(sessionId) ?? [];
          const endEvent = data['event'] as Record<string, unknown> | undefined;
          if (endEvent) {
            allEvents = [...allEvents, endEvent];
          }

          // Clean up cache
          sessionEventsCache.delete(sessionId);

          // Finalize: atomic write to all read-model tables
          try {
            await writer.finalizeSession(sessionId, allEvents);
          } catch (err) {
            console.error(`[DirectCommandBus] finalizeSession failed for ${sessionId}`, err);
          }

          return { events: [], fromCache: false };
        }

        // =====================================================================
        // Derived events (computed inline in finalizeSession, so these are no-ops)
        // =====================================================================

        case 'SESSION/UNLOCK_BADGE':
        case 'SESSION/COMPUTE_XP_BREAKDOWN':
        case 'SESSION/COMPUTE_JOURNEY_CONTEXT': {
          // No-op: badges and XP are computed inline during finalization.
          return { events: [], fromCache: false };
        }

        // =====================================================================
        // Calibration (direct writes to cognitive_profile_projection)
        // =====================================================================

        case 'CALIBRATION/SET_BASELINE': {
          const userId = data['userId'] as string;
          const event = data['event'] as Record<string, unknown>;
          const level = event?.['level'];
          if (typeof userId === 'string' && typeof level === 'number') {
            try {
              await applyBaselineDirectly(db, userId, level);
            } catch (err) {
              console.error('[DirectCommandBus] CALIBRATION/SET_BASELINE failed', err);
            }
          }
          return { events: [], fromCache: false };
        }

        case 'CALIBRATION/RESET': {
          const userId = data['userId'] as string;
          if (typeof userId === 'string') {
            try {
              await applyResetDirectly(db, userId);
            } catch (err) {
              console.error('[DirectCommandBus] CALIBRATION/RESET failed', err);
            }
          }
          return { events: [], fromCache: false };
        }

        case 'CALIBRATION/MODALITY_DETERMINED': {
          // The cognitive profile projection handles this via applyDirectly patterns.
          // For now, this is a best-effort direct update.
          return { events: [], fromCache: false };
        }

        // =====================================================================
        // Synergy Loop (simple key-value persistence)
        // =====================================================================

        case 'SYNERGY_LOOP/CONFIGURE':
        case 'SYNERGY_LOOP/START':
        case 'SYNERGY_LOOP/COMPLETE_STEP':
        case 'SYNERGY_LOOP/RESET': {
          // Synergy loop state is managed separately (algorithm_states or similar).
          // For now, no-op — the synergy state machine handles its own persistence.
          return { events: [], fromCache: false };
        }

        default: {
          console.warn(`[DirectCommandBus] Unknown command type: ${type}`);
          return { events: [], fromCache: false };
        }
      }
    },
  };

  return bus;
}
