/**
 * LandscapeBlocker - Bloque l'app en mode paysage sur mobile
 *
 * Affiche un overlay demandant de tourner l'appareil quand :
 * - L'orientation est paysage
 * - La hauteur est < 500px (indique un mobile, pas un desktop)
 */

import { ArrowCounterClockwise } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsLandscapeAllowed } from '@neurodual/ui';

export function LandscapeBlocker(): ReactNode {
  const { t } = useTranslation();
  const isLandscapeAllowed = useIsLandscapeAllowed();

  if (isLandscapeAllowed) return null;

  // Media query: orientation landscape ET hauteur < 500px (mobile uniquement)
  // [@media(orientation:landscape)_and_(max-height:500px)] est la syntaxe Tailwind pour les media queries arbitraires
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex-col items-center justify-center gap-6 p-8 hidden [@media(orientation:landscape)_and_(max-height:500px)]:flex">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <ArrowCounterClockwise className="w-10 h-10 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-foreground">
          {t('app.landscape.title', 'Mode portrait requis')}
        </h1>
        <p className="text-muted-foreground text-sm max-w-[280px]">
          {t(
            'app.landscape.message',
            "Tourne ton appareil en mode portrait pour utiliser l'application.",
          )}
        </p>
      </div>
    </div>
  );
}
