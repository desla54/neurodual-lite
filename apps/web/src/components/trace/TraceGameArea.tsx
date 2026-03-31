/**
 * TraceGameArea - Main game area for Dual Trace mode
 *
 * Contains the TraceGrid and all overlays:
 * - Idle overlay (play button)
 * - Pause overlay
 * - Writing zone overlay
 * - Writing feedback overlay
 */

import { cn, Spinner } from '@neurodual/ui';
import type {
  Sound,
  TracePhase,
  TraceWritingResult,
  TraceModality,
  TraceModalityResult,
  SwipeDirection,
  Color,
  ImageShape,
  TraceArithmeticProblem,
} from '@neurodual/logic';
import type { GridStyle } from '../../stores/trace-game-store';
import { Play } from '@phosphor-icons/react';
import { memo, type ReactNode } from 'react';

import { TraceGrid } from './TraceGrid';
import { TraceRuleIndicator } from './TraceRuleIndicator';

// =============================================================================
// Types
// =============================================================================

export interface TraceGameAreaProps {
  /** Current session phase */
  phase: TracePhase;
  /** Active stimulus position */
  activePosition: number | null;
  /** Whether to show stimulus */
  showStimulus: boolean;
  /** Feedback position */
  feedbackPosition: number | null;
  /** Feedback type */
  feedbackType: 'correct' | 'incorrect' | null;
  /** Whether feedback was from user action */
  feedbackFromUserAction: boolean;
  /** Whether grid is disabled */
  gridDisabled: boolean;
  /** Whether session is paused */
  isPaused: boolean;
  /** Whether in writing phase */
  isWriting: boolean;
  /** Whether to show writing feedback (grid hidden) */
  showWritingFeedback?: boolean;
  /** Current writing result (from snapshot) */
  writingResult: TraceWritingResult | null;
  /** Expected sound for writing phase */
  expectedSound: Sound | null;
  /** Stimulus color for current trial (color modality) */
  stimulusColor: Color | null;
  /** Current visual stimulus text rendered in the active cell */
  currentStimulusText?: string | null;
  /** Current visual stimulus shape rendered in the active cell */
  currentStimulusShape?: ImageShape | null;
  /** Expected N-back color for writing zone (color modality) */
  expectedColor: Color | null;
  /** Expected shape for writing (image modality) */
  expectedImage?: string | null;
  /** Expected digit for writing (digits modality) */
  expectedDigit?: string | null;
  /** Expected emotion for writing (emotions modality) */
  expectedEmotion?: string | null;
  /** Expected word for writing (words modality) */
  expectedWord?: string | null;
  /** Expected tone for writing (tones modality) */
  expectedTone?: string | null;
  /** Expected direction for writing (spatial modality) */
  expectedSpatialDirection?: string | null;
  /** Swipe feedback: from position */
  swipeFeedbackFrom?: number | null;
  /** Swipe feedback: to position */
  swipeFeedbackTo?: number | null;
  /** Whether from position was correct */
  swipeFeedbackFromCorrect?: boolean;
  /** Whether to position was correct */
  swipeFeedbackToCorrect?: boolean;
  /** Whether current trial is warmup */
  isWarmup: boolean;
  /** N-level */
  nLevel: number;
  /** Grid scale factor */
  gridScale: number;
  /** Grid visual style: 'trace' or 'classic' */
  gridStyle?: GridStyle;
  /** Whether dynamic rules are enabled */
  dynamicRules: boolean;
  /** Whether dynamic swipe direction is enabled */
  dynamicSwipeDirection?: boolean;
  /** Current swipe direction for the trial (for rule indicator) */
  swipeDirection?: SwipeDirection;
  /** Swipe direction for NEXT trial (shown during waiting phase) */
  nextSwipeDirection?: SwipeDirection;
  /** Active modalities for current trial (scorable) */
  activeModalities: readonly TraceModality[] | null;
  /** Active modalities of the N-back trial (the one being recalled), for writing step selection */
  nBackActiveModalities?: readonly string[] | null;
  /** Active modalities for NEXT trial (shown during waiting phase) */
  nextActiveModalities?: readonly TraceModality[] | null;
  /** Enabled modalities from settings */
  enabledModalities: readonly TraceModality[];
  /** Whether rule indicator is visible (from snapshot, for two-phase waiting) */
  ruleVisible?: boolean;
  /** SDT results per modality for feedback display (dynamic rules only) */
  lastModalityResults?: Readonly<Record<TraceModality, TraceModalityResult>> | null;
  /** Current trial index (used as seed for icon order randomization) */
  trialIndex?: number;
  /** Whether in arithmetic phase */
  isArithmetic?: boolean;
  /** Current arithmetic problem (expression + answer) */
  arithmeticProblem?: TraceArithmeticProblem | null;
  /** Whether arithmetic interference is enabled for this session */
  arithmeticEnabled?: boolean;
  /** Grid mode: '3x3' (default) or extended (dyslatéralisation) */
  gridMode?: '3x3' | '3x4' | '4x3' | '4x4';

  // Visual settings (from settings store)
  /** Visual stimulus style: 'full' | 'dots' | 'stringart' | 'custom' */
  visualStimulusStyle?: 'full' | 'dots' | 'stringart' | 'custom';
  /** Visual stimulus color (from settings, e.g., 'blue', 'red') */
  visualStimulusColor?: string;
  /** Custom image URL for stimulus (base64 data URL) */
  customImageUrl?: string;
  /** String Art: number of points per branch */
  stringArtPoints?: number;
  /** Sequential mode: cells visited by intermediate swipes (shown greyed during response) */
  visitedCells?: readonly number[];
  /** Sequential mode: per-step results for multi-cell feedback during positionFeedback */
  sequentialStepResults?: ReadonlyArray<{
    readonly fromPosition: number;
    readonly toPosition: number;
    readonly expectedFromPosition: number;
    readonly expectedToPosition: number;
    readonly expectedFromGesture: number;
    readonly expectedToGesture: number;
    readonly fromCorrect: boolean;
    readonly toCorrect: boolean;
    readonly isCorrect: boolean;
  }>;
  /** Whether sequential trace mode is active */
  isSequentialTrace?: boolean;
  /** Current writing step index (0 = oldest T-N) */
  writingStepIndex?: number;
  /** Total sequential writing steps = nLevel */
  sequentialStepCount?: number;
  /** Whether mindful timing mode is active */
  mindfulTimingEnabled?: boolean;
  /** Whether the current trial expects a mindful hold instead of a double tap */
  mindfulHoldEnabled?: boolean;
  /** Target duration for mindful position actions (ms) */
  mindfulPositionDurationMs?: number;
  /** Tolerance for mindful position actions (ms) */
  mindfulPositionToleranceMs?: number;
  /** Target duration for mindful writing actions (ms) */
  mindfulWritingDurationMs?: number;
  /** Tolerance for mindful writing actions (ms) */
  mindfulWritingToleranceMs?: number;
  /** Post-action timing feedback for position actions */
  positionTimingFeedback?: {
    readonly label: string;
    readonly durationMs: number;
    readonly accepted: boolean;
  } | null;
  /** Post-action timing feedback for writing actions */
  writingTimingFeedback?: {
    readonly label: string;
    readonly durationMs: number;
    readonly accepted: boolean;
  } | null;
  onPositionTimingFeedbackChange?: (
    feedback: {
      readonly label: string;
      readonly durationMs: number;
      readonly accepted: boolean;
    } | null,
  ) => void;
  onWritingTimingFeedbackChange?: (
    feedback: {
      readonly label: string;
      readonly durationMs: number;
      readonly accepted: boolean;
    } | null,
  ) => void;

  /** Called when user swipes */
  onSwipe: (
    from: number,
    to: number,
    inputMethod: 'mouse' | 'touch',
    capturedAtMs: number,
    actionDurationMs?: number,
  ) => void;
  /** Called when user double-taps */
  onDoubleTap: (position: number, inputMethod: 'mouse' | 'touch', capturedAtMs: number) => void;
  /** Called when user press-and-holds for a position match */
  onHold?: (
    position: number,
    inputMethod: 'mouse' | 'touch',
    capturedAtMs: number,
    actionDurationMs: number,
  ) => void;
  /** Called when user double-taps the center (position rejection) */
  onCenterDoubleTap?: (inputMethod: 'mouse' | 'touch', capturedAtMs: number) => void;
  /** Called when writing is submitted */
  onWritingSubmit: (result: TraceWritingResult) => void;
  /** Called when arithmetic answer is submitted */
  onArithmeticSubmit?: (userAnswer: number, confidence: number, writingTimeMs: number) => void;
  /** Called when user asks for a new arithmetic (captcha-like) */
  onArithmeticRefresh?: () => void;
  /** Called when play button is clicked (idle state) */
  onStart: () => void;
  /** Called when resume button is clicked (paused state) */
  onResume: () => void;
  /** Whether the start button is in loading state */
  isStarting?: boolean;

  /** Preparation delay before first stimulus in ms (countdown: 3,2,1,0) */
  prepDelayMs: number;

  /** Current stimulus duration (used for UI-only FX like the sweep) */
  stimulusDurationMs: number;
  /** Current warmup stimulus duration (used for UI-only FX like the sweep) */
  warmupStimulusDurationMs: number;
}

// =============================================================================
// Component
// =============================================================================

export const TraceGameArea = memo(function TraceGameArea({
  phase,
  activePosition,
  showStimulus,
  feedbackPosition,
  feedbackType,
  feedbackFromUserAction,
  gridDisabled,
  isPaused,
  isWriting,
  showWritingFeedback = false,
  writingResult,
  expectedSound,
  stimulusColor,
  currentStimulusText = null,
  currentStimulusShape = null,
  expectedColor,
  expectedImage,
  expectedDigit,
  expectedEmotion,
  expectedWord,
  expectedTone,
  expectedSpatialDirection,
  swipeFeedbackFrom,
  swipeFeedbackTo,
  swipeFeedbackFromCorrect,
  swipeFeedbackToCorrect,
  nLevel,
  gridScale,
  gridStyle = 'trace',
  dynamicRules,
  dynamicSwipeDirection = false,
  swipeDirection,
  nextSwipeDirection,
  activeModalities,
  nBackActiveModalities,
  nextActiveModalities,
  enabledModalities,
  ruleVisible = true,
  lastModalityResults,
  trialIndex,
  isArithmetic = false,
  arithmeticProblem,
  arithmeticEnabled = false,
  gridMode = '3x3',
  // Visual settings
  visualStimulusStyle,
  visualStimulusColor,
  customImageUrl,
  stringArtPoints,
  // Sequential mode
  visitedCells,
  sequentialStepResults,
  isSequentialTrace = false,
  writingStepIndex = 0,
  sequentialStepCount = 1,
  mindfulTimingEnabled = false,
  mindfulHoldEnabled = false,
  mindfulPositionDurationMs = 3000,
  mindfulPositionToleranceMs = 200,
  mindfulWritingDurationMs = 2000,
  mindfulWritingToleranceMs = 200,
  positionTimingFeedback = null,
  writingTimingFeedback = null,
  onPositionTimingFeedbackChange,
  onWritingTimingFeedbackChange,
  onSwipe,
  onDoubleTap,
  onHold,
  onCenterDoubleTap,
  onWritingSubmit,
  onArithmeticSubmit,
  onArithmeticRefresh,
  onStart,
  onResume,
  isStarting = false,
  prepDelayMs: _prepDelayMs,
}: TraceGameAreaProps): ReactNode {
  void _prepDelayMs; // Countdown now rendered at page level
  void mindfulPositionDurationMs;
  void mindfulPositionToleranceMs;
  void mindfulWritingDurationMs;
  void mindfulWritingToleranceMs;

  // Writing overlay should only ask/score modalities that were ACTIVE on the N-back trial
  // (the one the user must recall). With dynamic rules, the current trial may have different
  // active modalities than the recalled trial — using the current trial's modalities would
  // show/hide the wrong steps and cause incorrect feedback.
  // Fallback to current trial's modalities when nBackActiveModalities is null (warmup).
  const writingModalities = nBackActiveModalities ?? activeModalities;
  const writingAudioActive =
    Boolean(writingModalities?.includes('audio')) && enabledModalities.includes('audio');
  const writingColorActive =
    Boolean(writingModalities?.includes('color')) && enabledModalities.includes('color');
  const writingImageActive =
    Boolean(writingModalities?.includes('image')) && enabledModalities.includes('image');
  const writingDigitsActive =
    Boolean(writingModalities?.includes('digits')) && enabledModalities.includes('digits');
  const writingEmotionsActive =
    Boolean(writingModalities?.includes('emotions')) && enabledModalities.includes('emotions');
  const writingWordsActive =
    Boolean(writingModalities?.includes('words')) && enabledModalities.includes('words');
  const writingTonesActive =
    Boolean(writingModalities?.includes('tones')) && enabledModalities.includes('tones');
  const writingSpatialActive =
    Boolean(writingModalities?.includes('spatial')) && enabledModalities.includes('spatial');

  // Display logic driven by state machine phases (no timers needed):
  // - idle: show first trial's active modalities
  // - feedback: show results per modality (colored icons)
  // - waiting/preStimGap: show NEXT trial's active modalities
  // Note: preStimGap is the gap between rule disappearing and stimulus appearing,
  // we use next modalities during fade-out animation to prevent visual glitch
  const isPreparingNextTrial = phase === 'waiting' || phase === 'preStimGap';
  const ruleModalities = isPreparingNextTrial
    ? (nextActiveModalities ?? activeModalities)
    : activeModalities;
  // Same logic for swipe direction
  const ruleSwipeDirection = isPreparingNextTrial
    ? (nextSwipeDirection ?? swipeDirection)
    : swipeDirection;

  // When to show rule indicator (before/between trials)
  // WITH arithmetic: ONLY show during ruleReveal (after arithmetic, before response)
  // WITHOUT arithmetic:
  //   - During idle: show if first trial is NOT warmup (i.e., nLevel === 0)
  //   - During waiting: show if NEXT trial is NOT warmup
  // Warmup trials have no N-back target, so rule indicator is irrelevant noise
  const nextTrialIndex = phase === 'idle' ? 0 : (trialIndex ?? 0) + 1;
  const nextTrialIsWarmup = nextTrialIndex < nLevel;
  const showRuleIndicator = arithmeticEnabled
    ? phase === 'ruleReveal'
    : phase === 'ruleReveal' ||
      ((phase === 'idle' || (phase === 'waiting' && ruleVisible)) && !nextTrialIsWarmup);

  // When to show feedback indicator (after response / writing validation)
  // - For position-only trials: modality results are computed at end of positionFeedback.
  // - For writing trials: modality results are computed at entry of writingFeedback.
  const showFeedbackIndicator =
    dynamicRules &&
    (phase === 'positionFeedback' || phase === 'writingFeedback') &&
    !!lastModalityResults;

  // Rule indicator is only useful when it changes (dynamic rules)
  // or when we explicitly need to show swipe direction.
  const enableRuleIndicator = dynamicRules || dynamicSwipeDirection;
  // Reserve row height for indicators whenever this session can display them.
  const reserveRuleIndicatorRow =
    isArithmetic ||
    arithmeticEnabled ||
    (dynamicRules && enabledModalities.length > 1) ||
    (dynamicSwipeDirection && enabledModalities.length === 1);

  const showArithmeticExpressionInHeader =
    isArithmetic &&
    !!arithmeticProblem &&
    (arithmeticProblem.variant === 'simple' || arithmeticProblem.variant === undefined);
  const timingFeedback = isWriting ? writingTimingFeedback : positionTimingFeedback;

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center min-h-0 p-2 sm:p-4">
      <div className="w-full max-w-[400px] md:max-w-[450px]">
        {/* Spacer — countdown/pause status is now rendered at page level */}
        <div className="h-6 mb-2" />

        {/* Rule/Feedback/Arithmetic indicator container - FIXED HEIGHT to prevent layout shift */}
        {reserveRuleIndicatorRow && (
          <div className="h-16 flex items-center justify-center">
            {/* Arithmetic expression - displayed during arithmetic phase */}
            {showArithmeticExpressionInHeader && (
              <div className="text-3xl font-mono font-bold text-woven-text">
                {arithmeticProblem.expression} = ?
              </div>
            )}
            {/* Rule indicator: shows which modalities are scorable OR swipe direction (idle/waiting phases) */}
            {!isArithmetic && ruleModalities && !showFeedbackIndicator && enableRuleIndicator && (
              <TraceRuleIndicator
                mode="rule"
                activeModalities={ruleModalities}
                enabledModalities={enabledModalities}
                visible={showRuleIndicator}
                shuffleSeed={isPreparingNextTrial ? (trialIndex ?? 0) + 1 : trialIndex}
                dynamicSwipeDirection={dynamicSwipeDirection}
                swipeDirection={ruleSwipeDirection}
              />
            )}
            {/* Feedback indicator: shows results per modality (feedback phase) */}
            {!isArithmetic && !!showFeedbackIndicator && activeModalities && (
              <TraceRuleIndicator
                mode="feedback"
                activeModalities={activeModalities}
                enabledModalities={enabledModalities}
                modalityResults={lastModalityResults}
                visible={true}
                shuffleSeed={trialIndex}
                dynamicSwipeDirection={dynamicSwipeDirection}
                swipeDirection={swipeDirection}
              />
            )}
          </div>
        )}

        {/* Sequential writing step indicator: shows "N-2", "N-1" etc.
            distance = nLevel - writingStepIndex → how many back from current this recall targets */}
        {isSequentialTrace && isWriting && (
          <div className="h-5 flex items-center justify-center mb-1">
            <span className="text-xs font-medium text-woven-text-muted tabular-nums">
              N-{sequentialStepCount - writingStepIndex}
            </span>
          </div>
        )}

        <div className="relative">
          <div
            className="relative transition-transform duration-200"
            style={
              gridScale !== 1
                ? { transform: `scale(${gridScale})`, transformOrigin: 'center center' }
                : undefined
            }
          >
            <TraceGrid
              activePosition={activePosition}
              showStimulus={showStimulus}
              stimulusColor={stimulusColor}
              activeStimulusText={currentStimulusText}
              activeStimulusShape={currentStimulusShape}
              feedbackPosition={feedbackPosition}
              feedbackType={feedbackType}
              feedbackFromUserAction={feedbackFromUserAction}
              disabled={gridDisabled}
              onSwipe={onSwipe}
              onDoubleTap={onDoubleTap}
              onHold={onHold}
              onCenterDoubleTap={onCenterDoubleTap}
              isWriting={isWriting}
              showWritingFeedback={showWritingFeedback}
              expectedSound={writingAudioActive ? expectedSound : null}
              colorEnabled={writingColorActive}
              expectedColor={writingColorActive ? expectedColor : null}
              imageEnabled={writingImageActive}
              expectedImage={writingImageActive ? expectedImage : null}
              digitsEnabled={writingDigitsActive}
              expectedDigit={writingDigitsActive ? expectedDigit : null}
              emotionsEnabled={writingEmotionsActive}
              expectedEmotion={writingEmotionsActive ? expectedEmotion : null}
              wordsEnabled={writingWordsActive}
              expectedWord={writingWordsActive ? expectedWord : null}
              tonesEnabled={writingTonesActive}
              expectedTone={writingTonesActive ? expectedTone : null}
              spatialEnabled={writingSpatialActive}
              expectedSpatialDirection={writingSpatialActive ? expectedSpatialDirection : null}
              onWritingSubmit={onWritingSubmit}
              writingResult={writingResult}
              swipeFeedbackFrom={swipeFeedbackFrom}
              swipeFeedbackTo={swipeFeedbackTo}
              swipeFeedbackFromCorrect={swipeFeedbackFromCorrect}
              swipeFeedbackToCorrect={swipeFeedbackToCorrect}
              visitedCells={visitedCells}
              sequentialStepResults={sequentialStepResults}
              writingStepIndex={writingStepIndex}
              mindfulTimingEnabled={mindfulTimingEnabled}
              mindfulHoldEnabled={mindfulHoldEnabled}
              mindfulPositionDurationMs={mindfulPositionDurationMs}
              mindfulPositionToleranceMs={mindfulPositionToleranceMs}
              mindfulWritingDurationMs={mindfulWritingDurationMs}
              mindfulWritingToleranceMs={mindfulWritingToleranceMs}
              onPositionTimingFeedbackChange={onPositionTimingFeedbackChange}
              onWritingTimingFeedbackChange={onWritingTimingFeedbackChange}
              isArithmetic={isArithmetic}
              expectedAnswer={arithmeticProblem?.answer}
              arithmeticProblem={arithmeticProblem}
              onArithmeticSubmit={onArithmeticSubmit}
              onArithmeticRefresh={onArithmeticRefresh}
              gridStyle={gridStyle}
              gridMode={gridMode}
              paused={isPaused}
              onResume={onResume}
              // Visual settings
              visualStimulusStyle={visualStimulusStyle}
              visualStimulusColor={visualStimulusColor}
              customImageUrl={customImageUrl}
              stringArtPoints={stringArtPoints}
              className="w-full h-auto"
            />
            {/* Idle overlay - Play button centered on the grid only */}
            {phase === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center z-50">
                <button
                  type="button"
                  onClick={onStart}
                  disabled={isStarting}
                  className={cn(
                    'w-16 h-16 flex items-center justify-center rounded-full bg-woven-text text-woven-bg shadow-lg transition-[transform,opacity]',
                    isStarting ? 'scale-90 opacity-70' : 'active:scale-95',
                  )}
                >
                  {isStarting ? (
                    <Spinner size={24} className="text-woven-bg" />
                  ) : (
                    <Play size={32} className="ml-1" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 h-6 flex items-center justify-center">
            {timingFeedback && (
              <div
                className={cn(
                  'text-sm font-medium tabular-nums transition-colors duration-150',
                  timingFeedback.accepted ? 'text-woven-correct' : 'text-woven-incorrect',
                )}
              >
                {timingFeedback.label} {Math.round(timingFeedback.durationMs)} ms
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
