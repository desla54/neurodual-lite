/**
 * Event Columns Configuration
 *
 * Defines column groups and individual columns for the Events Data Grid.
 * Supports all game modes: Tempo, Flow, Recall, DualPick, Trace.
 */

import type { GameEvent } from '@neurodual/logic';
import type { ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

export type SessionMode = 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'trace';

export interface ColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  width: string;
  align?: 'left' | 'center' | 'right';
  render: (event: GameEvent, startTime: number) => ReactNode;
}

export interface ColumnGroup {
  id: string;
  label: string;
  columns: ColumnDef[];
  defaultExpanded: boolean;
  /** Modes where this group is relevant */
  modes: SessionMode[] | 'all';
}

// =============================================================================
// Event Type Detection
// =============================================================================

export function getEventMode(type: string): SessionMode {
  if (type.startsWith('FLOW_')) return 'flow';
  if (type.startsWith('RECALL_')) return 'recall';
  if (type.startsWith('DUAL_PICK_')) return 'dual-pick';
  if (type.startsWith('TRACE_')) return 'trace';
  return 'tempo';
}

export function getSessionMode(events: readonly GameEvent[]): SessionMode {
  const startEvent = events.find(
    (e) =>
      e.type === 'SESSION_STARTED' ||
      e.type === 'FLOW_SESSION_STARTED' ||
      e.type === 'RECALL_SESSION_STARTED' ||
      e.type === 'DUAL_PICK_SESSION_STARTED' ||
      e.type === 'TRACE_SESSION_STARTED',
  );
  return startEvent ? getEventMode(startEvent.type) : 'tempo';
}

// =============================================================================
// Event Type Colors & Labels
// =============================================================================

export const EVENT_COLORS: Record<string, string> = {
  // Tempo
  SESSION_STARTED: 'bg-emerald-500',
  SESSION_ENDED: 'bg-red-500',
  TRIAL_PRESENTED: 'bg-amber-500',
  USER_RESPONDED: 'bg-purple-500',
  DUPLICATE_RESPONSE_DETECTED: 'bg-purple-300',
  INPUT_MISFIRED: 'bg-orange-500',
  FOCUS_LOST: 'bg-red-400',
  FOCUS_REGAINED: 'bg-green-400',
  USER_STATE_DECLARED: 'bg-blue-500',
  SESSION_PAUSED: 'bg-gray-500',
  SESSION_RESUMED: 'bg-gray-400',
  SESSION_IMPORTED: 'bg-cyan-500',

  // Flow
  FLOW_SESSION_STARTED: 'bg-emerald-500',
  FLOW_SESSION_ENDED: 'bg-red-500',
  FLOW_STIMULUS_SHOWN: 'bg-amber-500',
  FLOW_PLACEMENT_STARTED: 'bg-blue-400',
  FLOW_DROP_ATTEMPTED: 'bg-purple-500',
  FLOW_DRAG_CANCELLED: 'bg-orange-400',
  FLOW_TURN_COMPLETED: 'bg-green-500',

  // Recall
  RECALL_SESSION_STARTED: 'bg-emerald-500',
  RECALL_SESSION_ENDED: 'bg-red-500',
  RECALL_STIMULUS_SHOWN: 'bg-amber-500',
  RECALL_STIMULUS_HIDDEN: 'bg-amber-300',
  RECALL_WINDOW_OPENED: 'bg-blue-400',
  RECALL_PICKED: 'bg-purple-500',
  RECALL_WINDOW_COMMITTED: 'bg-green-500',
  RECALL_CORRECTION_SHOWN: 'bg-pink-400',
  RECALL_PARAMS_UPDATED: 'bg-cyan-400',

  // Dual Label
  DUAL_PICK_SESSION_STARTED: 'bg-emerald-500',
  DUAL_PICK_SESSION_ENDED: 'bg-red-500',
  DUAL_PICK_STIMULUS_SHOWN: 'bg-amber-500',
  DUAL_PICK_PLACEMENT_STARTED: 'bg-blue-400',
  DUAL_PICK_DROP_ATTEMPTED: 'bg-purple-500',
  DUAL_PICK_TURN_COMPLETED: 'bg-green-500',

  // Trace
  TRACE_SESSION_STARTED: 'bg-emerald-500',
  TRACE_SESSION_ENDED: 'bg-red-500',
  TRACE_STIMULUS_SHOWN: 'bg-amber-500',
  TRACE_STIMULUS_HIDDEN: 'bg-amber-300',
  TRACE_RESPONDED: 'bg-purple-500',
  TRACE_TIMED_OUT: 'bg-orange-500',
  TRACE_PAUSED: 'bg-gray-500',
  TRACE_RESUMED: 'bg-gray-400',
  TRACE_WRITING_STARTED: 'bg-blue-400',
  TRACE_WRITING_COMPLETED: 'bg-green-500',
  TRACE_WRITING_TIMEOUT: 'bg-orange-400',
};

export const EVENT_SHORT_LABELS: Record<string, string> = {
  // Tempo
  SESSION_STARTED: 'START',
  SESSION_ENDED: 'END',
  TRIAL_PRESENTED: 'TRIAL',
  USER_RESPONDED: 'RESP',
  DUPLICATE_RESPONSE_DETECTED: 'DUP',
  INPUT_MISFIRED: 'MISFIRE',
  FOCUS_LOST: 'BLUR',
  FOCUS_REGAINED: 'FOCUS',
  USER_STATE_DECLARED: 'STATE',
  SESSION_PAUSED: 'PAUSE',
  SESSION_RESUMED: 'RESUME',
  SESSION_IMPORTED: 'IMPORT',

  // Flow
  FLOW_SESSION_STARTED: 'START',
  FLOW_SESSION_ENDED: 'END',
  FLOW_STIMULUS_SHOWN: 'STIM',
  FLOW_PLACEMENT_STARTED: 'PLACE',
  FLOW_DROP_ATTEMPTED: 'DROP',
  FLOW_DRAG_CANCELLED: 'CANCEL',
  FLOW_TURN_COMPLETED: 'DONE',

  // Recall
  RECALL_SESSION_STARTED: 'START',
  RECALL_SESSION_ENDED: 'END',
  RECALL_STIMULUS_SHOWN: 'STIM',
  RECALL_STIMULUS_HIDDEN: 'HIDE',
  RECALL_WINDOW_OPENED: 'WINDOW',
  RECALL_PICKED: 'PICK',
  RECALL_WINDOW_COMMITTED: 'COMMIT',
  RECALL_CORRECTION_SHOWN: 'CORRECT',
  RECALL_PARAMS_UPDATED: 'PARAMS',

  // Dual Label
  DUAL_PICK_SESSION_STARTED: 'START',
  DUAL_PICK_SESSION_ENDED: 'END',
  DUAL_PICK_STIMULUS_SHOWN: 'STIM',
  DUAL_PICK_PLACEMENT_STARTED: 'PLACE',
  DUAL_PICK_DROP_ATTEMPTED: 'DROP',
  DUAL_PICK_TURN_COMPLETED: 'DONE',

  // Trace
  TRACE_SESSION_STARTED: 'START',
  TRACE_SESSION_ENDED: 'END',
  TRACE_STIMULUS_SHOWN: 'STIM',
  TRACE_STIMULUS_HIDDEN: 'HIDE',
  TRACE_RESPONDED: 'RESP',
  TRACE_TIMED_OUT: 'TIMEOUT',
  TRACE_PAUSED: 'PAUSE',
  TRACE_RESUMED: 'RESUME',
  TRACE_WRITING_STARTED: 'WRITE',
  TRACE_WRITING_COMPLETED: 'WROTE',
  TRACE_WRITING_TIMEOUT: 'W-TOUT',
};

// =============================================================================
// Helper Functions
// =============================================================================

function formatTime(timestamp: number, startTime: number): string {
  const delta = (timestamp - startTime) / 1000;
  return `+${delta.toFixed(2)}s`;
}

function formatMs(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '-';
  return `${Math.round(ms)}ms`;
}

function formatBool(value: boolean | undefined): string {
  if (value === undefined) return '-';
  return value ? '✓' : '✗';
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// =============================================================================
// Column Definitions
// =============================================================================

/** Core columns - always visible */
export const CORE_COLUMNS: ColumnDef[] = [
  {
    key: 'time',
    label: '+Time',
    shortLabel: '+T',
    width: '70px',
    align: 'right',
    render: (event, startTime) => formatTime(event.timestamp, startTime),
  },
  {
    key: 'type',
    label: 'Type',
    width: '80px',
    align: 'center',
    render: (event) => EVENT_SHORT_LABELS[event.type] ?? event.type.slice(0, 8),
  },
  {
    key: 'trial',
    label: 'Trial',
    width: '50px',
    align: 'center',
    render: (event) => {
      const trialIndex =
        getNestedValue(event, 'trialIndex') ?? getNestedValue(event, 'trial.index');
      return trialIndex !== undefined ? `#${trialIndex}` : '-';
    },
  },
];

/** Response group - modality, value, correct, RT */
export const RESPONSE_COLUMNS: ColumnDef[] = [
  {
    key: 'modality',
    label: 'Modality',
    shortLabel: 'Mod',
    width: '60px',
    align: 'center',
    render: (event) => {
      const mod =
        getNestedValue(event, 'modality') ??
        getNestedValue(event, 'proposalType') ??
        getNestedValue(event, 'pick.modality');
      if (!mod) return '-';
      return mod === 'position'
        ? 'POS'
        : mod === 'audio'
          ? 'AUD'
          : String(mod).slice(0, 3).toUpperCase();
    },
  },
  {
    key: 'value',
    label: 'Value',
    width: '80px',
    align: 'center',
    render: (event) => {
      // Position/Sound for TRIAL_PRESENTED
      if (event.type === 'TRIAL_PRESENTED') {
        const trial = (event as { trial?: { position?: number; sound?: string } }).trial;
        if (trial) {
          return `P:${trial.position ?? '-'} S:${trial.sound ?? '-'}`;
        }
      }
      // Stimulus events
      const pos = getNestedValue(event, 'position');
      const sound = getNestedValue(event, 'sound');
      if (pos !== undefined || sound !== undefined) {
        return `P:${pos ?? '-'} S:${sound ?? '-'}`;
      }
      // Response position
      if (getNestedValue(event, 'responseType')) {
        const respPos = getNestedValue(event, 'position');
        return respPos !== null ? `P:${respPos}` : 'skip';
      }
      // Pick value
      const pickValue = getNestedValue(event, 'pick.value');
      if (pickValue !== undefined) return String(pickValue);
      // Proposal value
      const proposalValue = getNestedValue(event, 'proposalValue');
      if (proposalValue !== undefined) return String(proposalValue);
      return '-';
    },
  },
  {
    key: 'correct',
    label: 'OK?',
    width: '40px',
    align: 'center',
    render: (event) => {
      const correct = getNestedValue(event, 'correct') ?? getNestedValue(event, 'isCorrect');
      return formatBool(correct as boolean | undefined);
    },
  },
  {
    key: 'rt',
    label: 'RT',
    width: '70px',
    align: 'right',
    render: (event) => {
      const rt =
        getNestedValue(event, 'reactionTimeMs') ??
        getNestedValue(event, 'responseTimeMs') ??
        getNestedValue(event, 'placementTimeMs');
      return formatMs(rt as number | undefined);
    },
  },
];

/** Timing group */
export const TIMING_COLUMNS: ColumnDef[] = [
  {
    key: 'stimulusDuration',
    label: 'Stim Dur',
    width: '70px',
    align: 'right',
    render: (event) => formatMs(getNestedValue(event, 'stimulusDurationMs') as number | undefined),
  },
  {
    key: 'isi',
    label: 'ISI',
    width: '60px',
    align: 'right',
    render: (event) => formatMs(getNestedValue(event, 'isiMs') as number | undefined),
  },
  {
    key: 'turnDuration',
    label: 'Turn Dur',
    width: '70px',
    align: 'right',
    render: (event) => formatMs(getNestedValue(event, 'turnDurationMs') as number | undefined),
  },
];

/** Input group */
export const INPUT_COLUMNS: ColumnDef[] = [
  {
    key: 'inputMethod',
    label: 'Input',
    width: '60px',
    align: 'center',
    render: (event) => {
      const method = getNestedValue(event, 'inputMethod') as string | undefined;
      if (!method) return '-';
      const icons: Record<string, string> = {
        keyboard: 'KB',
        mouse: 'M',
        touch: 'T',
        gamepad: 'GP',
      };
      return icons[method] ?? method.slice(0, 2).toUpperCase();
    },
  },
  {
    key: 'responsePhase',
    label: 'Phase',
    width: '60px',
    align: 'center',
    render: (event) => {
      const phase = getNestedValue(event, 'responsePhase') as string | undefined;
      if (!phase) return '-';
      return phase === 'during_stimulus' ? 'DUR' : 'AFT';
    },
  },
  {
    key: 'processingLag',
    label: 'Lag',
    width: '50px',
    align: 'right',
    render: (event) => formatMs(getNestedValue(event, 'processingLagMs') as number | undefined),
  },
  {
    key: 'pressDuration',
    label: 'Press',
    width: '60px',
    align: 'right',
    render: (event) => formatMs(getNestedValue(event, 'pressDurationMs') as number | undefined),
  },
];

/** Trajectory group (Flow/DualPick) */
export const TRAJECTORY_COLUMNS: ColumnDef[] = [
  {
    key: 'targetSlot',
    label: 'Slot',
    width: '50px',
    align: 'center',
    render: (event) => {
      const slot = getNestedValue(event, 'targetSlot') ?? getNestedValue(event, 'slotIndex');
      return slot !== undefined ? String(slot) : '-';
    },
  },
  {
    key: 'dropOrder',
    label: 'Order',
    width: '50px',
    align: 'center',
    render: (event) => {
      const order = getNestedValue(event, 'dropOrder');
      return order !== undefined ? String(order) : '-';
    },
  },
  {
    key: 'totalDistance',
    label: 'Dist',
    width: '60px',
    align: 'right',
    render: (event) => {
      const dist = getNestedValue(event, 'totalDistancePx') as number | undefined;
      return dist !== undefined ? `${Math.round(dist)}px` : '-';
    },
  },
  {
    key: 'directness',
    label: 'Direct',
    width: '60px',
    align: 'right',
    render: (event) => {
      const total = getNestedValue(event, 'totalDistancePx') as number | undefined;
      const direct = getNestedValue(event, 'directDistancePx') as number | undefined;
      if (!total || !direct || total === 0) return '-';
      const ratio = (direct / total) * 100;
      return `${Math.round(ratio)}%`;
    },
  },
];

/** Device group */
export const DEVICE_COLUMNS: ColumnDef[] = [
  {
    key: 'platform',
    label: 'Platform',
    width: '60px',
    align: 'center',
    render: (event) => {
      const platform = getNestedValue(event, 'device.platform') as string | undefined;
      return platform?.toUpperCase() ?? '-';
    },
  },
  {
    key: 'screen',
    label: 'Screen',
    width: '90px',
    align: 'center',
    render: (event) => {
      const w = getNestedValue(event, 'device.screenWidth');
      const h = getNestedValue(event, 'device.screenHeight');
      return w && h ? `${w}x${h}` : '-';
    },
  },
  {
    key: 'touch',
    label: 'Touch',
    width: '50px',
    align: 'center',
    render: (event) =>
      formatBool(getNestedValue(event, 'device.touchCapable') as boolean | undefined),
  },
  {
    key: 'appVersion',
    label: 'Ver',
    width: '60px',
    align: 'center',
    render: (event) => {
      const ver = getNestedValue(event, 'device.appVersion') as string | undefined;
      return ver ?? '-';
    },
  },
];

/** Context group */
export const CONTEXT_COLUMNS: ColumnDef[] = [
  {
    key: 'timeOfDay',
    label: 'ToD',
    width: '60px',
    align: 'center',
    render: (event) => {
      const tod = getNestedValue(event, 'context.timeOfDay') as string | undefined;
      if (!tod) return '-';
      const icons: Record<string, string> = {
        morning: 'AM',
        afternoon: 'PM',
        evening: 'EVE',
        night: 'NIT',
      };
      return icons[tod] ?? tod.slice(0, 3).toUpperCase();
    },
  },
  {
    key: 'localHour',
    label: 'Hour',
    width: '50px',
    align: 'center',
    render: (event) => {
      const hour = getNestedValue(event, 'context.localHour');
      return hour !== undefined ? `${hour}h` : '-';
    },
  },
  {
    key: 'dayOfWeek',
    label: 'Day',
    width: '50px',
    align: 'center',
    render: (event) => {
      const day = getNestedValue(event, 'context.dayOfWeek') as number | undefined;
      if (day === undefined) return '-';
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[day] ?? String(day);
    },
  },
];

// =============================================================================
// Column Groups
// =============================================================================

export const COLUMN_GROUPS: ColumnGroup[] = [
  {
    id: 'core',
    label: 'Core',
    columns: CORE_COLUMNS,
    defaultExpanded: true,
    modes: 'all',
  },
  {
    id: 'response',
    label: 'Response',
    columns: RESPONSE_COLUMNS,
    defaultExpanded: true,
    modes: 'all',
  },
  {
    id: 'timing',
    label: 'Timing',
    columns: TIMING_COLUMNS,
    defaultExpanded: false,
    modes: 'all',
  },
  {
    id: 'input',
    label: 'Input',
    columns: INPUT_COLUMNS,
    defaultExpanded: false,
    modes: ['tempo', 'recall', 'trace'],
  },
  {
    id: 'trajectory',
    label: 'Trajectory',
    columns: TRAJECTORY_COLUMNS,
    defaultExpanded: false,
    modes: ['flow', 'dual-pick', 'recall'],
  },
  {
    id: 'device',
    label: 'Device',
    columns: DEVICE_COLUMNS,
    defaultExpanded: false,
    modes: 'all',
  },
  {
    id: 'context',
    label: 'Context',
    columns: CONTEXT_COLUMNS,
    defaultExpanded: false,
    modes: 'all',
  },
];

/**
 * Get column groups relevant for a given mode
 */
export function getColumnGroupsForMode(mode: SessionMode): ColumnGroup[] {
  return COLUMN_GROUPS.filter((g) => g.modes === 'all' || g.modes.includes(mode));
}

/**
 * Get all visible columns based on expanded groups
 */
export function getVisibleColumns(
  mode: SessionMode,
  expandedGroups: Set<string>,
): { group: ColumnGroup; columns: ColumnDef[] }[] {
  const groups = getColumnGroupsForMode(mode);
  return groups
    .filter((g) => g.id === 'core' || expandedGroups.has(g.id))
    .map((g) => ({ group: g, columns: g.columns }));
}
