/**
 * App router configuration with code splitting.
 * NeuroDual Lite — only 3 training modes: nback (brainworkshop + dualnback-classic), stroop, stroop-flex
 */

import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { Spinner } from '@neurodual/ui';
import { AppFrame } from './layouts/app-frame';
import { MainLayout } from './layouts/main-layout';
import { RouteErrorBoundary } from './components/route-error-boundary';

// Primary tabs are loaded eagerly so tab switches stay app-like.
import { HomePage } from './pages/home';
import { SocialPage } from './pages/social';
import { StatsPage } from './pages/stats';
import { SettingsPage } from './pages/settings';
import { TutorialHubPage } from './pages/tutorial-hub';

const loadNbackTrainingPage = () =>
  import('./pages/nback-training').then((m) => ({ default: m.NbackTrainingPage }));
const loadStroopTrainingPage = () =>
  import('./pages/stroop-training').then((m) => ({ default: m.StroopTrainingPage }));
const loadStroopFlexTrainingPage = () =>
  import('./pages/stroop-training').then((m) => ({ default: m.StroopFlexTrainingPage }));
const loadOspanTrainingPage = () =>
  import('./pages/ospan-training').then((m) => ({ default: m.OspanTrainingPage }));
const loadGridlockTrainingPage = () =>
  import('./pages/gridlock-training').then((m) => ({ default: m.GridlockTrainingPage }));
const loadDualMixTrainingPage = () =>
  import('./pages/dual-mix-training').then((m) => ({ default: m.DualMixTrainingPage }));
const loadOspanMeasurePage = () =>
  import('./pages/ospan-measure').then((m) => ({ default: m.OspanMeasurePage }));
const loadTutorialGuidedPage = () =>
  import('./pages/tutorial-guided').then((m) => ({ default: m.TutorialGuidedPage }));

// Lazy load training pages — only the 3 kept modes
const NbackTrainingPage = lazy(loadNbackTrainingPage);
const StroopTrainingPage = lazy(loadStroopTrainingPage);
const StroopFlexTrainingPage = lazy(loadStroopFlexTrainingPage);
const OspanTrainingPage = lazy(loadOspanTrainingPage);
const GridlockTrainingPage = lazy(loadGridlockTrainingPage);
const DualMixTrainingPage = lazy(loadDualMixTrainingPage);
const OspanMeasurePage = lazy(loadOspanMeasurePage);

// Tutorial session stays lazy — it's full-screen and heavier than the hub.
const TutorialGuidedPage = lazy(loadTutorialGuidedPage);

let fullscreenPreloadPromise: Promise<unknown> | null = null;

export function preloadFullscreenRoutes(): Promise<unknown> {
  if (fullscreenPreloadPromise) {
    return fullscreenPreloadPromise;
  }

  fullscreenPreloadPromise = Promise.allSettled([
    loadNbackTrainingPage(),
    loadStroopTrainingPage(),
    loadStroopFlexTrainingPage(),
    loadOspanTrainingPage(),
    loadGridlockTrainingPage(),
    loadDualMixTrainingPage(),
    loadOspanMeasurePage(),
    loadTutorialGuidedPage(),
  ]);

  return fullscreenPreloadPromise;
}

// Minimal loading fallback
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size={32} className="text-white" />
    </div>
  );
}

// Wrap lazy component with Suspense
function withSuspense(Component: React.LazyExoticComponent<React.ComponentType>) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppFrame />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { index: true, element: <HomePage /> },
          // N-back (serves brainworkshop DNB + dualnback-classic via ?mode= param)
          { path: 'nback', element: withSuspense(NbackTrainingPage) },
          // Stroop modes
          { path: 'stroop', element: withSuspense(StroopTrainingPage) },
          { path: 'stroop-flex', element: withSuspense(StroopFlexTrainingPage) },
          // OSPAN (Operation Span)
          { path: 'ospan', element: withSuspense(OspanTrainingPage) },
          // Gridlock (spatial reasoning)
          { path: 'gridlock', element: withSuspense(GridlockTrainingPage) },
          // Dual Mix (composite: N-Back + Stroop + Gridlock)
          { path: 'dual-mix', element: withSuspense(DualMixTrainingPage) },
          { path: 'ospan-measure', element: withSuspense(OspanMeasurePage) },
          // Tutorial
          { path: 'tutorial', element: <TutorialHubPage /> },
          { path: 'tutorial/:specId', element: withSuspense(TutorialGuidedPage) },
          // Social
          { path: 'social', element: <SocialPage /> },
          // Utility pages
          { path: 'stats', element: <StatsPage /> },
          { path: 'settings/:section?/:subSection?', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
