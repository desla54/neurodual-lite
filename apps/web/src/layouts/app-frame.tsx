import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { LandscapeBlocker } from '../components/landscape-blocker';

export function AppFrame(): ReactNode {
  return (
    <>
      <Outlet />
      <LandscapeBlocker />
    </>
  );
}
