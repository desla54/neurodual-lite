/**
 * Stroop Flex Introduction — in-game onboarding overlay.
 *
 * Shown on first launch; re-launchable from tutorial hub.
 * 5 swipable screens based on evidence-based pedagogy:
 *   1. Stroop effect (Explicit Instruction — "I Do")
 *   2. Rule switching (Worked Example Fading)
 *   3. N-level (Cognitive Load — sequenced, conditional)
 *   4. Strategy tip (Metacognitive Prompt)
 *   5. Go (Flow State — clear goals)
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@neurodual/ui';

interface StroopFlexIntroProps {
  nLevel: number;
  totalTrials: number;
  /** Resolved CSS color strings for the 4 buttons */
  colors: { id: string; cssVar: string; word: string; label: string }[];
  onComplete: () => void;
}

export function StroopFlexIntro({
  nLevel,
  totalTrials,
  colors,
  onComplete,
}: StroopFlexIntroProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const showNLevel = nLevel > 1;
  const bufferCount = nLevel - 1;
  const durationMin = Math.max(1, Math.round((totalTrials * 3.5) / 60));

  // Build ordered list of screens (skip N-level screen if nLevel === 1)
  const screens = ['stroop', 'flex', ...(showNLevel ? ['nlevel'] : []), 'tip', 'go'];
  const totalSteps = screens.length;
  const currentScreen = screens[step] ?? 'go';

  const next = useCallback(() => {
    if (step < totalSteps - 1) setStep((s) => s + 1);
    else onComplete();
  }, [step, totalSteps, onComplete]);

  const skip = useCallback(() => onComplete(), [onComplete]);

  // Find example colors for the visual demos
  const blueColor = colors.find((c) => c.id === 'blue');
  const redColor = colors.find((c) => c.id === 'red');
  const greenColor = colors.find((c) => c.id === 'green');

  const i = 'game.cogTask.stroopFlex.intro';

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pb-2 pt-4">
        {screens.map((_, idx) => (
          <div
            key={idx}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              idx === step ? 'w-6 bg-fuchsia-500' : 'w-1.5 bg-muted-foreground/30',
            )}
          />
        ))}
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {/* ── Screen 1: The Stroop effect ── */}
        {currentScreen === 'stroop' && (
          <>
            <h2 className="text-xl font-bold text-foreground">
              {t(`${i}.title1`)}
            </h2>
            {/* Visual: word BLUE in red ink */}
            <div className="flex flex-col items-center gap-3">
              <span
                className="select-none text-5xl font-black"
                style={{ color: `hsl(${redColor?.cssVar})` }}
              >
                {blueColor?.word ?? 'BLUE'}
              </span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="line-through opacity-60">{blueColor?.label ?? 'Blue'}</span>
                <span>→</span>
                <span
                  className="font-bold"
                  style={{ color: `hsl(${redColor?.cssVar})` }}
                >
                  {redColor?.label ?? 'Red'} ✓
                </span>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t(`${i}.body1`)}
            </p>
          </>
        )}

        {/* ── Screen 2: Rule switching ── */}
        {currentScreen === 'flex' && (
          <>
            <h2 className="text-xl font-bold text-foreground">
              {t(`${i}.title2`)}
            </h2>
            {/* Two side-by-side examples */}
            <div className="flex w-full max-w-xs gap-4">
              {/* Ink rule example */}
              <div className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fuchsia-400">
                  {t(`${i}.ruleExample`)}: {t(`${i}.inkLabel`)}
                </div>
                <span
                  className="text-3xl font-black"
                  style={{ color: `hsl(${blueColor?.cssVar})` }}
                >
                  {greenColor?.word ?? 'GREEN'}
                </span>
                <span className="text-xs text-muted-foreground">
                  → <span className="font-bold" style={{ color: `hsl(${blueColor?.cssVar})` }}>
                    {blueColor?.label ?? 'Blue'} ✓
                  </span>
                </span>
              </div>
              {/* Word rule example */}
              <div className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  {t(`${i}.ruleExample`)}: {t(`${i}.wordLabel`)}
                </div>
                <span
                  className="text-3xl font-black"
                  style={{ color: `hsl(${blueColor?.cssVar})` }}
                >
                  {greenColor?.word ?? 'GREEN'}
                </span>
                <span className="text-xs text-muted-foreground">
                  → <span className="font-bold" style={{ color: `hsl(${greenColor?.cssVar})` }}>
                    {greenColor?.label ?? 'Green'} ✓
                  </span>
                </span>
              </div>
            </div>
            <div className="flex max-w-sm flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
              <p>{t(`${i}.body2ink`)}</p>
              <p>{t(`${i}.body2word`)}</p>
              <p className="mt-1 font-medium text-foreground/80">{t(`${i}.body2badge`)}</p>
            </div>
          </>
        )}

        {/* ── Screen 3: N-level (conditional) ── */}
        {currentScreen === 'nlevel' && (
          <>
            <h2 className="text-xl font-bold text-foreground">
              {t(`${i}.title3`, { n: nLevel })}
            </h2>
            {/* Visual: simple N-back timeline */}
            <div className="flex items-end gap-2">
              {Array.from({ length: nLevel + 1 }, (_, idx) => {
                const isTarget = idx === 0;
                const isCurrent = idx === nLevel;
                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {isCurrent ? 'N' : `N-${nLevel - idx}`}
                    </span>
                    <div
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-lg border text-lg font-bold',
                        isTarget
                          ? 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-400'
                          : isCurrent
                            ? 'border-border bg-muted/50 text-muted-foreground'
                            : 'border-border/40 bg-muted/20 text-muted-foreground/50',
                      )}
                    >
                      {isTarget ? '?' : isCurrent ? '👁' : '·'}
                    </div>
                    {isTarget && (
                      <span className="text-[10px] font-bold text-fuchsia-400">
                        ↑ {t(`${i}.ruleExample`)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t(`${i}.body3`, { n: nLevel, buffer: bufferCount })}
            </p>
          </>
        )}

        {/* ── Screen 4: Strategy tip ── */}
        {currentScreen === 'tip' && (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-3xl">
              💡
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {t(`${i}.title4`)}
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t(`${i}.body4`)}
            </p>
          </>
        )}

        {/* ── Screen 5: Go ── */}
        {currentScreen === 'go' && (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-3xl">
              🎯
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              {t(`${i}.title5`)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(`${i}.body5`, { trials: totalTrials, duration: durationMin })}
            </p>
          </>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-between px-6 pb-8 pt-4">
        {step < totalSteps - 1 ? (
          <>
            <button
              type="button"
              onClick={skip}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(`${i}.skip`)}
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-xl bg-fuchsia-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-fuchsia-500 active:scale-95"
            >
              {t(`${i}.next`)}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={next}
            className="w-full rounded-xl bg-fuchsia-600 py-3 text-base font-bold text-white transition-all hover:bg-fuchsia-500 active:scale-95"
          >
            {t(`${i}.start`)}
          </button>
        )}
      </div>
    </div>
  );
}
