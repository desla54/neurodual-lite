import { useLocation } from 'react-router';

export type ReportVariant = 'stable' | 'beta';

/**
 * Report variant is route-scoped:
 * - `/beta/...` => beta report variant
 * - anything else => stable report variant
 */
export function useReportVariant(): ReportVariant {
  const location = useLocation();
  return location.pathname.startsWith('/beta/') ? 'beta' : 'stable';
}
