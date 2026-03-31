/**
 * BrainWorkshop Strategy - Faithful Implementation
 *
 * Réplication exacte de l'algorithme Brain Workshop 5.0:
 * - Two-stage generation: Guaranteed Match (12.5%) puis Interference (12.5%)
 * - Interference offsets: [-1, +1, N] pour créer des near-misses
 * - Dynamic trials: 20 + n²
 * - Variable N-Back support (beta distribution)
 * - Crab-Back mode (oscillating N)
 * - Multi-stimulus: probability adjustment (interferenceProb / multiCount)
 * - Cross-stream interference: can swap stimuli between visual streams
 *
 * @see https://github.com/brain-workshop/brainworkshop
 * @see /docs/references/brainworkshop-analysis.md
 */

import {
  BW_CHANCE_GUARANTEED_MATCH,
  BW_CHANCE_INTERFERENCE,
  BW_MULTI_STIMULUS_INTERFERENCE_DIVISOR,
  BW_TRIALS_BASE,
  BW_TRIALS_EXPONENT,
  BW_TRIALS_FACTOR,
  DIGIT_VALUES,
  EMOTION_VALUES,
  IMAGE_MODALITY_SHAPES,
  MULTI_AUDIO_MODALITIES,
  MULTI_STIMULUS_POSITION_MODALITIES,
  SPATIAL_DIRECTIONS,
  TONE_VALUES,
  WORD_VALUES,
  type ImageShape,
} from '../../specs/thresholds';
import { createStimulus, FlexibleTrialBuilder, toTrial } from '../modality';
import {
  BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
  BW_ARITHMETIC_DEFAULT_MAX_NUMBER,
  BW_ARITHMETIC_DEFAULT_USE_NEGATIVES,
  getBWArithmeticOperationsFromDifficulty,
  isBWAcceptableDivideStimulus,
} from '../modality/bw-arithmetic';
import type { SeededRandom } from '../random';
import {
  type ArithmeticDifficulty,
  type BWArithmeticOperation,
  COLORS,
  type Color,
  type DigitValue,
  type EmotionValue,
  type LureType,
  type ModalityId,
  POSITIONS,
  type Position,
  type SpatialDirection,
  SOUNDS,
  type Sound,
  type ToneValue,
  type Trial,
  type WordValue,
} from '../types';
import { type GenerationContext, GeneratorStrategy, strategyRegistry } from './strategy';

const DEFAULT_COLOR: Color = 'ink-navy';
const DEFAULT_IMAGE: ImageShape = 'circle';

/**
 * Configuration étendue pour Brain Workshop fidèle.
 */
interface BWConfig {
  readonly nLevel: number;
  readonly trialsCount?: number; // Base config trialsCount
  readonly trialsCountMode?: 'auto' | 'manual'; // From extensions
  readonly activeModalities: readonly string[];
  // BW Faithful Algorithm
  readonly guaranteedMatchProbability?: number;
  readonly interferenceProbability?: number;
  readonly variableNBack?: boolean;
  readonly crabBackMode?: boolean;
  // Multi-stimulus: 1-4 positions simultanées, chacune avec son propre historique N-back
  readonly multiStimulus?: 1 | 2 | 3 | 4;
  // Multi-audio: 1-2 sons simultanés, chacun avec son propre historique N-back
  readonly multiAudio?: 1 | 2;
  // Formula: base + factor * n^exponent
  readonly trialsBase?: number;
  readonly trialsFactor?: number;
  readonly trialsExponent?: number;
  // Arithmetic (BW faithful)
  readonly arithmeticDifficulty?: ArithmeticDifficulty;
  readonly arithmeticMaxNumber?: number;
  readonly arithmeticUseNegatives?: boolean;
  readonly arithmeticAcceptableDecimals?: readonly string[];
}

/**
 * Résultat de la génération d'une valeur de stimulus.
 */
interface BWFlags {
  readonly isTarget: boolean;
  readonly isLure: boolean;
  readonly lureType?: LureType;
}

export class BrainWorkshopStrategy extends GeneratorStrategy {
  readonly name = 'BrainWorkshop';

  generate(context: GenerationContext): Trial[] {
    const { config, rng } = context;
    const bwConfig = this.extractBWConfig(config);

    if (bwConfig.nLevel < 1) {
      throw new Error(`Invalid nLevel: ${bwConfig.nLevel}. Must be >= 1`);
    }

    // Calcul dynamique du nombre de trials (20 + n²)
    // BW original: buffer trials are INCLUDED in the total, not added separately
    // For 2-back: 20 + 2² = 24 total (first 2 are warmup, 22 are scorable)
    const trialsCount = this.calculateTrials(bwConfig);
    const fullLength = trialsCount;

    // Multi-stimulus: get position modalities based on multiStimulus count
    const multiCount = bwConfig.multiStimulus ?? 1;
    const positionModalities = MULTI_STIMULUS_POSITION_MODALITIES[multiCount];

    // BW multi-stimulus color/image replacement: vis1..n (8-value pool)
    const visModalities = this.getVisModalities(multiCount, bwConfig.activeModalities);

    // Multi-audio: get audio modalities based on multiAudio count
    const multiAudioCount = bwConfig.multiAudio ?? 1;
    const audioModalities = MULTI_AUDIO_MODALITIES[multiAudioCount];

    // BW Combination modalities (visual letter stream + cross-stream matches)
    const hasVisVis = bwConfig.activeModalities.includes('visvis');
    const hasVisAudio = bwConfig.activeModalities.includes('visaudio');
    const hasAudioVis = bwConfig.activeModalities.includes('audiovis');
    const hasCombination = hasVisVis || hasVisAudio || hasAudioVis;

    // Check if base modalities are active
    const hasPosition = bwConfig.activeModalities.includes('position');
    const hasAudio = bwConfig.activeModalities.includes('audio');
    const hasColor = bwConfig.activeModalities.includes('color');
    const hasImage = bwConfig.activeModalities.includes('image');
    const hasSpatial = bwConfig.activeModalities.includes('spatial');
    const hasDigits = bwConfig.activeModalities.includes('digits');
    const hasEmotions = bwConfig.activeModalities.includes('emotions');
    const hasWords = bwConfig.activeModalities.includes('words');
    const hasTones = bwConfig.activeModalities.includes('tones');
    const hasArithmetic = bwConfig.activeModalities.includes('arithmetic');
    const hasVis = visModalities.length > 0;
    // Combination modes require the audio stream for visaudio/audiovis targets.
    // BW standard combination modes always include 'audio'.
    const needsAudioStream = hasAudio || hasVisAudio || hasAudioVis;

    // Génération de variable_list si Variable N-Back activé
    const variableList = bwConfig.variableNBack
      ? this.generateVariableList(trialsCount, bwConfig.nLevel, rng)
      : null;

    // Historique indépendant pour chaque flux de modalité
    // Multi-stimulus: chaque position a son propre historique N-back
    const positionHistories: Record<string, number[]> = {};
    for (const posModality of positionModalities) {
      positionHistories[posModality] = [];
    }

    // Multi-stimulus vis streams: each vis has its own history (only when enabled)
    const visHistories: Record<string, number[]> = {};
    for (const visModality of visModalities) {
      visHistories[visModality] = [];
    }

    // Multi-audio: chaque audio a son propre historique N-back
    const audioHistories: Record<string, number[]> = {};
    for (const audioModality of audioModalities) {
      audioHistories[audioModality] = [];
    }

    // Color, Image, Arithmetic: single-stream each
    const colorHistory: number[] = [];
    const imageHistory: number[] = [];
    const spatialHistory: number[] = [];
    const digitsHistory: number[] = [];
    const emotionsHistory: number[] = [];
    const wordsHistory: number[] = [];
    const tonesHistory: number[] = [];
    // Arithmetic: BW stores numbers and operation each trial (even when arithmetic is not active).
    const arithmeticNumbersHistory: number[] = [];
    // Combination: single visual-letter stream ("vis") stored as 0-7 indices
    const visHistory: number[] = [];

    // Arithmetic parameters (BW defaults)
    const arithmeticDifficulty = bwConfig.arithmeticDifficulty ?? 4;
    const arithmeticOps = getBWArithmeticOperationsFromDifficulty(arithmeticDifficulty);
    const arithmeticMaxNumber = bwConfig.arithmeticMaxNumber ?? BW_ARITHMETIC_DEFAULT_MAX_NUMBER;
    const arithmeticUseNegatives =
      bwConfig.arithmeticUseNegatives ?? BW_ARITHMETIC_DEFAULT_USE_NEGATIVES;
    const arithmeticAcceptableDecimals =
      bwConfig.arithmeticAcceptableDecimals ?? BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS;
    const arithmeticMinNumber = arithmeticUseNegatives ? -arithmeticMaxNumber : 0;

    const trials: Trial[] = [];
    const builder = new FlexibleTrialBuilder();

    for (let i = 0; i < fullLength; i++) {
      const isBuffer = i < bwConfig.nLevel;

      // Calcul du real_back (crab mode, variable n-back)
      const realBack = this.calculateRealBack(
        i,
        bwConfig.nLevel,
        bwConfig.crabBackMode ?? false,
        variableList,
      );

      builder.reset().setIndex(i).setBuffer(isBuffer);

      // ---------------------------------------------------------------------
      // BW stimulus generation (faithful to brainworkshop.py)
      // ---------------------------------------------------------------------

      // Random baseline values (BW: starts random, then may override with match/interference)
      const positionValues: Record<string, number> = {};
      if (hasPosition) {
        const sample = rng.shuffle([...POSITIONS]).slice(0, multiCount);
        for (let s = 0; s < multiCount; s++) {
          const id = positionModalities[s] as string;
          positionValues[id] = sample[s] ?? 0;
        }
      }

      const visValues: Record<string, number> = {};
      if (hasVis) {
        for (const visId of visModalities) {
          visValues[visId] = rng.int(0, 8);
        }
      }

      const audioValues: Record<string, number> = {};
      if (needsAudioStream) {
        for (const audioId of audioModalities) {
          audioValues[audioId] = rng.int(0, SOUNDS.length);
        }
      }

      let colorIndex = hasColor ? rng.int(0, COLORS.length) : 0;
      let imageIndex = hasImage ? rng.int(0, IMAGE_MODALITY_SHAPES.length) : 0;
      let spatialIndex = hasSpatial ? rng.int(0, SPATIAL_DIRECTIONS.length) : 0;
      let digitsIndex = hasDigits ? rng.int(0, DIGIT_VALUES.length) : 0;
      let emotionsIndex = hasEmotions ? rng.int(0, EMOTION_VALUES.length) : 0;
      let wordsIndex = hasWords ? rng.int(0, WORD_VALUES.length) : 0;
      let tonesIndex = hasTones ? rng.int(0, TONE_VALUES.length) : 0;
      let visIndex = hasCombination ? rng.int(0, SOUNDS.length) : 0;

      // ---------------------------------------------------------------------
      // BW arithmetic generation (faithful to brainworkshop.py)
      // - Always generates `number` and `operation` (consumes RNG consistently)
      // - Special divide rules ONLY apply when arithmetic is active
      // ---------------------------------------------------------------------

      const arithmeticOperation = (arithmeticOps[rng.int(0, arithmeticOps.length)] ??
        'add') as BWArithmeticOperation;

      let arithmeticNumber: number;
      if (arithmeticOperation === 'divide' && hasArithmetic) {
        // BW: when enough history exists (trial_number > mode.back), restrict divisor candidates
        if (arithmeticNumbersHistory.length >= bwConfig.nLevel) {
          const nBackNumberForDivide = arithmeticNumbersHistory[i - bwConfig.nLevel] ?? 0;
          const possibilities: number[] = [];
          for (let x = arithmeticMinNumber; x <= arithmeticMaxNumber; x++) {
            if (
              isBWAcceptableDivideStimulus({
                numberNBack: nBackNumberForDivide,
                candidate: x,
                acceptableDecimals: arithmeticAcceptableDecimals,
              })
            ) {
              possibilities.push(x);
            }
          }
          if (possibilities.length > 0) {
            arithmeticNumber = possibilities[rng.int(0, possibilities.length)] ?? 1;
          } else {
            // BW would crash here; fall back to any non-zero to keep the session playable.
            arithmeticNumber = rng.int(arithmeticMinNumber, arithmeticMaxNumber + 1);
            while (arithmeticNumber === 0) {
              arithmeticNumber = rng.int(arithmeticMinNumber, arithmeticMaxNumber + 1);
            }
          }
        } else {
          arithmeticNumber = rng.int(arithmeticMinNumber, arithmeticMaxNumber + 1);
          while (arithmeticNumber === 0) {
            arithmeticNumber = rng.int(arithmeticMinNumber, arithmeticMaxNumber + 1);
          }
        }
      } else {
        arithmeticNumber = rng.int(arithmeticMinNumber, arithmeticMaxNumber + 1);
      }

      // Stage algorithm is applied only after the buffer (trial_number > mode.back)
      // BW buffer is fixed to base N (not realBack).
      if (!isBuffer) {
        const effectiveInterferenceProb =
          (bwConfig.interferenceProbability ?? BW_CHANCE_INTERFERENCE) /
          (multiCount > 1 ? BW_MULTI_STIMULUS_INTERFERENCE_DIVISOR : 1);
        const guaranteedProb = bwConfig.guaranteedMatchProbability ?? BW_CHANCE_GUARANTEED_MATCH;

        if (hasPosition) {
          for (const posId of positionModalities) {
            const history = positionHistories[posId] ?? [];
            const back = this.computeBackOverride(
              i,
              realBack,
              bwConfig.nLevel,
              history,
              guaranteedProb,
              effectiveInterferenceProb,
              rng,
            );
            if (back === null) continue;

            const matching = history[i - back];
            if (matching === undefined) continue;

            // BW: collision resolution in multi-stim position streams = swap positions
            if (multiCount > 1) {
              for (const otherId of positionModalities) {
                if (otherId === posId) continue;
                if (positionValues[otherId] === matching) {
                  positionValues[otherId] = positionValues[posId] ?? 0;
                  break;
                }
              }
            }

            positionValues[posId] = matching;
          }
        }

        if (hasVis) {
          for (const visId of visModalities) {
            const history = visHistories[visId] ?? [];
            const back = this.computeBackOverride(
              i,
              realBack,
              bwConfig.nLevel,
              history,
              guaranteedProb,
              effectiveInterferenceProb,
              rng,
            );
            if (back === null) continue;

            const matching = history[i - back];
            if (matching !== undefined) {
              visValues[visId] = matching;
            }
          }
        }

        // Combination modes: sequentially adjust vis/audio streams like BW
        // (visvis → visaudio overrides vis, audiovis overrides audio, then audio overrides audio).
        if (hasCombination) {
          // visvis: vis matches n-back vis
          if (hasVisVis) {
            const back = this.computeBackOverride(
              i,
              realBack,
              bwConfig.nLevel,
              visHistory,
              guaranteedProb,
              effectiveInterferenceProb,
              rng,
            );
            if (back !== null) {
              const matching = visHistory[i - back];
              if (matching !== undefined) {
                visIndex = matching;
              }
            }
          }

          // visaudio: vis matches n-back audio
          if (hasVisAudio) {
            const audioHistory = audioHistories['audio'] ?? [];
            const back = this.computeBackOverride(
              i,
              realBack,
              bwConfig.nLevel,
              audioHistory,
              guaranteedProb,
              effectiveInterferenceProb,
              rng,
            );
            if (back !== null) {
              const matching = audioHistory[i - back];
              if (matching !== undefined) {
                visIndex = matching;
              }
            }
          }

          // audiovis: audio matches n-back vis
          if (hasAudioVis) {
            const back = this.computeBackOverride(
              i,
              realBack,
              bwConfig.nLevel,
              visHistory,
              guaranteedProb,
              effectiveInterferenceProb,
              rng,
            );
            if (back !== null) {
              const matching = visHistory[i - back];
              if (matching !== undefined) {
                audioValues['audio'] = matching;
              }
            }
          }
        }

        if (needsAudioStream) {
          for (const audioId of audioModalities) {
            const history = audioHistories[audioId] ?? [];
            const back = this.computeBackOverride(
              i,
              realBack,
              bwConfig.nLevel,
              history,
              guaranteedProb,
              effectiveInterferenceProb,
              rng,
            );
            if (back === null) continue;

            const matching = history[i - back];
            if (matching !== undefined) {
              audioValues[audioId] = matching;
            }
          }
        }

        if (hasColor) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            colorHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = colorHistory[i - back];
            if (matching !== undefined) {
              colorIndex = matching;
            }
          }
        }

        if (hasImage) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            imageHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = imageHistory[i - back];
            if (matching !== undefined) {
              imageIndex = matching;
            }
          }
        }

        if (hasSpatial) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            spatialHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = spatialHistory[i - back];
            if (matching !== undefined) {
              spatialIndex = matching;
            }
          }
        }

        if (hasDigits) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            digitsHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = digitsHistory[i - back];
            if (matching !== undefined) {
              digitsIndex = matching;
            }
          }
        }

        if (hasEmotions) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            emotionsHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = emotionsHistory[i - back];
            if (matching !== undefined) {
              emotionsIndex = matching;
            }
          }
        }

        if (hasWords) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            wordsHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = wordsHistory[i - back];
            if (matching !== undefined) {
              wordsIndex = matching;
            }
          }
        }

        if (hasTones) {
          const back = this.computeBackOverride(
            i,
            realBack,
            bwConfig.nLevel,
            tonesHistory,
            guaranteedProb,
            effectiveInterferenceProb,
            rng,
          );
          if (back !== null) {
            const matching = tonesHistory[i - back];
            if (matching !== undefined) {
              tonesIndex = matching;
            }
          }
        }

        // BW multi-stimulus reversal ("confusion") - rare: CHANCE_OF_INTERFERENCE / 3
        if (multiCount > 1) {
          const baseInterference = bwConfig.interferenceProbability ?? BW_CHANCE_INTERFERENCE;
          if (rng.next() < baseInterference / 3) {
            const canRotatePosition = hasPosition;
            const canRotateVis = hasVis;
            const rotateModality: 'position' | 'vis' =
              canRotatePosition && canRotateVis
                ? rng.next() < 0.5
                  ? 'vis'
                  : 'position'
                : canRotateVis
                  ? 'vis'
                  : 'position';

            const offset = rng.int(1, multiCount);
            const nBackIndex = i - realBack;

            if (rotateModality === 'position' && hasPosition) {
              const rotated: Record<string, number> = {};
              for (let s = 0; s < multiCount; s++) {
                const dst = positionModalities[s] as string;
                const src = positionModalities[(s + offset) % multiCount] as string;
                rotated[dst] =
                  (positionHistories[src] ?? [])[nBackIndex] ?? positionValues[dst] ?? 0;
              }
              for (const id of Object.keys(rotated)) {
                positionValues[id] = rotated[id] ?? 0;
              }
            }

            if (rotateModality === 'vis' && hasVis) {
              const rotated: Record<string, number> = {};
              for (let s = 0; s < multiCount; s++) {
                const dst = `vis${s + 1}`;
                const src = `vis${((s + offset) % multiCount) + 1}`;
                rotated[dst] = (visHistories[src] ?? [])[nBackIndex] ?? visValues[dst] ?? 0;
              }
              for (const id of Object.keys(rotated)) {
                if (visValues[id] !== undefined) {
                  visValues[id] = rotated[id] ?? 0;
                }
              }
            }
          }
        }
      }

      // ---------------------------------------------------------------------
      // Build stimuli (targets/lures computed from final values vs history)
      // ---------------------------------------------------------------------

      if (hasPosition) {
        for (const posId of positionModalities) {
          const value = positionValues[posId] ?? 0;
          const flags = this.computeBWFlags({
            trialIndex: i,
            isBuffer,
            realBack,
            baseNLevel: bwConfig.nLevel,
            history: positionHistories[posId] ?? [],
            value,
          });
          builder.addStimulus(
            createStimulus(
              posId,
              POSITIONS[value] as Position,
              flags.isTarget,
              flags.isLure,
              flags.lureType,
            ),
          );
        }
      } else if (hasImage || hasColor || hasSpatial || hasDigits || hasEmotions || hasWords) {
        // Cell-rendered visual modalities still need a grid anchor even when
        // the position modality itself is not active or scored.
        const value = rng.int(0, POSITIONS.length);
        builder.addStimulus(
          createStimulus('position', POSITIONS[value] as Position, false, false, undefined),
        );
      }

      if (hasVis) {
        for (const visId of visModalities) {
          const value = visValues[visId] ?? 0;
          const flags = this.computeBWFlags({
            trialIndex: i,
            isBuffer,
            realBack,
            baseNLevel: bwConfig.nLevel,
            history: visHistories[visId] ?? [],
            value,
          });
          builder.addStimulus(
            createStimulus(visId, value, flags.isTarget, flags.isLure, flags.lureType),
          );
        }
      }

      if (hasAudio) {
        for (const audioId of audioModalities) {
          const valueIndex = audioValues[audioId] ?? 0;
          const flags = this.computeBWFlags({
            trialIndex: i,
            isBuffer,
            realBack,
            baseNLevel: bwConfig.nLevel,
            history: audioHistories[audioId] ?? [],
            value: valueIndex,
          });
          const sound = SOUNDS[valueIndex] as Sound;
          builder.addStimulus(
            createStimulus(audioId, sound, flags.isTarget, flags.isLure, flags.lureType),
          );
        }
      }

      // Combination stimuli (BW): share vis/audio streams but separate target logic
      if (hasCombination) {
        const visSound = SOUNDS[visIndex] as Sound;

        if (hasVisVis) {
          const flags = this.computeBWFlags({
            trialIndex: i,
            isBuffer,
            realBack,
            baseNLevel: bwConfig.nLevel,
            history: visHistory,
            value: visIndex,
          });
          builder.addStimulus(
            createStimulus('visvis', visSound, flags.isTarget, flags.isLure, flags.lureType),
          );
        }

        if (hasVisAudio) {
          const audioHistory = audioHistories['audio'] ?? [];
          const flags = this.computeBWFlags({
            trialIndex: i,
            isBuffer,
            realBack,
            baseNLevel: bwConfig.nLevel,
            history: audioHistory,
            value: visIndex,
          });
          builder.addStimulus(
            createStimulus('visaudio', visSound, flags.isTarget, flags.isLure, flags.lureType),
          );
        }

        if (hasAudioVis) {
          const audioIndex = audioValues['audio'] ?? 0;
          const audioSound = SOUNDS[audioIndex] as Sound;
          const flags = this.computeBWFlags({
            trialIndex: i,
            isBuffer,
            realBack,
            baseNLevel: bwConfig.nLevel,
            history: visHistory,
            value: audioIndex,
          });
          builder.addStimulus(
            createStimulus('audiovis', audioSound, flags.isTarget, flags.isLure, flags.lureType),
          );
        }
      }

      const colorValue = COLORS[colorIndex] ?? DEFAULT_COLOR;
      {
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: colorHistory,
          value: colorIndex,
        });
        builder.addStimulus(
          createStimulus(
            'color',
            colorValue,
            hasColor && flags.isTarget,
            hasColor && flags.isLure,
            flags.lureType,
          ),
        );
      }

      const imageValue = IMAGE_MODALITY_SHAPES[imageIndex] ?? DEFAULT_IMAGE;
      {
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: imageHistory,
          value: imageIndex,
        });
        builder.addStimulus(
          createStimulus(
            'image',
            imageValue,
            hasImage && flags.isTarget,
            hasImage && flags.isLure,
            flags.lureType,
          ),
        );
      }

      if (hasSpatial) {
        const spatialValue =
          SPATIAL_DIRECTIONS[spatialIndex] ?? (SPATIAL_DIRECTIONS[0] as SpatialDirection);
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: spatialHistory,
          value: spatialIndex,
        });
        builder.addStimulus(
          createStimulus(
            'spatial',
            spatialValue as SpatialDirection,
            flags.isTarget,
            flags.isLure,
            flags.lureType,
          ),
        );
      }

      if (hasDigits) {
        const digitValue = DIGIT_VALUES[digitsIndex] ?? (DIGIT_VALUES[0] as DigitValue);
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: digitsHistory,
          value: digitsIndex,
        });
        builder.addStimulus(
          createStimulus(
            'digits',
            digitValue as DigitValue,
            flags.isTarget,
            flags.isLure,
            flags.lureType,
          ),
        );
      }

      if (hasEmotions) {
        const emotionValue = EMOTION_VALUES[emotionsIndex] ?? (EMOTION_VALUES[0] as EmotionValue);
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: emotionsHistory,
          value: emotionsIndex,
        });
        builder.addStimulus(
          createStimulus(
            'emotions',
            emotionValue as EmotionValue,
            flags.isTarget,
            flags.isLure,
            flags.lureType,
          ),
        );
      }

      if (hasWords) {
        const wordValue = WORD_VALUES[wordsIndex] ?? (WORD_VALUES[0] as WordValue);
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: wordsHistory,
          value: wordsIndex,
        });
        builder.addStimulus(
          createStimulus(
            'words',
            wordValue as WordValue,
            flags.isTarget,
            flags.isLure,
            flags.lureType,
          ),
        );
      }

      if (hasTones) {
        const toneValue = TONE_VALUES[tonesIndex] ?? (TONE_VALUES[0] as ToneValue);
        const flags = this.computeBWFlags({
          trialIndex: i,
          isBuffer,
          realBack,
          baseNLevel: bwConfig.nLevel,
          history: tonesHistory,
          value: tonesIndex,
        });
        builder.addStimulus(
          createStimulus(
            'tones',
            toneValue as ToneValue,
            flags.isTarget,
            flags.isLure,
            flags.lureType,
          ),
        );
      }

      if (hasArithmetic) {
        // BW arithmetic: treat as always-scorable after warmup (no match/lure generation).
        const isArithmeticTarget = !isBuffer;

        builder.addStimulus(
          createStimulus('arithmetic', arithmeticNumber, isArithmeticTarget, false, undefined),
        );
      }

      // Build trial (legacy format) + BW-only metadata
      const legacyTrial = toTrial(builder.build());
      const trialOut: Trial = {
        ...legacyTrial,
        effectiveNBack: realBack,
        ...(hasArithmetic && {
          arithmeticNumber,
          arithmeticOperation,
          isArithmeticTarget: !isBuffer,
          isArithmeticLure: false,
          arithmeticLureType: undefined,
        }),
      };
      trials.push(trialOut);

      // ---------------------------------------------------------------------
      // Persist histories AFTER final values are decided (including reversal)
      // ---------------------------------------------------------------------
      if (hasPosition) {
        for (const posId of positionModalities) {
          positionHistories[posId]?.push(positionValues[posId] ?? 0);
        }
      }
      if (hasVis) {
        for (const visId of visModalities) {
          visHistories[visId]?.push(visValues[visId] ?? 0);
        }
      }
      if (needsAudioStream) {
        for (const audioId of audioModalities) {
          audioHistories[audioId]?.push(audioValues[audioId] ?? 0);
        }
      }
      if (hasCombination) {
        visHistory.push(visIndex);
      }
      colorHistory.push(colorIndex);
      imageHistory.push(imageIndex);
      if (hasSpatial) {
        spatialHistory.push(spatialIndex);
      }
      if (hasDigits) {
        digitsHistory.push(digitsIndex);
      }
      if (hasEmotions) {
        emotionsHistory.push(emotionsIndex);
      }
      if (hasWords) {
        wordsHistory.push(wordsIndex);
      }
      if (hasTones) {
        tonesHistory.push(tonesIndex);
      }
      arithmeticNumbersHistory.push(arithmeticNumber);
    }

    return trials;
  }

  /**
   * Extrait la configuration BW depuis le contexte de génération.
   */
  private extractBWConfig(config: GenerationContext['config']): BWConfig {
    // Extensions BW peuvent être dans config directement ou via un champ extensions
    const extensions = (config as unknown as { extensions?: Partial<BWConfig> }).extensions ?? {};
    const activeModalities = config.activeModalities;

    // BW fidelity: multi-stimulus variants are not generated for
    // - combination modes (visvis/visaudio/audiovis)
    // - arithmetic modes
    // - modes that include BOTH color + image
    const hasCombination =
      activeModalities.includes('visvis') ||
      activeModalities.includes('visaudio') ||
      activeModalities.includes('audiovis');
    const hasArithmetic = activeModalities.includes('arithmetic');
    const forbidsMultiStimulus =
      hasCombination ||
      hasArithmetic ||
      (activeModalities.includes('color') && activeModalities.includes('image'));

    return {
      nLevel: config.nLevel,
      trialsCount: config.trialsCount,
      trialsCountMode: extensions.trialsCountMode,
      activeModalities,
      guaranteedMatchProbability:
        extensions.guaranteedMatchProbability ?? BW_CHANCE_GUARANTEED_MATCH,
      interferenceProbability: extensions.interferenceProbability ?? BW_CHANCE_INTERFERENCE,
      variableNBack: extensions.variableNBack ?? false,
      crabBackMode: extensions.crabBackMode ?? false,
      multiStimulus: forbidsMultiStimulus ? 1 : ((extensions.multiStimulus ?? 1) as 1 | 2 | 3 | 4),
      multiAudio: hasCombination || hasArithmetic ? 1 : ((extensions.multiAudio ?? 1) as 1 | 2),
      trialsBase: extensions.trialsBase ?? BW_TRIALS_BASE,
      trialsFactor: extensions.trialsFactor ?? BW_TRIALS_FACTOR,
      trialsExponent: extensions.trialsExponent ?? BW_TRIALS_EXPONENT,
      arithmeticDifficulty: extensions.arithmeticDifficulty ?? 4,
      arithmeticMaxNumber:
        (extensions as unknown as { arithmeticMaxNumber?: number }).arithmeticMaxNumber ??
        BW_ARITHMETIC_DEFAULT_MAX_NUMBER,
      arithmeticUseNegatives:
        (extensions as unknown as { arithmeticUseNegatives?: boolean }).arithmeticUseNegatives ??
        BW_ARITHMETIC_DEFAULT_USE_NEGATIVES,
      arithmeticAcceptableDecimals:
        (extensions as unknown as { arithmeticAcceptableDecimals?: readonly string[] })
          .arithmeticAcceptableDecimals ?? BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
    };
  }

  /**
   * Calcule le nombre de trials selon la formule BW: base + factor * n^exponent
   * Default: 20 + 1 * n² → 24 pour 2-back, 29 pour 3-back, 36 pour 4-back.
   * If a manual trialsCount is provided AND trialsCountMode is 'manual', it takes precedence.
   */
  private calculateTrials(config: BWConfig): number {
    const base = config.trialsBase ?? BW_TRIALS_BASE;
    const factor = config.trialsFactor ?? BW_TRIALS_FACTOR;
    const exponent = config.trialsExponent ?? BW_TRIALS_EXPONENT;
    const autoTrials = Math.max(
      config.nLevel + 1,
      Math.round(base + factor * config.nLevel ** exponent),
    );

    if (
      config.trialsCountMode === 'manual' &&
      typeof config.trialsCount === 'number' &&
      Number.isFinite(config.trialsCount)
    ) {
      return Math.max(config.nLevel + 1, Math.round(config.trialsCount));
    }

    return autoTrials;
  }

  /**
   * Génère la liste de N variables pour Variable N-Back.
   * Utilise une distribution beta(n/2, 1) pour biaiser vers les valeurs basses.
   *
   * @example Pour 3-back: génère des valeurs 1, 2, ou 3 avec biais vers 1
   */
  private generateVariableList(trials: number, nLevel: number, rng: SeededRandom): number[] {
    const list: number[] = [];
    for (let i = 0; i < trials; i++) {
      // Beta(n/2, 1) * n + 1 → valeur entre 1 et n avec biais vers le bas
      const beta = rng.beta(nLevel / 2, 1);
      list.push(Math.floor(beta * nLevel) + 1);
    }
    return list;
  }

  /**
   * Calcule le real_back pour un trial donné.
   *
   * - Crab-Back mode: N oscille 1-3-5-1-3-5... (pour 3-back)
   * - Variable N-Back: N varie selon la distribution beta
   */
  private calculateRealBack(
    trialIndex: number,
    nLevel: number,
    crabMode: boolean,
    variableList: number[] | null,
  ): number {
    let realBack = nLevel;

    if (crabMode) {
      // Oscillation: 1-3-5-1-3-5... pour 3-back
      // Formule: 1 + 2 * ((trial) % n)
      realBack = 1 + 2 * (trialIndex % nLevel);
    }

    if (variableList && trialIndex >= realBack) {
      const variableIdx = trialIndex - realBack;
      if (variableIdx >= 0 && variableIdx < variableList.length) {
        realBack = variableList[variableIdx] ?? nLevel;
      }
    }

    return realBack;
  }

  private getVisModalities(
    multiCount: 1 | 2 | 3 | 4,
    activeModalities: readonly string[],
  ): readonly ModalityId[] {
    if (multiCount <= 1) return [];
    const all = ['vis1', 'vis2', 'vis3', 'vis4'] as const;
    return all.slice(0, multiCount).filter((m) => activeModalities.includes(m));
  }

  /**
   * BW faithful: decide whether to override current value with a match / interference.
   *
   * Returns the back distance to use (realBack or realBack+offset), or null for "keep random".
   */
  private computeBackOverride(
    trialIndex: number,
    realBack: number,
    baseNLevel: number,
    history: readonly number[],
    guaranteedProb: number,
    interferenceProb: number,
    rng: SeededRandom,
  ): number | null {
    // BW: rules apply only after the base-N warmup (trial_number > mode.back)
    if (trialIndex < baseNLevel) return null;

    const nBackValue = history[trialIndex - realBack];
    if (nBackValue === undefined) return null;

    const r1 = rng.next();
    const r2 = rng.next();

    if (r1 < guaranteedProb) return realBack;

    // BW: interference is disabled for 1-back sessions (mode.back > 1)
    if (baseNLevel > 1 && r2 < interferenceProb) {
      return this.computeInterferenceBack(trialIndex, realBack, baseNLevel, history, rng);
    }

    return null;
  }

  /**
   * BW faithful: choose a near-miss interference back distance.
   *
   * Offsets tested: [-1, +1, baseN] (with -1 excluded when realBack < 3).
   * Keeps the LAST valid offset found after shuffling (BW behavior).
   */
  private computeInterferenceBack(
    trialIndex: number,
    realBack: number,
    baseNLevel: number,
    history: readonly number[],
    rng: SeededRandom,
  ): number | null {
    const nBackValue = history[trialIndex - realBack];
    if (nBackValue === undefined) return null;

    let offsets = [-1, 1, baseNLevel];
    if (realBack < 3) offsets = offsets.slice(1);

    const shuffledOffsets = [...offsets];
    rng.shuffle(shuffledOffsets);

    let chosen: number | null = null;
    for (const offset of shuffledOffsets) {
      const back = realBack + offset;
      const idx = trialIndex - back;
      if (idx >= 0 && idx < history.length) {
        const candidate = history[idx];
        if (candidate !== undefined && candidate !== nBackValue) {
          chosen = back;
        }
      }
    }

    return chosen;
  }

  /**
   * Compute BW target/lure flags from FINAL value vs history.
   * This intentionally allows accidental targets (BW leaves random values as-is).
   */
  private computeBWFlags({
    trialIndex,
    isBuffer,
    realBack,
    baseNLevel,
    history,
    value,
  }: {
    trialIndex: number;
    isBuffer: boolean;
    realBack: number;
    baseNLevel: number;
    history: readonly number[];
    value: number;
  }): BWFlags {
    if (isBuffer) return { isTarget: false, isLure: false };

    const nBackValue = history[trialIndex - realBack];
    if (nBackValue !== undefined && value === nBackValue) {
      return { isTarget: true, isLure: false };
    }

    const candidates: Array<{ lureType: LureType; back: number; enabled: boolean }> = [
      { lureType: 'n-1', back: realBack - 1, enabled: realBack >= 3 },
      { lureType: 'n+1', back: realBack + 1, enabled: true },
      { lureType: 'sequence', back: realBack + baseNLevel, enabled: true },
    ];

    for (const c of candidates) {
      if (!c.enabled) continue;
      const idx = trialIndex - c.back;
      if (idx >= 0 && idx < history.length) {
        const candidate = history[idx];
        if (candidate !== undefined && value === candidate) {
          return { isTarget: false, isLure: true, lureType: c.lureType };
        }
      }
    }

    return { isTarget: false, isLure: false };
  }
}

// Auto-register
strategyRegistry.register(new BrainWorkshopStrategy());
