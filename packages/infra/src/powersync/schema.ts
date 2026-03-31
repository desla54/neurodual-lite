/**
 * PowerSync schema types stub (NeuroDual Lite)
 */

export interface PowerSyncEventSignalRow {
  id: string;
  type: string;
  stream_id: string;
  session_id: string;
  data: string;
  metadata: string;
  created: string;
  global_position: number;
  deleted?: unknown;
}
