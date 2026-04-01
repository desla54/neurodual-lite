/**
 * Journey Stubs - NeuroDual Lite doesn't use the journey system.
 * These stubs prevent compilation errors in components that still reference journey hooks.
 */

// biome-ignore lint/suspicious/noExplicitAny: stub returns null cast as the consumer's expected type
export function useJourneyStateWithContext(): { state: any } {
  return { state: null };
}

// biome-ignore lint/suspicious/noExplicitAny: stub returns null cast as the consumer's expected type
export function useNextJourneySessionWithContext(): { nextSession: any } {
  return { nextSession: null };
}

// biome-ignore lint/suspicious/noExplicitAny: stub returns null cast as the consumer's expected type
export function useJourneyState(): any {
  return null;
}

// biome-ignore lint/suspicious/noExplicitAny: stub returns null cast as the consumer's expected type
export function useNextJourneySession(): any {
  return null;
}
