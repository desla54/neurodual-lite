/**
 * CognitiveProfiler - Cognitive Analysis Class
 *
 * Classe OOP pour extraire des features ML-ready à partir des events bruts.
 * Aucune donnée stockée - tout est calculé à la demande.
 *
 * Features analysées:
 * - Flow State: Détection via variance du RT
 * - Resilience: Analyse du post-error slowing
 * - Fatigue: Courbe de performance début vs fin
 * - Rhythm: Stabilité du tempo de réponse
 */

import { getIsTarget, type ModalityId } from '../domain';
import {
  getAllReactionTimes,
  type GameEvent,
  type SessionStartedEvent,
  type TrialOutcome,
  type TrialPresentedEvent,
  type UserResponseEvent,
} from './events';
import { SessionProjector } from './session-projector';
import { StatisticalCalculator } from './statistical-calculator';
import {
  PROFILE_FLOW_SCORE_DEFAULT,
  COGNITIVE_FLOW_ENTRY_THRESHOLD,
  COGNITIVE_RESILIENCE_THRESHOLD,
  COGNITIVE_FRAGILE_THRESHOLD,
  COGNITIVE_ERROR_PROBABILITY_BREAK,
  COGNITIVE_ERROR_PROBABILITY_DECREASE,
  COGNITIVE_SCORE_INCREASE_DIFFICULTY,
  COGNITIVE_RECOVERY_TOO_FAST_FACTOR,
} from '../specs/thresholds';

// =============================================================================
// Helpers
// =============================================================================

/** Default modalities when not specified in session config */
const DEFAULT_MODALITIES: readonly ModalityId[] = ['position', 'audio'];

/**
 * Extracts activeModalities from events via SESSION_STARTED config.
 * Falls back to default if not found.
 */
function extractActiveModalities(events: readonly GameEvent[]): readonly ModalityId[] {
  const sessionStart = events.find((e): e is SessionStartedEvent => e.type === 'SESSION_STARTED');
  return sessionStart?.config?.activeModalities ?? DEFAULT_MODALITIES;
}

// =============================================================================
// Types
// =============================================================================

export interface FlowMetrics {
  /** Variance des RT sur une fenêtre glissante (ms²) */
  readonly rtVariance: number;
  /** Coefficient de variation (écart-type / moyenne) - normalisé */
  readonly rtCoefficientOfVariation: number;
  /** Tendance du RT: stable, increasing (fatigue), decreasing (warmup), chaotic */
  readonly rtTrend: 'stable' | 'increasing' | 'decreasing' | 'chaotic';
  /** Score de flow 0-1 (1 = parfaitement régulier) */
  readonly flowScore: number;
  /** Le joueur est-il en état de flow? */
  readonly isInFlow: boolean;
}

export interface ResilienceMetrics {
  /** Ralentissement moyen après une erreur (ms) */
  readonly avgSlowdownAfterError: number;
  /** Nombre de trials pour revenir au RT baseline après erreur */
  readonly avgRecoveryTrials: number;
  /** Ratio d'erreurs consécutives (cascade) */
  readonly errorCascadeRate: number;
  /** Score de résilience 0-1 (1 = récupère vite, pas de cascade) */
  readonly resilienceScore: number;
  /** Profil émotionnel déduit */
  readonly profile: 'fragile' | 'normal' | 'resilient';
}

export interface FatigueMetrics {
  /** RT moyen sur les 5 premiers trials scorables */
  readonly earlyAvgRT: number;
  /** RT moyen sur les 5 derniers trials scorables */
  readonly lateAvgRT: number;
  /** Delta de performance (late - early), positif = ralentissement */
  readonly rtDelta: number;
  /** Pourcentage de dégradation */
  readonly degradationPercent: number;
  /** Accuracy début vs fin */
  readonly earlyAccuracy: number;
  readonly lateAccuracy: number;
  /** Score d'endurance 0-1 (1 = pas de fatigue) */
  readonly enduranceScore: number;
  /** Détection de fatigue */
  readonly isFatigued: boolean;
}

export interface RhythmMetrics {
  /** Intervalle moyen entre réponses (ms) */
  readonly avgInterResponseInterval: number;
  /** Variance de l'intervalle */
  readonly intervalVariance: number;
  /** Le joueur maintient-il un rythme? */
  readonly hasStableRhythm: boolean;
  /** Tempo estimé (réponses par minute) */
  readonly responsesPerMinute: number;
}

/** Profil cognitif par modalité (session unique) */
export interface CognitiveModalityProfile {
  readonly modality: ModalityId;

  // SDT
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  readonly dPrime: number;
  readonly accuracy: number;

  // Timing
  readonly avgRT: number;
  readonly rtVariance: number;
  readonly rtTrend: 'stable' | 'increasing' | 'decreasing' | 'chaotic';

  // Flow
  readonly flowScore: number;
  readonly isInFlow: boolean;

  // Resilience
  readonly resilienceScore: number;
  readonly errorCascadeRate: number;

  // Fatigue
  readonly enduranceScore: number;
  readonly isFatigued: boolean;
}

/** Insights comparatifs entre modalités */
export interface CognitiveModalityInsights {
  readonly strongestModality: ModalityId | null;
  readonly weakestModality: ModalityId | null;
  /** Score d'équilibre 0-1 (1 = parfaitement équilibré) */
  readonly balanceScore: number;
  readonly gaps: {
    readonly dPrimeGap: number;
    readonly rtGap: number;
    readonly flowGap: number;
  };
  /** Biais dominant détecté (ex: 'audio_dominant') ou 'balanced' */
  readonly detectedBias: string | null;
}

export interface CognitiveProfile {
  readonly flow: FlowMetrics;
  readonly resilience: ResilienceMetrics;
  readonly fatigue: FatigueMetrics;
  readonly rhythm: RhythmMetrics;
  /** Score cognitif global 0-1 */
  readonly overallScore: number;
  /** Probabilité estimée d'erreur au prochain trial */
  readonly nextErrorProbability: number;
  /** Recommandation pour le coach */
  readonly recommendation:
    | 'increase_difficulty'
    | 'maintain'
    | 'decrease_difficulty'
    | 'suggest_break';
  /** Métriques par modalité (clés: 'position', 'audio', 'color', etc.) */
  readonly byModality: Record<ModalityId, CognitiveModalityProfile>;
  /** Insights comparatifs entre modalités */
  readonly modalityInsights: CognitiveModalityInsights;
}

// =============================================================================
// CognitiveProfiler
// =============================================================================

/**
 * Profileur cognitif.
 * Analyse les patterns comportementaux à partir des events de jeu.
 */
export class CognitiveProfiler {
  // ===========================================================================
  // Flow Metrics
  // ===========================================================================

  /**
   * Calcule les métriques de flow state.
   */
  static computeFlowMetrics(responses: readonly UserResponseEvent[], windowSize = 5): FlowMetrics {
    // Filtrer les RT valides (réponses pendant stimulus ou juste après)
    const rts = responses.map((r) => r.reactionTimeMs).filter((rt) => rt > 0 && rt < 3000);

    if (rts.length < 3) {
      return {
        rtVariance: 0,
        rtCoefficientOfVariation: 0,
        rtTrend: 'stable',
        flowScore: PROFILE_FLOW_SCORE_DEFAULT, // Neutral default @see thresholds.ts
        isInFlow: false,
      };
    }

    // Prendre les derniers N trials pour la fenêtre glissante
    const window = rts.slice(-windowSize);
    const rtVar = StatisticalCalculator.variance(window);
    const rtMean = StatisticalCalculator.mean(window);

    // Coefficient de variation (normalisé par la moyenne)
    const cv = StatisticalCalculator.coefficientOfVariation(window);

    // Tendance sur toute la session
    const slope = StatisticalCalculator.linearTrend(rts);
    const normalizedSlope = slope / (rtMean || 1);

    let rtTrend: FlowMetrics['rtTrend'];
    if (cv > 0.4) {
      rtTrend = 'chaotic';
    } else if (normalizedSlope > 0.02) {
      rtTrend = 'increasing'; // Fatigue
    } else if (normalizedSlope < -0.02) {
      rtTrend = 'decreasing'; // Warmup
    } else {
      rtTrend = 'stable';
    }

    // Flow score: basé sur la régularité (faible CV = bon flow)
    // CV < 0.15 = excellent, CV > 0.5 = chaos
    const flowScore = Math.max(0, Math.min(1, 1 - cv * 2));

    return {
      rtVariance: rtVar,
      rtCoefficientOfVariation: cv,
      rtTrend,
      flowScore,
      isInFlow: flowScore > COGNITIVE_FLOW_ENTRY_THRESHOLD && rtTrend === 'stable',
    };
  }

  // ===========================================================================
  // Resilience Metrics
  // ===========================================================================

  /**
   * Calcule les métriques de résilience.
   */
  static computeResilienceMetrics(events: readonly GameEvent[]): ResilienceMetrics {
    const trials = events.filter(
      (e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED' && !e.trial.isBuffer,
    );
    const responses = events.filter((e): e is UserResponseEvent => e.type === 'USER_RESPONDED');
    const activeModalities = extractActiveModalities(events);

    // Calculer les outcomes
    const outcomes = trials.map((t) =>
      SessionProjector.computeTrialOutcome(t, responses, activeModalities),
    );

    if (outcomes.length < 5) {
      return {
        avgSlowdownAfterError: 0,
        avgRecoveryTrials: 0,
        errorCascadeRate: 0,
        resilienceScore: 0.5,
        profile: 'normal',
      };
    }

    // Identifier les erreurs (miss ou falseAlarm) sur n'importe quelle modalité
    const isError = (o: TrialOutcome) =>
      Object.values(o.byModality).some((m) => m.result === 'miss' || m.result === 'falseAlarm');

    // Calculer le RT moyen pour chaque outcome (premier RT disponible)
    const getRT = (o: TrialOutcome): number | null => {
      const rts = getAllReactionTimes(o);
      return rts.length > 0 ? (rts[0] ?? null) : null;
    };

    // Analyser post-error slowing
    const slowdowns: number[] = [];
    const recoveries: number[] = [];
    let consecutiveErrors = 0;
    let totalErrorPairs = 0;

    for (let i = 0; i < outcomes.length - 1; i++) {
      const current = outcomes[i];
      const next = outcomes[i + 1];
      if (!current || !next) continue;

      const currentRT = getRT(current);
      const nextRT = getRT(next);

      if (isError(current)) {
        // Mesurer le ralentissement après erreur
        if (currentRT !== null && nextRT !== null) {
          slowdowns.push(nextRT - currentRT);
        }

        // Compter les erreurs consécutives
        if (isError(next)) {
          consecutiveErrors++;
        }
        totalErrorPairs++;

        // Mesurer le temps de récupération
        let recoveryCount = 0;
        const baselineRT = currentRT;
        for (let j = i + 1; j < outcomes.length && j < i + 6; j++) {
          const outcome = outcomes[j];
          if (!outcome) continue;
          recoveryCount++;
          const rt = getRT(outcome);
          if (rt !== null && baselineRT !== null && rt <= baselineRT * 1.1) {
            break;
          }
        }
        if (recoveryCount > 0) recoveries.push(recoveryCount);
      }
    }

    const avgSlowdown = StatisticalCalculator.mean(slowdowns);
    const avgRecovery = StatisticalCalculator.mean(recoveries);
    const cascadeRate = totalErrorPairs > 0 ? consecutiveErrors / totalErrorPairs : 0;

    // Score de résilience
    const cascadeScore = 1 - cascadeRate;
    const recoveryScore = avgRecovery > 0 ? Math.max(0, 1 - (avgRecovery - 1) / 4) : 1;
    const slowdownScore =
      avgSlowdown >= 50 && avgSlowdown <= 150
        ? 1
        : avgSlowdown < 50
          ? COGNITIVE_RECOVERY_TOO_FAST_FACTOR
          : Math.max(0, 1 - (avgSlowdown - 150) / 300);

    const resilienceScore = cascadeScore * 0.4 + recoveryScore * 0.3 + slowdownScore * 0.3;

    let profile: ResilienceMetrics['profile'];
    if (resilienceScore > COGNITIVE_RESILIENCE_THRESHOLD) {
      profile = 'resilient';
    } else if (resilienceScore < COGNITIVE_FRAGILE_THRESHOLD) {
      profile = 'fragile';
    } else {
      profile = 'normal';
    }

    return {
      avgSlowdownAfterError: avgSlowdown,
      avgRecoveryTrials: avgRecovery,
      errorCascadeRate: cascadeRate,
      resilienceScore,
      profile,
    };
  }

  // ===========================================================================
  // Fatigue Metrics
  // ===========================================================================

  /**
   * Calcule les métriques de fatigue.
   */
  static computeFatigueMetrics(events: readonly GameEvent[], windowSize = 5): FatigueMetrics {
    const trials = events.filter(
      (e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED' && !e.trial.isBuffer,
    );
    const responses = events.filter((e): e is UserResponseEvent => e.type === 'USER_RESPONDED');
    const activeModalities = extractActiveModalities(events);

    const outcomes = trials.map((t) =>
      SessionProjector.computeTrialOutcome(t, responses, activeModalities),
    );

    if (outcomes.length < windowSize * 2) {
      return {
        earlyAvgRT: 0,
        lateAvgRT: 0,
        rtDelta: 0,
        degradationPercent: 0,
        earlyAccuracy: 0,
        lateAccuracy: 0,
        enduranceScore: 0.5,
        isFatigued: false,
      };
    }

    // Extraire les RTs de toutes les modalités
    const getRTs = (o: TrialOutcome) => getAllReactionTimes(o);
    const isCorrect = (o: TrialOutcome) =>
      Object.values(o.byModality).every(
        (m) => m.result === 'hit' || m.result === 'correctRejection',
      );

    // Fenêtre début
    const earlyOutcomes = outcomes.slice(0, windowSize);
    const earlyRTs = earlyOutcomes.flatMap(getRTs);
    const earlyAvgRT = StatisticalCalculator.mean(earlyRTs);
    const earlyCorrect = earlyOutcomes.filter(isCorrect).length;
    const earlyAccuracy = earlyCorrect / windowSize;

    // Fenêtre fin
    const lateOutcomes = outcomes.slice(-windowSize);
    const lateRTs = lateOutcomes.flatMap(getRTs);
    const lateAvgRT = StatisticalCalculator.mean(lateRTs);
    const lateCorrect = lateOutcomes.filter(isCorrect).length;
    const lateAccuracy = lateCorrect / windowSize;

    const rtDelta = lateAvgRT - earlyAvgRT;
    const degradationPercent = earlyAvgRT > 0 ? (rtDelta / earlyAvgRT) * 100 : 0;

    // Score d'endurance
    const rtDegradationScore = Math.max(0, 1 - Math.abs(degradationPercent) / 30);
    const accuracyDeltaScore = Math.max(0, 1 - Math.abs(lateAccuracy - earlyAccuracy) * 2);
    const enduranceScore = rtDegradationScore * 0.6 + accuracyDeltaScore * 0.4;

    // Détection de fatigue: RT augmente de >20% OU accuracy chute de >20%
    const isFatigued = degradationPercent > 20 || lateAccuracy - earlyAccuracy < -0.2;

    return {
      earlyAvgRT,
      lateAvgRT,
      rtDelta,
      degradationPercent,
      earlyAccuracy,
      lateAccuracy,
      enduranceScore,
      isFatigued,
    };
  }

  // ===========================================================================
  // Rhythm Metrics
  // ===========================================================================

  /**
   * Calcule les métriques de rythme.
   */
  static computeRhythmMetrics(responses: readonly UserResponseEvent[]): RhythmMetrics {
    if (responses.length < 3) {
      return {
        avgInterResponseInterval: 0,
        intervalVariance: 0,
        hasStableRhythm: false,
        responsesPerMinute: 0,
      };
    }

    // Calculer les intervalles entre réponses consécutives
    const intervals: number[] = [];
    const sortedResponses = [...responses].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sortedResponses.length; i++) {
      const current = sortedResponses[i];
      const previous = sortedResponses[i - 1];
      if (!current || !previous) continue;
      const interval = current.timestamp - previous.timestamp;
      // Ignorer les intervalles trop longs (pauses)
      if (interval < 10000) {
        intervals.push(interval);
      }
    }

    if (intervals.length === 0) {
      return {
        avgInterResponseInterval: 0,
        intervalVariance: 0,
        hasStableRhythm: false,
        responsesPerMinute: 0,
      };
    }

    const avgInterval = StatisticalCalculator.mean(intervals);
    const intervalVar = StatisticalCalculator.variance(intervals);
    const cv = StatisticalCalculator.coefficientOfVariation(intervals);

    // Rythme stable si CV < 0.3
    const hasStableRhythm = cv < 0.3;

    // Tempo en réponses par minute
    const responsesPerMinute = avgInterval > 0 ? 60000 / avgInterval : 0;

    return {
      avgInterResponseInterval: avgInterval,
      intervalVariance: intervalVar,
      hasStableRhythm,
      responsesPerMinute,
    };
  }

  // ===========================================================================
  // Modality Helpers
  // ===========================================================================

  /**
   * Détecte les modalités actives dans une session.
   */
  static detectActiveModalities(events: readonly GameEvent[]): ModalityId[] {
    const responses = events.filter((e): e is UserResponseEvent => e.type === 'USER_RESPONDED');
    const modalities = new Set<ModalityId>();
    for (const r of responses) {
      modalities.add(r.modality);
    }
    return [...modalities];
  }

  /**
   * Filtre les events par modalité.
   */
  static filterEventsByModality(events: readonly GameEvent[], modality: ModalityId): GameEvent[] {
    return events.filter((e) => {
      if (e.type === 'USER_RESPONDED') {
        return e.modality === modality;
      }
      // Garder tous les TRIAL_PRESENTED (on filtrera après par modalité)
      // Garder les autres events (SESSION_STARTED, etc.)
      return true;
    });
  }

  // ===========================================================================
  // Modality Profile
  // ===========================================================================

  /**
   * Calcule le profil cognitif pour une modalité spécifique.
   */
  static computeModalityProfile(
    events: readonly GameEvent[],
    modality: ModalityId,
  ): CognitiveModalityProfile {
    // Filtrer les réponses pour cette modalité
    const responses = events.filter(
      (e): e is UserResponseEvent => e.type === 'USER_RESPONDED' && e.modality === modality,
    );
    const trials = events.filter(
      (e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED' && !e.trial.isBuffer,
    );

    // Calculer SDT pour cette modalité
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;

    for (const trialEvent of trials) {
      const isTarget = getIsTarget(trialEvent.trial, modality);
      // Chercher si l'utilisateur a répondu pour ce trial et cette modalité
      const hasResponse = responses.some(
        (r) => r.trialIndex === trialEvent.trial.index && r.modality === modality,
      );

      if (isTarget && hasResponse) hits++;
      else if (isTarget && !hasResponse) misses++;
      else if (!isTarget && hasResponse) falseAlarms++;
      else if (!isTarget && !hasResponse) correctRejections++;
    }

    const totalTargets = hits + misses;
    const totalNonTargets = falseAlarms + correctRejections;
    // Balanced Accuracy: (hitRate + crRate) / 2
    const hitRate = totalTargets > 0 ? hits / totalTargets : 0;
    const crRate = totalNonTargets > 0 ? correctRejections / totalNonTargets : 0;
    const accuracy = totalTargets + totalNonTargets > 0 ? (hitRate + crRate) / 2 : 0;
    const dPrime = StatisticalCalculator.computeDPrime(
      hits,
      misses,
      falseAlarms,
      correctRejections,
    );

    // Timing
    const rts = responses.map((r) => r.reactionTimeMs).filter((rt) => rt > 0 && rt < 3000);
    const avgRT = StatisticalCalculator.mean(rts);
    const rtVariance = StatisticalCalculator.variance(rts);

    // Flow (réutilise la logique existante)
    const flowMetrics = CognitiveProfiler.computeFlowMetrics(responses);

    // Pour resilience et fatigue, on filtre les events par modalité
    const filteredEvents = CognitiveProfiler.filterEventsByModality(events, modality);

    // Resilience (réutilise la logique existante sur les events filtrés)
    const resilienceMetrics = CognitiveProfiler.computeResilienceMetrics(filteredEvents);

    // Fatigue (réutilise la logique existante sur les events filtrés)
    const fatigueMetrics = CognitiveProfiler.computeFatigueMetrics(filteredEvents);

    return {
      modality,
      hits,
      misses,
      falseAlarms,
      correctRejections,
      dPrime,
      accuracy,
      avgRT,
      rtVariance,
      rtTrend: flowMetrics.rtTrend,
      flowScore: flowMetrics.flowScore,
      isInFlow: flowMetrics.isInFlow,
      resilienceScore: resilienceMetrics.resilienceScore,
      errorCascadeRate: resilienceMetrics.errorCascadeRate,
      enduranceScore: fatigueMetrics.enduranceScore,
      isFatigued: fatigueMetrics.isFatigued,
    };
  }

  // ===========================================================================
  // Modality Insights
  // ===========================================================================

  /**
   * Calcule les insights comparatifs entre modalités.
   */
  static computeModalityInsights(
    profiles: Record<ModalityId, CognitiveModalityProfile>,
  ): CognitiveModalityInsights {
    const entries = Object.values(profiles);

    // Pas assez de modalités pour comparer
    if (entries.length < 2) {
      const first = entries[0];
      return {
        strongestModality: first?.modality ?? null,
        weakestModality: null,
        balanceScore: 1,
        gaps: { dPrimeGap: 0, rtGap: 0, flowGap: 0 },
        detectedBias: null,
      };
    }

    // Trier par d-prime (meilleur indicateur de performance)
    const sorted = [...entries].sort((a, b) => b.dPrime - a.dPrime);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const strongest = first?.modality ?? null;
    const weakest = last?.modality ?? null;

    // Calculer les écarts
    const dPrimes = entries.map((e) => e.dPrime);
    const rts = entries.map((e) => e.avgRT);
    const flows = entries.map((e) => e.flowScore);

    const dPrimeGap = Math.max(...dPrimes) - Math.min(...dPrimes);
    const rtGap = Math.max(...rts) - Math.min(...rts);
    const flowGap = Math.max(...flows) - Math.min(...flows);

    // Balance score (1 = parfaitement équilibré, 0 = très déséquilibré)
    const balanceScore = Math.max(0, 1 - dPrimeGap / 3);

    // Biais détecté
    let detectedBias: string | null = 'balanced';
    if (dPrimeGap > 1 && strongest) {
      detectedBias = `${strongest}_dominant`;
    }

    return {
      strongestModality: strongest,
      weakestModality: weakest,
      balanceScore,
      gaps: { dPrimeGap, rtGap, flowGap },
      detectedBias,
    };
  }

  // ===========================================================================
  // Full Cognitive Profile
  // ===========================================================================

  /**
   * Calcule le profil cognitif complet.
   */
  static compute(events: readonly GameEvent[]): CognitiveProfile {
    const responses = events.filter((e): e is UserResponseEvent => e.type === 'USER_RESPONDED');

    const flow = CognitiveProfiler.computeFlowMetrics(responses);
    const resilience = CognitiveProfiler.computeResilienceMetrics(events);
    const fatigue = CognitiveProfiler.computeFatigueMetrics(events);
    const rhythm = CognitiveProfiler.computeRhythmMetrics(responses);

    // Score global pondéré
    const overallScore =
      flow.flowScore * 0.3 +
      resilience.resilienceScore * 0.25 +
      fatigue.enduranceScore * 0.25 +
      (rhythm.hasStableRhythm ? 0.2 : 0.1);

    // Estimation probabilité d'erreur
    let errorProb = 0.2; // Base
    if (!flow.isInFlow) errorProb += 0.15;
    if (flow.rtTrend === 'chaotic') errorProb += 0.2;
    if (fatigue.isFatigued) errorProb += 0.15;
    if (resilience.profile === 'fragile') errorProb += 0.1;
    if (!rhythm.hasStableRhythm) errorProb += 0.1;

    const nextErrorProbability = StatisticalCalculator.clamp(errorProb, 0.05, 0.95);

    // Recommandation pour le coach
    let recommendation: CognitiveProfile['recommendation'];
    if (fatigue.isFatigued || nextErrorProbability > COGNITIVE_ERROR_PROBABILITY_BREAK) {
      recommendation = 'suggest_break';
    } else if (
      nextErrorProbability > COGNITIVE_ERROR_PROBABILITY_DECREASE ||
      resilience.profile === 'fragile'
    ) {
      recommendation = 'decrease_difficulty';
    } else if (flow.isInFlow && overallScore > COGNITIVE_SCORE_INCREASE_DIFFICULTY) {
      recommendation = 'increase_difficulty';
    } else {
      recommendation = 'maintain';
    }

    // Calcul des profils par modalité
    const activeModalities = CognitiveProfiler.detectActiveModalities(events);
    const byModalityMut: Record<ModalityId, CognitiveModalityProfile> = {};
    for (const modality of activeModalities) {
      byModalityMut[modality] = CognitiveProfiler.computeModalityProfile(events, modality);
    }
    const byModality = byModalityMut as CognitiveProfile['byModality'];

    // Insights comparatifs
    const modalityInsights = CognitiveProfiler.computeModalityInsights(byModality);

    return {
      flow,
      resilience,
      fatigue,
      rhythm,
      overallScore,
      nextErrorProbability,
      recommendation,
      byModality,
      modalityInsights,
    };
  }
}
