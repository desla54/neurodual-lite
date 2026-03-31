/**
 * AnnotationZone Component
 *
 * Fixed position annotation zone for tutorial text.
 * Uses "Woven Ink" design with fade transitions.
 *
 * DESIGN CONSTRAINTS (from spec):
 * - NO popups, spotlights, or toasts
 * - Fixed zone with paper/woven texture styling
 * - Fade-in/fade-out on key change
 */

import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMountEffect } from '../hooks';

export interface AnnotationZoneProps {
  /** i18n key for the annotation text */
  annotationKey: string;
  /** Optional className for styling overrides */
  className?: string;
}

/**
 * Fixed annotation zone with fade transitions.
 *
 * Displays translated text from the given i18n key.
 * Animates text changes with a cross-fade effect.
 */
export function AnnotationZone({ annotationKey, className = '' }: AnnotationZoneProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Track previous key to detect changes
  const [displayedKey, setDisplayedKey] = useState(annotationKey);
  const previousKeyRef = useRef(annotationKey);
  const initializedRef = useRef(false);

  // Handle key changes with fade animation
  useEffect(() => {
    if (annotationKey === previousKeyRef.current) return;

    const textEl = textRef.current;
    if (!textEl) {
      previousKeyRef.current = annotationKey;
      setDisplayedKey(annotationKey);
      return;
    }

    // Fade out, change text, fade in
    gsap.to(textEl, {
      opacity: 0,
      y: -5,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => {
        previousKeyRef.current = annotationKey;
        setDisplayedKey(annotationKey);
        gsap.fromTo(
          textEl,
          { opacity: 0, y: 5 },
          { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
        );
      },
    });
  }, [annotationKey]);

  // Initial fade in
  useMountEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.5, ease: 'power2.out' },
      );
    }
  });

  // Get translated text
  const text = t(displayedKey, { defaultValue: '' });

  return (
    <div
      ref={containerRef}
      className={
        `relative mx-4 px-4 py-3 sm:px-5 sm:py-4 ` +
        `bg-woven-surface/95 border border-woven-border rounded-2xl ` +
        `shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)] ` +
        `backdrop-blur-sm ` +
        `border-l-4 border-l-amber-500 ` +
        className
      }
    >
      <div className="absolute inset-0 rounded-2xl opacity-[0.06] pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--woven-border)/0.25),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex items-center justify-center gap-2 mb-2">
        <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-700">
          {t('tutorial.annotation.label', 'Consigne')}
        </span>
        <span className="h-px flex-1 bg-woven-border/60" />
      </div>

      {/* Annotation text - larger, readable size */}
      <p
        ref={textRef}
        className="
          relative z-10
          min-h-[3.5rem]
          flex items-center justify-center
          text-base sm:text-lg
          text-woven-text
          font-medium leading-relaxed
          text-center
        "
      >
        {text || ''}
      </p>
    </div>
  );
}
