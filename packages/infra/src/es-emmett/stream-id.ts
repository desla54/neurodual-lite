export const SESSION_STREAM_PREFIX = 'session:';
export const LEGACY_SESSION_STREAM_PREFIX = 'training:session:';

export function formatSessionStreamId(sessionId: string): string {
  return `${SESSION_STREAM_PREFIX}${sessionId}`;
}

export function isSessionStreamId(streamId: string): boolean {
  return (
    streamId.startsWith(SESSION_STREAM_PREFIX) || streamId.startsWith(LEGACY_SESSION_STREAM_PREFIX)
  );
}

export function parseSessionIdFromStreamId(streamId: string): string | null {
  if (streamId.startsWith(SESSION_STREAM_PREFIX)) {
    return streamId.slice(SESSION_STREAM_PREFIX.length);
  }
  if (streamId.startsWith(LEGACY_SESSION_STREAM_PREFIX)) {
    return streamId.slice(LEGACY_SESSION_STREAM_PREFIX.length);
  }
  return null;
}

export function sessionStreamIdSql(column: string = 'stream_id'): string {
  return `CASE
    WHEN ${column} LIKE 'training:session:%' THEN substr(${column}, 18)
    WHEN ${column} LIKE 'session:%' THEN substr(${column}, 9)
    ELSE NULL
  END`;
}

export function sessionStreamFilterSql(column: string = 'stream_id'): string {
  return `(${column} LIKE 'session:%' OR ${column} LIKE 'training:session:%')`;
}

export function sessionStreamEqualsSql(column: string = 'stream_id'): string {
  return `(${column} = 'session:' || ? OR ${column} = 'training:session:' || ?)`;
}
