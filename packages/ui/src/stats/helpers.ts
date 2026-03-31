/**
 * Stats Helpers - Shared utility functions for stats components
 */

import type { ReactNode } from 'react';
import {
  Stack,
  MapPin,
  MusicNote,
  Square,
  ArrowsOutCardinal,
  Hash,
  Smiley,
  TextAa,
  MusicNotes,
  Shapes,
} from '@phosphor-icons/react';
import { createElement } from 'react';
import { getGameModeMeta, resolveEffectiveStatsGameModeId, type ModeType } from '@neurodual/logic';

/**
 * Inverse error function (erfInv) approximation for d' calculation.
 * Uses Winitzki's approximation.
 */
export function erfInv(x: number): number {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const term1 = 2 / (Math.PI * a) + ln / 2;
  const term2 = ln / a;
  const sign = x >= 0 ? 1 : -1;
  return sign * Math.sqrt(Math.sqrt(term1 * term1 - term2) - term1);
}

/**
 * Get modality icon component based on modality ID.
 */
export function getModalityIcon(modalityId: string): ReactNode {
  const props = { size: 16 };
  switch (modalityId) {
    case 'position':
      return createElement(MapPin, props);
    case 'audio':
      return createElement(MusicNote, props);
    case 'color':
      return createElement(Stack, props);
    case 'image':
      return createElement(Shapes, props);
    case 'spatial':
      return createElement(ArrowsOutCardinal, props);
    case 'digits':
      return createElement(Hash, props);
    case 'emotions':
      return createElement(Smiley, props);
    case 'words':
      return createElement(TextAa, props);
    case 'tones':
      return createElement(MusicNotes, props);
    default:
      return createElement(Square, props);
  }
}

/**
 * Format duration in milliseconds to human readable string.
 */
export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isTempoLikeMode(m: ModeType): boolean {
  return ['DualTempo', 'DualnbackClassic', 'BrainWorkshop', 'Libre'].includes(m);
}

export function isPlaceOrMemoMode(m: ModeType): boolean {
  return ['DualPlace', 'DualMemo'].includes(m);
}

export function isGlobalView(mode: ModeType): boolean {
  return mode === 'all' || mode === 'Journey';
}

/**
 * Get an array of ticks spread evenly across the data.
 * This prevents Recharts from computing massive amount of ticks for long time series (like 2+ years of data)
 * which was causing massive Incremental GC pauses in Firefox.
 */
export function getResponsiveTicks<T extends Record<string, unknown>, K extends keyof T>(
  data: readonly T[],
  dataKey: K,
  maxTicks = 6,
): Array<T[K]> {
  if (!data || data.length === 0) return [];
  if (data.length <= maxTicks) {
    return data.map((d) => d[dataKey]).filter((v): v is T[K] => v !== undefined);
  }

  const step = Math.max(1, Math.floor((data.length - 1) / (maxTicks - 1)));
  const ticks: Array<T[K]> = [];

  for (let i = 0; i < data.length; i += step) {
    const v = data[i]?.[dataKey];
    if (v !== undefined) ticks.push(v);
    if (ticks.length === maxTicks - 1) break;
  }

  const lastVal = data[data.length - 1]?.[dataKey];
  if (ticks.length > 0 && ticks[ticks.length - 1] !== lastVal) {
    if (lastVal !== undefined) ticks.push(lastVal);
  } else if (ticks.length === 0) {
    if (lastVal !== undefined) ticks.push(lastVal);
  }

  return ticks;
}

/**
 * Downsample a series to a maximum number of points.
 * Keeps order and always tries to keep the first and last points.
 */
export function downsampleEvenly<T>(data: readonly T[], maxPoints: number): T[] {
  if (!Array.isArray(data)) return [];
  if (maxPoints <= 0) return [];
  if (data.length <= maxPoints) return [...data];
  if (maxPoints === 1) return [data[data.length - 1] as T];

  const out: T[] = [];
  const step = (data.length - 1) / (maxPoints - 1);
  let lastIdx = -1;

  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round(i * step);
    if (idx === lastIdx) continue;
    out.push(data[idx] as T);
    lastIdx = idx;
  }

  const last = data[data.length - 1] as T;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Backward-compatible helper used by stats tabs.
 * In Journey mode, returns a mode that matches the simulator journey when possible.
 */
export function resolveEffectiveJourneyMode(
  mode: ModeType,
  journeyId: string | undefined,
): ModeType {
  if (mode !== 'Journey') return mode;

  const effectiveGameModeId = resolveEffectiveStatsGameModeId({ mode, journeyId });
  if (effectiveGameModeId) {
    const meta = getGameModeMeta(effectiveGameModeId);
    if (meta) return meta.statsMode;
  }
  return 'Journey';
}

/**
 * Get start date from date range option.
 */
export function getStartDateFromOption(
  option: 'all' | 'today' | 'week' | 'month' | 'custom',
): Date | null {
  if (option === 'all') return null;
  const now = new Date();
  if (option === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (option === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (option === 'month') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null;
}
