import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import * as supabaseClient from '../supabase/client';
import { SupabasePowerSyncConnector } from './supabase-connector';

const originalNodeEnv = process.env.NODE_ENV;
const originalPowerSyncUrl = process.env.VITE_POWERSYNC_URL;

describe('SupabasePowerSyncConnector - PowerSync URL resolution', () => {
  beforeEach(() => {
    spyOn(supabaseClient, 'isSupabaseConfigured').mockReturnValue(true);
    spyOn(supabaseClient, 'getSupabase').mockReturnValue({
      auth: {
        getSession: mock(() =>
          Promise.resolve({
            data: { session: { access_token: 'tk' } },
            error: null,
          }),
        ),
      },
    } as any);
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (typeof originalPowerSyncUrl === 'undefined') {
      delete process.env.VITE_POWERSYNC_URL;
    } else {
      process.env.VITE_POWERSYNC_URL = originalPowerSyncUrl;
    }
    mock.restore();
  });

  it('uses https VITE_POWERSYNC_URL in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_POWERSYNC_URL = 'https://powersync.example.com/';

    const connector = new SupabasePowerSyncConnector();
    const { endpoint } = await connector.fetchCredentials();

    expect(endpoint).toBe('https://powersync.example.com');
  });

  it('rejects missing VITE_POWERSYNC_URL in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VITE_POWERSYNC_URL;

    const connector = new SupabasePowerSyncConnector();
    await expect(connector.fetchCredentials()).rejects.toThrow(
      'VITE_POWERSYNC_URL is required in production.',
    );
  });

  it('rejects http VITE_POWERSYNC_URL in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_POWERSYNC_URL = 'http://powersync.example.com';

    const connector = new SupabasePowerSyncConnector();
    await expect(connector.fetchCredentials()).rejects.toThrow('Insecure PowerSync URL');
  });

  it('defaults to localhost in dev when missing', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VITE_POWERSYNC_URL;

    const connector = new SupabasePowerSyncConnector();
    const { endpoint } = await connector.fetchCredentials();

    expect(endpoint).toBe('http://localhost:8080');
  });

  it('returns refreshed token when the current session is close to expiry', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_POWERSYNC_URL = 'https://powersync.example.com';

    const nearExpirySeconds = Math.floor((Date.now() + 10_000) / 1000);
    const refreshedExpirySeconds = Math.floor((Date.now() + 3_600_000) / 1000);
    const refreshSession = mock(() =>
      Promise.resolve({
        data: {
          session: {
            access_token: 'tk-refreshed',
            expires_at: refreshedExpirySeconds,
          },
        },
        error: null,
      }),
    );

    spyOn(supabaseClient, 'getSupabase').mockReturnValue({
      auth: {
        getSession: mock(() =>
          Promise.resolve({
            data: {
              session: {
                access_token: 'tk-stale',
                expires_at: nearExpirySeconds,
              },
            },
            error: null,
          }),
        ),
        refreshSession,
      },
    } as any);

    const connector = new SupabasePowerSyncConnector();
    const credentials = await connector.fetchCredentials();

    expect(refreshSession).toHaveBeenCalled();
    expect(credentials.token).toBe('tk-refreshed');
    expect(credentials.expiresAt?.getTime()).toBe(refreshedExpirySeconds * 1000);
  });
});
