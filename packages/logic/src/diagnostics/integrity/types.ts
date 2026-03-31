export type IntegrityStatus = 'ok' | 'warning' | 'error';

export interface IntegrityCheck {
  readonly name: string;
  readonly description: string;
  readonly status: IntegrityStatus;
  readonly message?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface EventCounts {
  readonly total: number;
  readonly byType: Record<string, number>;
}

export interface RecalculatedStats {
  readonly trialsPresented: number;
  readonly userResponses: number;

  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;

  readonly accuracy: number;
  readonly dPrime: number | null;

  readonly durationMs: number;
  readonly avgReactionTimeMs: number | null;
}

export interface IntegrityReport {
  readonly reportId: string;
  readonly generatedAt: number;
  readonly sessionId: string;
  readonly sessionType: 'flow' | 'memo' | 'unknown';
  readonly nLevel: number;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly completed: boolean;
  readonly eventCounts: EventCounts;
  readonly recalculatedStats: RecalculatedStats;
  readonly checks: IntegrityCheck[];
  readonly overallStatus: IntegrityStatus;
  readonly summary: string;
}

export interface IntegrityReportSummary {
  readonly reportId: string;
  readonly sessionId: string;
  readonly sessionType: IntegrityReport['sessionType'];
  readonly nLevel: number;
  readonly generatedAt: number;
  readonly overallStatus: IntegrityStatus;
  readonly checksCount: number;
  readonly failedChecksCount: number;
}
