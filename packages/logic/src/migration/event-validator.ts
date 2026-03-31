/**
 * Event Validator
 *
 * Validates and migrates events from database rows.
 * Single entry point for all event reconstruction.
 *
 * Flow:
 * 1. Parse raw JSON payload
 * 2. Detect schema version (default: 1 for old events)
 * 3. Apply migrations if needed
 * 4. Validate against current Zod schema
 * 5. Return typed GameEvent or error
 */

import type { GameEvent } from '../engine/events';
import { GameEventSchema } from '../engine/events';
import { getBadgeById } from '../domain/progression/badges';
import { SOUNDS } from '../types/core';
import { eventMigrationRegistry } from './event-migration-registry';
import type { MigrationResult, RawVersionedEvent, ValidationConfig, SchemaVersion } from './types';
import { DEFAULT_VALIDATION_CONFIG } from './types';

type PathSegment = PropertyKey;

function cloneForValidation<T>(value: T): T {
  // Prefer structuredClone when available (keeps numbers/arrays/objects, loses functions which we don't have here).
  // Fallback to JSON clone for older runtimes (good enough for raw event payloads).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function removeUnrecognizedKeysAtPath(
  root: unknown,
  path: readonly PathSegment[],
  keys: readonly string[],
): void {
  let cursor: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'symbol') return;
    if (typeof cursor !== 'object' || cursor === null) return;
    cursor = (cursor as Record<string, unknown> | unknown[])[segment as never];
  }

  if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return;
  const obj = cursor as Record<string, unknown>;
  for (const key of keys) {
    delete obj[key];
  }
}

function normalizeLegacyEvent(rawEvent: RawVersionedEvent): RawVersionedEvent {
  // Backward compatibility: older Flow/DualPick datasets used `placementOrderMode: 'guided'`.
  // Normalize to the canonical `random` value before Zod validation (keeps WRITE schema strict).
  if (rawEvent.type === 'FLOW_SESSION_STARTED' || rawEvent.type === 'DUAL_PICK_SESSION_STARTED') {
    const legacy = rawEvent as Record<string, unknown>;
    const config = legacy['config'];
    if (typeof config === 'object' && config !== null && !Array.isArray(config)) {
      const cfg = config as Record<string, unknown>;
      if (cfg['placementOrderMode'] === 'guided') {
        return {
          ...(legacy as RawVersionedEvent),
          config: { ...cfg, placementOrderMode: 'random' },
        } as RawVersionedEvent;
      }
    }
  }

  // Backward compatibility: some old events redundantly embedded `userId` in the payload,
  // even when the canonical schema stores user ownership in the DB column (`events.user_id`).
  // Keep WRITE schemas strict, but tolerate READ by stripping this legacy key.
  // Note: SESSION_ENDED also had this — the schema uses .strict() so the extra key fails.
  if (
    rawEvent.type === 'BADGE_UNLOCKED' ||
    rawEvent.type === 'JOURNEY_CONTEXT_COMPUTED' ||
    rawEvent.type === 'JOURNEY_TRANSITION_DECIDED' ||
    rawEvent.type === 'SESSION_ENDED'
  ) {
    const legacy = rawEvent as Record<string, unknown>;
    if (typeof legacy['userId'] === 'string') {
      const { userId: _userId, ...rest } = legacy;
      return rest as RawVersionedEvent;
    }
  }

  // Backward compatibility: older BADGE_UNLOCKED events stored badge data nested as
  // { badge: { id, category, priority, ... } } instead of the canonical flat shape
  // { badgeId, category, priority }. Flatten the nested object before Zod validation.
  if (rawEvent.type === 'BADGE_UNLOCKED') {
    const legacy = rawEvent as Record<string, unknown>;
    const badge = legacy['badge'];
    if (typeof badge === 'object' && badge !== null && !Array.isArray(badge)) {
      const b = badge as Record<string, unknown>;
      const next: Record<string, unknown> = { ...legacy };
      // Map badge.id → badgeId (only if canonical key is missing)
      if (typeof next['badgeId'] !== 'string' && typeof b['id'] === 'string') {
        next['badgeId'] = b['id'];
      }
      // Map badge.category → category
      if (typeof next['category'] !== 'string' && typeof b['category'] === 'string') {
        next['category'] = b['category'];
      }
      // Map badge.priority → priority
      if (typeof next['priority'] !== 'number' && typeof b['priority'] === 'number') {
        next['priority'] = b['priority'];
      }
      const resolvedBadgeId =
        typeof next['badgeId'] === 'string'
          ? next['badgeId']
          : typeof b['badgeId'] === 'string'
            ? b['badgeId']
            : undefined;
      if (typeof next['badgeId'] !== 'string' && typeof b['badgeId'] === 'string') {
        next['badgeId'] = b['badgeId'];
      }
      const badgeDefinition =
        typeof resolvedBadgeId === 'string' ? getBadgeById(resolvedBadgeId) : undefined;
      if (typeof next['category'] !== 'string' && badgeDefinition) {
        next['category'] = badgeDefinition.category;
      }
      if (typeof next['priority'] !== 'number' && badgeDefinition) {
        next['priority'] = badgeDefinition.priority ?? 0;
      }
      // Remove nested badge object (strict schema rejects unrecognized keys)
      delete next['badge'];
      return next as RawVersionedEvent;
    }

    if (typeof legacy['badgeId'] === 'string') {
      const badgeDefinition = getBadgeById(legacy['badgeId']);
      if (
        badgeDefinition &&
        (typeof legacy['category'] !== 'string' || typeof legacy['priority'] !== 'number')
      ) {
        return {
          ...legacy,
          category:
            typeof legacy['category'] === 'string' ? legacy['category'] : badgeDefinition.category,
          priority:
            typeof legacy['priority'] === 'number'
              ? legacy['priority']
              : (badgeDefinition.priority ?? 0),
        } as unknown as RawVersionedEvent;
      }
    }
  }

  // Backward compatibility: legacy Trace self-paced sessions stored responseWindowMs=0.
  // Current schema allows 0 only when rhythmMode=self-paced. Some datasets had missing/incorrect
  // rhythmMode, so we fix it up here before Zod validation.
  if (rawEvent.type === 'TRACE_SESSION_STARTED') {
    const legacy = rawEvent as Record<string, unknown>;
    let mutated = false;
    let next = legacy;

    // Fix config.responseWindowMs: set rhythmMode to self-paced when responseWindowMs=0
    const config = legacy['config'];
    if (typeof config === 'object' && config !== null && !Array.isArray(config)) {
      const cfg = config as Record<string, unknown>;
      if (cfg['responseWindowMs'] === 0 && cfg['rhythmMode'] !== 'self-paced') {
        next = { ...next, config: { ...cfg, rhythmMode: 'self-paced' } };
        mutated = true;
      }
    }

    // Fix spec.timing.responseWindowMs: TimingSpecSchema expects .positive().optional(),
    // so 0 is invalid. Remove it (field is optional) for self-paced sessions.
    const spec = legacy['spec'];
    if (typeof spec === 'object' && spec !== null && !Array.isArray(spec)) {
      const s = spec as Record<string, unknown>;
      const timing = s['timing'];
      if (typeof timing === 'object' && timing !== null && !Array.isArray(timing)) {
        const t = timing as Record<string, unknown>;
        if (t['responseWindowMs'] === 0) {
          const { responseWindowMs: _rw, ...restTiming } = t;
          next = { ...next, spec: { ...s, timing: restTiming } };
          mutated = true;
        }
      }
    }

    if (mutated) return next as RawVersionedEvent;
  }

  // Backward compatibility: some old datasets used USER_RESPONSE instead of USER_RESPONDED.
  // Normalize to the canonical discriminator before Zod validation.
  if (rawEvent.type === 'USER_RESPONSE') {
    const legacy = rawEvent as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...legacy, type: 'USER_RESPONDED' };

    // Opportunistic key normalization (only when the canonical key is missing).
    if (typeof legacy['trialIndex'] !== 'number') {
      if (typeof legacy['trial'] === 'number') normalized['trialIndex'] = legacy['trial'];
      const trialObj = legacy['trial'] as { index?: unknown } | undefined;
      if (typeof trialObj?.index === 'number') normalized['trialIndex'] = trialObj.index;
    }

    if (typeof legacy['modality'] !== 'string' && typeof legacy['modalityId'] === 'string') {
      normalized['modality'] = legacy['modalityId'];
    }

    if (typeof legacy['reactionTimeMs'] !== 'number') {
      const rt =
        typeof legacy['reactionTime'] === 'number'
          ? legacy['reactionTime']
          : typeof legacy['rtMs'] === 'number'
            ? legacy['rtMs']
            : typeof legacy['rt'] === 'number'
              ? legacy['rt']
              : undefined;
      if (typeof rt === 'number') {
        normalized['reactionTimeMs'] = rt;
      }
    }

    if (typeof legacy['pressDurationMs'] !== 'number') {
      const pressDuration =
        typeof legacy['pressDuration'] === 'number'
          ? legacy['pressDuration']
          : typeof legacy['durationMs'] === 'number'
            ? legacy['durationMs']
            : undefined;
      normalized['pressDurationMs'] = typeof pressDuration === 'number' ? pressDuration : 0;
    }

    if (typeof legacy['responsePhase'] !== 'string') {
      // Older events sometimes stored a coarse `phase` ("stimulus"/"waiting").
      const phase = legacy['phase'];
      if (phase === 'stimulus') normalized['responsePhase'] = 'during_stimulus';
      else if (phase === 'waiting') normalized['responsePhase'] = 'after_stimulus';
    }

    return normalized as RawVersionedEvent;
  }

  if (rawEvent.type === 'TRIAL_PRESENTED') {
    const legacy = rawEvent as Record<string, unknown>;
    const trial = legacy['trial'] as Record<string, unknown> | undefined;
    if (!trial || typeof trial !== 'object') return rawEvent;

    const nextTrial: Record<string, unknown> = { ...trial };

    // Legacy position pool was sometimes 0-8 or arbitrary ints; clamp to 8-position pool (0-7).
    if (typeof nextTrial['position'] === 'number' && Number.isFinite(nextTrial['position'])) {
      const normalized = ((nextTrial['position'] % 8) + 8) % 8;
      nextTrial['position'] = normalized;
    }

    // Legacy audio pool sometimes used A-H; map deterministically to the canonical 8-letter pool.
    if (typeof nextTrial['sound'] === 'string' && nextTrial['sound'].length === 1) {
      const code = nextTrial['sound'].charCodeAt(0);
      const idx = code - 65; // 'A'
      if (idx >= 0 && idx < SOUNDS.length) {
        const mapped = SOUNDS[idx];
        if (mapped) nextTrial['sound'] = mapped;
      }
    }

    // Legacy trialType strings: buffer/target/standard → canonical FR labels.
    if (
      typeof nextTrial['trialType'] === 'string' &&
      (nextTrial['trialType'] === 'buffer' ||
        nextTrial['trialType'] === 'target' ||
        nextTrial['trialType'] === 'standard')
    ) {
      const isBuffer = nextTrial['isBuffer'] === true;
      const isPositionTarget = nextTrial['isPositionTarget'] === true;
      const isSoundTarget = nextTrial['isSoundTarget'] === true;

      nextTrial['trialType'] = isBuffer
        ? 'Tampon'
        : isPositionTarget && isSoundTarget
          ? 'Dual'
          : isPositionTarget
            ? 'V-Seul'
            : isSoundTarget
              ? 'A-Seul'
              : 'Non-Cible';
    }

    return { ...rawEvent, trial: nextTrial } as RawVersionedEvent;
  }

  // Backward compatibility: legacy Trace datasets sometimes had invalid positions.
  // Dual Trace can now run on true grids (up to 4×4 → 16 positions).
  // Clamp to the safe superset range [0..15] so old corruption doesn't break validation.
  if (
    rawEvent.type === 'TRACE_STIMULUS_SHOWN' ||
    rawEvent.type === 'TRACE_RESPONDED' ||
    rawEvent.type === 'TRACE_TIMED_OUT'
  ) {
    const legacy = rawEvent as Record<string, unknown>;
    const next: Record<string, unknown> = { ...legacy };
    const normalizePos = (value: unknown): unknown => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return value;
      const n = Math.trunc(value);
      if (n < 0) return 0;
      if (n > 15) return 15;
      return n;
    };
    if ('position' in next) next['position'] = normalizePos(next['position']);
    if ('expectedPosition' in next)
      next['expectedPosition'] = normalizePos(next['expectedPosition']);
    return next as RawVersionedEvent;
  }

  // Backward compatibility: old SESSION_ENDED events may have missing or invalid reason/playContext.
  // Default to 'completed' reason and 'free' playContext for backward compatibility.
  if (rawEvent.type === 'SESSION_ENDED') {
    const legacy = rawEvent as Record<string, unknown>;
    const next: Record<string, unknown> = { ...legacy };

    // Normalize reason: default to 'completed' if missing or invalid
    const reason = next['reason'];
    if (
      typeof reason !== 'string' ||
      (reason !== 'completed' && reason !== 'abandoned' && reason !== 'error')
    ) {
      next['reason'] = 'completed';
    }

    // Normalize playContext: default to 'free' if missing or invalid
    const playContext = next['playContext'];
    if (
      typeof playContext !== 'string' ||
      (playContext !== 'journey' &&
        playContext !== 'free' &&
        playContext !== 'synergy' &&
        playContext !== 'calibration' &&
        playContext !== 'profile')
    ) {
      next['playContext'] = 'free';
    }

    return next as RawVersionedEvent;
  }

  return rawEvent;
}

/**
 * Migrate and validate a raw event from database.
 *
 * @param rawEvent - Raw event from database (type/timestamp/payload merged)
 * @param config - Validation configuration
 * @returns MigrationResult with validated event or error details
 */
export function migrateAndValidateEvent(
  rawEvent: RawVersionedEvent,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): MigrationResult {
  const sourceVersion = ((rawEvent.schemaVersion as number) ?? 1) as SchemaVersion;
  const needsMigration = sourceVersion !== config.targetVersion;

  try {
    // Step 1: Normalize event (ensure schemaVersion is present)
    let normalizedEvent: RawVersionedEvent = rawEvent;
    if (rawEvent.schemaVersion === undefined || rawEvent.schemaVersion === null) {
      normalizedEvent = { ...rawEvent, schemaVersion: sourceVersion };
    }

    // Step 1b: Legacy compatibility normalization (type aliases, renamed fields, etc.)
    normalizedEvent = normalizeLegacyEvent(normalizedEvent);

    // Step 2: Apply migrations if needed
    let migratedEvent = normalizedEvent;

    if (needsMigration) {
      migratedEvent = eventMigrationRegistry.migrate(normalizedEvent, config.targetVersion);
    }

    // Step 3: Validate against Zod schema
    let eventForValidation = migratedEvent as unknown;
    let parseResult = GameEventSchema.safeParse(eventForValidation);

    // Non-strict mode: allow forward-compatible reads by stripping *unrecognized keys* only
    // for validation purposes, while returning the original (lossless) object on success.
    if (!parseResult.success && !config.strict) {
      eventForValidation = cloneForValidation(migratedEvent);
      // Iteratively remove unrecognized keys, as Zod may report them at different depths.
      for (let i = 0; i < 5; i++) {
        const result = GameEventSchema.safeParse(eventForValidation);
        if (result.success) {
          parseResult = result;
          break;
        }

        const unrecognized = result.error.issues.filter(
          (issue): issue is typeof issue & { keys: string[] } =>
            (issue as { code?: unknown }).code === 'unrecognized_keys' &&
            Array.isArray((issue as { keys?: unknown }).keys),
        );
        if (unrecognized.length === 0) {
          parseResult = result;
          break;
        }

        for (const issue of unrecognized) {
          removeUnrecognizedKeysAtPath(eventForValidation, issue.path, issue.keys);
        }
      }
    }

    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');

      if (config.logErrors) {
        console.error(
          `[EventValidator] Validation failed for ${rawEvent.type} (v${sourceVersion}):`,
          errorMessage,
        );
      }

      if (config.strict) {
        throw new Error(`Event validation failed: ${errorMessage}`);
      }

      return {
        success: false,
        error: errorMessage,
        originalEvent: rawEvent,
        stage: 'validation',
      };
    }

    return {
      success: true,
      // IMPORTANT: Zod strips unknown keys by default. For legacy/backward-compatible datasets,
      // this can silently drop useful fields that we still want to keep for projections
      // (e.g. journeyId/playContext added later).
      //
      // We still validate against the current schema to ensure required fields exist,
      // but we can also return the canonical validated shape when the caller needs it.
      event:
        (config.output ?? 'lossless') === 'canonical'
          ? (parseResult.data as unknown as GameEvent)
          : (migratedEvent as unknown as GameEvent),
      migrated: needsMigration,
      fromVersion: sourceVersion,
      toVersion: config.targetVersion,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (config.logErrors) {
      console.error(
        `[EventValidator] Migration/validation error for ${rawEvent.type}:`,
        errorMessage,
      );
    }

    if (config.strict) {
      throw error;
    }

    return {
      success: false,
      error: errorMessage,
      originalEvent: rawEvent,
      stage: 'migration',
    };
  }
}

/**
 * Batch migrate and validate events.
 * Returns array of validated events (skipping failures).
 *
 * @param rawEvents - Array of raw events from database
 * @param config - Validation configuration
 * @returns Validated GameEvent array and error count
 */
export function migrateAndValidateEventBatch(
  rawEvents: RawVersionedEvent[],
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): {
  events: GameEvent[];
  errorCount: number;
  errors: Array<{ event: RawVersionedEvent; error: string }>;
} {
  const validEvents: GameEvent[] = [];
  const errors: Array<{ event: RawVersionedEvent; error: string }> = [];

  for (const rawEvent of rawEvents) {
    const result = migrateAndValidateEvent(rawEvent, config);

    if (result.success) {
      validEvents.push(result.event);
    } else {
      errors.push({ event: result.originalEvent, error: result.error });
    }
  }

  return {
    events: validEvents,
    errorCount: errors.length,
    errors,
  };
}

/**
 * Quick check if event has valid shape (before full validation).
 * Useful for filtering before batch operations.
 */
export function isValidEventShape(rawEvent: unknown): rawEvent is RawVersionedEvent {
  if (typeof rawEvent !== 'object' || rawEvent === null) return false;

  const event = rawEvent as Record<string, unknown>;
  return (
    typeof event['id'] === 'string' &&
    typeof event['type'] === 'string' &&
    typeof event['sessionId'] === 'string' &&
    typeof event['timestamp'] === 'number'
  );
}

/**
 * Safe parse for events - never throws.
 * Returns null for invalid events.
 */
export function safeParseEvent(rawEvent: unknown): GameEvent | null {
  if (!isValidEventShape(rawEvent)) {
    return null;
  }

  const result = migrateAndValidateEvent(rawEvent, {
    ...DEFAULT_VALIDATION_CONFIG,
    strict: false,
    logErrors: false,
  });

  return result.success ? result.event : null;
}
