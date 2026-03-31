/**
 * SectionRenderer - Interprets ModeSpec.report.sections
 *
 * Maps semantic section IDs from the Spec to React components.
 * The Spec defines WHAT to show, this renderer defines HOW to show it.
 *
 * Note: HERO and NEXT_STEP require special props (callbacks) and should be
 * rendered directly by UnifiedSessionReport, not through this generic renderer.
 *
 * Design: All sections are rendered with consistent width (w-full).
 */

import type { ReactNode } from 'react';
import type { ReportSectionId } from '@neurodual/logic';
import type { SessionEndReportModel, ContextualMessage } from '@neurodual/logic';
import type { ReportLabels, ModeColors } from './types';

import { ReportTrend } from './report-trend';
import { ReportPerformance } from './report-performance';
import { ReportErrorProfile } from './report-error-profile';
import { ReportInsights } from './report-insights';
import { ReportSpeed } from './report-speed';
import { ReportRewardProgress } from './report-reward-progress';
import { ReportDetails } from './report-details';

// =============================================================================
// Types
// =============================================================================

export interface SectionRendererProps {
  readonly sections: readonly ReportSectionId[];
  readonly data: SessionEndReportModel;
  readonly message: ContextualMessage;
  readonly labels: ReportLabels;
  readonly modeColors: ModeColors;
}

// =============================================================================
// Section Registry
// =============================================================================

/**
 * Renders a single section by its ID.
 * Returns null if the section should not be displayed (e.g., no data)
 * or requires special handling (HERO, NEXT_STEP).
 */
function renderSection(
  sectionId: ReportSectionId,
  props: Omit<SectionRendererProps, 'sections'>,
): ReactNode {
  const { data, labels, modeColors } = props;

  switch (sectionId) {
    // HERO, NEXT_STEP, and CONFIDENCE_BREAKDOWN require special handling
    // They are rendered directly by UnifiedSessionReport (special layout, callbacks, or data checks)
    case 'HERO':
    case 'NEXT_STEP':
    case 'CONFIDENCE_BREAKDOWN':
      return null;

    case 'PERFORMANCE':
      return <ReportPerformance data={data} labels={labels} />;

    case 'ERROR_PROFILE':
      return <ReportErrorProfile data={data} labels={labels} />;

    case 'INSIGHTS':
      return <ReportInsights data={data} labels={labels} modeColors={modeColors} />;

    case 'SPEED':
      return <ReportSpeed data={data} labels={labels} />;

    case 'DETAILS':
      return <ReportDetails data={data} labels={labels} />;

    case 'RECENT_TREND':
      return <ReportTrend data={data} labels={labels} />;

    case 'REWARD_INDICATOR':
      return <ReportRewardProgress labels={labels} />;

    default: {
      // Exhaustive check - TypeScript will error if a new section is added without handling
      const _exhaustiveCheck: never = sectionId;
      console.warn(`Unknown section ID: ${_exhaustiveCheck}`);
      return null;
    }
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * Renders all sections defined in the Spec in order.
 *
 * The Spec is the "communication contract" - it defines which sections
 * to display and in what order. This component interprets that contract.
 *
 * All sections are wrapped with consistent styling for uniform layout.
 */
export function SectionRenderer({
  sections,
  data,
  message,
  labels,
  modeColors,
}: SectionRendererProps): ReactNode {
  return (
    <div className="space-y-4">
      {sections.map((sectionId) => {
        const element = renderSection(sectionId, { data, message, labels, modeColors });
        // Skip null elements (sections that have no data to display)
        if (element === null) return null;
        return (
          <div key={sectionId} className="w-full">
            {element}
          </div>
        );
      })}
    </div>
  );
}
