/**
 * Dev Logger
 *
 * En mode dev, envoie les events de session au plugin Vite
 * pour écriture dans un fichier JSON.
 *
 * En production, ne fait rien.
 */

// Check dev mode (works in Vite)
const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const DEV_LOGS_ENABLED =
  (globalThis as typeof globalThis & { __DEV_LOGS_ENABLED__?: boolean }).__DEV_LOGS_ENABLED__ ===
  true;
const LOG_ENDPOINT = '/api/dev-log';

interface DevLogPayload {
  sessionId: string;
  events: readonly unknown[];
  summary: unknown;
}

/**
 * Log une session terminée (dev only).
 * Envoie les events au plugin Vite pour écriture fichier.
 */
export async function logSessionToDev(payload: DevLogPayload): Promise<void> {
  if (!IS_DEV || !DEV_LOGS_ENABLED) return;

  try {
    const response = await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // In some dev setups, the Vite dev-log plugin isn't mounted.
      // Treat 404 as "feature not available" and stay silent.
      if (response.status !== 404) {
        console.warn('[dev-logger] Failed to log session:', response.status);
      }
      return;
    }

    const result = await response.json();
    console.log(`[dev-logger] Session saved: ${result.filename}`);
  } catch (error) {
    // Silently fail in dev - not critical
    console.warn('[dev-logger] Error logging session:', error);
  }
}
