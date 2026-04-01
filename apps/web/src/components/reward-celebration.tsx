/**
 * RewardCelebration Component
 *
 * Celebratory animation when user unlocks a Premium reward through XP.
 * Displays confetti, golden overlay, and reward details.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { gsap } from 'gsap';
import { Crown, Gift, Star, X } from '@phosphor-icons/react';
import type { PremiumReward } from '@neurodual/logic';
import { Button, cn, useMountEffect } from '@neurodual/ui';

export interface RewardCelebrationProps {
  /** The reward that was just granted */
  reward: PremiumReward;
  /** Expiration date (null for lifetime) */
  expiresAt: Date | null;
  /** Called when user dismisses the celebration */
  onDismiss: () => void;
}

/**
 * Create confetti particles
 */
function createConfetti(container: HTMLElement): () => void {
  const colors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#A855F7', '#F472B6'];
  const particles: HTMLDivElement[] = [];

  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'absolute w-3 h-3 rounded-full pointer-events-none';
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)] ?? '#FFD700';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = '-20px';
    container.appendChild(particle);
    particles.push(particle);

    gsap.to(particle, {
      y: window.innerHeight + 100,
      x: (Math.random() - 0.5) * 400,
      rotation: Math.random() * 720,
      duration: 2 + Math.random() * 2,
      ease: 'power1.out',
      delay: Math.random() * 0.5,
    });
  }

  return () => {
    for (const particle of particles) {
      particle.remove();
    }
  };
}

export function RewardCelebration({
  reward,
  expiresAt,
  onDismiss,
}: RewardCelebrationProps): React.ReactElement | null {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Format duration text
  const durationText = reward.durationDays
    ? t('rewards.duration', { days: reward.durationDays })
    : t('rewards.lifetimeLabel');

  // Format expiry text
  const expiryText = expiresAt
    ? t('rewards.expiresAt', { date: expiresAt.toLocaleDateString() })
    : t('rewards.neverExpires');

  // Animation on mount
  useMountEffect(() => {
    if (!overlayRef.current || !cardRef.current) return;

    const cleanup = createConfetti(overlayRef.current);

    // Overlay fade in
    gsap.fromTo(
      overlayRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: 'power2.out' },
    );

    // Card entrance
    gsap.fromTo(
      cardRef.current,
      { scale: 0.8, opacity: 0, y: 50 },
      { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)', delay: 0.2 },
    );

    // Star pulse animation
    const stars = cardRef.current.querySelectorAll('.reward-star');
    gsap.fromTo(
      stars,
      { scale: 0, rotation: -180 },
      {
        scale: 1,
        rotation: 0,
        duration: 0.6,
        ease: 'elastic.out(1, 0.5)',
        stagger: 0.1,
        delay: 0.5,
      },
    );

    return cleanup;
  });

  // Dismiss animation
  const handleDismiss = (): void => {
    if (!overlayRef.current || !cardRef.current) {
      onDismiss();
      return;
    }

    gsap.to(cardRef.current, {
      scale: 0.8,
      opacity: 0,
      y: -50,
      duration: 0.3,
      ease: 'power2.in',
    });

    gsap.to(overlayRef.current, {
      opacity: 0,
      duration: 0.3,
      delay: 0.1,
      onComplete: () => {
        setIsVisible(false);
        onDismiss();
      },
    });
  };

  if (!isVisible) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleDismiss}
      onKeyDown={(e) => e.key === 'Escape' && handleDismiss()}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-title"
        className={cn(
          'relative max-w-md mx-4 p-8 rounded-3xl',
          'bg-gradient-to-br from-amber-900/90 via-amber-800/90 to-orange-900/90',
          'border-2 border-amber-400/50 shadow-2xl shadow-amber-500/20',
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-full text-amber-200/70 hover:text-amber-100 hover:bg-amber-700/50 transition-colors"
        >
          <X size={24} weight="bold" />
        </button>

        {/* Stars decoration */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-2">
          <Star className="reward-star text-amber-300" size={32} weight="fill" />
          <Star className="reward-star text-amber-200" size={40} weight="fill" />
          <Star className="reward-star text-amber-300" size={32} weight="fill" />
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-6 mt-4">
          <div className="p-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30">
            {reward.durationDays === null ? (
              <Crown size={48} weight="fill" className="text-amber-900" />
            ) : (
              <Gift size={48} weight="fill" className="text-amber-900" />
            )}
          </div>
        </div>

        {/* Title */}
        <h2 id="reward-title" className="text-2xl font-bold text-center text-amber-100 mb-2">
          {t('rewards.congratulations')}
        </h2>

        {/* Reward name */}
        <p className="text-xl font-semibold text-center text-amber-200 mb-4">{t(reward.nameKey)}</p>

        {/* Description */}
        <p className="text-center text-amber-100/80 mb-6">{t(reward.descriptionKey)}</p>

        {/* Duration badge */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-200 font-medium">
            {durationText}
          </span>
        </div>

        {/* Expiry info */}
        <p className="text-center text-amber-300/70 text-sm mb-6">{expiryText}</p>

        {/* Dismiss button */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleDismiss}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-amber-900 font-bold"
        >
          {t('rewards.continue')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
