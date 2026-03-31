import { House, Pause, Timer } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GameControls, type GameControlItem } from '../game/game-controls';
import { cn } from '../lib/utils';
import { CanvasWeave } from '../primitives/canvas-weave';
import { Grid } from '../game/grid';
import { AnnotationZone } from './AnnotationZone';
import { SpotlightOverlay, type SpotlightStep } from './SpotlightOverlay';
import { useTutorialLayout } from './hooks/use-tutorial-layout';

const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

function MiniGrid({ position }: { position: number }) {
  return (
    <div className="bg-woven-surface rounded-lg shadow-sm w-9 h-9 flex items-center justify-center">
      <div className="grid grid-cols-3 gap-0.5">
        {GRID_MAP.map((logicPos, idx) => {
          if (logicPos === null) {
            return <div key={`cell-${idx}`} className="w-2 h-2 rounded-[2px] bg-transparent" />;
          }
          return (
            <div
              key={`cell-${idx}`}
              className={cn(
                'w-2 h-2 rounded-[2px]',
                logicPos === position ? 'bg-visual' : 'bg-woven-cell-rest',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function MiniLetter({ letter }: { letter: string }) {
  return (
    <div className="bg-woven-surface rounded-lg shadow-sm w-9 h-9 flex items-center justify-center">
      <span className="font-bold text-audio text-base">{letter}</span>
    </div>
  );
}

function PostludeHud({ nLevel }: { nLevel: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center">
      <div className="relative inline-flex items-center gap-2 p-2 px-3 rounded-full bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm overflow-visible">
        <CanvasWeave lineCount={8} rounded="full" />
        <div
          data-testid="postlude-hud-n"
          className="relative z-10 w-[54px] h-9 px-1.5 flex items-center justify-center rounded-full text-[13px] font-bold uppercase bg-woven-cell-rest text-woven-text shrink-0 leading-none"
        >
          N-{nLevel}
        </div>
        <div className="relative z-10 h-9 min-w-[84px] pl-1.5 pr-1 flex items-center justify-start rounded-full bg-woven-cell-rest/85 border border-woven-border/80 shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.35)] font-mono font-semibold text-woven-text leading-none shrink-0">
          <Timer size={12} weight="bold" className="text-primary/75 shrink-0" />
          <span className="ml-1 text-[16px] tabular-nums tracking-tight">
            00<span className="text-woven-text-muted">·</span>00
          </span>
        </div>
        <button
          type="button"
          className="relative z-10 min-w-10 min-h-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border shrink-0 bg-woven-surface text-woven-text-muted"
          disabled
          aria-label={t('aria.pause')}
        >
          <Pause size={16} weight="bold" />
        </button>
        <button
          type="button"
          className="relative z-10 min-w-10 min-h-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border shrink-0 bg-woven-surface text-woven-text-muted"
          disabled
          aria-label={t('common.home')}
        >
          <House size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}

type DemoMode = 'position' | 'audio';

function LevelsTimeline({
  compareBack,
  mode,
  pastLabel,
  presentLabel,
}: {
  compareBack: 1 | 2 | 3;
  mode: DemoMode;
  pastLabel: string;
  presentLabel: string;
}) {
  // Example content: make the compared attribute identical between N and N-k.
  const presentPos = 1;
  const pastPos = mode === 'position' ? presentPos : 6;
  const presentLetter = 'A';
  const pastLetter = mode === 'audio' ? presentLetter : 'T';

  const pastTargetId = compareBack === 1 ? 'n1' : compareBack === 2 ? 'n2' : 'n3';

  const slots = useMemo(() => {
    const base = {
      n3: { pos: 7, letter: 'K' },
      n2: { pos: 0, letter: 'I' },
      n1: { pos: 6, letter: 'T' },
    } as const;

    const override = { pos: pastPos, letter: pastLetter };
    const final = {
      ...base,
      [pastTargetId]: override,
    } as Record<'n1' | 'n2' | 'n3', { pos: number; letter: string }>;

    return [
      { id: 'n3', label: 'N-3', pos: final.n3.pos, letter: final.n3.letter },
      { id: 'n2', label: 'N-2', pos: final.n2.pos, letter: final.n2.letter },
      { id: 'n1', label: 'N-1', pos: final.n1.pos, letter: final.n1.letter },
      { id: 'n', label: 'N', pos: presentPos, letter: presentLetter },
    ] as const;
  }, [pastPos, pastLetter, pastTargetId]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex flex-col items-center gap-1 sm:gap-3">
        <div className="relative flex items-start justify-center gap-2 sm:gap-4">
          {/* Past */}
          <div className="relative flex flex-col items-center">
            <div className="text-3xs font-medium uppercase tracking-wider text-woven-text-muted mb-1">
              {pastLabel}
            </div>
            <div className="relative px-2 py-1.5">
              <div className="absolute left-0 right-0 top-0 bottom-0 bg-woven-surface rounded-2xl border border-woven-border pointer-events-none" />
              <div className="relative z-10 flex items-center gap-1.5">
                {slots
                  .filter((s) => s.id !== 'n')
                  .map((s) => (
                    <div
                      key={s.id}
                      data-testid={`postlude-slot-${s.id}`}
                      className="flex flex-col items-center"
                    >
                      <div className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-woven-text-muted">
                        {s.label}
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <MiniGrid position={s.pos} />
                        <MiniLetter letter={s.letter} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Present */}
          <div className="relative flex flex-col items-center">
            <div className="text-3xs font-medium uppercase tracking-wider text-woven-text-muted mb-1">
              {presentLabel}
            </div>
            <div className="relative px-2 py-1.5">
              <div className="absolute left-0 right-0 top-0 bottom-0 bg-woven-surface rounded-2xl border border-woven-border pointer-events-none" />
              <div className="relative z-10 flex items-center gap-1.5">
                <div data-testid="postlude-slot-n" className="flex flex-col items-center">
                  <div className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-woven-text-muted">
                    N
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <MiniGrid position={presentPos} />
                    <MiniLetter letter={presentLetter} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Helper for SpotlightOverlay to target the current past slot */}
        <div className="sr-only" data-testid={`postlude-past-target-${pastTargetId}`} />
      </div>
    </div>
  );
}

export interface TutorialLevelsPostludeProps {
  onDone: () => void;
}

export function TutorialLevelsPostlude({ onDone }: TutorialLevelsPostludeProps): ReactNode {
  const { t } = useTranslation();
  const layout = useTutorialLayout();

  const [nLevel, setNLevel] = useState<1 | 2 | 3>(1);
  const overlayKeyRef = useRef(0);
  const [overlayKey, setOverlayKey] = useState(0);

  const mode: DemoMode = nLevel % 2 === 1 ? 'position' : 'audio';
  const compareBack = nLevel;
  const pastLabel = t('tutorial.timeline.past', 'Past');
  const presentLabel = t('tutorial.timeline.present', 'Present');

  const steps: SpotlightStep[] = useMemo(() => {
    const pastSlotId = nLevel === 1 ? 'n1' : nLevel === 2 ? 'n2' : 'n3';
    const buttonTarget =
      mode === 'position'
        ? '[data-testid="btn-match-position"]'
        : '[data-testid="btn-match-audio"]';
    return [
      {
        id: 'hud',
        target: '[data-testid="postlude-hud-n"]',
        content: t('tutorial.postlude.levels.hud', 'N = number of turns back.'),
        position: 'bottom',
      },
      {
        id: 'present',
        target: '[data-testid="postlude-slot-n"]',
        content: t('tutorial.postlude.levels.present', 'N = the current stimulus (present).'),
        position: 'top',
      },
      {
        id: 'past',
        target: `[data-testid="postlude-slot-${pastSlotId}"]`,
        content: t('tutorial.postlude.levels.past', 'On compare avec N-{{n}}.', { n: nLevel }),
        position: 'top',
      },
      {
        id: 'controls',
        target: buttonTarget,
        content:
          mode === 'position'
            ? t('tutorial.postlude.levels.pressPosition', 'If it repeats, press Position.')
            : t('tutorial.postlude.levels.pressAudio', 'If it repeats, press Audio.'),
        position: 'top',
      },
    ];
  }, [t, nLevel, mode]);

  const intro = useMemo(
    () => (
      <div className="text-center">
        <div className="text-woven-text text-lg sm:text-xl font-bold">
          {t('tutorial.postlude.levels.title', 'Understanding N levels')}
        </div>
        <div className="mt-1 text-woven-text-muted text-sm sm:text-base">
          {t(
            'tutorial.postlude.levels.desc',
            "You learned N=2. Here's how it generalizes from N=1 to N=4.",
          )}
        </div>
      </div>
    ),
    [t],
  );

  const outro = useMemo(
    () => (
      <div className="text-center">
        <div className="text-woven-text text-base sm:text-lg font-semibold">
          {t('tutorial.postlude.levels.outroTitle', 'Et ainsi de suite…')}
        </div>
        <div className="mt-1 text-woven-text-muted text-sm sm:text-base">
          {t(
            'tutorial.postlude.levels.outroBody',
            'Si vous passez a N=4, vous comparerez avec N-4. La regle ne change pas, seule la distance augmente.',
          )}
        </div>
      </div>
    ),
    [t],
  );

  useEffect(() => {
    overlayKeyRef.current++;
    setOverlayKey(overlayKeyRef.current);
  }, [nLevel]);

  const controls: GameControlItem[] = useMemo(
    () => [
      {
        id: 'position',
        label: t('tutorial.controls.position', 'Position'),
        shortcut: 'A',
        active: false,
        onClick: () => {},
        color: 'visual',
        highlighted: mode === 'position',
      },
      {
        id: 'audio',
        label: t('tutorial.controls.audio', 'Audio'),
        shortcut: 'L',
        active: false,
        onClick: () => {},
        color: 'audio',
        highlighted: mode === 'audio',
      },
    ],
    [t, mode],
  );

  const onOverlayComplete = () => {
    if (nLevel < 3) {
      setNLevel((nLevel + 1) as 1 | 2 | 3);
      return;
    }
    onDone();
  };

  const gridStyle = {
    display: 'grid' as const,
    gridTemplateRows: layout.gridTemplateRows,
    gridTemplateAreas: layout.gridTemplateAreas,
    gap: `${layout.gap}px`,
    height: '100%',
    padding: '12px',
    paddingTop: '8px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
  };

  return (
    <div className="relative bg-woven-bg overflow-hidden" style={gridStyle}>
      <CanvasWeave lineCount={8} className="opacity-[0.25]" />

      <div style={{ gridArea: 'hud' }} className="relative z-[1001]">
        <PostludeHud nLevel={nLevel} />
      </div>

      <div
        style={{ gridArea: 'gameZone' }}
        className="relative flex flex-col items-center justify-start z-10 min-h-0 overflow-hidden pt-1"
      >
        <div className="w-full max-w-md">
          <LevelsTimeline
            compareBack={compareBack}
            mode={mode}
            pastLabel={pastLabel}
            presentLabel={presentLabel}
          />
        </div>

        <div className="mt-3">
          <div className="relative" style={{ width: layout.gridSize, height: layout.gridSize }}>
            <Grid
              activePosition={1}
              showStimulus
              stimulusStyle="full"
              gridStyle="classic"
              className="rounded-2xl w-full h-full"
            />
          </div>
        </div>
      </div>

      <div style={{ gridArea: 'annotation' }} className="flex justify-center items-center">
        <AnnotationZone
          annotationKey={
            nLevel === 1
              ? 'tutorial.postlude.levels.annotation.n1'
              : nLevel === 2
                ? 'tutorial.postlude.levels.annotation.n2'
                : 'tutorial.postlude.levels.annotation.n3'
          }
          className="w-full max-w-md mx-auto"
        />
      </div>

      <div style={{ gridArea: 'controls' }} className="flex items-center justify-center">
        <div className="w-full flex justify-center px-4">
          <GameControls
            disabled
            controls={controls}
            compact
            width={layout.gridSize}
            scale={Math.min(1, layout.buttonScale)}
          />
        </div>
      </div>

      <SpotlightOverlay
        key={`levels-${overlayKey}`}
        steps={steps}
        introMessage={intro}
        introButtonText={t('tutorial.postlude.levels.start', 'Commencer')}
        outroMessage={nLevel === 3 ? outro : undefined}
        outroButtonText={nLevel === 3 ? t('tutorial.postlude.levels.done', 'Terminer') : undefined}
        onComplete={onOverlayComplete}
      />
    </div>
  );
}
