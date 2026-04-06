/**
 * GameMode - Abstract Factory Pattern
 *
 * Bundle un mode de jeu complet avec :
 * - Generator strategy (BrainWorkshop, Adaptive, etc.)
 * - Configuration par défaut
 * - Settings configurables vs fixes
 *
 * Permet d'ajouter de nouveaux modes facilement.
 */

import type { BlockConfig, GeneratorName, ModalityId } from '../types/core';
import type { AdaptationMode } from '../sequence';
import type { ModeSpec } from '../specs/types';
import {
  deriveDualTrackTotalObjects,
  resolveDualTrackSessionDefaults,
} from '../domain/track/dual-track-session-defaults';
import { validateModeSpec, isThresholdReasonable } from '../specs/validation';
import {
  BW_TRIALS_BASE,
  BW_TRIALS_EXPONENT,
  BW_TRIALS_FACTOR,
  BW_STIMULUS_BASE_TICKS,
  BW_STIMULUS_TICKS_PER_EXTRA_POSITION,
  BW_TICKS_DEFAULT,
  BW_TICK_DURATION_MS,
  MULTI_STIMULUS_TIMING_BONUS_TICKS,
} from '../specs/thresholds';
import { AllSpecs, getBlockConfigFromSpec } from '../specs';
import { normalizeModeId } from '../utils/mode-normalizer';

// =============================================================================
// Types
// =============================================================================

export type GameModeId = string;

/**
 * Clés de configuration modifiables par l'utilisateur.
 * Utilisées pour définir quels settings sont exposés par mode.
 */
export type ConfigurableSettingKey =
  | 'nLevel'
  | 'corsiDirection'
  | 'trialsCount'
  | 'dualMixIncludeGridlock'
  | 'dualMixManualAdvance'
  | 'trialsCountMode'
  | 'intervalSeconds'
  | 'stimulusDurationSeconds'
  | 'generator'
  | 'targetProbability'
  | 'lureProbability'
  | 'activeModalities'
  | 'algorithm'
  | 'placementOrderMode'
  | 'rhythmMode'
  | 'dynamicRules'
  | 'dynamicSwipeDirection'
  | 'sequentialTrace'
  | 'arithmeticInterferenceVariant'
  | 'mindfulTimingEnabled'
  | 'mindfulPositionDurationMs'
  | 'mindfulPositionToleranceMs'
  | 'mindfulWritingDurationMs'
  | 'mindfulWritingToleranceMs'
  // Brain Workshop Faithful settings
  | 'guaranteedMatchProbability'
  | 'interferenceProbability'
  | 'variableNBack'
  | 'crabBackMode'
  | 'multiStimulus'
  | 'multiMode'
  | 'multiAudio'
  | 'selfPaced'
  // Brain Workshop Advanced knobs
  | 'trialsBase'
  | 'trialsFactor'
  | 'trialsExponent'
  | 'arithmeticDifficulty'
  // Dual Track knobs
  | 'trackingDurationMode'
  | 'trackingDurationMs'
  | 'trackingSpeedMode'
  | 'trackingSpeedPxPerSec'
  | 'trackingIdentityMode'
  | 'trackingLetterAudioEnabled'
  | 'trackingTonesEnabled'
  | 'motionComplexity'
  | 'crowdingMode'
  | 'trackingFocusCrossEnabled'
  | 'totalObjectsMode'
  | 'totalObjects'
  | 'highlightSpacingMs'
  | 'depthMode'
  | 'renderMode';

/**
 * Settings spécifiques à un mode (stockés par mode dans le store)
 */
export interface ModeSettings {
  nLevel?: number;
  corsiDirection?: 'forward' | 'backward';
  trialsCount?: number;
  dualMixIncludeGridlock?: boolean;
  dualMixManualAdvance?: boolean;
  trialsCountMode?: 'auto' | 'manual';
  ufovVariant?: 'full' | 'central' | 'divided' | 'selective';
  ufovInitialDisplayMs?: number;
  ufovDistractorCount?: number;
  ufovPeripheralRadiusMode?: 'near' | 'standard' | 'wide';
  towerDiscCount?: 3 | 4 | 5;
  towerProfileId?: 'rookie' | 'standard' | 'expert';
  towerChallengeMode?: 'mixed' | 'classic' | 'precision' | 'memory' | 'expert';
  intervalSeconds?: number;
  stimulusDurationSeconds?: number;
  generator?: GeneratorName;
  targetProbability?: number;
  lureProbability?: number;
  activeModalities?: ModalityId[];
  algorithm?: string;
  // Tempo UI extensions
  guidedMode?: boolean;
  mirrorMode?: boolean;
  gameCountdownMode?: boolean;
  gameShowProgressBar?: boolean;
  gameShowNLevel?: boolean;
  // Flow/Label extensions
  placementOrderMode?: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  timelineMode?: 'separated' | 'unified';
  distractorCount?: number;
  distractorSource?: 'random' | 'proactive';
  mirrorTimeline?: boolean;
  mirrorOnlyMode?: boolean;
  hideFilledCards?: boolean;
  noRepetitions?: boolean;
  trialColorCoding?: boolean;
  flowShowModalityLabels?: boolean;
  flowShowTimeLabels?: boolean;
  flowShowRecenterButton?: boolean;
  flowGridScale?: number;
  flowCountdownMode?: boolean;
  flowShowNLevel?: boolean;
  flowShowAdaptiveZone?: boolean;
  // Recall extensions
  fillOrderMode?: 'sequential' | 'random';
  feedbackMode?: 'none' | 'on-commit';
  // Trace extensions
  rhythmMode?: 'self-paced' | 'timed';
  dynamicRules?: boolean;
  dynamicSwipeDirection?: boolean;
  sequentialTrace?: boolean;
  arithmeticEnabled?: boolean;
  /** Dual Trace: which arithmetic interference variant to use. */
  arithmeticInterferenceVariant?: 'simple' | 'color-cue-2step' | 'grid-cue-chain';
  mindfulTimingEnabled?: boolean;
  mindfulPositionDurationMs?: number;
  mindfulPositionToleranceMs?: number;
  mindfulWritingDurationMs?: number;
  mindfulWritingToleranceMs?: number;
  // Trace dyslatéralisation extensions
  dyslatGridMode?: '3x3' | '3x4' | '4x3' | '4x4';
  dyslatMirrorSwipe?: boolean;
  dyslatMirrorAxis?: 'horizontal' | 'vertical' | 'dynamic';
  // Brain Workshop Faithful extensions
  guaranteedMatchProbability?: number;
  interferenceProbability?: number;
  variableNBack?: boolean;
  crabBackMode?: boolean;
  multiStimulus?: 1 | 2 | 3 | 4;
  multiMode?: 'color' | 'image';
  multiAudio?: 1 | 2;
  selfPaced?: boolean;
  // Brain Workshop Advanced knobs
  trialsBase?: number;
  trialsFactor?: number;
  trialsExponent?: number;
  arithmeticDifficulty?: 1 | 2 | 3 | 4;
  // Time extensions
  timeTargetDurationMs?: number;
  timeEstimationEnabled?: boolean;
  timeSliderShape?: 'line' | 'circle';
  timeSliderDirection?: 'normal' | 'reverse';
  // Gridlock extensions
  gridlockProfileId?: 'rookie' | 'standard' | 'expert';
  gridlockSessionVariant?: 'mixed' | 'classic' | 'precision' | 'memory' | 'timed';
  gridlockTimeLimitMs?: number;
  gridlockDifficultyLock?: 'auto' | 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';
  gridlockAssistance?: 'generous' | 'balanced' | 'strict';
  gridlockShowMoveCounter?: boolean;
  gridlockShowOptimal?: boolean;
  gridlockPreviewDuration?: 'auto' | 'off' | 'short' | 'medium' | 'long';
  gridlockAutoAdvance?: boolean;
  gridlockShowSolutionOnFail?: boolean;
  // Stroop dyslatéralisation
  stroopDyslatEnabled?: boolean;
  // Dual Track extensions
  trackingDurationMs?: number;
  trackingDurationMode?: 'auto' | 'manual';
  trackingSpeedPxPerSec?: number;
  trackingSpeedMode?: 'auto' | 'manual';
  trackingIdentityMode?:
    | 'classic'
    | 'color'
    | 'letter'
    | 'position'
    | 'image'
    | 'spatial'
    | 'digits'
    | 'emotions'
    | 'words';
  trackingLetterAudioEnabled?: boolean;
  trackingTonesEnabled?: boolean;
  motionComplexity?: 'smooth' | 'standard' | 'agile';
  crowdingMode?: 'low' | 'standard' | 'dense';
  /** Ball collision enabled (default true). When false, balls can overlap freely. */
  trackingCollisionEnabled?: boolean;
  trackingFocusCrossEnabled?: boolean;
  totalObjectsMode?: 'auto' | 'manual';
  totalObjects?: number;
  /** Offset applied to auto ball count (e.g. -3 for easy synergy, 0 for hard). Only used when totalObjectsMode is auto. */
  ballsOffset?: number;
  /** Milliseconds between each target highlight in sequential identity modes (letter/image). Default 1500. */
  highlightSpacingMs?: number;
  /** Visual depth mode for MOT arena: flat (2D) or 2.5d (pseudo-3D depth cues). */
  depthMode?: 'flat' | '2.5d';
  /** Visual renderer for MOT arena: DOM/CSS or WebGL 3D. */
  renderMode?: 'dom' | 'webgl' | 'webgl3d';
  hybridTrackSessionsPerBlock?: number;
  hybridDnbSessionsPerBlock?: number;
  dualTrackJourneyCalibrationCompleted?: boolean;
  dualTrackJourneyCalibrationStartLevel?: number;
  dualTrackJourneyCalibrationPreset?: 'easy' | 'medium' | 'hard';
}

/**
 * Contexte de résolution (données externes au mode)
 */
export interface ModeResolutionContext {
  /** nLevel depuis le profil joueur (pour adaptive) */
  profileNLevel?: number;
}

/**
 * Définition d'un mode de jeu
 */
export interface GameModeDefinition {
  /** Identifiant unique du mode */
  readonly id: GameModeId;
  /**
   * Spécification complète du mode (Single Source of Truth).
   * Contient scoring, timing, génération, defaults, adaptivity, extensions.
   */
  readonly spec: ModeSpec;
  /** Nom affiché à l'utilisateur */
  readonly displayName: string;
  /** Description courte */
  readonly description: string;
  /** Nom de la stratégie de génération */
  readonly generatorName: GeneratorName;
  /** Nom de l'algorithme adaptatif */
  readonly algorithmName: string;
  /** Nom de la stratégie de scoring (SDT, Jaeggi, BrainWorkshop) */
  readonly scoringStrategyName: string;
  /**
   * Configuration par défaut du bloc.
   * @deprecated Phase 5/6: Use spec.defaults + spec.timing instead.
   * Computed via getBlockConfigFromSpec(spec) for backwards compatibility.
   */
  readonly defaultConfig: Omit<BlockConfig, 'generator'>;
  /** Tags pour catégorisation (training, challenge, relaxation, etc.) */
  readonly tags: readonly string[];
  /** Niveau de difficulté estimé (1-5) */
  readonly difficultyLevel: 1 | 2 | 3 | 4 | 5;
  /**
   * Settings configurables par l'utilisateur pour ce mode.
   * Seuls ces settings seront affichés dans l'UI et stockés.
   */
  readonly configurableSettings: readonly ConfigurableSettingKey[];
  /**
   * Source du nLevel pour ce mode:
   * - 'user': depuis les settings utilisateur (libre, classic, advanced)
   * - 'profile': depuis le profil joueur (adaptive)
   */
  readonly nLevelSource: 'user' | 'profile';
  /**
   * Si true, le nLevel est verrouillé par défaut (grisé dans l'UI).
   * L'utilisateur peut débloquer manuellement via un bouton "Modifier".
   * Utilisé pour les modes avec progression automatique (classic, advanced).
   */
  readonly nLevelLockedByDefault?: boolean;
  /**
   * Mode d'adaptation pour le générateur Sequence.
   * - 'tempo': Adapte l'ISI (Dual Catch)
   * - 'memo': Adapte le niveau N (Dual Memo)
   * - 'flow': Adapte la probabilité de targets (Dual Place)
   */
  readonly sequenceMode?: AdaptationMode;
}

/**
 * Configuration résolue pour créer une session
 */
export interface ResolvedGameMode {
  /**
   * Spécification complète du mode (Single Source of Truth).
   * Permet à GameSession d'accéder à scoring.passThreshold, timing, extensions, etc.
   */
  readonly spec: ModeSpec;
  readonly generatorName: GeneratorName;
  readonly algorithmName: string;
  readonly scoringStrategyName: string;
  /** @deprecated Utiliser spec.defaults + spec.timing. Conservé pour compatibilité. */
  readonly config: BlockConfig;
  /** Mode d'adaptation pour le générateur Sequence (si applicable) */
  readonly sequenceMode?: AdaptationMode;
}

/**
 * Options de résolution d'un mode de jeu
 */
export interface GameModeResolveOptions {
  /** Overrides pour la configuration de bloc */
  readonly configOverrides?: Partial<BlockConfig>;
  /** Override pour l'algorithme adaptatif */
  readonly algorithmName?: string;
}

// =============================================================================
// Registry
// =============================================================================

class GameModeRegistryClass {
  private modes = new Map<GameModeId, GameModeDefinition>();

  /**
   * Enregistre un mode de jeu.
   * Valide la spec au runtime - throw si incomplète ou invalide.
   */
  register(mode: GameModeDefinition): void {
    if (this.modes.has(mode.id)) {
      throw new Error(`GameMode already registered: ${mode.id}`);
    }

    // Validation runtime de la spec (SSOT enforcement)
    try {
      validateModeSpec(mode.spec);
    } catch (error) {
      throw new Error(
        `[GameModeRegistry] Invalid spec for mode "${mode.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Vérification des seuils raisonnables
    if (!isThresholdReasonable(mode.spec)) {
      console.warn(
        `[GameModeRegistry] Mode "${mode.id}" has suspicious threshold: ${mode.spec.scoring.passThreshold} for strategy "${mode.spec.scoring.strategy}"`,
      );
    }

    this.modes.set(mode.id, mode);
  }

  /**
   * Récupère un mode par son ID.
   * Automatically normalizes legacy mode IDs (e.g., 'sim-jaeggi' → 'dualnback-classic').
   */
  get(id: GameModeId): GameModeDefinition {
    const normalizedId = normalizeModeId(id);
    const mode = this.modes.get(normalizedId);
    if (!mode) {
      throw new Error(`Unknown GameMode: ${id}. Available: ${this.list().join(', ')}`);
    }
    return mode;
  }

  /**
   * Vérifie si un mode existe.
   * Automatically normalizes legacy mode IDs.
   */
  has(id: GameModeId): boolean {
    return this.modes.has(normalizeModeId(id));
  }

  /**
   * Liste tous les modes disponibles
   */
  list(): GameModeId[] {
    return Array.from(this.modes.keys());
  }

  /**
   * Liste tous les modes avec leurs définitions
   */
  getAll(): GameModeDefinition[] {
    return Array.from(this.modes.values());
  }

  /**
   * Filtre les modes par tag
   */
  getByTag(tag: string): GameModeDefinition[] {
    return this.getAll().filter((mode) => mode.tags.includes(tag));
  }

  /**
   * Résout un mode avec des overrides optionnels
   * @deprecated Utiliser resolveWithSettings pour une résolution propre par mode
   */
  resolve(id: GameModeId, options?: GameModeResolveOptions): ResolvedGameMode {
    const mode = this.get(id);
    const configOverrides = options?.configOverrides;

    // Pour le mode libre, on respecte le générateur choisi par l'utilisateur
    // Pour les autres modes, on force le générateur du mode
    const effectiveGenerator = configOverrides?.generator ?? mode.generatorName;

    // Permet d'overrider l'algorithme adaptatif (ex: depuis les settings)
    const effectiveAlgorithm = options?.algorithmName ?? mode.algorithmName;

    const config: BlockConfig = {
      ...mode.defaultConfig,
      ...configOverrides,
      generator: effectiveGenerator,
    };

    return {
      spec: mode.spec,
      generatorName: effectiveGenerator,
      algorithmName: effectiveAlgorithm,
      scoringStrategyName: mode.scoringStrategyName,
      config,
      sequenceMode: mode.sequenceMode,
    };
  }

  /**
   * Résout un mode avec ses settings spécifiques.
   * Seuls les settings listés dans `configurableSettings` sont appliqués.
   *
   * @param id - ID du mode de jeu
   * @param modeSettings - Settings stockés pour ce mode
   * @param context - Contexte externe (profil joueur, etc.)
   */
  resolveWithSettings(
    id: GameModeId,
    modeSettings: ModeSettings,
    context?: ModeResolutionContext,
  ): ResolvedGameMode {
    // Normalize legacy mode IDs (e.g., 'sim-jaeggi' → 'dualnback-classic')
    const normalizedId = normalizeModeId(id);
    const mode = this.get(normalizedId);
    const { configurableSettings, defaultConfig, nLevelSource } = mode;

    // Commencer avec la config par défaut du mode (mutable copy)
    const config = {
      ...defaultConfig,
      generator: mode.generatorName,
    } as {
      nLevel: number;
      activeModalities: ModalityId[];
      trialsCount: number;
      targetProbability: number;
      lureProbability: number;
      intervalSeconds: number;
      stimulusDurationSeconds: number;
      generator: GeneratorName;
    };

    // Appliquer UNIQUEMENT les settings configurables pour ce mode
    for (const key of configurableSettings) {
      if (key === 'algorithm') continue; // Géré séparément

      const value = modeSettings[key];
      if (value !== undefined) {
        // Type-safe assignment via switch
        switch (key) {
          case 'nLevel':
            config.nLevel = value as number;
            break;
          case 'trialsCount':
            config.trialsCount = value as number;
            break;
          case 'intervalSeconds':
            config.intervalSeconds = value as number;
            break;
          case 'stimulusDurationSeconds':
            config.stimulusDurationSeconds = value as number;
            break;
          case 'generator':
            config.generator = value as GeneratorName;
            break;
          case 'targetProbability':
            config.targetProbability = value as number;
            break;
          case 'lureProbability':
            config.lureProbability = value as number;
            break;
          case 'activeModalities':
            config.activeModalities = value as ModalityId[];
            break;
        }
      }
    }

    // nLevel: depuis le profil ou les settings selon le mode
    if (nLevelSource === 'profile' && context?.profileNLevel !== undefined) {
      config.nLevel = context.profileNLevel;
    } else if (nLevelSource === 'user' && modeSettings.nLevel !== undefined) {
      config.nLevel = modeSettings.nLevel;
    }

    // Algorithm: depuis les settings si configurable, sinon depuis le mode
    const effectiveAlgorithm = configurableSettings.includes('algorithm')
      ? (modeSettings.algorithm ?? mode.algorithmName)
      : mode.algorithmName;

    // SPEC-FIRST: Merge user settings into spec extensions
    // This allows UI to consume spec.extensions exclusively
    let mergedSpec = mode.spec;

    // Only merge extensions if the spec has them (mode-specific)
    if (mode.spec.extensions && typeof mode.spec.extensions === 'object') {
      const mergedExtensions = { ...mode.spec.extensions };

      // Tempo modes: guided/mirror + HUD options
      if (
        normalizedId === 'dualnback-classic' ||
        normalizedId === 'custom' ||
        normalizedId === 'dualnback-classic' ||
        normalizedId === 'sim-brainworkshop'
      ) {
        if (modeSettings['guidedMode'] !== undefined) {
          mergedExtensions['guidedMode'] = modeSettings['guidedMode'];
        }
        if (modeSettings['mirrorMode'] !== undefined) {
          mergedExtensions['mirrorMode'] = modeSettings['mirrorMode'];
        }
        if (modeSettings['gameCountdownMode'] !== undefined) {
          mergedExtensions['gameCountdownMode'] = modeSettings['gameCountdownMode'];
        }
        if (modeSettings['gameShowProgressBar'] !== undefined) {
          mergedExtensions['gameShowProgressBar'] = modeSettings['gameShowProgressBar'];
        }
        if (modeSettings['gameShowNLevel'] !== undefined) {
          mergedExtensions['gameShowNLevel'] = modeSettings['gameShowNLevel'];
        }
      }

      // BrainWorkshop mode: multi-stimulus extensions
      if (normalizedId === 'sim-brainworkshop') {
        if (modeSettings['multiStimulus'] !== undefined) {
          mergedExtensions['multiStimulus'] = modeSettings['multiStimulus'];
        }
        if (modeSettings['multiMode'] !== undefined) {
          mergedExtensions['multiMode'] = modeSettings['multiMode'];
        }
        if (modeSettings['multiAudio'] !== undefined) {
          mergedExtensions['multiAudio'] = modeSettings['multiAudio'];
        }
        if (modeSettings['guaranteedMatchProbability'] !== undefined) {
          mergedExtensions['guaranteedMatchProbability'] =
            modeSettings['guaranteedMatchProbability'];
        }
        if (modeSettings['interferenceProbability'] !== undefined) {
          mergedExtensions['interferenceProbability'] = modeSettings['interferenceProbability'];
        }
        if (modeSettings['variableNBack'] !== undefined) {
          mergedExtensions['variableNBack'] = modeSettings['variableNBack'];
        }
        if (modeSettings['crabBackMode'] !== undefined) {
          mergedExtensions['crabBackMode'] = modeSettings['crabBackMode'];
        }
        if (modeSettings['selfPaced'] !== undefined) {
          mergedExtensions['selfPaced'] = modeSettings['selfPaced'];
        }
        // Advanced knobs (formula: trialsBase + trialsFactor * n^trialsExponent)
        if (modeSettings['trialsBase'] !== undefined) {
          mergedExtensions['trialsBase'] = modeSettings['trialsBase'];
        }
        if (modeSettings['trialsFactor'] !== undefined) {
          mergedExtensions['trialsFactor'] = modeSettings['trialsFactor'];
        }
        if (modeSettings['trialsExponent'] !== undefined) {
          mergedExtensions['trialsExponent'] = modeSettings['trialsExponent'];
        }
        if (modeSettings['arithmeticDifficulty'] !== undefined) {
          mergedExtensions['arithmeticDifficulty'] = modeSettings['arithmeticDifficulty'];
        }
        if (modeSettings['trialsCountMode'] !== undefined) {
          mergedExtensions['trialsCountMode'] = modeSettings['trialsCountMode'];
        }

        // BW faithful timing: when multiStimulus changes, BW adjusts default ticks_per_trial
        // and stimulus extinction time automatically (unless user explicitly overrides timings).
        const multiStimulusRaw = mergedExtensions['multiStimulus'] ?? 1;
        const multiStimulus = Math.min(4, Math.max(1, Number(multiStimulusRaw))) as 1 | 2 | 3 | 4;

        const intervalOverridden = modeSettings.intervalSeconds !== undefined;
        const stimulusOverridden = modeSettings.stimulusDurationSeconds !== undefined;

        if (!intervalOverridden) {
          // BW faithful: base ticks depend on the *mode family*.
          // - Combination N-Back defaults to 35 ticks (3.5s)
          // - Arithmetic N-Back defaults to 40 ticks (4.0s)
          // - Otherwise default is 30 ticks (3.0s)
          const hasCombination =
            config.activeModalities.includes('visvis') ||
            config.activeModalities.includes('visaudio') ||
            config.activeModalities.includes('audiovis');
          const hasArithmetic = config.activeModalities.includes('arithmetic');
          const baseTicks = hasCombination ? 35 : hasArithmetic ? 40 : BW_TICKS_DEFAULT;

          const bonusTicks =
            MULTI_STIMULUS_TIMING_BONUS_TICKS[
              multiStimulus as keyof typeof MULTI_STIMULUS_TIMING_BONUS_TICKS
            ] ?? 0;
          const ticksPerTrial = baseTicks + bonusTicks;
          config.intervalSeconds = (ticksPerTrial * BW_TICK_DURATION_MS) / 1000;
        }

        if (!stimulusOverridden) {
          const stimTicks =
            BW_STIMULUS_BASE_TICKS + (multiStimulus - 1) * BW_STIMULUS_TICKS_PER_EXTRA_POSITION;
          config.stimulusDurationSeconds = (stimTicks * BW_TICK_DURATION_MS) / 1000;
        }

        // BW session duration: auto (formula) by default, manual override optional.
        const durationMode = modeSettings['trialsCountMode'] === 'manual' ? 'manual' : 'auto';
        const trialsBase = Number(mergedExtensions['trialsBase'] ?? BW_TRIALS_BASE);
        const trialsFactor = Number(mergedExtensions['trialsFactor'] ?? BW_TRIALS_FACTOR);
        const trialsExponent = Number(mergedExtensions['trialsExponent'] ?? BW_TRIALS_EXPONENT);
        const autoTrials = Math.max(
          config.nLevel + 1,
          Math.round(trialsBase + trialsFactor * config.nLevel ** trialsExponent),
        );
        const manualTrialsRaw = modeSettings.trialsCount;
        const manualTrials =
          typeof manualTrialsRaw === 'number' && Number.isFinite(manualTrialsRaw)
            ? Math.max(config.nLevel + 1, Math.round(manualTrialsRaw))
            : autoTrials;

        config.trialsCount = durationMode === 'manual' ? manualTrials : autoTrials;
      }

      // Place/Pick mode: placementOrderMode, timelineMode, distractorSource, etc.
      if (normalizedId === 'dual-place' || normalizedId === 'dual-pick') {
        if (modeSettings['placementOrderMode'] !== undefined) {
          mergedExtensions['placementOrderMode'] = modeSettings['placementOrderMode'];
        }
        if (modeSettings['timelineMode'] !== undefined) {
          mergedExtensions['timelineMode'] = modeSettings['timelineMode'];
        }
        if (modeSettings['distractorCount'] !== undefined) {
          mergedExtensions['distractorCount'] = modeSettings['distractorCount'];
        }
        if (modeSettings['distractorSource'] !== undefined) {
          mergedExtensions['distractorSource'] = modeSettings['distractorSource'];
        }
        if (modeSettings['mirrorTimeline'] !== undefined) {
          mergedExtensions['mirrorTimeline'] = modeSettings['mirrorTimeline'];
        }
        if (modeSettings['mirrorOnlyMode'] !== undefined) {
          mergedExtensions['mirrorOnlyMode'] = modeSettings['mirrorOnlyMode'];
        }
        if (modeSettings['hideFilledCards'] !== undefined) {
          mergedExtensions['hideFilledCards'] = modeSettings['hideFilledCards'];
        }
        if (modeSettings['noRepetitions'] !== undefined) {
          mergedExtensions['noRepetitions'] = modeSettings['noRepetitions'];
        }
        if (modeSettings['trialColorCoding'] !== undefined) {
          mergedExtensions['trialColorCoding'] = modeSettings['trialColorCoding'];
        }
        if (modeSettings['flowShowModalityLabels'] !== undefined) {
          mergedExtensions['flowShowModalityLabels'] = modeSettings['flowShowModalityLabels'];
        }
        if (modeSettings['flowShowTimeLabels'] !== undefined) {
          mergedExtensions['flowShowTimeLabels'] = modeSettings['flowShowTimeLabels'];
        }
        if (modeSettings['flowShowRecenterButton'] !== undefined) {
          mergedExtensions['flowShowRecenterButton'] = modeSettings['flowShowRecenterButton'];
        }
        if (modeSettings['flowGridScale'] !== undefined) {
          mergedExtensions['flowGridScale'] = modeSettings['flowGridScale'];
        }
        if (modeSettings['flowCountdownMode'] !== undefined) {
          mergedExtensions['flowCountdownMode'] = modeSettings['flowCountdownMode'];
        }
        if (modeSettings['flowShowNLevel'] !== undefined) {
          mergedExtensions['flowShowNLevel'] = modeSettings['flowShowNLevel'];
        }
        if (modeSettings['flowShowAdaptiveZone'] !== undefined) {
          mergedExtensions['flowShowAdaptiveZone'] = modeSettings['flowShowAdaptiveZone'];
        }
      }

      // Memo mode: fillOrderMode, feedbackMode, progressiveWindow, etc.
      if (normalizedId === 'dual-memo') {
        if (modeSettings['fillOrderMode'] !== undefined) {
          mergedExtensions['fillOrderMode'] = modeSettings['fillOrderMode'];
        }
        if (modeSettings['feedbackMode'] !== undefined) {
          mergedExtensions['feedbackMode'] = modeSettings['feedbackMode'];
        }
        if (modeSettings['trialColorCoding'] !== undefined) {
          mergedExtensions['trialColorCoding'] = modeSettings['trialColorCoding'];
        }
      }

      // Trace mode: rhythm, dynamicRules, dynamicSwipeDirection, arithmetic, and modality sync
      if (normalizedId === 'dual-trace') {
        if (modeSettings['rhythmMode'] !== undefined) {
          mergedExtensions['rhythmMode'] = modeSettings['rhythmMode'];
        }
        if (modeSettings['dynamicRules'] !== undefined) {
          mergedExtensions['dynamicRules'] = modeSettings['dynamicRules'];
        }
        if (modeSettings['dynamicSwipeDirection'] !== undefined) {
          mergedExtensions['dynamicSwipeDirection'] = modeSettings['dynamicSwipeDirection'];
        }
        if (modeSettings['sequentialTrace'] !== undefined) {
          mergedExtensions['sequentialTrace'] = modeSettings['sequentialTrace'];
        }
        if (
          modeSettings['mindfulTimingEnabled'] !== undefined ||
          modeSettings['mindfulPositionDurationMs'] !== undefined ||
          modeSettings['mindfulPositionToleranceMs'] !== undefined ||
          modeSettings['mindfulWritingDurationMs'] !== undefined ||
          modeSettings['mindfulWritingToleranceMs'] !== undefined
        ) {
          const existingMindful =
            typeof mergedExtensions['mindfulTiming'] === 'object'
              ? mergedExtensions['mindfulTiming']
              : {};
          mergedExtensions['mindfulTiming'] = {
            ...existingMindful,
            ...(modeSettings['mindfulTimingEnabled'] !== undefined && {
              enabled: modeSettings['mindfulTimingEnabled'],
            }),
            ...(modeSettings['mindfulPositionDurationMs'] !== undefined && {
              positionDurationMs: modeSettings['mindfulPositionDurationMs'],
            }),
            ...(modeSettings['mindfulPositionToleranceMs'] !== undefined && {
              positionToleranceMs: modeSettings['mindfulPositionToleranceMs'],
            }),
            ...(modeSettings['mindfulWritingDurationMs'] !== undefined && {
              writingDurationMs: modeSettings['mindfulWritingDurationMs'],
            }),
            ...(modeSettings['mindfulWritingToleranceMs'] !== undefined && {
              writingToleranceMs: modeSettings['mindfulWritingToleranceMs'],
            }),
          };
        }
        if (modeSettings['arithmeticEnabled'] !== undefined) {
          // Merge into the nested arithmeticInterference config
          const existingArithmetic =
            typeof mergedExtensions['arithmeticInterference'] === 'object'
              ? mergedExtensions['arithmeticInterference']
              : {};
          mergedExtensions['arithmeticInterference'] = {
            ...existingArithmetic,
            enabled: modeSettings['arithmeticEnabled'],
          };
        }

        if (modeSettings['arithmeticInterferenceVariant'] !== undefined) {
          const existingArithmetic =
            typeof mergedExtensions['arithmeticInterference'] === 'object'
              ? mergedExtensions['arithmeticInterference']
              : {};
          mergedExtensions['arithmeticInterference'] = {
            ...existingArithmetic,
            variant: modeSettings['arithmeticInterferenceVariant'],
          };
        }
        // Dyslatéralisation settings
        if (
          modeSettings['dyslatGridMode'] !== undefined ||
          modeSettings['dyslatMirrorSwipe'] !== undefined ||
          modeSettings['dyslatMirrorAxis'] !== undefined
        ) {
          const existingDyslat =
            typeof mergedExtensions['dyslatéralisation'] === 'object'
              ? mergedExtensions['dyslatéralisation']
              : {};
          mergedExtensions['dyslatéralisation'] = {
            ...existingDyslat,
            ...(modeSettings['dyslatGridMode'] !== undefined && {
              gridMode: modeSettings['dyslatGridMode'],
            }),
            ...(modeSettings['dyslatMirrorSwipe'] !== undefined && {
              mirrorSwipe: modeSettings['dyslatMirrorSwipe'],
            }),
            ...(modeSettings['dyslatMirrorAxis'] !== undefined && {
              mirrorAxis: modeSettings['dyslatMirrorAxis'],
            }),
          };
        }
        // Sync enabled flags from activeModalities
        // This ensures the machine reads the same modalities as the page
        const activeModalities = config.activeModalities ?? mode.spec.defaults.activeModalities;
        mergedExtensions['audioEnabled'] = activeModalities.includes('audio');
        mergedExtensions['colorEnabled'] = activeModalities.includes('color');
        mergedExtensions['imageEnabled'] = activeModalities.includes('image');
        mergedExtensions['digitsEnabled'] = activeModalities.includes('digits');
        mergedExtensions['emotionsEnabled'] = activeModalities.includes('emotions');
        mergedExtensions['wordsEnabled'] = activeModalities.includes('words');
        mergedExtensions['tonesEnabled'] = activeModalities.includes('tones');
        mergedExtensions['spatialEnabled'] = activeModalities.includes('spatial');
      }

      // Dual Track / MOT: derive total objects and default session length from target load.
      if (normalizedId === 'dual-track') {
        const sessionDefaults = resolveDualTrackSessionDefaults(config.nLevel);
        const targetCount = sessionDefaults.targetCount;
        const crowdingMode = modeSettings['crowdingMode'] ?? sessionDefaults.crowdingMode;
        const durationMode = modeSettings['trackingDurationMode'] === 'manual' ? 'manual' : 'auto';
        const speedMode = modeSettings['trackingSpeedMode'] === 'manual' ? 'manual' : 'auto';
        const autoTrackingDurationMs = sessionDefaults.trackingDurationMs;
        const manualTrackingDurationMsRaw = Number(modeSettings['trackingDurationMs']);
        const manualTrackingDurationMs = Number.isFinite(manualTrackingDurationMsRaw)
          ? Math.max(3_000, Math.min(15_000, Math.round(manualTrackingDurationMsRaw)))
          : autoTrackingDurationMs;
        const autoTrackingSpeedPxPerSec = sessionDefaults.speedPxPerSec;
        const manualTrackingSpeedRaw = Number(modeSettings['trackingSpeedPxPerSec']);
        const manualTrackingSpeedPxPerSec = Number.isFinite(manualTrackingSpeedRaw)
          ? Math.max(80, Math.min(260, Math.round(manualTrackingSpeedRaw)))
          : autoTrackingSpeedPxPerSec;
        const motionComplexity =
          modeSettings['motionComplexity'] ?? sessionDefaults.motionComplexity;
        const totalObjectsMode = modeSettings['totalObjectsMode'] === 'manual' ? 'manual' : 'auto';
        const baseTotalObjects = deriveDualTrackTotalObjects(targetCount, crowdingMode);
        const ballsOffsetRaw = Number(modeSettings['ballsOffset']);
        const ballsOffset = Number.isFinite(ballsOffsetRaw) ? Math.round(ballsOffsetRaw) : 0;
        const autoTotalObjects = Math.max(targetCount + 2, baseTotalObjects + ballsOffset);
        const manualTotalObjectsRaw = Number(modeSettings['totalObjects']);
        const manualTotalObjects = Number.isFinite(manualTotalObjectsRaw)
          ? Math.max(targetCount + 2, Math.min(20, Math.round(manualTotalObjectsRaw)))
          : autoTotalObjects;
        mergedExtensions['targetCount'] = targetCount;
        mergedExtensions['crowdingMode'] = crowdingMode;
        mergedExtensions['totalObjects'] =
          totalObjectsMode === 'manual' ? manualTotalObjects : autoTotalObjects;
        mergedExtensions['ballsOffset'] = ballsOffset;
        mergedExtensions['totalObjectsMode'] = totalObjectsMode;
        mergedExtensions['trackingDurationMs'] =
          durationMode === 'manual' ? manualTrackingDurationMs : autoTrackingDurationMs;
        mergedExtensions['trackingDurationMode'] = durationMode;
        mergedExtensions['speedPxPerSec'] =
          speedMode === 'manual' ? manualTrackingSpeedPxPerSec : autoTrackingSpeedPxPerSec;
        mergedExtensions['trackingSpeedMode'] = speedMode;
        const trackingIdentityMode = modeSettings['trackingIdentityMode'];
        const VISUAL_IDENTITY_MODES = [
          'position',
          'color',
          'image',
          'spatial',
          'digits',
          'emotions',
          'words',
        ] as const;
        mergedExtensions['trackingIdentityMode'] = VISUAL_IDENTITY_MODES.includes(
          trackingIdentityMode as (typeof VISUAL_IDENTITY_MODES)[number],
        )
          ? trackingIdentityMode
          : 'classic';
        mergedExtensions['trackingLetterAudioEnabled'] =
          modeSettings['trackingLetterAudioEnabled'] === true || trackingIdentityMode === 'letter';
        mergedExtensions['trackingTonesEnabled'] = modeSettings['trackingTonesEnabled'] === true;
        mergedExtensions['motionComplexity'] = motionComplexity;
        mergedExtensions['collisionEnabled'] = modeSettings['trackingCollisionEnabled'] !== false;
        mergedExtensions['focusCrossEnabled'] = modeSettings['trackingFocusCrossEnabled'] === true;
        const highlightSpacingRaw = Number(modeSettings['highlightSpacingMs']);
        if (Number.isFinite(highlightSpacingRaw) && highlightSpacingRaw >= 600) {
          mergedExtensions['highlightSpacingMs'] = Math.min(2000, Math.round(highlightSpacingRaw));
        }
        mergedExtensions['depthMode'] = modeSettings['depthMode'] === '2.5d' ? '2.5d' : 'flat';
        const rawRenderMode = modeSettings['renderMode'];
        mergedExtensions['renderMode'] =
          rawRenderMode === 'webgl' || rawRenderMode === 'webgl3d' ? rawRenderMode : 'dom';

        if (modeSettings.trialsCount === undefined) {
          config.trialsCount = sessionDefaults.trialsCount;
        }
      }

      if (normalizedId === 'corsi-block' && modeSettings['corsiDirection'] !== undefined) {
        mergedExtensions['direction'] = modeSettings['corsiDirection'];
      }

      // Create merged spec with updated extensions
      mergedSpec = {
        ...mode.spec,
        extensions: mergedExtensions,
      };
    }

    // SPEC-FIRST Phase 7: Also merge user overrides into spec.defaults
    // This allows pages to read from spec.defaults.* instead of config.*
    const mergedDefaults = {
      ...mergedSpec.defaults,
      nLevel: config.nLevel,
      trialsCount: config.trialsCount,
      activeModalities: config.activeModalities as readonly string[],
    };

    // Build merged generation config (targetProbability, lureProbability can be overridden)
    const mergedGeneration = {
      ...mergedSpec.generation,
      generator: config.generator,
      targetProbability: config.targetProbability,
      lureProbability: config.lureProbability,
    };

    // Build merged timing (intervalSeconds, stimulusDurationSeconds can be overridden)
    const mergedTiming = {
      ...mergedSpec.timing,
      intervalMs: config.intervalSeconds * 1000,
      stimulusDurationMs: config.stimulusDurationSeconds * 1000,
    };

    // Final merged spec with all user overrides applied
    // CRITICAL: Ensure metadata.id uses the normalized mode ID (spec-driven SSOT)
    const finalSpec = {
      ...mergedSpec,
      metadata: {
        ...mergedSpec.metadata,
        id: normalizedId, // Use normalized ID, not legacy ID
      },
      defaults: mergedDefaults,
      generation: mergedGeneration,
      timing: mergedTiming,
    };

    return {
      spec: finalSpec,
      generatorName: config.generator,
      algorithmName: effectiveAlgorithm,
      scoringStrategyName: mode.scoringStrategyName,
      config,
      sequenceMode: mode.sequenceMode,
    };
  }
}

export const gameModeRegistry = new GameModeRegistryClass();

// =============================================================================
// Game Mode Registrations
// =============================================================================
// All mode configurations are defined in specs/*.spec.ts (Single Source of Truth)
// This file only registers them with the game mode registry.
// =============================================================================

type BuiltInModeSpec = (typeof AllSpecs)[keyof typeof AllSpecs];

function deriveAlgorithmName(spec: BuiltInModeSpec): string {
  if (spec.metadata.id === 'dualnback-classic') return 'jaeggi-v1';
  if (spec.metadata.id === 'sim-brainworkshop') return 'brainworkshop-v1';
  return spec.adaptivity.algorithm;
}

function deriveScoringStrategyName(spec: BuiltInModeSpec): string {
  if (spec.metadata.id === 'dual-memo') return 'dualnback-classic';
  if (spec.metadata.id === 'dual-place' || spec.metadata.id === 'dual-pick') return 'Flow';

  switch (spec.scoring.strategy) {
    case 'sdt':
      return 'SDT';
    case 'brainworkshop':
      return 'BrainWorkshop';
    case 'dualnback-classic':
      return 'dualnback-classic';
    case 'accuracy':
      return 'Accuracy';
  }
}

function registerBuiltInMode(spec: BuiltInModeSpec): void {
  const maybeLockedByDefault = (spec.extensions as { nLevelLockedByDefault?: boolean } | undefined)
    ?.nLevelLockedByDefault;

  gameModeRegistry.register({
    id: spec.metadata.id,
    spec,
    displayName: spec.metadata.displayName,
    description: spec.metadata.description,
    generatorName: spec.generation.generator as GeneratorName,
    algorithmName: deriveAlgorithmName(spec),
    scoringStrategyName: deriveScoringStrategyName(spec),
    defaultConfig: getBlockConfigFromSpec(spec),
    tags: spec.metadata.tags as string[],
    difficultyLevel: spec.metadata.difficultyLevel,
    configurableSettings: spec.adaptivity.configurableSettings as ConfigurableSettingKey[],
    nLevelSource: spec.adaptivity.nLevelSource,
    nLevelLockedByDefault: maybeLockedByDefault,
    sequenceMode: spec.generation.sequenceMode as AdaptationMode,
  });
}

for (const spec of Object.values(AllSpecs)) {
  // Skip stub specs for removed modes (they lack required fields like generation/adaptivity)
  if (!spec.generation || !spec.adaptivity) continue;
  registerBuiltInMode(spec);
}
