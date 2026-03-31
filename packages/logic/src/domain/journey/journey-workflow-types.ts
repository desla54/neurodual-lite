/**
 * Journey Workflow Types
 *
 * Discriminated union of outputs following the Emmett Workflow pattern:
 * decide(input, state) → Output[] where outputs are Events (what happened)
 * and Commands (what to do next).
 */

// =============================================================================
// Events — what happened during progression
// =============================================================================

export type JourneyEvent =
  | {
      readonly kind: 'Event';
      readonly type: 'StageAdvanced';
      readonly fromNLevel: number;
      readonly toNLevel: number;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'StageRetained';
      readonly nLevel: number;
      readonly decision: 'stay' | 'pending-pair';
    }
  | {
      readonly kind: 'Event';
      readonly type: 'LevelDowngraded';
      readonly fromNLevel: number;
      readonly toNLevel: number;
      readonly strikes?: number;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'StageProgressUpdated';
      readonly stageId: number;
      readonly progressPct: number;
      readonly validatingSessions: number;
      readonly bestScore: number | null;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'JourneyCompleted';
      readonly finalNLevel: number;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'StartLevelExpanded';
      readonly oldStartLevel: number;
      readonly newStartLevel: number;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'SessionAccepted';
      readonly sessionId?: string;
      readonly nLevel?: number;
      readonly gameMode?: string;
      readonly score?: number;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'StrikesUpdated';
      readonly strikes: number;
    }
  | {
      readonly kind: 'Event';
      readonly type: 'HybridLoopStateUpdated';
      readonly nextSessionGameMode: string;
      readonly trackSessionsInBlock: number;
      readonly dnbSessionsInBlock: number;
      readonly dnbZone: 'clean' | 'stay' | 'down' | null;
      readonly dnbZoneCount: number;
    };

// =============================================================================
// Commands — what to do next
// =============================================================================

export interface NextSessionCommand {
  readonly kind: 'Command';
  readonly type: 'NextSession';
  readonly stageId: number;
  readonly nLevel: number;
  readonly gameMode: string;
  readonly route: string;
}

export type JourneyCommand = NextSessionCommand;

// =============================================================================
// Union
// =============================================================================

export type JourneyOutput = JourneyEvent | JourneyCommand;
