import { prefersReducedMotion, usePageTransition, type TransitionDirection } from '@neurodual/ui';
import gsap from 'gsap';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { consumeShellNavigationTransition, type ShellNavigationKind } from '../lib/navigation-transitions';

interface RouteTransitionShellProps {
  readonly routeKey: string;
  readonly children: ReactNode;
}

interface OutgoingLayer {
  readonly key: string;
  readonly node: ReactNode;
}

interface ActiveTransition {
  readonly direction: TransitionDirection;
  readonly outgoing: OutgoingLayer;
}

function toDirection(
  armedKind: ShellNavigationKind | null,
  fallbackDirection: TransitionDirection,
): TransitionDirection {
  switch (armedKind) {
    case 'push':
      return 'push';
    case 'back':
      return 'back';
    case 'modal':
      return 'modal';
    case 'tab':
      return 'fade';
    default:
      return fallbackDirection;
  }
}

export function RouteTransitionShell({
  routeKey,
  children,
}: RouteTransitionShellProps): ReactNode {
  const { transitionDirection } = usePageTransition();
  const currentNodeRef = useRef(children);
  const currentKeyRef = useRef(routeKey);
  const [activeTransition, setActiveTransition] = useState<ActiveTransition | null>(null);
  const incomingRef = useRef<HTMLDivElement | null>(null);
  const outgoingRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (currentKeyRef.current === routeKey) {
      currentNodeRef.current = children;
      return;
    }

    const nextDirection = toDirection(consumeShellNavigationTransition(), transitionDirection);
    setActiveTransition({
      direction: nextDirection,
      outgoing: {
        key: currentKeyRef.current,
        node: currentNodeRef.current,
      },
    });
    currentKeyRef.current = routeKey;
    currentNodeRef.current = children;
  }, [children, routeKey, transitionDirection]);

  useLayoutEffect(() => {
    if (!activeTransition) return;

    const incoming = incomingRef.current;
    const outgoing = outgoingRef.current;
    if (!incoming || !outgoing) return;

    gsap.killTweensOf([incoming, outgoing]);

    if (prefersReducedMotion()) {
      gsap.set([incoming, outgoing], { clearProps: 'all' });
      setActiveTransition(null);
      return;
    }

    const complete = () => {
      gsap.set([incoming, outgoing], { clearProps: 'all' });
      setActiveTransition(null);
    };

    let timeline: gsap.core.Timeline;

    switch (activeTransition.direction) {
      case 'modal':
        gsap.set(outgoing, {
          zIndex: 1,
          x: 0,
          y: 0,
          opacity: 1,
          scale: 1,
          force3D: true,
        });
        gsap.set(incoming, {
          zIndex: 2,
          x: 0,
          yPercent: 12,
          opacity: 1,
          force3D: true,
        });
        timeline = gsap.timeline({ onComplete: complete });
        timeline.to(
          outgoing,
          {
            scale: 0.992,
            opacity: 0.98,
            duration: 0.18,
            ease: 'power1.out',
            overwrite: 'auto',
          },
          0,
        );
        timeline.to(
          incoming,
          {
            yPercent: 0,
            duration: 0.36,
            ease: 'power3.out',
            overwrite: 'auto',
          },
          0,
        );
        break;
      case 'push':
        gsap.set(outgoing, {
          zIndex: 1,
          xPercent: 0,
          opacity: 1,
          force3D: true,
        });
        gsap.set(incoming, {
          zIndex: 2,
          xPercent: 22,
          opacity: 1,
          force3D: true,
        });
        timeline = gsap.timeline({ onComplete: complete });
        timeline.to(
          outgoing,
          {
            xPercent: -8,
            opacity: 0.9,
            duration: 0.3,
            ease: 'power2.out',
            overwrite: 'auto',
          },
          0,
        );
        timeline.to(
          incoming,
          {
            xPercent: 0,
            duration: 0.32,
            ease: 'power3.out',
            overwrite: 'auto',
          },
          0,
        );
        break;
      case 'back':
        gsap.set(outgoing, {
          zIndex: 2,
          xPercent: 0,
          opacity: 1,
          force3D: true,
        });
        gsap.set(incoming, {
          zIndex: 1,
          xPercent: -8,
          opacity: 0.94,
          force3D: true,
        });
        timeline = gsap.timeline({ onComplete: complete });
        timeline.to(
          outgoing,
          {
            xPercent: 18,
            opacity: 0.78,
            duration: 0.28,
            ease: 'power2.out',
            overwrite: 'auto',
          },
          0,
        );
        timeline.to(
          incoming,
          {
            xPercent: 0,
            opacity: 1,
            duration: 0.3,
            ease: 'power3.out',
            overwrite: 'auto',
          },
          0,
        );
        break;
      case 'fade':
      case 'default':
      default:
        gsap.set(outgoing, {
          zIndex: 1,
          opacity: 1,
          force3D: true,
        });
        gsap.set(incoming, {
          zIndex: 2,
          opacity: 0,
          y: 8,
          force3D: true,
        });
        timeline = gsap.timeline({ onComplete: complete });
        timeline.to(
          outgoing,
          {
            opacity: 0,
            duration: 0.16,
            ease: 'power1.out',
            overwrite: 'auto',
          },
          0,
        );
        timeline.to(
          incoming,
          {
            opacity: 1,
            y: 0,
            duration: 0.22,
            ease: 'power2.out',
            overwrite: 'auto',
          },
          0.04,
        );
        break;
    }

    return () => {
      timeline.kill();
      gsap.killTweensOf([incoming, outgoing]);
    };
  }, [activeTransition]);

  return (
    <div className="app-route-surface route-transition-shell relative flex flex-1 flex-col overflow-hidden">
      {activeTransition ? (
        <div
          ref={outgoingRef}
          key={`outgoing-${activeTransition.outgoing.key}`}
          className="route-transition-layer absolute inset-0 z-10 flex flex-col pointer-events-none"
          data-route-key={activeTransition.outgoing.key}
        >
          {activeTransition.outgoing.node}
        </div>
      ) : null}
      <div
        ref={incomingRef}
        key={routeKey}
        className={
          activeTransition
            ? 'route-transition-layer absolute inset-0 z-20 flex flex-col'
            : 'route-transition-layer relative flex flex-1 flex-col'
        }
        data-route-key={routeKey}
      >
        {children}
      </div>
    </div>
  );
}
