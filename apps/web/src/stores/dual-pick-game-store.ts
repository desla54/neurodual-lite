/**
 * dual-pick-game-store.ts - État local pour une session Dual Label
 *
 * Gère :
 * - Placements en attente (mode miroir)
 * - Statistiques miroir
 * - Ordre de placement unifié (mode guidé + miroir)
 * - État des drop zones magnétiques
 *
 * Ce store est réinitialisé à chaque nouvelle session.
 *
 * Différence avec place-game-store :
 * - Les placements contiennent un label (N, N-1, N-2) au lieu d'un slot numérique
 * - La validation est basée sur le label temporel, pas la valeur
 */

import { create } from 'zustand';
import type { DualPickDragTrajectory, DualPickId } from '@neurodual/logic';

// =============================================================================
// TYPES
// =============================================================================

export interface DualPickPendingPlacement {
  slot: number;
  type: 'position' | 'audio';
  label: DualPickId;
  trajectory: DualPickDragTrajectory;
}

export interface DualPickMirrorPlacement {
  slot: number;
  type: 'position' | 'audio';
  label: DualPickId;
}

export interface DualPickGameState {
  // === Placements en attente (mode miroir) ===
  /** Placements normaux en attente de commit (proposalId → placement) */
  pendingNormalPlacements: Map<string, DualPickPendingPlacement>;
  /** Placements miroir (proposalId → placement) */
  mirrorPlacements: Map<string, DualPickMirrorPlacement>;

  // === Statistiques miroir ===
  mirrorStats: {
    correctDrops: number;
    errorCount: number;
  };

  // === Mode guidé unifié (normal + miroir mélangés) ===
  /** Ordre aléatoire des cartes à placer (ex: ["id1-normal", "id1-mirror", "id2-normal", ...]) */
  unifiedPlacementOrder: string[];
  /** Index courant dans l'ordre de placement */
  unifiedPlacementIndex: number;
  /** IDs unifiés déjà placés */
  unifiedPlacedIds: Set<string>;

  // === État magnétique (pour le surlignage des drop zones) ===
  magneticZoneKey: string | null;

  // === État d'animation ===
  isAnimating: boolean;
}

export interface DualPickGameActions {
  // === Placements ===
  /** Ajoute un placement normal en attente avec sa trajectory */
  addPendingNormal: (
    proposalId: string,
    slot: number,
    type: 'position' | 'audio',
    label: DualPickId,
    trajectory: DualPickDragTrajectory,
  ) => void;
  /** Ajoute un placement miroir */
  addMirrorPlacement: (
    proposalId: string,
    slot: number,
    type: 'position' | 'audio',
    label: DualPickId,
  ) => void;
  /** Incrémente le compteur d'erreurs miroir */
  incrementMirrorError: () => void;
  /** Incrémente le compteur de drops corrects miroir */
  incrementMirrorCorrect: () => void;

  // === Mode guidé unifié ===
  /** Génère l'ordre de placement unifié à partir des proposals */
  generateUnifiedOrder: (proposalIds: string[]) => void;
  /** Marque un ID unifié comme placé et avance l'index */
  markUnifiedPlaced: (unifiedId: string) => void;
  /** Vérifie si un ID unifié est le prochain attendu en mode guidé */
  isNextInGuidedOrder: (unifiedId: string) => boolean;

  // === État magnétique ===
  setMagneticZone: (zoneKey: string | null) => void;

  // === Animation ===
  setAnimating: (animating: boolean) => void;

  // === Helpers ===
  /** Vérifie si un slot normal est étiqueté (session + pending) */
  isNormalSlotLabeled: (
    slot: number,
    type: 'position' | 'audio',
    sessionLabeledSlots: ReadonlyMap<string, number>,
    proposals: readonly { id: string; type: string }[],
  ) => boolean;
  /** Vérifie si un slot miroir est étiqueté */
  isMirrorSlotLabeled: (
    slot: number,
    type: 'position' | 'audio',
    proposals: readonly { id: string; type: string }[],
  ) => boolean;

  // === Reset ===
  /** Réinitialise l'état pour un nouveau trial */
  resetForNewTrial: () => void;
  /** Réinitialise complètement le store */
  reset: () => void;
}

export type DualPickGameStore = DualPickGameState & DualPickGameActions;

// =============================================================================
// DEFAULT STATE
// =============================================================================

const createDefaultState = (): DualPickGameState => ({
  pendingNormalPlacements: new Map(),
  mirrorPlacements: new Map(),
  mirrorStats: { correctDrops: 0, errorCount: 0 },
  unifiedPlacementOrder: [],
  unifiedPlacementIndex: 0,
  unifiedPlacedIds: new Set(),
  magneticZoneKey: null,
  isAnimating: false,
});

// =============================================================================
// STORE
// =============================================================================

export const useDualPickGameStore = create<DualPickGameStore>((set, get) => ({
  ...createDefaultState(),

  // === Placements ===
  addPendingNormal: (proposalId, slot, type, label, trajectory) =>
    set((state) => {
      const next = new Map(state.pendingNormalPlacements);
      next.set(proposalId, { slot, type, label, trajectory });
      return { pendingNormalPlacements: next };
    }),

  addMirrorPlacement: (proposalId, slot, type, label) =>
    set((state) => {
      const next = new Map(state.mirrorPlacements);
      next.set(proposalId, { slot, type, label });
      return { mirrorPlacements: next };
    }),

  incrementMirrorError: () =>
    set((state) => ({
      mirrorStats: {
        ...state.mirrorStats,
        errorCount: state.mirrorStats.errorCount + 1,
      },
    })),

  incrementMirrorCorrect: () =>
    set((state) => ({
      mirrorStats: {
        ...state.mirrorStats,
        correctDrops: state.mirrorStats.correctDrops + 1,
      },
    })),

  // === Mode guidé unifié ===
  generateUnifiedOrder: (proposalIds) => {
    // Crée une liste plate de toutes les cartes (normal + mirror pour chaque proposal)
    const allCards: string[] = proposalIds.flatMap((id) => [`${id}-normal`, `${id}-mirror`]);

    // Shuffle complet de toutes les cartes (Fisher-Yates)
    // Les paires normal/mirror ne sont PAS gardées ensemble
    for (let i = allCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = allCards[i];
      const swap = allCards[j];
      if (temp !== undefined && swap !== undefined) {
        allCards[i] = swap;
        allCards[j] = temp;
      }
    }

    set({
      unifiedPlacementOrder: allCards,
      unifiedPlacementIndex: 0,
      unifiedPlacedIds: new Set(),
    });
  },

  markUnifiedPlaced: (unifiedId) =>
    set((state) => ({
      unifiedPlacedIds: new Set([...state.unifiedPlacedIds, unifiedId]),
      unifiedPlacementIndex: state.unifiedPlacementIndex + 1,
    })),

  isNextInGuidedOrder: (unifiedId) => {
    const state = get();
    if (state.unifiedPlacementOrder.length === 0) return true; // Pas de mode guidé
    return state.unifiedPlacementOrder[state.unifiedPlacementIndex] === unifiedId;
  },

  // === État magnétique ===
  setMagneticZone: (zoneKey) => set({ magneticZoneKey: zoneKey }),

  // === Animation ===
  setAnimating: (animating) => set({ isAnimating: animating }),

  // === Helpers ===
  isNormalSlotLabeled: (slot, type, sessionLabeledSlots, proposals) => {
    // Check session labels
    for (const [proposalId, labeledSlot] of sessionLabeledSlots) {
      if (labeledSlot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return true;
      }
    }
    // Check pending placements
    const state = get();
    for (const [_proposalId, placement] of state.pendingNormalPlacements) {
      if (placement.slot === slot && placement.type === type) {
        return true;
      }
    }
    return false;
  },

  isMirrorSlotLabeled: (slot, type, proposals) => {
    const state = get();
    for (const [proposalId, placement] of state.mirrorPlacements) {
      if (placement.slot === slot && placement.type === type) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return true;
      }
    }
    return false;
  },

  // === Reset ===
  resetForNewTrial: () =>
    set({
      pendingNormalPlacements: new Map(),
      mirrorPlacements: new Map(),
      unifiedPlacementOrder: [],
      unifiedPlacementIndex: 0,
      unifiedPlacedIds: new Set(),
    }),

  reset: () => set(createDefaultState()),
}));
