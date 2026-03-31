/**
 * Query Keys Factory
 *
 * Centralized query key definitions for type safety and consistency.
 * Using the factory pattern recommended by TanStack Query.
 */

export const queryKeys = {
  // Journey queries (journeyId is required for query isolation)
  journey: {
    all: ['journey'] as const,
    byJourney: (journeyId: string) => [...queryKeys.journey.all, journeyId] as const,
    state: (journeyId: string) => [...queryKeys.journey.byJourney(journeyId), 'state'] as const,
    stage: (journeyId: string, stageId: number) =>
      [...queryKeys.journey.byJourney(journeyId), 'stage', stageId] as const,
    currentStage: (journeyId: string) =>
      [...queryKeys.journey.byJourney(journeyId), 'currentStage'] as const,
  },

  // Sync queries
  sync: {
    all: ['sync'] as const,
    state: () => [...queryKeys.sync.all, 'state'] as const,
    events: () => [...queryKeys.sync.all, 'events'] as const,
    unsyncedEvents: () => [...queryKeys.sync.all, 'unsynced'] as const,
  },

  // Auth queries
  auth: {
    all: ['auth'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
    profile: () => [...queryKeys.auth.all, 'profile'] as const,
  },

  // Progression queries
  progression: {
    all: ['progression'] as const,
    data: () => [...queryKeys.progression.all, 'data'] as const,
    badges: () => [...queryKeys.progression.all, 'badges'] as const,
  },

  // Profile queries (cognitive profile)
  profile: {
    all: ['profile'] as const,
    player: () => [...queryKeys.profile.all, 'player'] as const,
  },

  // History queries
  history: {
    all: ['history'] as const,
    sessions: () => [...queryKeys.history.all, 'sessions'] as const,
    session: (sessionId: string) => [...queryKeys.history.all, 'session', sessionId] as const,
    report: (sessionId: string) => [...queryKeys.history.session(sessionId), 'report'] as const,
    runs: (sessionId: string) => [...queryKeys.history.session(sessionId), 'runs'] as const,
    runEvents: (runId: string) => [...queryKeys.history.all, 'run-events', runId] as const,
  },

  // Stats queries
  stats: {
    all: ['stats'] as const,
    filtered: (signature: string, refreshKey = 0) =>
      [...queryKeys.stats.all, 'filtered', signature, refreshKey] as const,
  },

  // Settings queries
  settings: {
    all: ['settings'] as const,
    cloud: () => [...queryKeys.settings.all, 'cloud'] as const,
  },

  // Subscription queries
  subscription: {
    all: ['subscription'] as const,
    state: () => [...queryKeys.subscription.all, 'state'] as const,
  },

  // Payment queries (RevenueCat)
  payment: {
    all: ['payment'] as const,
    products: () => [...queryKeys.payment.all, 'products'] as const,
    customerInfo: () => [...queryKeys.payment.all, 'customerInfo'] as const,
  },

  // Reward queries (XP-based Premium rewards)
  reward: {
    all: ['reward'] as const,
    granted: () => [...queryKeys.reward.all, 'granted'] as const,
    pending: () => [...queryKeys.reward.all, 'pending'] as const,
    state: () => [...queryKeys.reward.all, 'state'] as const,
  },

  // License queries (Lemon Squeezy - web only)
  license: {
    all: ['license'] as const,
    state: () => [...queryKeys.license.all, 'state'] as const,
    products: () => [...queryKeys.license.all, 'products'] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
