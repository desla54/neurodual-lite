import { Fragment } from 'react';
import { PWAInstallPrompt } from './pwa-install-prompt';
import { PWAUpdatePrompt } from './pwa-update-prompt';

export function PWAPrompts() {
  return (
    <Fragment>
      <PWAInstallPrompt />
      <PWAUpdatePrompt />
    </Fragment>
  );
}
