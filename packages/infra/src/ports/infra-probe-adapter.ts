import type { InfraProbePort } from '@neurodual/logic';
import { isSupabaseConfigured } from '../supabase/client';

export const infraProbeAdapter: InfraProbePort = {
  isSupabaseConfigured: () => isSupabaseConfigured(),
};
