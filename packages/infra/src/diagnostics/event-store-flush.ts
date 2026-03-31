/**
 * Best-effort flush of pending persistence writes before the page/app is torn down.
 *
 * Why:
 * - Emmett command bus serializes appends per stream; critical events are awaited at the session layer.
 * - There is no global "EventStore" queue anymore; keep this hook as a no-op for now.
 */
export function installEventStoreFlushOnPageHide(timeoutMs = 2000): () => void {
  void timeoutMs;
  return () => {};
}
