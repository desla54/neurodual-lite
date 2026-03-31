export function normalizeEffectiveUserIds(userIds: readonly string[]): string[] {
  const sanitized = userIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (sanitized.length === 0) return ['local'];
  return Array.from(new Set(sanitized));
}

export function effectiveUserIdsWithLocal(userId: string | null | undefined): string[] {
  return normalizeEffectiveUserIds(userId ? [userId, 'local'] : ['local']);
}
