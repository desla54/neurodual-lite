/**
 * Report Sections - Atomic components for session reports
 *
 * Each section is a semantic unit driven by ModeSpec.report.sections.
 * The SectionRenderer maps spec IDs to these components.
 */

// Types
export type { ReportLabels, ModeColors, BaseSectionProps } from './types';
export { getModeColors } from './types';

// Section Components
export { ReportHero } from './report-hero';
export type { ReportHeroProps } from './report-hero';

export { ReportTrend } from './report-trend';
export type { ReportTrendProps } from './report-trend';

export { ReportPerformance } from './report-performance';
export type { ReportPerformanceProps } from './report-performance';

export { ReportErrorProfile } from './report-error-profile';
export type { ReportErrorProfileProps } from './report-error-profile';

export { ReportInsights } from './report-insights';
export type { ReportInsightsProps } from './report-insights';

export { ReportSpeed } from './report-speed';
export type { ReportSpeedProps } from './report-speed';

export { ReportDetails } from './report-details';
export type { ReportDetailsProps } from './report-details';

export { ReportRewardProgress } from './report-reward-progress';
export type { ReportRewardProgressProps } from './report-reward-progress';

export { ReportXPSection } from './report-xp-section';
export type { ReportXPSectionProps } from './report-xp-section';

export { ReportXPSummary } from './report-xp-summary';
export type { ReportXPSummaryProps } from './report-xp-summary';

export { ReportPrimaryActions, ReportSecondaryActions } from './report-actions';
export type {
  ReportPrimaryActionsProps,
  ReportSecondaryActionsProps,
} from './report-actions';

export { ProgressionIndicator } from './progression-indicator';
export type { ProgressionIndicatorProps } from './progression-indicator';

export { ReportConfidenceBreakdown } from './report-confidence-breakdown';
export type { ReportConfidenceBreakdownProps } from './report-confidence-breakdown';

// Interpreter
export { SectionRenderer } from './section-renderer';
export type { SectionRendererProps } from './section-renderer';
