import { useEffect } from 'react';
import { useCommandBus } from '../../providers';
import { useCurrentUser } from '@neurodual/ui';
import { bindSynergyCommandBus, hydrateSynergyStore } from '../../stores/synergy-store';

export function SynergyLoopSync(): null {
  const commandBus = useCommandBus();
  const user = useCurrentUser();
  const userId = user?.user?.id ?? null;

  useEffect(() => {
    const getUserId = () => userId ?? 'local';
    bindSynergyCommandBus(commandBus, getUserId);
    if (!commandBus?.readStream) {
      return () => {
        bindSynergyCommandBus(null);
      };
    }

    void hydrateSynergyStore();

    return () => {
      bindSynergyCommandBus(null);
    };
  }, [commandBus, userId]);

  return null;
}
