import { useMountEffect } from '@neurodual/ui';
import { useEffectEvent } from 'react';

interface UseEnterCommitHotkeyOptions {
  readonly phase: string;
  readonly activePhase: string;
  readonly onCommit: () => void;
}

export function useEnterCommitHotkey({
  phase,
  activePhase,
  onCommit,
}: UseEnterCommitHotkeyOptions): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Enter' || phase !== activePhase) return;
    event.preventDefault();
    onCommit();
  });

  useMountEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
}
