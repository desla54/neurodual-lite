/**
 * place-game-store.ts - État local pour une session Dual Place
 *
 * Gère :
 * - Placements en attente (mode miroir)
 * - Statistiques miroir
 * - Ordre de placement unifié (mode guidé + miroir)
 * - État des drop zones magnétiques
 *
 * Ce store est réinitialisé à chaque nouvelle session.
 */

import { create } from 'zustand';
import type { PlaceDragTrajectory } from '@neurodual/logic';

// =============================================================================
// TYPES
// =============================================================================

export interface PendingPlacement {
  slot: number;
  trajectory: PlaceDragTrajectory;
}

export interface PlaceGameState {
  // === Placements en attente (mode miroir) ===
  /** Placements normaux en attente de commit (proposalId → { slot, trajectory }) */
  pendingNormalPlacements: Map<string, PendingPlacement>;
  /** Placements miroir (proposalId → slot) */
  mirrorPlacements: Map<string, number>;

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

export interface PlaceGameActions {
  // === Placements ===
  /** Ajoute un placement normal en attente avec sa trajectory */
  addPendingNormal: (proposalId: string, slot: number, trajectory: PlaceDragTrajectory) => void;
  /** Ajoute un placement miroir */
  addMirrorPlacement: (proposalId: string, slot: number) => void;
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
  /** Vérifie si un slot normal est rempli (session + pending) */
  isNormalSlotFilled: (
    slot: number,
    type: 'position' | 'audio',
    sessionPlacedProposals: ReadonlyMap<string, number>,
    proposals: readonly { id: string; type: string }[],
  ) => boolean;
  /** Vérifie si un slot miroir est rempli */
  isMirrorSlotFilled: (
    slot: number,
    type: 'position' | 'audio',
    proposals: readonly { id: string; type: string }[],
  ) => boolean;
  /** Obtient le contenu placé pour un slot normal */
  getNormalPlacedProposal: (
    slot: number,
    type: 'position' | 'audio',
    sessionPlacedProposals: ReadonlyMap<string, number>,
    proposals: readonly { id: string; type: string; value: number | string }[],
  ) => { id: string; type: string; value: number | string } | null;
  /** Obtient le contenu placé pour un slot miroir */
  getMirrorPlacedProposal: (
    slot: number,
    type: 'position' | 'audio',
    proposals: readonly { id: string; type: string; value: number | string }[],
  ) => { id: string; type: string; value: number | string } | null;

  // === Reset ===
  /** Réinitialise l'état pour un nouveau trial */
  resetForNewTrial: () => void;
  /** Réinitialise complètement le store */
  reset: () => void;
}

export type PlaceGameStore = PlaceGameState & PlaceGameActions;

// =============================================================================
// DEFAULT STATE
// =============================================================================

const createDefaultState = (): PlaceGameState => ({
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

export const usePlaceGameStore = create<PlaceGameStore>((set, get) => ({
  ...createDefaultState(),

  // === Placements ===
  addPendingNormal: (proposalId, slot, trajectory) =>
    set((state) => {
      const next = new Map(state.pendingNormalPlacements);
      next.set(proposalId, { slot, trajectory });
      return { pendingNormalPlacements: next };
    }),

  addMirrorPlacement: (proposalId, slot) =>
    set((state) => {
      const next = new Map(state.mirrorPlacements);
      next.set(proposalId, slot);
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
    // Crée les paires : chaque proposal a un normal et un mirror (jumeaux)
    const pairs: [string, string][] = proposalIds.map((id) => [`${id}-normal`, `${id}-mirror`]);

    // Shuffle l'ordre des paires (Fisher-Yates)
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pairs[i];
      const swap = pairs[j];
      if (temp !== undefined && swap !== undefined) {
        pairs[i] = swap;
        pairs[j] = temp;
      }
    }

    // Pour chaque paire, choisir aléatoirement qui vient en premier (50/50)
    // Résultat : les jumeaux sont toujours consécutifs
    const unifiedIds: string[] = [];
    for (const pair of pairs) {
      if (Math.random() < 0.5) {
        unifiedIds.push(pair[0], pair[1]); // normal puis mirror
      } else {
        unifiedIds.push(pair[1], pair[0]); // mirror puis normal
      }
    }

    set({
      unifiedPlacementOrder: unifiedIds,
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
  isNormalSlotFilled: (slot, type, sessionPlacedProposals, proposals) => {
    // Check session placements
    for (const [proposalId, placedSlot] of sessionPlacedProposals) {
      if (placedSlot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return true;
      }
    }
    // Check pending placements
    const state = get();
    for (const [proposalId, placement] of state.pendingNormalPlacements) {
      if (placement.slot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return true;
      }
    }
    return false;
  },

  isMirrorSlotFilled: (slot, type, proposals) => {
    const state = get();
    for (const [proposalId, placedSlot] of state.mirrorPlacements) {
      if (placedSlot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return true;
      }
    }
    return false;
  },

  getNormalPlacedProposal: (slot, type, sessionPlacedProposals, proposals) => {
    // Check session placements first
    for (const [proposalId, placedSlot] of sessionPlacedProposals) {
      if (placedSlot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return proposal;
      }
    }
    // Check pending placements
    const state = get();
    for (const [proposalId, placement] of state.pendingNormalPlacements) {
      if (placement.slot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return proposal;
      }
    }
    return null;
  },

  getMirrorPlacedProposal: (slot, type, proposals) => {
    const state = get();
    for (const [proposalId, placedSlot] of state.mirrorPlacements) {
      if (placedSlot === slot) {
        const proposal = proposals.find((p) => p.id === proposalId && p.type === type);
        if (proposal) return proposal;
      }
    }
    return null;
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
