/**
 * TurnOrchestrator Plugin
 *
 * Manages turn completion checks.
 *
 * Data in / Data out: Pure logic, no side effects.
 */

import type { TurnOrchestrator, TurnCompleteInput } from './types';

/**
 * Default TurnOrchestrator implementation.
 */
export class DefaultTurnOrchestrator implements TurnOrchestrator {
  isAllProposalsPlaced(input: TurnCompleteInput): boolean {
    const { proposals, placedProposals } = input;

    // Count valid (non-distractor) proposals
    const validProposals = proposals.filter((p) => !p.isDistractor);

    // Check if all valid proposals have been placed
    return placedProposals.size >= validProposals.length;
  }
}
