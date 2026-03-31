/**
 * Badge System
 *
 * Définitions déclaratives des badges avec leurs règles de vérification.
 * Chaque badge contient sa propre logique de check (pas de séparation artificielle).
 *
 * OBJECTIF: ~50 badges pour qu'un utilisateur régulier gagne un badge toutes les 7-10 sessions.
 *
 * CATÉGORIES:
 * - consistency: Habitude et régularité
 * - performance: Compétence et maîtrise
 * - resilience: Mindset et récupération
 * - exploration: Polyvalence et curiosité
 * - milestone: Jalons long terme
 * - cognitive: Métriques neuroscientifiques (CognitiveProfiler)
 */

import { getAllReactionTimes, getModalityStats, getTotalStats } from '../../engine/events';
import {
  // Session milestones
  BADGE_SESSIONS_FIRST,
  BADGE_SESSIONS_BRONZE,
  BADGE_SESSIONS_SILVER,
  BADGE_SESSIONS_GOLD,
  BADGE_SESSIONS_TIME_OF_DAY,
  BADGE_ZEN_MASTER_SESSIONS,
  BADGE_IMPERTURBABLE_TRIALS,
  BADGE_SANG_FROID_MIN_ERRORS,
  BADGE_NO_PAUSE_STREAK,
  // Streak thresholds
  BADGE_STREAK_NASCENT,
  BADGE_STREAK_WEEKLY,
  BADGE_STREAK_BIWEEKLY,
  BADGE_STREAK_MONTHLY,
  BADGE_STREAK_QUARTERLY,
  BADGE_STREAK_YEARLY,
  BADGE_COMEBACK_DAYS,
  // Accuracy thresholds
  BADGE_ACCURACY_SNIPER,
  BADGE_ACCURACY_SURGICAL,
  BADGE_ACCURACY_LASER,
  BADGE_ACCURACY_DUAL_MASTER,
  BADGE_ACCURACY_DUAL_ELITE,
  // RT thresholds
  BADGE_RT_QUICK_MS,
  BADGE_RT_FLASH_MS,
  BADGE_RT_LIGHTNING_MS,
  BADGE_RT_CONSISTENT_STD_MS,
  BADGE_RT_METRONOME_STD_MS,
  BADGE_METRONOME_MIN_TRIALS,
  // N-Level thresholds
  BADGE_N_LEVEL_SHARP,
  BADGE_N_LEVEL_GENIUS,
  BADGE_N_LEVEL_VIRTUOSO,
  BADGE_N_LEVEL_LEGEND,
  BADGE_N_LEVEL_TRANSCENDED,
  // D-Prime thresholds
  BADGE_DPRIME_MASTER,
  BADGE_DPRIME_EXPERT,
  BADGE_DPRIME_IMPROVEMENT,
  // Modality balance
  BADGE_MODALITY_IMBALANCE_HIGH,
  BADGE_MODALITY_IMBALANCE_LOW,
  BADGE_MODALITY_SYNC_TOLERANCE,
  // Cognitive
  BADGE_FLOW_STATE_THRESHOLD,
  BADGE_VETERAN_DAYS,
  // Milestones
  BADGE_MILESTONE_SESSIONS,
  BADGE_TRIALS_PRACTITIONER,
  BADGE_TRIALS_TRAINED,
  BADGE_MILESTONE_TRIALS,
  // Inverse erf approximation
  PSYCHOMETRIC_DPRIME_INVERSE_ERF_CAP,
  // Badge system controls
  BADGE_MIN_RESPONSE_RATE,
  BADGE_MAX_PER_SESSION,
  // Anti-gaming thresholds
  BADGE_RT_MIN_RESPONSES,
  BADGE_RT_MIN_ACCURACY,
  BADGE_MIN_TRIALS_PER_MODALITY,
  BADGE_SYNC_MIN_ACCURACY,
  BADGE_SANG_FROID_MIN_ACCURACY,
  BADGE_IMPERTURBABLE_MIN_ACCURACY,
  BADGE_SECOND_WIND_MIN_DPRIME,
  BADGE_SECOND_WIND_MIN_TRIALS,
  BADGE_COMEBACK_MIN_DPRIME,
  BADGE_NO_PAUSE_MIN_ACCURACY,
  BADGE_STEADY_HANDS_MIN_ACCURACY,
  BADGE_MIN_LURES_PER_MODALITY,
} from '../../specs/thresholds';
import type { BadgeCategory, BadgeContext, UnlockedBadge } from '../../types';
import type { GameEvent, SessionSummary } from '../../engine/events';

// =============================================================================
// Re-export types depuis types/ pour rétro-compatibilité
// =============================================================================

export type { BadgeCategory, BadgeContext, UnlockedBadge };

// =============================================================================
// Types
// =============================================================================

export interface BadgeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: BadgeCategory;
  readonly icon: string;
  readonly check: (ctx: BadgeContext) => boolean;
  /** Optional group to avoid overlapping unlocks in a single session */
  readonly group?: string;
  /** Tier inside the group (higher = harder) */
  readonly tier?: number;
  /**
   * If true, badge requires a valid session (>50% response rate).
   * Used for cumulative badges (milestones, consistency) to prevent farming.
   * Performance badges based on current session metrics don't need this.
   */
  readonly requiresValidSession?: boolean;
  /**
   * Priority for badge selection (higher = more important).
   * When capped at 2 badges/session, higher priority badges are selected first.
   * Default: 0 (milestone/consistency), 1 (performance/cognitive)
   */
  readonly priority?: number;
}

// =============================================================================
// Helpers pour les règles
// =============================================================================

/**
 * Vérifie si une session est "valide" pour les badges cumulatifs.
 * Une session valide a un taux de réponse suffisant (>50% par défaut).
 * Cela empêche le farming de badges en faisant des sessions vides.
 */
function isValidSession(session: SessionSummary): boolean {
  const totals = getTotalStats(session.finalStats);
  const totalTrials = session.totalTrials;
  if (totalTrials === 0) return false;

  // Nombre de réponses données (hits + false alarms = réponses actives)
  const responsesGiven = totals.totalHits + totals.totalFalseAlarms;
  // Nombre de cibles (hits + misses)
  const totalTargets = totals.totalHits + totals.totalMisses;

  // Taux de réponse = réponses données / cibles attendues
  // On utilise totalTargets car c'est le nombre de fois où une réponse était attendue
  if (totalTargets === 0) return false;

  const responseRate = responsesGiven / totalTargets;
  return responseRate >= BADGE_MIN_RESPONSE_RATE;
}

/** Calcule la précision globale d'une session (0-1) */
function getSessionAccuracy(session: SessionSummary): number {
  const totals = getTotalStats(session.finalStats);
  const totalTargets = totals.totalHits + totals.totalMisses;
  return totalTargets > 0 ? totals.totalHits / totalTargets : 0;
}

/** Calcule l'écart-type des temps de réaction */
function getReactionTimeStdDev(session: SessionSummary): number {
  const rts = session.outcomes.flatMap((o) => getAllReactionTimes(o));

  if (rts.length < 2) return Infinity;

  const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
  const variance = rts.reduce((sum, rt) => sum + (rt - mean) ** 2, 0) / rts.length;
  return Math.sqrt(variance);
}

/** Calcule le temps de réaction moyen */
function getAvgReactionTime(session: SessionSummary): number {
  const rts = session.outcomes.flatMap((o) => getAllReactionTimes(o));

  if (rts.length === 0) return Infinity;
  return rts.reduce((a, b) => a + b, 0) / rts.length;
}

/** Compte le nombre de réponses avec un temps de réaction */
function getResponseCount(session: SessionSummary): number {
  return session.outcomes.flatMap((o) => getAllReactionTimes(o)).length;
}

function getTempoEvents(events?: readonly GameEvent[]): readonly GameEvent[] | null {
  if (!events || events.length === 0) return null;
  const hasTempo = events.some(
    (event) => event.type === 'SESSION_STARTED' || event.type === 'TRIAL_PRESENTED',
  );
  return hasTempo ? events : null;
}

/** Vérifie si la session est parfaite (0 erreurs) */
function isPerfectSession(session: SessionSummary): boolean {
  const totals = getTotalStats(session.finalStats);
  return totals.totalMisses === 0 && totals.totalFalseAlarms === 0;
}

/** Calcule le d-prime de la première moitié vs seconde moitié */
function getHalfSessionDPrimes(session: SessionSummary): { first: number; second: number } {
  const mid = Math.floor(session.outcomes.length / 2);
  const firstHalf = session.outcomes.slice(0, mid);
  const secondHalf = session.outcomes.slice(mid);

  const computeDPrime = (outcomes: readonly (typeof session.outcomes)[number][]): number => {
    let hits = 0,
      misses = 0,
      fas = 0,
      crs = 0;
    for (const o of outcomes) {
      // Itérer sur toutes les modalités présentes
      for (const modalityOutcome of Object.values(o.byModality)) {
        if (modalityOutcome.result === 'hit') hits++;
        if (modalityOutcome.result === 'miss') misses++;
        if (modalityOutcome.result === 'falseAlarm') fas++;
        if (modalityOutcome.result === 'correctRejection') crs++;
      }
    }
    const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0.5;
    const faRate = fas + crs > 0 ? fas / (fas + crs) : 0.5;
    // Simplified d-prime approximation
    const clamp = (v: number) => Math.max(0.01, Math.min(0.99, v));
    const zHit = Math.sqrt(2) * inverseErf(2 * clamp(hitRate) - 1);
    const zFa = Math.sqrt(2) * inverseErf(2 * clamp(faRate) - 1);
    return zHit - zFa;
  };

  return { first: computeDPrime(firstHalf), second: computeDPrime(secondHalf) };
}

/** Inverse error function approximation */
function inverseErf(x: number): number {
  const a = 0.147;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  if (absX >= 1) return sign * PSYCHOMETRIC_DPRIME_INVERSE_ERF_CAP;
  const ln = Math.log(1 - absX * absX);
  const term1 = 2 / (Math.PI * a) + ln / 2;
  const term2 = ln / a;
  return sign * Math.sqrt(Math.sqrt(term1 * term1 - term2) - term1);
}

// =============================================================================
// Badge Definitions (~50 badges)
// =============================================================================

export const BADGES: readonly BadgeDefinition[] = [
  // =========================================================================
  // 🏆 CONSISTENCY (Habitude) - 10 badges
  // Tous requiresValidSession: true (empêche le farming de sessions vides)
  // priority: 0 (moins prioritaires que les badges de performance)
  // =========================================================================
  {
    id: 'first_session',
    name: 'Neurone en Éveil',
    description: 'Première session terminée.',
    category: 'consistency',
    icon: 'brain',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_SESSIONS_FIRST,
  },
  {
    id: 'sessions_10',
    name: 'Pilier (Bronze)',
    description: '10 sessions terminées.',
    category: 'consistency',
    icon: 'layers',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_SESSIONS_BRONZE,
  },
  {
    id: 'sessions_25',
    name: 'Pilier (Argent)',
    description: '25 sessions terminées.',
    category: 'consistency',
    icon: 'stack',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_SESSIONS_SILVER,
  },
  {
    id: 'marathoner',
    name: 'Pilier (Or)',
    description: '50 sessions terminées.',
    category: 'consistency',
    icon: 'activity',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_SESSIONS_GOLD,
  },
  {
    id: 'streak_3',
    name: 'Rituel Naissant',
    description: 'Streak de 3 jours.',
    category: 'consistency',
    icon: 'flame',
    requiresValidSession: true,
    priority: 0,
    check: ({ history }) => history.getStreak().current >= BADGE_STREAK_NASCENT,
  },
  {
    id: 'streak_7',
    name: 'Rituel Quotidien',
    description: 'Streak de 7 jours.',
    category: 'consistency',
    icon: 'flame',
    requiresValidSession: true,
    priority: 0,
    check: ({ history }) => history.getStreak().current >= BADGE_STREAK_WEEKLY,
  },
  {
    id: 'streak_14',
    name: 'Habitude Ancrée',
    description: 'Streak de 14 jours.',
    category: 'consistency',
    icon: 'fire',
    requiresValidSession: true,
    priority: 0,
    check: ({ history }) => history.getStreak().current >= BADGE_STREAK_BIWEEKLY,
  },
  {
    id: 'streak_30',
    name: 'Discipline de Fer',
    description: 'Streak de 30 jours.',
    category: 'consistency',
    icon: 'gem',
    requiresValidSession: true,
    priority: 0,
    check: ({ history }) => history.getStreak().current >= BADGE_STREAK_MONTHLY,
  },
  {
    id: 'early_bird',
    name: 'Lève-tôt',
    description: '5 jours différents avec session avant 8h.',
    category: 'consistency',
    icon: 'sunrise',
    requiresValidSession: true,
    priority: 0,
    // Anti-gaming: Compte les jours uniques, pas les sessions
    // Empêche 5 sessions le même matin de débloquer le badge
    check: ({ history }) => history.getEarlyMorningDaysCount() >= BADGE_SESSIONS_TIME_OF_DAY,
  },
  {
    id: 'night_owl',
    name: 'Oiseau de Nuit',
    description: '5 jours différents avec session après 22h.',
    category: 'consistency',
    icon: 'moon',
    requiresValidSession: true,
    priority: 0,
    // Anti-gaming: Compte les jours uniques, pas les sessions
    // Empêche 5 sessions la même nuit de débloquer le badge
    check: ({ history }) => history.getLateNightDaysCount() >= BADGE_SESSIONS_TIME_OF_DAY,
  },

  // =========================================================================
  // ⚡ PERFORMANCE (Compétence) - 15 badges
  // priority: 1 (prioritaires sur les badges cumulatifs)
  // Pas besoin de requiresValidSession car ils vérifient déjà la performance
  // =========================================================================

  // --- N-Level ---
  {
    id: 'brain_n3',
    name: 'Cerveau Affûté',
    description: 'Atteindre le niveau N-3.',
    category: 'performance',
    icon: 'brain',
    group: 'n_level',
    tier: 1,
    priority: 1,
    check: ({ history }) => history.maxNLevel >= BADGE_N_LEVEL_SHARP,
  },
  {
    id: 'brain_n4',
    name: 'Cerveau Musclé',
    description: 'Atteindre le niveau N-4.',
    category: 'performance',
    icon: 'dumbbell',
    group: 'n_level',
    tier: 2,
    priority: 1,
    check: ({ history }) => history.maxNLevel >= BADGE_N_LEVEL_GENIUS,
  },
  {
    id: 'brain_n5',
    name: 'Cerveau Olympique',
    description: 'Atteindre le niveau N-5.',
    category: 'performance',
    icon: 'trophy',
    group: 'n_level',
    tier: 3,
    priority: 1,
    check: ({ history }) => history.maxNLevel >= BADGE_N_LEVEL_VIRTUOSO,
  },
  {
    id: 'brain_n7',
    name: 'Élite Cognitive',
    description: 'Atteindre le niveau N-7.',
    category: 'performance',
    icon: 'crown',
    group: 'n_level',
    tier: 4,
    priority: 1,
    check: ({ history }) => history.maxNLevel >= BADGE_N_LEVEL_LEGEND,
  },
  {
    id: 'brain_n10',
    name: 'Surhumain',
    description: 'Atteindre le niveau N-10.',
    category: 'performance',
    icon: 'rocket',
    group: 'n_level',
    tier: 5,
    priority: 1,
    check: ({ history }) => history.maxNLevel >= BADGE_N_LEVEL_TRANSCENDED,
  },

  // --- Accuracy ---
  {
    id: 'sniper',
    name: 'Sniper',
    description: '> 90% de précision à N ≥ 2.',
    category: 'performance',
    icon: 'target',
    group: 'accuracy',
    tier: 1,
    priority: 1,
    check: ({ session }) =>
      session.nLevel >= 2 && getSessionAccuracy(session) > BADGE_ACCURACY_SNIPER,
  },
  {
    id: 'accuracy_95',
    name: 'Précision Chirurgicale',
    description: '> 95% de précision à N ≥ 2.',
    category: 'performance',
    icon: 'crosshair',
    group: 'accuracy',
    tier: 2,
    priority: 1,
    check: ({ session }) =>
      session.nLevel >= 2 && getSessionAccuracy(session) > BADGE_ACCURACY_SURGICAL,
  },
  {
    id: 'accuracy_98',
    name: 'Laser',
    description: '> 98% de précision à N ≥ 2.',
    category: 'performance',
    icon: 'crosshair',
    group: 'accuracy',
    tier: 3,
    priority: 1,
    check: ({ session }) =>
      session.nLevel >= 2 && getSessionAccuracy(session) > BADGE_ACCURACY_LASER,
  },
  {
    id: 'untouchable',
    name: 'Intouchable',
    description: 'Session parfaite (0 erreurs) à N ≥ 2.',
    category: 'performance',
    icon: 'sparkle',
    group: 'accuracy',
    tier: 4,
    priority: 1,
    check: ({ session }) => session.nLevel >= 2 && isPerfectSession(session),
  },

  // --- Reaction Time ---
  // Anti-gaming: Exige un minimum de réponses pour éviter les sessions courtes
  // rt_300 exige aussi une accuracy minimale pour éviter le spam de réponses
  {
    id: 'rt_500',
    name: 'Réflexe Vif',
    description: 'Temps de réaction moyen < 500ms avec ≥70% accuracy.',
    category: 'performance',
    icon: 'zap',
    group: 'reaction_time',
    tier: 1,
    priority: 1,
    check: ({ session }) => {
      // Anti-gaming: Exige min réponses + accuracy minimale pour éviter le spam
      if (getResponseCount(session) < BADGE_RT_MIN_RESPONSES) return false;
      if (getSessionAccuracy(session) < BADGE_RT_MIN_ACCURACY) return false;
      return getAvgReactionTime(session) < BADGE_RT_QUICK_MS;
    },
  },
  {
    id: 'flash',
    name: 'Flash',
    description: 'Temps de réaction moyen < 400ms avec ≥70% accuracy.',
    category: 'performance',
    icon: 'zap',
    group: 'reaction_time',
    tier: 2,
    priority: 1,
    check: ({ session }) => {
      // Anti-gaming: Exige min réponses + accuracy minimale pour éviter le spam
      if (getResponseCount(session) < BADGE_RT_MIN_RESPONSES) return false;
      if (getSessionAccuracy(session) < BADGE_RT_MIN_ACCURACY) return false;
      return getAvgReactionTime(session) < BADGE_RT_FLASH_MS;
    },
  },
  {
    id: 'rt_300',
    name: 'Éclair',
    description: 'Temps de réaction moyen < 300ms avec ≥70% accuracy.',
    category: 'performance',
    icon: 'bolt',
    group: 'reaction_time',
    tier: 3,
    priority: 1,
    check: ({ session }) => {
      // Anti-gaming: Exige min réponses + accuracy minimale pour éviter le spam
      if (getResponseCount(session) < BADGE_RT_MIN_RESPONSES) return false;
      if (getSessionAccuracy(session) < BADGE_RT_MIN_ACCURACY) return false;
      return getAvgReactionTime(session) < BADGE_RT_LIGHTNING_MS;
    },
  },

  // --- Consistency ---
  {
    id: 'consistent',
    name: 'Régulier',
    description: 'Écart-type RT < 100ms (≥10 réponses requises).',
    category: 'performance',
    icon: 'bar-chart',
    group: 'rhythm',
    tier: 1,
    priority: 1,
    check: ({ session }) => {
      // Anti-gaming: Exige un minimum de réponses pour éviter les petits échantillons
      if (getResponseCount(session) < BADGE_RT_MIN_RESPONSES) return false;
      return getReactionTimeStdDev(session) < BADGE_RT_CONSISTENT_STD_MS;
    },
  },

  // --- D-Prime ---
  {
    id: 'dprime_master',
    name: "Maître d'",
    description: 'd-prime > 3.0 sur une session.',
    category: 'performance',
    icon: 'trending-up',
    group: 'dprime',
    tier: 1,
    priority: 1,
    check: ({ session }) => session.finalStats.globalDPrime > BADGE_DPRIME_MASTER,
  },
  {
    id: 'dprime_4',
    name: 'Expert SDT',
    description: 'd-prime > 4.0 sur une session.',
    category: 'performance',
    icon: 'chart-line',
    group: 'dprime',
    tier: 2,
    priority: 1,
    check: ({ session }) => session.finalStats.globalDPrime > BADGE_DPRIME_EXPERT,
  },

  // =========================================================================
  // 🧠 RESILIENCE (Mindset) - 9 badges
  // Badges session → priority: 1 (vérifient une vraie performance)
  // Badges cumulatifs → requiresValidSession: true, priority: 0
  // =========================================================================
  {
    id: 'no_pause',
    name: 'Sans interruption',
    description: `${BADGE_NO_PAUSE_STREAK} sessions consécutives sans pause avec ≥75% accuracy.`,
    category: 'resilience',
    icon: 'clock',
    group: 'discipline',
    tier: 1,
    requiresValidSession: true,
    priority: 0,
    check: ({ progression, session }) => {
      // Anti-gaming: Exige une accuracy minimale pour éviter les sessions triviales
      if (getSessionAccuracy(session) < BADGE_NO_PAUSE_MIN_ACCURACY) return false;
      return progression.uninterruptedSessionsStreak >= BADGE_NO_PAUSE_STREAK;
    },
  },
  {
    id: 'steady_hands',
    name: 'Main sûre',
    description: 'Aucune fausse manipulation pendant la session (≥80% accuracy).',
    category: 'resilience',
    icon: 'focus',
    group: 'discipline',
    tier: 2,
    priority: 1,
    check: ({ session, events }) => {
      const tempoEvents = getTempoEvents(events);
      if (!tempoEvents || session.totalTrials < 20) return false;
      const hasPause = tempoEvents.some((event) => event.type === 'SESSION_PAUSED');
      if (hasPause) return false;
      const hasMisfire = tempoEvents.some((event) => event.type === 'INPUT_MISFIRED');
      if (hasMisfire) return false;
      // Anti-gaming: Vérifier qu'il y a eu des réponses actives
      // Empêche le badge si l'utilisateur fait 0 réponses (tout en CR)
      const totals = getTotalStats(session.finalStats);
      const responsesGiven = totals.totalHits + totals.totalFalseAlarms;
      if (responsesGiven === 0) return false;
      // Anti-gaming: Exige une accuracy minimale
      return getSessionAccuracy(session) >= BADGE_STEADY_HANDS_MIN_ACCURACY;
    },
  },
  {
    id: 'zen_master',
    name: 'Zen Master',
    description: '10 sessions sans jamais abandonner.',
    category: 'resilience',
    icon: 'leaf',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) =>
      progression.completedSessions >= BADGE_ZEN_MASTER_SESSIONS &&
      progression.abandonedSessions === 0,
  },
  {
    id: 'comeback_kid',
    name: 'Comeback Kid',
    description: 'Remonter de niveau après une descente.',
    category: 'resilience',
    icon: 'trending-up',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.comebackCount >= 1,
  },
  {
    id: 'persistent',
    name: 'Persistant',
    description: '3 sessions le même jour après un échec.',
    category: 'resilience',
    icon: 'anchor',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.persistentDays >= 1,
  },
  {
    id: 'second_wind',
    name: 'Second Souffle',
    description: 'Améliorer son d-prime entre moitié 1 et 2 (d′ ≥ 2.0 requis).',
    category: 'resilience',
    icon: 'wind',
    priority: 1,
    check: ({ session }) => {
      // Anti-gaming: Exige un nombre minimum de trials pour des moitiés significatives
      if (session.outcomes.length < BADGE_SECOND_WIND_MIN_TRIALS) return false;
      const halves = getHalfSessionDPrimes(session);
      // Anti-gaming: La seconde moitié doit avoir une bonne performance absolue
      // Empêche le cas où on améliore de d'=0.3 à d'=0.7 (toujours médiocre)
      if (halves.second < BADGE_SECOND_WIND_MIN_DPRIME) return false;
      return halves.second > halves.first + BADGE_DPRIME_IMPROVEMENT;
    },
  },
  {
    id: 'plateau_breaker',
    name: 'Plateau Brisé',
    description: 'Progresser après 10+ sessions au même niveau.',
    category: 'resilience',
    icon: 'hammer',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.plateausBroken >= 1,
  },
  {
    id: 'no_surrender',
    name: 'Aucun Abandon',
    description: '25 sessions sans abandon.',
    category: 'resilience',
    icon: 'shield',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) =>
      progression.completedSessions >= BADGE_SESSIONS_SILVER && progression.abandonedSessions === 0,
  },
  {
    id: 'ironwill',
    name: 'Volonté de Fer',
    description: '50 sessions sans abandon.',
    category: 'resilience',
    icon: 'shield-check',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) =>
      progression.completedSessions >= BADGE_SESSIONS_GOLD && progression.abandonedSessions === 0,
  },

  // =========================================================================
  // 🎨 EXPLORATION (Polyvalence) - 5 badges
  // Tous basés sur la performance de session courante → priority: 1
  // Anti-gaming: Tous exigent un minimum de trials par modalité
  // =========================================================================
  {
    id: 'audiophile',
    name: 'Audiophile',
    description: 'Audio > 80% mais Visuel < 70%.',
    category: 'exploration',
    icon: 'headphones',
    priority: 1,
    check: ({ session }) => {
      const audioStats = getModalityStats(session.finalStats, 'audio');
      const posStats = getModalityStats(session.finalStats, 'position');
      const audioTargets = audioStats.hits + audioStats.misses;
      const posTargets = posStats.hits + posStats.misses;
      // Anti-gaming: Exige un minimum de trials par modalité
      if (audioTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      if (posTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      const audioAcc = audioStats.hits / audioTargets;
      const posAcc = posStats.hits / posTargets;
      return audioAcc > BADGE_MODALITY_IMBALANCE_HIGH && posAcc < BADGE_MODALITY_IMBALANCE_LOW;
    },
  },
  {
    id: 'eagle_eye',
    name: 'Oeil de Lynx',
    description: 'Visuel > 80% mais Audio < 70%.',
    category: 'exploration',
    icon: 'eye',
    priority: 1,
    check: ({ session }) => {
      const audioStats = getModalityStats(session.finalStats, 'audio');
      const posStats = getModalityStats(session.finalStats, 'position');
      const audioTargets = audioStats.hits + audioStats.misses;
      const posTargets = posStats.hits + posStats.misses;
      // Anti-gaming: Exige un minimum de trials par modalité
      if (audioTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      if (posTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      const audioAcc = audioStats.hits / audioTargets;
      const posAcc = posStats.hits / posTargets;
      return posAcc > BADGE_MODALITY_IMBALANCE_HIGH && audioAcc < BADGE_MODALITY_IMBALANCE_LOW;
    },
  },
  {
    id: 'synchronized',
    name: 'Synchronisé',
    description: 'Scores Audio et Visuel identiques à 5% près (≥60% requis).',
    category: 'exploration',
    icon: 'scale',
    priority: 1,
    check: ({ session }) => {
      const audioStats = getModalityStats(session.finalStats, 'audio');
      const posStats = getModalityStats(session.finalStats, 'position');
      const audioTargets = audioStats.hits + audioStats.misses;
      const posTargets = posStats.hits + posStats.misses;
      // Anti-gaming: Exige un minimum de trials par modalité
      if (audioTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      if (posTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      const audioAcc = audioStats.hits / audioTargets;
      const posAcc = posStats.hits / posTargets;
      // Anti-gaming: Exige une accuracy minimale pour les deux modalités
      // Empêche le cas paradoxal où 0% audio et 0% visuel = "synchronisé"
      if (audioAcc < BADGE_SYNC_MIN_ACCURACY) return false;
      if (posAcc < BADGE_SYNC_MIN_ACCURACY) return false;
      return Math.abs(audioAcc - posAcc) <= BADGE_MODALITY_SYNC_TOLERANCE;
    },
  },
  {
    id: 'dual_master',
    name: 'Maître Dual',
    description: 'Audio ET Visuel > 85% sur la même session (≥6 leurres/modalité).',
    category: 'exploration',
    icon: 'infinity',
    group: 'dual_balance',
    tier: 1,
    priority: 1,
    check: ({ session }) => {
      const audioStats = getModalityStats(session.finalStats, 'audio');
      const posStats = getModalityStats(session.finalStats, 'position');
      const audioTargets = audioStats.hits + audioStats.misses;
      const posTargets = posStats.hits + posStats.misses;
      // Anti-gaming: Exige un minimum de trials par modalité
      if (audioTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      if (posTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      // Anti-gaming: Exige un minimum de leurres par modalité
      // Empêche les sessions générées sans leurres où 85%+ est trivial
      const audioLures = audioStats.falseAlarms + audioStats.correctRejections;
      const posLures = posStats.falseAlarms + posStats.correctRejections;
      if (audioLures < BADGE_MIN_LURES_PER_MODALITY) return false;
      if (posLures < BADGE_MIN_LURES_PER_MODALITY) return false;
      const audioAcc = audioStats.hits / audioTargets;
      const posAcc = posStats.hits / posTargets;
      return audioAcc > BADGE_ACCURACY_DUAL_MASTER && posAcc > BADGE_ACCURACY_DUAL_MASTER;
    },
  },
  {
    id: 'dual_elite',
    name: 'Dual Élite',
    description: 'Audio ET Visuel > 90% sur la même session à N ≥ 3 (≥6 leurres/modalité).',
    category: 'exploration',
    icon: 'star',
    group: 'dual_balance',
    tier: 2,
    priority: 1,
    check: ({ session }) => {
      if (session.nLevel < BADGE_N_LEVEL_SHARP) return false;
      const audioStats = getModalityStats(session.finalStats, 'audio');
      const posStats = getModalityStats(session.finalStats, 'position');
      const audioTargets = audioStats.hits + audioStats.misses;
      const posTargets = posStats.hits + posStats.misses;
      // Anti-gaming: Exige un minimum de trials par modalité
      if (audioTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      if (posTargets < BADGE_MIN_TRIALS_PER_MODALITY) return false;
      // Anti-gaming: Exige un minimum de leurres par modalité
      const audioLures = audioStats.falseAlarms + audioStats.correctRejections;
      const posLures = posStats.falseAlarms + posStats.correctRejections;
      if (audioLures < BADGE_MIN_LURES_PER_MODALITY) return false;
      if (posLures < BADGE_MIN_LURES_PER_MODALITY) return false;
      const audioAcc = audioStats.hits / audioTargets;
      const posAcc = posStats.hits / posTargets;
      return audioAcc > BADGE_ACCURACY_DUAL_ELITE && posAcc > BADGE_ACCURACY_DUAL_ELITE;
    },
  },

  // =========================================================================
  // 📈 MILESTONES (Long terme) - 11 badges
  // Tous cumulatifs → requiresValidSession: true, priority: 0
  // =========================================================================
  {
    id: 'centurion',
    name: 'Centurion',
    description: '100 sessions terminées.',
    category: 'milestone',
    icon: 'medal',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_MILESTONE_SESSIONS[0],
  },
  {
    id: 'sessions_250',
    name: 'Légende (Émeraude)',
    description: '250 sessions terminées.',
    category: 'milestone',
    icon: 'crown',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_MILESTONE_SESSIONS[1],
  },
  {
    id: 'sessions_500',
    name: 'Immortel (Diamant)',
    description: '500 sessions terminées.',
    category: 'milestone',
    icon: 'diamond',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.completedSessions >= BADGE_MILESTONE_SESSIONS[2],
  },
  {
    id: 'trials_500',
    name: 'Pratiquant',
    description: '500 trials joués au total.',
    category: 'milestone',
    icon: 'heart',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.totalTrials >= BADGE_TRIALS_PRACTITIONER,
  },
  {
    id: 'trials_1000',
    name: 'Entraîné',
    description: '1 000 trials joués au total.',
    category: 'milestone',
    icon: 'heartbeat',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.totalTrials >= BADGE_TRIALS_TRAINED,
  },
  {
    id: 'trials_5000',
    name: 'Aguerri',
    description: '5 000 trials joués au total.',
    category: 'milestone',
    icon: 'trophy',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.totalTrials >= BADGE_MILESTONE_TRIALS[0],
  },
  {
    id: 'trials_10k',
    name: '10 000 Trials',
    description: '10 000 trials joués au total.',
    category: 'milestone',
    icon: 'medal',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.totalTrials >= BADGE_MILESTONE_TRIALS[1],
  },
  {
    id: 'trials_50k',
    name: 'Titan',
    description: '50 000 trials joués au total.',
    category: 'milestone',
    icon: 'mountain',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.totalTrials >= BADGE_MILESTONE_TRIALS[2],
  },
  {
    id: 'streak_90',
    name: 'Trimestre Sans Faille',
    description: 'Streak de 90 jours.',
    category: 'milestone',
    icon: 'calendar',
    requiresValidSession: true,
    priority: 0,
    check: ({ history }) => history.getStreak().current >= BADGE_STREAK_QUARTERLY,
  },
  {
    id: 'streak_365',
    name: 'Année Parfaite',
    description: 'Streak de 365 jours.',
    category: 'milestone',
    icon: 'calendar-check',
    requiresValidSession: true,
    priority: 0,
    check: ({ history }) => history.getStreak().current >= BADGE_STREAK_YEARLY,
  },
  {
    id: 'veteran',
    name: 'Vétéran',
    description: "1 an d'utilisation.",
    category: 'milestone',
    icon: 'star',
    requiresValidSession: true,
    priority: 0,
    check: ({ progression }) => progression.daysSinceFirstSession >= BADGE_VETERAN_DAYS,
  },

  // =========================================================================
  // 🧬 COGNITIVE (Neuroscience) - 5 badges
  // Tous basés sur la performance de session courante → priority: 1
  // =========================================================================
  {
    id: 'metronome',
    name: 'Le Métronome',
    description: 'Variance du RT < 50ms sur ≥20 trials (réponses actives requises).',
    category: 'cognitive',
    icon: 'metronome',
    group: 'rhythm',
    tier: 2,
    priority: 1,
    check: ({ session }) => {
      // Anti-gaming: Vérifier qu'il y a des réponses actives (évite 0 réponses en tout CR)
      if (getResponseCount(session) === 0) return false;
      const stdDev = getReactionTimeStdDev(session);
      // stdDev < 50ms means variance < 2500ms² which indicates very consistent timing
      return (
        stdDev < BADGE_RT_METRONOME_STD_MS && session.outcomes.length >= BADGE_METRONOME_MIN_TRIALS
      );
    },
  },
  {
    id: 'flow_state',
    name: 'État de Grâce',
    description: 'Détection de Flow sur une session entière.',
    category: 'cognitive',
    icon: 'waves',
    priority: 1,
    check: ({ session }) => {
      // Flow détecté via tempoConfidence (TimingDiscipline + RTStability hauts)
      if (!session.tempoConfidence) return false;
      const { timingDiscipline, rtStability } = session.tempoConfidence.components;
      // Flow = timing très discipliné ET RT très stable (scores are 0-100, so >80 means >0.8)
      // timingDiscipline can be null for Jaeggi mode (when timing penalty is waived)
      if (timingDiscipline === null) return false;
      return (
        timingDiscipline > BADGE_FLOW_STATE_THRESHOLD && rtStability > BADGE_FLOW_STATE_THRESHOLD
      );
    },
  },
  {
    id: 'sang_froid',
    name: 'Sang-Froid',
    description: "Aucune cascade d'erreurs après une erreur (≥70% accuracy).",
    category: 'cognitive',
    icon: 'snowflake',
    priority: 1,
    check: ({ session }) => {
      // Vérifie qu'il n'y a pas 2 erreurs consécutives
      let previousWasError = false;
      for (const outcome of session.outcomes) {
        const isError = Object.values(outcome.byModality).some(
          (m) => m.result === 'miss' || m.result === 'falseAlarm',
        );
        if (previousWasError && isError) {
          return false; // Cascade détectée
        }
        previousWasError = isError;
      }
      // Au moins 5 erreurs pour que ce soit significatif
      const totalErrors = session.outcomes.filter((o) =>
        Object.values(o.byModality).some((m) => m.result === 'miss' || m.result === 'falseAlarm'),
      ).length;
      if (totalErrors < BADGE_SANG_FROID_MIN_ERRORS) return false;
      // Anti-gaming: Exige une accuracy minimale pour éviter les mauvaises performances
      // Empêche le cas où 50% accuracy avec erreurs dispersées = "sang-froid"
      return getSessionAccuracy(session) >= BADGE_SANG_FROID_MIN_ACCURACY;
    },
  },
  {
    id: 'imperturbable',
    name: 'Imperturbable',
    description: 'Session complète sans perte de focus (≥60% accuracy).',
    category: 'cognitive',
    icon: 'glasses',
    priority: 1,
    check: ({ session }) => {
      // Aucune perte de focus et session substantielle
      if (session.focusLostCount !== 0) return false;
      if (session.outcomes.length < BADGE_IMPERTURBABLE_TRIALS) return false;
      // Anti-gaming: Exige une accuracy minimale
      // Empêche le badge pour une mauvaise performance sans perte de focus
      return getSessionAccuracy(session) >= BADGE_IMPERTURBABLE_MIN_ACCURACY;
    },
  },
  {
    id: 'comeback_strong',
    name: 'Retour en Force',
    description: "Battre son record de d-prime après 3+ jours d'absence (d′ ≥ 2.5).",
    category: 'cognitive',
    icon: 'trending-up',
    priority: 1,
    check: ({ session, history }) => {
      // Exiger une absence significative
      if (history.daysSinceLastSession === null) return false;
      if (history.daysSinceLastSession < BADGE_COMEBACK_DAYS) return false;
      // Exiger que le record précédent existe
      if (history.bestDPrime <= 0) return false;
      // Anti-gaming: Exige que la nouvelle performance soit vraiment bonne
      // Empêche le cas où on bat d'=1.2 avec d'=1.3 (toujours médiocre)
      if (session.finalStats.globalDPrime < BADGE_COMEBACK_MIN_DPRIME) return false;
      // L'amélioration doit battre le record
      return session.finalStats.globalDPrime > history.bestDPrime;
    },
  },
];

// =============================================================================
// Badge Checker
// =============================================================================

/**
 * Vérifie les nouveaux badges débloqués pour cette session.
 *
 * Règles anti-farming et anti-spam :
 * 1. Les badges avec `requiresValidSession: true` nécessitent un taux de réponse ≥ 50%
 * 2. Maximum 2 badges par session (BADGE_MAX_PER_SESSION)
 * 3. Badges triés par priorité (performance > cumulatifs)
 *
 * @param ctx Contexte avec session actuelle, historique et progression
 * @param unlockedIds Set des IDs de badges déjà débloqués
 * @returns Liste des badges nouvellement débloqués (max 2)
 */
export function checkNewBadges(ctx: BadgeContext, unlockedIds: Set<string>): BadgeDefinition[] {
  // Vérifier si la session est valide pour les badges cumulatifs
  const sessionIsValid = isValidSession(ctx.session);

  const unlockedTierByGroup = new Map<string, number>();
  for (const badge of BADGES) {
    if (!badge.group || !unlockedIds.has(badge.id)) continue;
    const tier = badge.tier ?? 0;
    const current = unlockedTierByGroup.get(badge.group) ?? 0;
    if (tier > current) unlockedTierByGroup.set(badge.group, tier);
  }

  const grouped = new Map<string, BadgeDefinition[]>();
  const ungrouped: BadgeDefinition[] = [];

  for (const badge of BADGES) {
    if (unlockedIds.has(badge.id)) continue;

    // Skip les badges cumulatifs si la session n'est pas valide
    if (badge.requiresValidSession && !sessionIsValid) continue;

    let isUnlocked = false;
    try {
      isUnlocked = badge.check(ctx);
    } catch {
      isUnlocked = false;
    }
    if (!isUnlocked) continue;

    if (!badge.group) {
      ungrouped.push(badge);
      continue;
    }
    const existing = grouped.get(badge.group) ?? [];
    existing.push(badge);
    grouped.set(badge.group, existing);
  }

  const selected: BadgeDefinition[] = [...ungrouped];
  for (const [group, candidates] of grouped) {
    const minTier = unlockedTierByGroup.get(group) ?? 0;
    const eligible = candidates.filter((badge) => (badge.tier ?? 0) > minTier);
    if (eligible.length === 0) continue;
    eligible.sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0));
    const topBadge = eligible[0];
    if (topBadge) selected.push(topBadge);
  }

  // Appliquer le cap de badges par session :
  // - Trier par priorité (1 = performance > 0 = cumulatif)
  // - Garder au maximum BADGE_MAX_PER_SESSION badges
  if (selected.length > BADGE_MAX_PER_SESSION) {
    selected.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return selected.slice(0, BADGE_MAX_PER_SESSION);
  }

  return selected;
}

/**
 * Récupère un badge par son ID.
 */
export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id);
}

/**
 * Récupère tous les badges d'une catégorie.
 */
export function getBadgesByCategory(category: BadgeCategory): BadgeDefinition[] {
  return BADGES.filter((b) => b.category === category);
}

/**
 * Compte le nombre total de badges par catégorie.
 */
export function getBadgeCountByCategory(): Record<BadgeCategory, number> {
  const counts: Record<BadgeCategory, number> = {
    consistency: 0,
    performance: 0,
    resilience: 0,
    exploration: 0,
    milestone: 0,
    cognitive: 0,
  };
  for (const badge of BADGES) {
    counts[badge.category]++;
  }
  return counts;
}
