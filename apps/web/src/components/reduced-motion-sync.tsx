/**
 * Reduced motion sync component
 * Applies 'reduce-motion' class to <html> when user prefers reduced animations.
 * This disables CSS transitions/animations globally.
 */

import { getLastMeasuredLag } from '@neurodual/logic';
import { setPerformanceReducedMotionOverride } from '@neurodual/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';

interface ReducedMotionSyncProps {
  children: ReactNode;
}

// Adaptive motion tuning:
// - Enable quickly when lag is repeatedly high
// - Disable only after sustained stable period (hysteresis)
const ADAPTIVE_SAMPLE_MS = 1000;
const LONG_TASK_HARD_ENABLE_MS = 220;
const LAG_ENABLE_MS = 100;
const LAG_HARD_ENABLE_MS = 180;
const LAG_RECOVER_MS = 40;
const LAG_ENABLE_STREAK = 3;
const LAG_RECOVER_STREAK = 10;
const LOW_END_CORES_MAX = 2;
const LOW_END_MEMORY_GB_MAX = 2;

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

export function ReducedMotionSync({ children }: ReducedMotionSyncProps): ReactNode {
  const reducedMotion = useSettingsStore((state) => state.ui.reducedMotion);
  const [adaptiveReducedMotion, setAdaptiveReducedMotion] = useState(false);
  const [reduceTransparencyEffects, setReduceTransparencyEffects] = useState(false);
  const { diagnostics } = useAppPorts();

  useEffect(() => {
    const nav = navigator as NavigatorWithDeviceMemory;
    const isAndroid = /android/i.test(nav.userAgent);
    setReduceTransparencyEffects(isAndroid);
    if (!isAndroid) return;

    const cpuCores = nav.hardwareConcurrency;
    const deviceMemory = nav.deviceMemory;

    // Android fleet low-end baseline: start in reduced motion, but keep adaptive recovery.
    let startReduced = false;
    if (
      (typeof cpuCores === 'number' && cpuCores > 0 && cpuCores <= LOW_END_CORES_MAX) ||
      (typeof deviceMemory === 'number' &&
        deviceMemory > 0 &&
        deviceMemory <= LOW_END_MEMORY_GB_MAX)
    ) {
      startReduced = true;
      setAdaptiveReducedMotion(true);
    }

    let slowStreak = startReduced ? LAG_ENABLE_STREAK : 0;
    let recoveryStreak = 0;

    const unsubscribeLongTask = diagnostics.onLongTask((event) => {
      if (event.durationMs >= LONG_TASK_HARD_ENABLE_MS) {
        slowStreak = LAG_ENABLE_STREAK;
        recoveryStreak = 0;
        setAdaptiveReducedMotion(true);
      }
    });

    const intervalId = window.setInterval(() => {
      const lagMs = getLastMeasuredLag();
      if (lagMs === undefined) return;

      if (lagMs >= LAG_HARD_ENABLE_MS) {
        slowStreak = LAG_ENABLE_STREAK;
        recoveryStreak = 0;
      } else if (lagMs >= LAG_ENABLE_MS) {
        slowStreak += 1;
        recoveryStreak = 0;
      } else if (lagMs <= LAG_RECOVER_MS) {
        recoveryStreak += 1;
        slowStreak = Math.max(0, slowStreak - 1);
      } else {
        slowStreak = Math.max(0, slowStreak - 1);
        recoveryStreak = 0;
      }

      setAdaptiveReducedMotion((prev) => {
        if (!prev && slowStreak >= LAG_ENABLE_STREAK) {
          slowStreak = 0;
          return true;
        }
        if (prev && recoveryStreak >= LAG_RECOVER_STREAK) {
          recoveryStreak = 0;
          return false;
        }
        return prev;
      });
    }, ADAPTIVE_SAMPLE_MS);

    return () => {
      unsubscribeLongTask();
      window.clearInterval(intervalId);
    };
  }, [diagnostics]);

  useEffect(() => {
    const root = document.documentElement;
    // User accessibility preference
    root.classList.toggle('reduce-motion', reducedMotion);
    // Runtime performance fallback
    root.classList.toggle('perf-reduce-motion', adaptiveReducedMotion);
    // Android/WebView fallback for surfaces that can lag behind badly.
    root.classList.toggle('reduce-transparency-effects', reduceTransparencyEffects);
    setPerformanceReducedMotionOverride(adaptiveReducedMotion);
    return () => {
      root.classList.remove('reduce-transparency-effects');
      setPerformanceReducedMotionOverride(false);
    };
  }, [adaptiveReducedMotion, reduceTransparencyEffects, reducedMotion]);

  return children;
}
