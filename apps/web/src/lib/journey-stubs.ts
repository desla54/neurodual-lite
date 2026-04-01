/**
 * Journey Stubs - NeuroDual Lite doesn't use the journey system.
 * These stubs prevent compilation errors in components that still reference journey hooks.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useJourneyStateWithContext(): { state: any } {
  return { state: null };
}

export function useNextJourneySessionWithContext(): { nextSession: any } {
  return { nextSession: null };
}

export function useJourneyState(): any {
  return null;
}

export function useNextJourneySession(): any {
  return null;
}
