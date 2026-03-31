/**
 * Reset marker local tracking
 *
 * We need a storage that survives a full DB wipe (OPFS/IndexedDB delete),
 * otherwise a remote reset marker would cause an infinite wipe loop.
 */

const STORAGE_KEY = 'neurodual:reset:lastAppliedAtByUser';

type ResetMap = Record<string, number | undefined>;

function readMap(): ResetMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as ResetMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: ResetMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getLastAppliedResetAtMs(userId: string): number | null {
  const map = readMap();
  const value = map[userId];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function setLastAppliedResetAtMs(userId: string, resetAtMs: number): void {
  const map = readMap();
  map[userId] = resetAtMs;
  writeMap(map);
}
