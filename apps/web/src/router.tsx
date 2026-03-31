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

// HomePage loaded eagerly (critical path for LCP)
import { HomePage } from './pages/home';

// Lazy load training pages — only the 3 kept modes
const NbackTrainingPage = lazy(() =>
  import('./pages/nback-training').then((m) => ({ default: m.NbackTrainingPage })),
);
const StroopTrainingPage = lazy(() =>
  import('./pages/stroop-training').then((m) => ({ default: m.StroopTrainingPage })),
);
const StroopFlexTrainingPage = lazy(() =>
  import('./pages/stroop-training').then((m) => ({ default: m.StroopFlexTrainingPage })),
);

// Utility pages
const StatsPage = lazy(() => import('./pages/stats').then((m) => ({ default: m.StatsPage })));
const SettingsPage = lazy(() =>
  import('./pages/settings').then((m) => ({ default: m.SettingsPage })),
);

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
          // Utility pages
          { path: 'stats', element: withSuspense(StatsPage) },
          { path: 'settings/:section?/:subSection?', element: withSuspense(SettingsPage) },
        ],
      },
    ],
  },
]);
