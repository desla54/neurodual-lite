/**
 * use-place-drag.ts - Hook pour gérer le drag & drop dans Dual Flow
 *
 * Responsabilités :
 * - Gestion des refs des drop zones
 * - Handlers de drag (start, move, end)
 * - Intégration avec PlaceAnimations
 * - Support du mode miroir
 */

import { useCallback, useRef } from 'react';
import gsap from 'gsap';
import { usePlaceGameStore } from '../stores/place-game-store';
import {
  animateLanding,
  animateRejection,
  animateReturn,
} from '../components/place/PlaceAnimations';
import { useHapticTrigger } from './use-haptic';
import type {
  PlaceDragTrajectory,
  PlaceSessionMachineEvent,
  PlaceSessionMachineSnapshot,
} from '@neurodual/logic';
import type { DragTrajectoryData } from '@neurodual/ui';

// =============================================================================
// TYPES
// =============================================================================

export interface MagneticTarget {
  key: string;
  centerX: number;
  centerY: number;
}

export interface UseFlowDragOptions {
  /** Send function from XState machine */
  send: (event: PlaceSessionMachineEvent) => void;
  /** Current snapshot */
  snapshot: PlaceSessionMachineSnapshot | null;
  /** Enable guided placement */
  guidedPlacement: boolean;
  /** Mirror only mode: treat mirror placements as real session placements */
  mirrorOnly?: boolean;
  /** Magnetic threshold in pixels */
  magneticThreshold?: number;
}

export interface UseFlowDragResult {
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
    trajectory: DragTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  /** Handle unified drag end (mirror mode) */
  handleUnifiedDragEnd: (
    unifiedId: string,
    x: number,
    y: number,
    trajectory: DragTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
}

// =============================================================================
// HELPER: Convert UI trajectory to logic format
// =============================================================================

function toFlowTrajectory(traj: DragTrajectoryData): PlaceDragTrajectory {
  return {
    dragStartedAtMs: traj.dragStartedAtMs,
    totalDistancePx: traj.totalDistancePx,
    directDistancePx: traj.directDistancePx,
    slotEnters: traj.slotEnters.map((e) => ({
      slot: e.slot,
      type: e.type,
      mirror: e.mirror,
      atMs: e.atMs,
    })),
    trajectory: traj.trajectory,
    inputMethod: traj.inputMethod,
  };
}

// =============================================================================
// HELPER: Validate proposal placement using snapshot
// =============================================================================

interface ValidationResult {
  valid: boolean;
  correct: boolean;
}

function validateProposal(
  snapshot: PlaceSessionMachineSnapshot,
  proposalId: string,
  slot: number,
): ValidationResult {
  const proposal = snapshot.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { valid: false, correct: false };

  // Check if slot is already filled
  if (snapshot.placedProposals.has(proposalId)) {
    return { valid: false, correct: false };
  }

  // Check if slot is within valid range (0 to history.length - 1)
  if (slot < 0 || slot >= snapshot.history.length) {
    return { valid: false, correct: false };
  }

  // Check if slot already has a proposal of this type
  for (const [, placedSlot] of snapshot.placedProposals) {
    if (placedSlot === slot) {
      const placedProposal = snapshot.proposals.find(
        (p) => snapshot.placedProposals.get(p.id) === slot,
      );
      if (placedProposal?.type === proposal.type) {
        return { valid: false, correct: false };
      }
    }
  }

  // Validate against history
  const historyIndex = snapshot.history.length - 1 - slot;
  const expectedItem = snapshot.history[historyIndex];
  if (!expectedItem) return { valid: true, correct: false };

  let isCorrect = false;
  if (proposal.type === 'unified') {
    isCorrect =
      proposal.position === expectedItem.position && proposal.sound === expectedItem.sound;
  } else {
    const expectedValue = proposal.type === 'position' ? expectedItem.position : expectedItem.sound;
    isCorrect = proposal.value === expectedValue;
  }

  return { valid: true, correct: isCorrect };
}

// =============================================================================
// HOOK
// =============================================================================

export function usePlaceDrag(options: UseFlowDragOptions): UseFlowDragResult {
  const { send, snapshot, guidedPlacement, mirrorOnly = false, magneticThreshold = 60 } = options;

  // Drop zone rects cache
  const dropZonesRef = useRef<Map<string, DOMRect>>(new Map());
  const lastMagneticZoneRef = useRef<string | null>(null);

  // Haptic feedback (respects user setting)
  const triggerHaptic = useHapticTrigger();

  // Store actions
  const setMagneticZone = usePlaceGameStore((s) => s.setMagneticZone);
  const setAnimating = usePlaceGameStore((s) => s.setAnimating);
  const addPendingNormal = usePlaceGameStore((s) => s.addPendingNormal);
  const addMirrorPlacement = usePlaceGameStore((s) => s.addMirrorPlacement);
  const incrementMirrorError = usePlaceGameStore((s) => s.incrementMirrorError);
  const incrementMirrorCorrect = usePlaceGameStore((s) => s.incrementMirrorCorrect);
  const markUnifiedPlaced = usePlaceGameStore((s) => s.markUnifiedPlaced);
  const isNextInGuidedOrder = usePlaceGameStore((s) => s.isNextInGuidedOrder);

  // ==========================================================================
  // Update drop zone rects
  // ==========================================================================
  const updateDropZoneRects = useCallback(() => {
    const map = new Map<string, DOMRect>();

    // Normal timeline zones
    const zones = document.querySelectorAll('[data-drop-slot]');
    zones.forEach((zone) => {
      const slot = zone.getAttribute('data-drop-slot');
      const type = zone.getAttribute('data-drop-type');
      if (slot && type) {
        map.set(`${type}-${slot}`, zone.getBoundingClientRect());
      }
    });

    // Mirror timeline zones
    const mirrorZones = document.querySelectorAll('[data-mirror-drop-slot]');
    mirrorZones.forEach((zone) => {
      const slot = zone.getAttribute('data-mirror-drop-slot');
      const type = zone.getAttribute('data-mirror-drop-type');
      if (slot && type) {
        map.set(`mirror-${type}-${slot}`, zone.getBoundingClientRect());
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
      trajectory: DragTrajectoryData,
      magneticTarget?: MagneticTarget,
    ) => {
      if (!snapshot) return;

      const proposal = snapshot.proposals.find((p) => p.id === proposalId);
      if (!proposal) return;

      setAnimating(true);
      setMagneticZone(null);
      lastMagneticZoneRef.current = null;

      const cardEl = document.querySelector(`[data-proposal-id="${proposalId}"]`);

      const unlock = () => setAnimating(false);

      // Guard: card element may be gone if DOM changed (e.g., trial advanced)
      if (!cardEl) {
        unlock();
        return;
      }

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

      // No valid target - animate back (animateReturn clears all GSAP inline styles)
      if (!targetKey || !targetRect) {
        animateReturn(cardEl as HTMLElement, { onComplete: unlock });
        return;
      }

      // Parse zone key (format: "type-slot")
      const parts = targetKey.split('-');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        animateReturn(cardEl as HTMLElement, { onComplete: unlock });
        return;
      }
      const type = parts[0];
      const slot = parseInt(parts[1], 10);

      // Check type match
      if (type !== proposal.type) {
        animateReturn(cardEl as HTMLElement, { onComplete: unlock });
        return;
      }

      // Validate using snapshot
      const validation = validateProposal(snapshot, proposalId, slot);

      // Cast once after null guard for cleaner code
      const cardElement = cardEl as HTMLElement;

      if (!validation.valid) {
        animateRejection(cardElement, { onComplete: unlock });
        return;
      }

      if (!validation.correct) {
        // Check if this is the active card in guided mode
        // If not the active card → just shake in place (wrong card selected)
        // If active card but wrong slot → fly to slot, shake, return
        const isActiveCard =
          !snapshot.currentTarget || snapshot.currentTarget.proposalId === proposalId;

        if (!isActiveCard) {
          // Wrong card in guided mode - just shake in place
          animateRejection(cardElement, {
            onComplete: () => {
              send({
                type: 'DROP',
                proposalId,
                targetSlot: slot,
                trajectory: toFlowTrajectory(trajectory),
              });
              unlock();
            },
          });
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
            animateRejection(cardElement, {
              onComplete: () => {
                send({
                  type: 'DROP',
                  proposalId,
                  targetSlot: slot,
                  trajectory: toFlowTrajectory(trajectory),
                });
                unlock();
              },
            });
          },
        });
        return;
      }

      // Correct - animate landing then commit
      animateLanding(cardElement, targetRect, {
        onComplete: () => {
          send({
            type: 'DROP',
            proposalId,
            targetSlot: slot,
            trajectory: toFlowTrajectory(trajectory),
          });
          unlock();
        },
      });
    },
    [send, snapshot, setAnimating, setMagneticZone],
  );

  // ==========================================================================
  // Handle unified drag end (mirror mode)
  // ==========================================================================
  const handleUnifiedDragEnd = useCallback(
    (
      unifiedId: string,
      x: number,
      y: number,
      trajectory: DragTrajectoryData,
      magneticTarget?: MagneticTarget,
    ) => {
      if (!snapshot) return;

      // Parse unified ID: "originalId-target" (e.g., "abc123-normal" or "abc123-mirror")
      const lastDash = unifiedId.lastIndexOf('-');
      if (lastDash === -1) return;

      const originalId = unifiedId.substring(0, lastDash);
      const target = unifiedId.substring(lastDash + 1) as 'normal' | 'mirror';

      const proposal = snapshot.proposals.find((p) => p.id === originalId);
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
      const isNormalTarget = target === 'normal';
      let targetKey: string | null = null;
      let targetRect: DOMRect | null = null;

      if (magneticTarget) {
        const isMirrorZone = magneticTarget.key.startsWith('mirror-');
        if ((isNormalTarget && !isMirrorZone) || (!isNormalTarget && isMirrorZone)) {
          targetKey = magneticTarget.key;
          targetRect = dropZonesRef.current.get(magneticTarget.key) ?? null;
        }
      }

      // Fallback to point-based detection
      if (!targetKey) {
        for (const [key, rect] of dropZonesRef.current) {
          const isMirrorZone = key.startsWith('mirror-');
          if (isNormalTarget && isMirrorZone) continue;
          if (!isNormalTarget && !isMirrorZone) continue;

          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            targetKey = key;
            targetRect = rect;
            break;
          }
        }
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
            // Clear boxShadow so CSS ring classes can take effect
            gsap.set(cardElement, { clearProps: 'boxShadow' });
            unlock();
          },
        });
        return;
      }

      // Parse zone key
      const parts = targetKey.split('-');
      const isMirrorZone = targetKey.startsWith('mirror-');
      let type: string;
      let slot: number;

      if (isMirrorZone) {
        if (parts.length !== 3 || !parts[1] || !parts[2]) {
          unlock();
          return;
        }
        type = parts[1];
        slot = parseInt(parts[2], 10);
      } else {
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          unlock();
          return;
        }
        type = parts[0];
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
            // Clear boxShadow so CSS ring classes can take effect
            gsap.set(cardElement, { clearProps: 'boxShadow' });
            unlock();
          },
        });
        return;
      }

      // Validate using history
      const historyIndex = snapshot.history.length - 1 - slot;
      if (historyIndex < 0) {
        unlock();
        return;
      }

      const expectedItem = snapshot.history[historyIndex];
      let isCorrect = false;
      if (proposal.type === 'unified') {
        // Unified: must match BOTH position and sound
        isCorrect =
          proposal.position === expectedItem?.position && proposal.sound === expectedItem?.sound;
      } else {
        const expectedValue =
          proposal.type === 'position' ? expectedItem?.position : expectedItem?.sound;
        isCorrect = proposal.value === expectedValue;
      }

      if (!isCorrect) {
        if (target === 'mirror') {
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
      const cardRect = cardElement.getBoundingClientRect();
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const flyDx = targetCenterX - (cardRect.left + cardRect.width / 2);
      const flyDy = targetCenterY - (cardRect.top + cardRect.height / 2);
      const currentX = gsap.getProperty(cardElement, 'x') as number;
      const currentY = gsap.getProperty(cardElement, 'y') as number;

      const tl = gsap.timeline({
        onComplete: () => {
          // Update store state
          if (target === 'normal') {
            addPendingNormal(originalId, slot, toFlowTrajectory(trajectory));
            markUnifiedPlaced(unifiedId);
            unlock();
          } else if (mirrorOnly) {
            // In mirrorOnly mode, send mirror placements directly to session
            send({
              type: 'DROP',
              proposalId: originalId,
              targetSlot: slot,
              trajectory: toFlowTrajectory(trajectory),
            });
            markUnifiedPlaced(unifiedId);
            unlock();
          } else {
            incrementMirrorCorrect();
            addMirrorPlacement(originalId, slot);
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
      send,
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
