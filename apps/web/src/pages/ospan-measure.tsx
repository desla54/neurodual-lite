/**
 * OspanMeasurePage - Fullscreen route for the OSpan working memory measure.
 * Accessible via /ospan-measure. Same layout pattern as cognitive-profile.
 */

import { type ReactNode, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import gsap from 'gsap';
import { useMountEffect } from '@neurodual/ui';
import { OspanMeasure } from '../components/ospan-measure/ospan-measure';

export function OspanMeasurePage(): ReactNode {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    if (!containerRef.current) return;
    gsap.set(containerRef.current, { opacity: 0 });
    gsap.to(containerRef.current, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.out',
    });
  });

  const handleClose = useCallback(() => navigate('/'), [navigate]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-woven-bg overflow-y-auto overflow-x-hidden page-inset-x page-inset-y"
      data-testid="ospan-measure-page"
    >
      <div className="flex-1 flex flex-col items-center md:justify-center md:py-8">
        <OspanMeasure onClose={handleClose} />
      </div>
    </div>
  );
}
