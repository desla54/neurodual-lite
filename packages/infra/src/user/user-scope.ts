export function normalizeEffectiveUserIds(
  userIds: readonly (string | null | undefined)[],
): string[] {
  const sanitized = userIds
    .flatMap((id) => (typeof id === 'string' ? [id.trim()] : []))
    .filter((id) => id.length > 0);

  if (sanitized.length === 0) {
    return ['local'];
  }

  return Array.from(new Set(sanitized));
}

export function effectiveUserIdsWithLocal(userId: string | null | undefined): string[] {
  if (!userId || userId.trim() === '' || userId === 'local') {
    return ['local'];
  }

  return normalizeEffectiveUserIds([userId, 'local']);
}

export function getAuthenticatedUserId(): string | null {
  return null;
}

export function getActiveEffectiveUserIds(): string[] {
  return effectiveUserIdsWithLocal(getAuthenticatedUserId());
}

export function buildProjectionScopeClause(
  columnName: string,
  userIds: readonly string[],
): { clause: string; params: string[] } {
  const effectiveUserIds = normalizeEffectiveUserIds(userIds);
  const placeholders = effectiveUserIds.map(() => '?').join(', ');

  return {
    clause: `${columnName} IN (${placeholders})`,
    params: effectiveUserIds,
  };
}

export function buildSessionSummaryScopeClause(
  columnName: string,
  userIds: readonly string[],
): { clause: string; params: string[] } {
  const effectiveUserIds = normalizeEffectiveUserIds(userIds);
  const placeholders = effectiveUserIds.map(() => '?').join(', ');

  return {
    clause: `${columnName} IN (${placeholders})`,
    params: effectiveUserIds,
  };
}
