/**
 * use-dual-pick-drag.ts - Hook pour gérer le drag & drop dans Dual Label
 *
 * Différence avec use-place-drag :
 * - Dual Flow : On drag des valeurs (position/lettre) vers des slots temporels (N, N-1, N-2)
 * - Dual Label : On drag des labels (N, N-1, N-2) vers des valeurs affichées
 *
 * Responsabilités :
 * - Gestion des refs des drop zones
 * - Handlers de drag (start, move, end)
 * - Intégration avec DualPickAnimations
 * - Support du mode miroir
 */

import { useCallback, useRef } from 'react';
import gsap from 'gsap';
import { useDualPickGameStore } from '../stores/dual-pick-game-store';
import {
  animateLanding,
  animateRejection,
  animateReturn,
} from '../components/dual-pick/DualPickAnimations';
import { useHapticTrigger } from './use-haptic';
import type {
  DualPickSession,
  DualPickSessionSnapshot,
  DualPickDragTrajectory,
  DualPickProposal,
} from '@neurodual/logic';
import type { DualPickTrajectoryData, MagneticTarget } from '@neurodual/ui';

// =============================================================================
// TYPES
// =============================================================================

export interface UseDualPickDragOptions {
  /** Session instance */
  session: DualPickSession | null;
  /** Current snapshot */
  snapshot: DualPickSessionSnapshot | null;
  /** Enable guided placement */
  guidedPlacement: boolean;
  /** Mirror only mode: treat mirror placements as real session placements */
  mirrorOnly?: boolean;
  /** Magnetic threshold in pixels */
  magneticThreshold?: number;
}

export interface UseDualPickDragResult {
  /** Update drop zone rects (call on phase change) */
  updateDropZoneRects: () => void;
  /** Handle drag start */
  handleDragStart: (proposalId: string) => void;
  /** Handle drag move - returns magnetic target if within range */
  handleDragMove: (proposalId: string, x: number, y: number) => MagneticTarget | null;
  /** Handle drag end (normal mode) */
  handleDragEnd: (
    proposalId: string,
    x: number,
    y: number,
    trajectory: DualPickTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  /** Handle unified drag end (mirror mode) */
  handleUnifiedDragEnd: (
    unifiedId: string,
    x: number,
    y: number,
    trajectory: DualPickTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
}

// =============================================================================
// HELPER: Convert UI trajectory to logic format
// =============================================================================

function toDualPickTrajectory(traj: DualPickTrajectoryData): DualPickDragTrajectory {
  return {
    dragStartedAtMs: traj.dragStartedAtMs,
    totalDistancePx: traj.totalDistancePx,
    directDistancePx: traj.directDistancePx,
    slotEnters: traj.slotEnters.map((e) => ({
      slot: e.slot,
      type: e.type,
      atMs: e.atMs,
    })),
    trajectory: traj.trajectory,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useDualPickDrag(options: UseDualPickDragOptions): UseDualPickDragResult {
  const {
    session,
    snapshot,
    guidedPlacement,
    mirrorOnly = false,
    magneticThreshold = 60,
  } = options;

  // Drop zone rects cache
  const dropZonesRef = useRef<Map<string, DOMRect>>(new Map());
  const lastMagneticZoneRef = useRef<string | null>(null);

  // Haptic feedback (respects user setting)
  const triggerHaptic = useHapticTrigger();

  // Store actions
  const setMagneticZone = useDualPickGameStore((s) => s.setMagneticZone);
  const setAnimating = useDualPickGameStore((s) => s.setAnimating);
  const addPendingNormal = useDualPickGameStore((s) => s.addPendingNormal);
  const addMirrorPlacement = useDualPickGameStore((s) => s.addMirrorPlacement);
  const incrementMirrorError = useDualPickGameStore((s) => s.incrementMirrorError);
  const incrementMirrorCorrect = useDualPickGameStore((s) => s.incrementMirrorCorrect);
  const markUnifiedPlaced = useDualPickGameStore((s) => s.markUnifiedPlaced);
  const isNextInGuidedOrder = useDualPickGameStore((s) => s.isNextInGuidedOrder);

  // ==========================================================================
  // Update drop zone rects
  // ==========================================================================
  const updateDropZoneRects = useCallback(() => {
    const map = new Map<string, DOMRect>();

    // Normal timeline zones (Dual Label uses different data attributes)
    const zones = document.querySelectorAll('[data-dual-pick-slot]');
    zones.forEach((zone) => {
      const slot = zone.getAttribute('data-dual-pick-slot');
      const type = zone.getAttribute('data-dual-pick-type');
      if (slot && type) {
        map.set(`${type}-${slot}`, zone.getBoundingClientRect());
      }
    });

    // Mirror timeline zones
    const mirrorZones = document.querySelectorAll('[data-dual-pick-mirror-slot]');
    mirrorZones.forEach((zone) => {
      const slot = zone.getAttribute('data-dual-pick-mirror-slot');
      const type = zone.getAttribute('data-dual-pick-mirror-type');
      if (slot && type) {
        map.set(`mirror-${type}-${slot}`, zone.getBoundingClientRect());
      }
    });

    // Distractor zones (always error to drop on)
    // Check if distractor is in normal or mirror timeline by looking for data-mirror-container
    const distractorZones = document.querySelectorAll('[data-dual-pick-distractor]');
    distractorZones.forEach((zone) => {
      const distractorId = zone.getAttribute('data-dual-pick-distractor-id');
      if (distractorId) {
        const parent = zone.closest('[data-mirror-container="true"]');
        const isMirror = parent !== null;
        const key = isMirror ? `mirror-distractor-${distractorId}` : `distractor-${distractorId}`;
        map.set(key, zone.getBoundingClientRect());
      }
    });

    dropZonesRef.current = map;
  }, []);

  // ==========================================================================
  // Handle drag start
  // ==========================================================================
  const handleDragStart = useCallback(
    (_proposalId: string) => {
      updateDropZoneRects();
    },
    [updateDropZoneRects],
  );

  // ==========================================================================
  // Handle drag move (magnetic detection)
  // ==========================================================================
  const handleDragMove = useCallback(
    (_proposalId: string, x: number, y: number): MagneticTarget | null => {
      let closestKey: string | null = null;
      let closestDistance = Infinity;
      let closestCenter = { x: 0, y: 0 };

      for (const [key, rect] of dropZonesRef.current) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(x - centerX, y - centerY);

        if (distance < closestDistance && distance < magneticThreshold) {
          closestDistance = distance;
          closestKey = key;
          closestCenter = { x: centerX, y: centerY };
        }
      }

      // Trigger haptic when entering a new magnetic zone
      if (closestKey !== lastMagneticZoneRef.current) {
        if (closestKey) {
          triggerHaptic(10);
        }
        lastMagneticZoneRef.current = closestKey;
        setMagneticZone(closestKey);
      }

      if (closestKey) {
        return { key: closestKey, centerX: closestCenter.x, centerY: closestCenter.y };
      }
      return null;
    },
    [magneticThreshold, setMagneticZone, triggerHaptic],
  );

  // ==========================================================================
  // Handle drag end (normal mode - no mirror)
  // ==========================================================================
  const handleDragEnd = useCallback(
    (
      proposalId: string,
      x: number,
      y: number,
      trajectory: DualPickTrajectoryData,
      magneticTarget?: MagneticTarget,
    ) => {
      if (!session || !snapshot) return;

      const proposal = snapshot.proposals.find((p: DualPickProposal) => p.id === proposalId);
      if (!proposal) return;

      setAnimating(true);
      setMagneticZone(null);
      lastMagneticZoneRef.current = null;

      const cardEl = document.querySelector(`[data-label-proposal-id="${proposalId}"]`);

      const unlock = () => setAnimating(false);

      // Guard: card element may be gone if DOM changed (e.g., trial advanced)
      if (!cardEl) {
        unlock();
        return;
      }

      // Cast once after null guard
      const cardElement = cardEl as HTMLElement;

      // Determine target zone
      let targetKey: string | null = null;
      let targetRect: DOMRect | null = null;

      if (magneticTarget) {
        targetKey = magneticTarget.key;
        targetRect = dropZonesRef.current.get(magneticTarget.key) ?? null;
      } else {
        for (const [key, rect] of dropZonesRef.current) {
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            targetKey = key;
            targetRect = rect;
            break;
          }
        }
      }

      // No valid target - animate back
      if (!targetKey || !targetRect) {
        animateReturn(cardElement, { onComplete: unlock });
        return;
      }

      // Check if dropped on distractor (always an error)
      if (targetKey.startsWith('distractor-')) {
        // Animate to target then reject
        const cardRect = cardElement.getBoundingClientRect();
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        const flyDx = targetCenterX - (cardRect.left + cardRect.width / 2);
        const flyDy = targetCenterY - (cardRect.top + cardRect.height / 2);
        const currentX = gsap.getProperty(cardElement, 'x') as number;
        const currentY = gsap.getProperty(cardElement, 'y') as number;

        gsap.to(cardElement, {
          x: currentX + flyDx,
          y: currentY + flyDy,
          scaleX: 0.9,
          scaleY: 0.9,
          duration: 0.2,
          ease: 'power2.out',
          onComplete: () => {
            animateRejection(cardElement, { onComplete: unlock });
          },
        });
        return;
      }

      // Parse zone key (format: "type-slot")
      const parts = targetKey.split('-');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        animateReturn(cardElement, { onComplete: unlock });
        return;
      }
      const type = parts[0] as 'position' | 'audio' | 'unified';
      const slot = parseInt(parts[1], 10);

      // Check type match
      if (type !== proposal.type) {
        animateReturn(cardElement, { onComplete: unlock });
        return;
      }

      // Validate using session
      // In Dual Label, we call dropLabel to place the label
      session
        .dropLabel(proposalId, slot, type, toDualPickTrajectory(trajectory))
        .then((correct: boolean) => {
          if (!correct) {
            // Check if this is the active card in guided mode
            const isActiveCard =
              !snapshot.currentTarget || snapshot.currentTarget.proposalId === proposalId;

            if (!isActiveCard) {
              // Wrong card in guided mode - just shake in place
              animateRejection(cardElement, { onComplete: unlock });
              return;
            }

            // Right card but wrong slot - fly to slot, shake, then return
            const cardRect = cardElement.getBoundingClientRect();
            const targetCenterX = targetRect.left + targetRect.width / 2;
            const targetCenterY = targetRect.top + targetRect.height / 2;
            const flyDx = targetCenterX - (cardRect.left + cardRect.width / 2);
            const flyDy = targetCenterY - (cardRect.top + cardRect.height / 2);
            const currentX = gsap.getProperty(cardElement, 'x') as number;
            const currentY = gsap.getProperty(cardElement, 'y') as number;

            // Phase 1: Fly to target slot
            gsap.to(cardElement, {
              x: currentX + flyDx,
              y: currentY + flyDy,
              scaleX: 0.9,
              scaleY: 0.9,
              duration: 0.2,
              ease: 'power2.out',
              onComplete: () => {
                // Phase 2: Shake and return
                animateRejection(cardElement, { onComplete: unlock });
              },
            });
            return;
          }

          // Correct - animate landing
          animateLanding(cardElement, targetRect, { onComplete: unlock });
        });
    },
    [session, snapshot, setAnimating, setMagneticZone],
  );

  // ==========================================================================
  // Handle unified drag end (mirror mode)
  // ==========================================================================
  const handleUnifiedDragEnd = useCallback(
    (
      unifiedId: string,
      x: number,
      y: number,
      trajectory: DualPickTrajectoryData,
      magneticTarget?: MagneticTarget,
    ) => {
      if (!session || !snapshot) return;

      // Parse unified ID: "originalId-target" (e.g., "abc123-normal" or "abc123-mirror")
      const lastDash = unifiedId.lastIndexOf('-');
      if (lastDash === -1) return;

      const originalId = unifiedId.substring(0, lastDash);
      const target = unifiedId.substring(lastDash + 1) as 'normal' | 'mirror';

      const proposal = snapshot.proposals.find((p: DualPickProposal) => p.id === originalId);
      if (!proposal) return;

      setAnimating(true);
      setMagneticZone(null);
      lastMagneticZoneRef.current = null;

      updateDropZoneRects();

      const cardEl = document.querySelector(`[data-unified-proposal-id="${unifiedId}"]`);

      const unlock = () => setAnimating(false);
      const baseScaleX = target === 'mirror' ? -1 : 1;

      // Guard: card element may be gone if DOM changed (e.g., trial advanced)
      if (!cardEl) {
        unlock();
        return;
      }

      // Cast once after null guard
      const cardElement = cardEl as HTMLElement;

      // Check guided mode
      if (guidedPlacement && !isNextInGuidedOrder(unifiedId)) {
        if (target === 'mirror') {
          incrementMirrorError();
        }
        animateRejection(cardElement, { onComplete: unlock });
        return;
      }

      // Determine which zones to check based on target
      // INVERTED (normal mode): Normal cards drop on mirror zones, mirror cards drop on normal zones
      // DIRECT (mirrorOnly mode): Mirror cards drop on mirror zones (no inversion)
      const isNormalCard = target === 'normal';
      let targetKey: string | null = null;
      let targetRect: DOMRect | null = null;

      // Helper to check if a key is a distractor zone
      const isDistractorKey = (key: string) =>
        key.startsWith('distractor-') || key.startsWith('mirror-distractor-');

      if (magneticTarget) {
        const isMirrorZone = magneticTarget.key.startsWith('mirror-');
        const isDistractorZone = isDistractorKey(magneticTarget.key);
        // Distractor zones can be detected for error handling
        if (isDistractorZone) {
          targetKey = magneticTarget.key;
          targetRect = dropZonesRef.current.get(magneticTarget.key) ?? null;
        } else if (mirrorOnly) {
          // mirrorOnly mode: mirror cards drop directly on mirror zones (no inversion)
          if (isMirrorZone) {
            targetKey = magneticTarget.key;
            targetRect = dropZonesRef.current.get(magneticTarget.key) ?? null;
          }
        } else if ((isNormalCard && isMirrorZone) || (!isNormalCard && !isMirrorZone)) {
          // Normal mirror mode - Inverted matching: normal card → mirror zone, mirror card → normal zone
          targetKey = magneticTarget.key;
          targetRect = dropZonesRef.current.get(magneticTarget.key) ?? null;
        }
      }

      // Fallback to point-based detection
      if (!targetKey) {
        for (const [key, rect] of dropZonesRef.current) {
          const isMirrorZone = key.startsWith('mirror-');
          const isDistractorZone = isDistractorKey(key);

          // Skip if not matching the logic (unless distractor)
          if (!isDistractorZone) {
            if (mirrorOnly) {
              // mirrorOnly mode: only allow mirror zones
              if (!isMirrorZone) continue;
            } else {
              // Normal mirror mode: inverted logic
              if (isNormalCard && !isMirrorZone) continue;
              if (!isNormalCard && isMirrorZone) continue;
            }
          }

          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            targetKey = key;
            targetRect = rect;
            break;
          }
        }
      }

      // Check if dropped on distractor (always an error)
      if (targetKey && isDistractorKey(targetKey) && targetRect) {
        incrementMirrorError();
        const cardRect = cardElement.getBoundingClientRect();
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        const flyDx = targetCenterX - (cardRect.left + cardRect.width / 2);
        const flyDy = targetCenterY - (cardRect.top + cardRect.height / 2);
        const currentX = gsap.getProperty(cardElement, 'x') as number;
        const currentY = gsap.getProperty(cardElement, 'y') as number;

        gsap.to(cardElement, {
          x: currentX + flyDx,
          y: currentY + flyDy,
          scaleX: baseScaleX * 0.9,
          scaleY: 0.9,
          duration: 0.2,
          ease: 'power2.out',
          onComplete: () => {
            animateRejection(cardElement, { onComplete: unlock });
          },
        });
        return;
      }

      // No valid target - animate back (preserve scaleX for mirror)
      if (!targetKey || !targetRect) {
        gsap.to(cardElement, {
          x: 0,
          y: 0,
          scaleX: baseScaleX,
          scaleY: 1,
          duration: 0.3,
          ease: 'power2.out',
          onComplete: () => {
            gsap.set(cardElement, { clearProps: 'boxShadow' });
            unlock();
          },
        });
        return;
      }

      // Parse zone key
      const parts = targetKey.split('-');
      const isMirrorZone = targetKey.startsWith('mirror-');
      let type: 'position' | 'audio';
      let slot: number;

      if (isMirrorZone) {
        if (parts.length !== 3 || !parts[1] || !parts[2]) {
          unlock();
          return;
        }
        type = parts[1] as 'position' | 'audio';
        slot = parseInt(parts[2], 10);
      } else {
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          unlock();
          return;
        }
        type = parts[0] as 'position' | 'audio';
        slot = parseInt(parts[1], 10);
      }

      // Check type match
      if (type !== proposal.type) {
        gsap.to(cardElement, {
          x: 0,
          y: 0,
          scaleX: baseScaleX,
          scaleY: 1,
          duration: 0.3,
          ease: 'power2.out',
          onComplete: () => {
            gsap.set(cardElement, { clearProps: 'boxShadow' });
            unlock();
          },
        });
        return;
      }

      // Validate using history - the label should match the slot
      // In Dual Label: proposal.correctSlot tells us where this label belongs
      const isCorrect = proposal.correctSlot === slot;

      if (!isCorrect) {
        // Error counting based on target zone (inverted logic)
        if (isMirrorZone) {
          incrementMirrorError();
        }
        // Animate error landing then rejection (with scaleX preservation)
        const cardRect = cardElement.getBoundingClientRect();
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        const flyDx = targetCenterX - (cardRect.left + cardRect.width / 2);
        const flyDy = targetCenterY - (cardRect.top + cardRect.height / 2);
        const currentX = gsap.getProperty(cardElement, 'x') as number;
        const currentY = gsap.getProperty(cardElement, 'y') as number;

        gsap.to(cardElement, {
          x: currentX + flyDx,
          y: currentY + flyDy,
          scaleX: baseScaleX * 0.9,
          scaleY: 0.9,
          duration: 0.2,
          ease: 'power2.out',
          onComplete: () => {
            animateRejection(cardElement, { onComplete: unlock });
          },
        });
        return;
      }

      // Valid placement - animate landing then update state
      // Storage logic:
      // - mirrorOnly mode: always send directly to session (regardless of zone)
      // - Normal mirror mode: inverted logic - normal zone → pending, mirror zone → just count
      const droppedOnMirrorZone = isMirrorZone;

      const cardRect = cardElement.getBoundingClientRect();
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const flyDx = targetCenterX - (cardRect.left + cardRect.width / 2);
      const flyDy = targetCenterY - (cardRect.top + cardRect.height / 2);
      const currentX = gsap.getProperty(cardElement, 'x') as number;
      const currentY = gsap.getProperty(cardElement, 'y') as number;

      const tl = gsap.timeline({
        onComplete: () => {
          // Update store state based on mode and target zone
          if (mirrorOnly) {
            // In mirrorOnly mode, send directly to session
            session.dropLabel(originalId, slot, type, toDualPickTrajectory(trajectory)).then(() => {
              markUnifiedPlaced(unifiedId);
              unlock();
            });
          } else if (!droppedOnMirrorZone) {
            // Normal mirror mode: Dropped on normal timeline → commit to session via pending
            addPendingNormal(
              originalId,
              slot,
              type,
              proposal.label,
              toDualPickTrajectory(trajectory),
            );
            markUnifiedPlaced(unifiedId);
            unlock();
          } else {
            // Normal mirror mode: Dropped on mirror timeline → just count
            incrementMirrorCorrect();
            addMirrorPlacement(originalId, slot, type, proposal.label);
            markUnifiedPlaced(unifiedId);
            unlock();
          }
        },
      });

      // Phase 1: Fly to target
      tl.to(cardElement, {
        x: currentX + flyDx,
        y: currentY + flyDy,
        scaleX: baseScaleX * 0.9,
        scaleY: 0.9,
        duration: 0.4,
        ease: 'power2.out',
      });

      // Phase 2: Absorption
      tl.to(cardElement, {
        scaleX: baseScaleX * 0.7,
        scaleY: 0.7,
        opacity: 0.4,
        duration: 0.12,
        ease: 'power2.in',
      });
    },
    [
      session,
      snapshot,
      guidedPlacement,
      mirrorOnly,
      setAnimating,
      setMagneticZone,
      updateDropZoneRects,
      isNextInGuidedOrder,
      incrementMirrorError,
      incrementMirrorCorrect,
      addPendingNormal,
      addMirrorPlacement,
      markUnifiedPlaced,
    ],
  );

  return {
    updateDropZoneRects,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleUnifiedDragEnd,
  };
}
