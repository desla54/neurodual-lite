/**
 * Stroop Flex Introduction — in-game onboarding overlay.
 *
 * Shown on first launch; re-launchable from tutorial hub.
 * The overlay explains:
 *   1. Stroop conflict (word vs color)
 *   2. Rule badge (respond to color or word)
 *   3. Level logic (current stimulus vs past target)
 *   4. Play strategy
 *   5. Session recap
 */

import { type ReactNode, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CanvasWeave, Hatching, cn } from '@neurodual/ui';

interface StroopFlexIntroProps {
  nLevel: number;
  totalTrials: number;
  /** Resolved CSS color strings for the 4 buttons */
  colors: { id: string; cssVar: string; word: string; label: string }[];
  onComplete: () => void;
}

const INTRO_SCREENS = ['stroop', 'flex', 'level', 'tip', 'go'] as const;
type IntroScreenId = (typeof INTRO_SCREENS)[number];

function SurfaceCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-woven-border/60 bg-woven-surface shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function MetaLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-bold uppercase tracking-[0.24em] text-woven-text-muted', className)}>
      {children}
    </p>
  );
}

function RulePill({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex rounded-full border border-woven-border/70 bg-woven-bg/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-woven-text-muted">
      {children}
    </div>
  );
}

export function StroopFlexIntro({
  nLevel,
  totalTrials,
  colors,
  onComplete,
}: StroopFlexIntroProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const bufferCount = Math.max(0, nLevel - 1);
  const durationMin = Math.max(1, Math.round((totalTrials * 3.5) / 60));
  const currentScreen = INTRO_SCREENS[step] ?? 'go';
  const totalSteps = INTRO_SCREENS.length;

  const next = useCallback(() => {
    if (step < totalSteps - 1) setStep((s) => s + 1);
    else onComplete();
  }, [step, totalSteps, onComplete]);

  const skip = useCallback(() => onComplete(), [onComplete]);

  const blueColor = colors.find((c) => c.id === 'blue');
  const redColor = colors.find((c) => c.id === 'red');
  const greenColor = colors.find((c) => c.id === 'green');
  const yellowColor = colors.find((c) => c.id === 'yellow');

  const blueCss = blueColor ? `hsl(${blueColor.cssVar})` : 'currentColor';
  const redCss = redColor ? `hsl(${redColor.cssVar})` : 'currentColor';
  const greenCss = greenColor ? `hsl(${greenColor.cssVar})` : 'currentColor';
  const yellowCss = yellowColor ? `hsl(${yellowColor.cssVar})` : 'currentColor';

  const i = 'game.cogTask.stroopFlex.intro';
  const screenLabels: Record<IntroScreenId, string> = {
    stroop: t(`${i}.screen1Label`, { defaultValue: 'Conflit' }),
    flex: t(`${i}.screen2Label`, { defaultValue: 'Règle' }),
    level: t(`${i}.screen3Label`, { defaultValue: 'Niveau' }),
    tip: t(`${i}.screen4Label`, { defaultValue: 'Stratégie' }),
    go: t(`${i}.screen5Label`, { defaultValue: 'Session' }),
  };

  const ruleInk = t('game.cogTask.stroopFlex.ruleInk', { defaultValue: 'Couleur' });
  const ruleWord = t('game.cogTask.stroopFlex.ruleWord', { defaultValue: 'Mot' });
  const inkLabel = t(`${i}.inkLabel`, { defaultValue: ruleInk });
  const wordLabel = t(`${i}.wordLabel`, { defaultValue: ruleWord });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-4 sm:p-6">
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/18 bg-woven-surface shadow-[0_24px_60px_hsl(var(--foreground)/0.14)] shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.32)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.32),hsl(var(--background)/0.10))]" />
        <div className="absolute inset-[1px] rounded-[27px] bg-white/8" />
        <CanvasWeave opacity={0.12} className="pointer-events-none stroke-neutral-400" />

        <div className="relative z-10 flex max-h-[88vh] min-h-[600px] flex-col">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <MetaLabel>{t(`${i}.introLabel`, { defaultValue: 'Guide rapide' })}</MetaLabel>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-woven-text sm:text-[2rem]">
                  {t('settings.gameMode.stroopFlex')}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-woven-text-muted">
                  {t(`${i}.introSubtitle`, {
                    defaultValue:
                      'Avant de jouer, prends 30 secondes pour comprendre comment la règle et le niveau se combinent.',
                  })}
                </p>
              </div>
              <div className="rounded-full border border-woven-border/70 bg-woven-bg/80 px-3 py-1 text-xs font-bold tabular-nums text-woven-text-muted">
                {step + 1}/{totalSteps}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {INTRO_SCREENS.map((screen, idx) => (
                <div
                  key={screen}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    idx === step ? 'w-8 bg-primary' : 'w-2 bg-woven-border/70',
                  )}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <MetaLabel className="text-primary">{screenLabels[currentScreen]}</MetaLabel>
              <span className="text-woven-text-muted">{t(`${i}.swipeHint`, { defaultValue: 'Lis puis continue' })}</span>
            </div>

            <Hatching id="stroop-flex-intro-top" className="mt-4 text-foreground/70" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            {currentScreen === 'stroop' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-woven-text">
                    {t(`${i}.title1`)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-woven-text/80">
                    {t(`${i}.body1`)}
                  </p>
                </div>

                <SurfaceCard className="relative overflow-hidden p-5">
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.12),transparent)]" />
                  <div className="relative z-10 flex flex-col items-center gap-4 text-center">
                    <MetaLabel>{t(`${i}.exampleLabel`, { defaultValue: 'Exemple' })}</MetaLabel>
                    <span className="select-none text-5xl font-black tracking-tight sm:text-6xl" style={{ color: redCss }}>
                      {blueColor?.word ?? 'BLEU'}
                    </span>
                    <div className="grid w-full grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-woven-border/60 bg-background/40 p-3 text-left">
                        <MetaLabel>{t(`${i}.autoReadLabel`, { defaultValue: 'Réflexe automatique' })}</MetaLabel>
                        <p className="mt-2 text-base font-bold line-through opacity-70 text-woven-text">
                          {blueColor?.label ?? 'Bleu'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-woven-border/60 bg-background/40 p-3 text-left">
                        <MetaLabel>{t(`${i}.correctAnswerLabel`, { defaultValue: 'Bonne réponse' })}</MetaLabel>
                        <p className="mt-2 text-base font-bold" style={{ color: redCss }}>
                          {redColor?.label ?? 'Rouge'}
                        </p>
                      </div>
                    </div>
                  </div>
                </SurfaceCard>
              </div>
            )}

            {currentScreen === 'flex' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-woven-text">
                    {t(`${i}.title2`)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-woven-text/80">
                    {t(`${i}.body2badge`)}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SurfaceCard className="p-4">
                    <div className="flex flex-col gap-3">
                      <RulePill>
                        {t(`${i}.ruleExample`, { defaultValue: 'Règle' })}: {inkLabel}
                      </RulePill>
                      <span className="select-none text-4xl font-black tracking-tight" style={{ color: blueCss }}>
                        {greenColor?.word ?? 'VERT'}
                      </span>
                      <p className="text-sm leading-relaxed text-woven-text/80">{t(`${i}.body2ink`)}</p>
                      <div className="rounded-xl border border-woven-border/60 bg-background/40 px-3 py-2 text-sm text-woven-text-muted">
                        <span className="font-semibold text-woven-text">{inkLabel}</span>
                        {' → '}
                        <span className="font-bold" style={{ color: blueCss }}>
                          {blueColor?.label ?? 'Bleu'}
                        </span>
                      </div>
                    </div>
                  </SurfaceCard>

                  <SurfaceCard className="p-4">
                    <div className="flex flex-col gap-3">
                      <RulePill>
                        {t(`${i}.ruleExample`, { defaultValue: 'Règle' })}: {wordLabel}
                      </RulePill>
                      <span className="select-none text-4xl font-black tracking-tight" style={{ color: blueCss }}>
                        {greenColor?.word ?? 'VERT'}
                      </span>
                      <p className="text-sm leading-relaxed text-woven-text/80">{t(`${i}.body2word`)}</p>
                      <div className="rounded-xl border border-woven-border/60 bg-background/40 px-3 py-2 text-sm text-woven-text-muted">
                        <span className="font-semibold text-woven-text">{wordLabel}</span>
                        {' → '}
                        <span className="font-bold" style={{ color: greenCss }}>
                          {greenColor?.label ?? 'Vert'}
                        </span>
                      </div>
                    </div>
                  </SurfaceCard>
                </div>
              </div>
            )}

            {currentScreen === 'level' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-woven-text">
                    {t(`${i}.title3`, { n: nLevel })}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-woven-text/80">
                    {nLevel === 1
                      ? t(`${i}.levelImmediate`, {
                          defaultValue: 'Niveau 1 : tu réponds au stimulus affiché maintenant.',
                        })
                      : t(`${i}.levelShifted`, {
                          n: nLevel,
                          buffer: bufferCount,
                          defaultValue:
                            'Niveau {{n}} : tu réponds au stimulus vu il y a {{buffer}} tour(s).',
                        })}
                  </p>
                  <p className="mt-3 text-[15px] leading-[1.7] text-woven-text/80">
                    {t(`${i}.levelRuleLink`, {
                      defaultValue:
                        'Le badge affiché maintenant indique toujours la règle à appliquer, même si la bonne cible est passée.',
                    })}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SurfaceCard className="p-4">
                    <MetaLabel>{t(`${i}.cardSeenNow`, { defaultValue: "À l'écran maintenant" })}</MetaLabel>
                    <div className="mt-3 flex flex-col gap-3">
                      <RulePill>
                        {t(`${i}.currentRuleLabel`, { defaultValue: 'Badge actuel' })}: {wordLabel}
                      </RulePill>
                      <span className="select-none text-4xl font-black tracking-tight" style={{ color: yellowCss }}>
                        {greenColor?.word ?? 'VERT'}
                      </span>
                      <p className="text-sm leading-relaxed text-woven-text-muted">
                        {t(`${i}.currentRuleHint`, {
                          defaultValue:
                            "Cet écran te montre l'essai en cours, mais il ne sera pas toujours la bonne cible.",
                        })}
                      </p>
                    </div>
                  </SurfaceCard>

                  <SurfaceCard className="p-4">
                    <MetaLabel>
                      {nLevel === 1
                        ? t(`${i}.cardTargetNow`, { defaultValue: 'Cible = stimulus actuel' })
                        : t(`${i}.cardTarget`, { defaultValue: 'Cible de réponse' })}
                    </MetaLabel>
                    <div className="mt-3 flex flex-col gap-3">
                      {nLevel > 1 && (
                        <p className="text-xs leading-relaxed text-woven-text-muted">
                          {t(`${i}.targetDistance`, {
                            buffer: bufferCount,
                            defaultValue: 'Cible vue il y a {{buffer}} tour(s).',
                          })}
                        </p>
                      )}
                      <span className="select-none text-4xl font-black tracking-tight" style={{ color: redCss }}>
                        {blueColor?.word ?? 'BLEU'}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-woven-border/60 bg-background/40 px-3 py-2 text-sm text-woven-text-muted">
                          <span className="font-semibold text-woven-text">{inkLabel}</span>
                          {' → '}
                          <span className="font-bold" style={{ color: redCss }}>
                            {redColor?.label ?? 'Rouge'}
                          </span>
                        </div>
                        <div className="rounded-xl border border-woven-border/60 bg-background/40 px-3 py-2 text-sm text-woven-text-muted">
                          <span className="font-semibold text-woven-text">{wordLabel}</span>
                          {' → '}
                          <span className="font-bold" style={{ color: blueCss }}>
                            {blueColor?.label ?? 'Bleu'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </SurfaceCard>
                </div>

                {bufferCount > 0 && (
                  <SurfaceCard className="p-4">
                    <MetaLabel>{t('game.cogTask.stroopFlex.memorize', { defaultValue: 'Mémorise' })}</MetaLabel>
                    <p className="mt-2 text-sm leading-relaxed text-woven-text/80">
                      {t(`${i}.bufferHint`, {
                        buffer: bufferCount,
                        defaultValue:
                          'Les {{buffer}} premier(s) essai(s) servent à remplir la mémoire : observe et retiens, tu répondras ensuite.',
                      })}
                    </p>
                  </SurfaceCard>
                )}
              </div>
            )}

            {currentScreen === 'tip' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-woven-text">
                    {t(`${i}.title4`)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-woven-text/80">
                    {t(`${i}.body4`)}
                  </p>
                </div>

                <SurfaceCard className="p-4">
                  <div className="space-y-3">
                    <div>
                      <MetaLabel>{t(`${i}.tipStep1Label`, { defaultValue: '1. Regarde le badge' })}</MetaLabel>
                      <p className="mt-1 text-sm leading-relaxed text-woven-text/80">
                        {t(`${i}.tipStep1`, {
                          defaultValue: 'Décide d’abord si tu dois répondre à la couleur ou au mot.',
                        })}
                      </p>
                    </div>
                    <Hatching id="stroop-flex-intro-tip-1" className="text-foreground/70" />
                    <div>
                      <MetaLabel>{t(`${i}.tipStep2Label`, { defaultValue: '2. Choisis la bonne cible' })}</MetaLabel>
                      <p className="mt-1 text-sm leading-relaxed text-woven-text/80">
                        {t(`${i}.tipStep2`, {
                          defaultValue:
                            nLevel === 1
                              ? 'Au niveau 1, la cible est ce que tu vois maintenant.'
                              : 'À ce niveau, demande-toi d’abord de combien de tours tu dois remonter.',
                        })}
                      </p>
                    </div>
                    <Hatching id="stroop-flex-intro-tip-2" className="text-foreground/70" />
                    <div>
                      <MetaLabel>{t(`${i}.tipStep3Label`, { defaultValue: '3. Réponds proprement' })}</MetaLabel>
                      <p className="mt-1 text-sm leading-relaxed text-woven-text/80">
                        {t(`${i}.tipStep3`, {
                          defaultValue: 'La vitesse viendra ensuite : cherche d’abord la bonne logique, puis accélère.',
                        })}
                      </p>
                    </div>
                  </div>
                </SurfaceCard>
              </div>
            )}

            {currentScreen === 'go' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-woven-text">
                    {t(`${i}.title5`)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-woven-text/80">
                    {t(`${i}.body5`, { trials: totalTrials, n: nLevel, duration: durationMin })}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <SurfaceCard className="p-3 text-center">
                    <MetaLabel>{t('game.cogTask.trials', { defaultValue: 'Essais' })}</MetaLabel>
                    <p className="mt-2 text-2xl font-black tabular-nums text-woven-text">{totalTrials}</p>
                  </SurfaceCard>
                  <SurfaceCard className="p-3 text-center">
                    <MetaLabel>{t(`${i}.levelLabel`, { defaultValue: 'Niveau' })}</MetaLabel>
                    <p className="mt-2 text-2xl font-black tabular-nums text-woven-text">{nLevel}</p>
                  </SurfaceCard>
                  <SurfaceCard className="p-3 text-center">
                    <MetaLabel>{t(`${i}.durationLabel`, { defaultValue: 'Durée' })}</MetaLabel>
                    <p className="mt-2 text-2xl font-black tabular-nums text-woven-text">~{durationMin}</p>
                  </SurfaceCard>
                </div>

                <SurfaceCard className="p-4">
                  <div className="space-y-3">
                    <div>
                      <MetaLabel>{t(`${i}.summaryRuleLabel`, { defaultValue: 'Le badge choisit la règle' })}</MetaLabel>
                      <p className="mt-1 text-sm leading-relaxed text-woven-text/80">
                        {t(`${i}.summaryRule`, {
                          defaultValue: 'Couleur = réponds à la couleur. Mot = réponds au mot.',
                        })}
                      </p>
                    </div>
                    <Hatching id="stroop-flex-intro-summary-1" className="text-foreground/70" />
                    <div>
                      <MetaLabel>{t(`${i}.summaryLevelLabel`, { defaultValue: 'Le niveau choisit la cible' })}</MetaLabel>
                      <p className="mt-1 text-sm leading-relaxed text-woven-text/80">
                        {nLevel === 1
                          ? t(`${i}.summaryLevelCurrent`, {
                              defaultValue: 'Au niveau 1, la cible est le stimulus actuel.',
                            })
                          : t(`${i}.summaryLevelShifted`, {
                              n: nLevel,
                              buffer: bufferCount,
                              defaultValue:
                                'Au niveau {{n}}, la cible est le stimulus vu il y a {{buffer}} tour(s).',
                            })}
                      </p>
                    </div>
                    {bufferCount > 0 && (
                      <>
                        <Hatching id="stroop-flex-intro-summary-2" className="text-foreground/70" />
                        <div>
                          <MetaLabel>{t(`${i}.summaryMemoryLabel`, { defaultValue: 'Début de session' })}</MetaLabel>
                          <p className="mt-1 text-sm leading-relaxed text-woven-text/80">
                            {t(`${i}.summaryMemory`, {
                              buffer: bufferCount,
                              defaultValue:
                                'Les {{buffer}} premier(s) essai(s) servent à mémoriser avant les réponses.',
                            })}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </SurfaceCard>
              </div>
            )}
          </div>

          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <Hatching id="stroop-flex-intro-bottom" className="mb-4 text-foreground/70" />
            {step < totalSteps - 1 ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={skip}
                  className="text-woven-text-muted hover:bg-woven-bg"
                >
                  {t(`${i}.skip`)}
                </Button>
                <Button size="md" onClick={next} className="min-w-[7.5rem]">
                  {t(`${i}.next`)}
                </Button>
              </div>
            ) : (
              <Button size="lg" onClick={next} className="w-full">
                {t(`${i}.start`)}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
