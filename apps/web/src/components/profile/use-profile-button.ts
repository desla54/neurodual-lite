/**
 * Controller Hook for GlobalProfileButton
 * Handles visibility logic
 */

import { useLocation } from 'react-router';

export function useProfileButton() {
  const location = useLocation();
  const pathname = location.pathname;

  // Hide when playing or on auth page
  const isGamePage =
    pathname === '/nback' ||
    pathname === '/dual-memo' ||
    pathname === '/dual-place' ||
    pathname === '/dual-pick' ||
    pathname === '/dual-trace';
  const isAuthPage = pathname === '/auth';
  const isTutorialPage = pathname === '/tutorial' || pathname.startsWith('/tutorial/');
  const shouldHide = isGamePage || isAuthPage || isTutorialPage;

  return {
    shouldHide,
  };
}
