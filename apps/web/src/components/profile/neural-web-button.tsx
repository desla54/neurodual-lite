/**
 * NeuralWebButton — Miniature "fiche" (index card) entry point to the cognitive profile.
 *
 * Looks like a tiny document: brain icon top-left (like a photo),
 * title lines next to it, text lines below, held by a metallic paperclip.
 */

import { Brain } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

/** Metallic gray paperclip */
function Paperclip(): ReactNode {
  return (
    <svg
      width={13}
      height={32}
      viewBox="0 0 14 34"
      fill="none"
      className="absolute -top-[12px] right-1 z-10"
    >
      <path
        d="M7 0 V7 Q7 10 4 10 Q1 10 1 13 V25 Q1 30 5 30 Q9 30 9 25 V11 Q9 8.5 7 8.5 Q5 8.5 5 11 V21"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        className="text-foreground"
      />
    </svg>
  );
}

export function NeuralWebButton(): ReactNode {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => navigate('/profile')}
      className="group relative -rotate-3 origin-top-right active:scale-[0.97] active:origin-top-right transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-b-sm"
      aria-label={t('home.showProfile', 'Show cognitive profile')}
    >
      <Paperclip />

      {/* Card */}
      <div
        className="relative rounded-b-[3px] border border-t-0 border-foreground/20 bg-background group-hover:bg-foreground/[0.04] transition-colors overflow-hidden"
        style={{ width: 52, height: 68 }}
      >
        <div className="px-1.5 pt-2">
          {/* Row 1: brain "photo" + title lines */}
          <div className="flex items-start gap-1.5">
            {/* Brain in a tiny bordered square — like a photo */}
            <div className="shrink-0 flex items-center justify-center w-4 h-4 rounded-[2px] border border-foreground/15 bg-foreground/[0.05]">
              <Brain size={10} weight="duotone" className="text-foreground/70" />
            </div>
            {/* Title lines */}
            <div className="flex-1 flex flex-col gap-[3px] pt-0.5">
              <div className="h-[2.5px] rounded-full bg-foreground/25 w-full" />
              <div className="h-[2px] rounded-full bg-foreground/15 w-3/4" />
            </div>
          </div>

          {/* Separator */}
          <div className="mt-2 h-px bg-foreground/10" />

          {/* Text lines */}
          <div className="mt-1.5 flex flex-col gap-[3px]">
            <div className="h-[2px] rounded-full bg-foreground/12 w-full" />
            <div className="h-[2px] rounded-full bg-foreground/12 w-full" />
            <div className="h-[2px] rounded-full bg-foreground/10 w-4/5" />
          </div>

          {/* Mini bar chart — 4 tiny bars */}
          <div className="mt-2 flex items-end gap-[3px] h-3">
            <div className="flex-1 rounded-t-[1px] bg-foreground/15" style={{ height: '60%' }} />
            <div className="flex-1 rounded-t-[1px] bg-foreground/15" style={{ height: '100%' }} />
            <div className="flex-1 rounded-t-[1px] bg-foreground/15" style={{ height: '40%' }} />
            <div className="flex-1 rounded-t-[1px] bg-foreground/15" style={{ height: '75%' }} />
          </div>
        </div>
      </div>
    </button>
  );
}
