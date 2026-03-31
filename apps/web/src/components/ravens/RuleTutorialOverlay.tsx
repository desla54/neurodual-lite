/**
 * RuleTutorialOverlay — interstitial overlay shown before the first
 * encounter of advanced rule types during an adaptive session.
 *
 * Displays the tutorial gate's content (title, description, rule explanations)
 * and a dismiss button. Mandatory tutorials require explicit dismissal.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type RuleTutorialGate,
  type RuleTutorialContent,
  getTutorialContent,
} from '@neurodual/logic';
import { Button } from '@neurodual/ui';

export interface RuleTutorialOverlayProps {
  /** The tutorial gate to display */
  gate: RuleTutorialGate;
  /** Called when the user dismisses the tutorial */
  onDismiss: () => void;
}

export function RuleTutorialOverlay({ gate, onDismiss }: RuleTutorialOverlayProps): ReactNode {
  const { t } = useTranslation();
  const content = getTutorialContent(gate.id);

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-overlay-padding">
      {/* Backdrop — non-dismissable for mandatory tutorials */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative bg-woven-surface border border-woven-border rounded-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-xl">
              {gate.id === 'logic-rules'
                ? '\u2295'
                : gate.id === 'mesh-overlay'
                  ? '\u2592'
                  : '\u29C9'}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-woven-text">
              {t(`${gate.i18nPrefix}.title`, content.title)}
            </h2>
            <p className="text-[11px] text-woven-text-muted uppercase tracking-wider font-semibold mt-0.5">
              {t('visualLogic.tutorial.levelGate', 'Niveau {{level}}+', {
                level: gate.triggerLevel,
              })}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-woven-text-muted leading-relaxed mb-5">
          {t(`${gate.i18nPrefix}.description`, content.description)}
        </p>

        {/* Rule explanations */}
        <div className="space-y-3 mb-6">
          {content.ruleExplanations.map((rule, i) => (
            <RuleExplanationCard key={i} rule={rule} i18nPrefix={gate.i18nPrefix} index={i} />
          ))}
        </div>

        {/* Dismiss button */}
        <Button variant="primary" className="w-full" onClick={onDismiss}>
          {t('visualLogic.tutorial.dismiss', 'Compris, continuer')}
        </Button>
      </div>
    </div>
  );
}

// ─── Rule Explanation Card ──────────────────────────────────────────────────

function RuleExplanationCard({
  rule,
  i18nPrefix,
  index,
}: {
  rule: RuleTutorialContent['ruleExplanations'][number];
  i18nPrefix: string;
  index: number;
}): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-woven-surface/80 border border-woven-border/60 p-3.5">
      <h3 className="text-sm font-bold text-woven-text mb-1">
        {t(`${i18nPrefix}.rules.${index}.name`, rule.name)}
      </h3>
      <p className="text-xs text-woven-text-muted leading-relaxed">
        {t(`${i18nPrefix}.rules.${index}.explanation`, rule.explanation)}
      </p>
      {rule.example && (
        <p className="mt-1.5 text-[11px] text-primary/80 italic leading-relaxed">
          {t(`${i18nPrefix}.rules.${index}.example`, rule.example)}
        </p>
      )}
    </div>
  );
}
