/**
 * useLastPlayedMode
 *
 * Reactive latest completed mode sourced from the read-model adapter.
 */

import { getReadModelsAdapter, useCurrentUser, useSubscribable } from '@neurodual/ui';
import type { GameModeId } from '../lib/mode-metadata';

export function useLastPlayedMode(): GameModeId | null {
  const currentUser = useCurrentUser();
  const snapshot = useSubscribable(
    getReadModelsAdapter().lastPlayedMode(currentUser?.user.id ?? null),
  );
  const row = Array.isArray(snapshot.data)
    ? (snapshot.data[0] as { game_mode?: GameModeId | null } | undefined)
    : undefined;
  return row?.game_mode ?? null;
}
