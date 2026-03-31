export { TutorialEngine, type TutorialEngineProps } from './TutorialEngine';

export {
  useTutorialLayout,
  calculateTutorialLayout,
  type TutorialLayoutDimensions,
  type ViewportDimensions,
} from './hooks/use-tutorial-layout';

export { useTutorialSession, type UseTutorialSessionReturn } from './use-tutorial-session';

export { AnnotationZone, type AnnotationZoneProps } from './AnnotationZone';
export { TutorialHub } from './tutorial-hub';
export { GsapTimeline, type GsapTimelineHandle } from './gsap-timeline';
export {
  SpotlightOverlay,
  type SpotlightStep,
  type SpotlightOverlayProps,
} from './SpotlightOverlay';
export type { TimelineItem } from './types';

export { TutorialAnimator, tutorialAnimator } from './TutorialAnimator';
export { TutorialReport } from './tutorial-report';

export {
  TutorialLevelsPostlude,
  type TutorialLevelsPostludeProps,
} from './tutorial-levels-postlude';
