/**
 * Journey rules version.
 *
 * Bump when journey rules change (thresholds, stages, protocols).
 * On startup, any journey_state_projection row with a lower version
 * is automatically rebuilt from session_summaries.
 */
export const JOURNEY_RULES_VERSION = 1;
