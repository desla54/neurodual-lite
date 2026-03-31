/**
 * Disposal Registry
 *
 * Central registry for cleanup functions to prevent memory leaks.
 * Automatically invoked on logout, user switch, or app unmount.
 */

import { disposalLog } from '../logger';

export type DisposalCallback = () => void | Promise<void>;

interface DisposalEntry {
  name: string;
  callback: DisposalCallback;
}

const listeners = new Set<DisposalEntry>();

/**
 * Register a cleanup function.
 */
export function registerDisposal(name: string, callback: DisposalCallback): void {
  listeners.add({ name, callback });
  disposalLog.debug(`Registered: ${name}`);
}

/**
 * Unregister a cleanup function.
 */
export function unregisterDisposal(name: string, callback: DisposalCallback): void {
  for (const entry of listeners) {
    if (entry.name === name && entry.callback === callback) {
      listeners.delete(entry);
      disposalLog.debug(`Unregistered: ${name}`);
      return;
    }
  }
}

/**
 * Execute all registered disposal callbacks.
 * Used on logout, user switch, or app unmount.
 */
export async function disposeAll(): Promise<void> {
  const callbacks = Array.from(listeners);
  disposalLog.info(`Running ${callbacks.length} disposal callbacks...`);

  for (const entry of callbacks) {
    try {
      disposalLog.debug(`  - ${entry.name}`);
      await entry.callback();
    } catch (error) {
      disposalLog.error(`Cleanup error for "${entry.name}":`, error);
    }
  }

  listeners.clear();
  disposalLog.info('Disposal complete');
}

/**
 * Get count of registered disposals (for debugging).
 */
export function getDisposalCount(): number {
  return listeners.size;
}

// Expose to window for manual cleanup in browser console
if (typeof window !== 'undefined') {
  (window as { __disposeAll?: typeof disposeAll }).__disposeAll = disposeAll;
  (window as { __getDisposalCount?: typeof getDisposalCount }).__getDisposalCount =
    getDisposalCount;
}
