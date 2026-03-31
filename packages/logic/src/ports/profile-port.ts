/**
 * ProfilePort
 *
 * Interface for player profile access.
 * The profile is a projection computed from game events (SQLite).
 * Implemented by infra (profileAdapter), consumed by ui via Context.
 *
 * NOTE: UI reads profile via PowerSync watched queries (useProfileQuery).
 * This port is only used for imperative access (e.g. tests, pipeline).
 */

import type { PlayerProfile } from '../types';

// =============================================================================
// Port
// =============================================================================

export interface ProfilePort {
  /** Get the current player profile */
  getProfile(): Promise<PlayerProfile>;
}
