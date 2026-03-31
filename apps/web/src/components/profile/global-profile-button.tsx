/**
 * GlobalProfileButton - Floating profile button wrapper
 * Positioned top-right, hides when playing
 * Nordic design system
 */

import type { ReactNode } from 'react';
import { ProfileButton } from './profile-button';
import { useProfileButton } from './use-profile-button';

export function GlobalProfileButton(): ReactNode {
  const { shouldHide } = useProfileButton();

  if (shouldHide) {
    return null;
  }

  return (
    <div className="shrink-0 animate-in fade-in duration-300">
      <ProfileButton compact chrome="embedded" />
    </div>
  );
}
