import { describe, expect, it } from 'vitest';
import { startRetailHubProductionServer, RetailHubProductionStartupError } from './production-server';

const validEnvironment = {
  RETAIL_HUB_ENVIRONMENT: 'production',
  RETAIL_HUB_PUBLIC_ORIGIN: 'https://hub.bakaloo.in',
  RETAIL_HUB_ALLOWED_ORIGINS: 'https://admin.bakaloo.in,https://app.bakaloo.in',
  DATABASE_URL: 'postgresql://hub:password@db.internal:5432/retail_hub',
  REDIS_URL: 'rediss://redis.internal:6380',
  RETAIL_HUB_DATABASE_RLS_CONTEXT_CONFIGURED: 'true',
  RETAIL_HUB_AUTH_MODE: 'oidc',
  RETAIL_HUB_TLS_ENABLED: 'true',
  RETAIL_HUB_CREDENTIAL_VAULT_CONFIGURED: 'true',
  RETAIL_HUB_OBSERVABILITY_CONFIGURED: 'true',
  RETAIL_HUB_BACKUP_CONFIGURED: 'true',
  RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED: 'true',
  RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED: 'true',
  RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED: 'true',
  RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED: 'true',
  RETAIL_HUB_SOURCE_MODE: 'shadow-read-only',
  RETAIL_HUB_BIND_HOST: '127.0.0.1',
  RETAIL_HUB_PORT: '4180',
} as const;

describe('Retail Hub production startup boundary', () => {
  it('does not create a listener when deployment readiness is on hold', async () => {
    let listened = false;
    await expect(startRetailHubProductionServer({
      environment: { ...validEnvironment, RETAIL_HUB_CREDENTIAL_VAULT_CONFIGURED: 'false' },
      service: { handle: async () => ({ status: 200, headers: {}, body: { ok: true } }) },
      listen: async () => { listened = true; },
    })).rejects.toBeInstanceOf(RetailHubProductionStartupError);
    expect(listened).toBe(false);
  });

  it('requires explicit binding configuration instead of guessing a public listener', async () => {
    await expect(startRetailHubProductionServer({
      environment: { ...validEnvironment, RETAIL_HUB_BIND_HOST: undefined },
      service: { handle: async () => ({ status: 200, headers: {}, body: { ok: true } }) },
      listen: async () => undefined,
    })).rejects.toThrow(/bind host/i);
    await expect(startRetailHubProductionServer({
      environment: { ...validEnvironment, RETAIL_HUB_PORT: '0' },
      service: { handle: async () => ({ status: 200, headers: {}, body: { ok: true } }) },
      listen: async () => undefined,
    })).rejects.toThrow(/port/i);
  });

  it('passes only after preflight and forwards the explicit host and port', async () => {
    const calls: Array<{ host: string; port: number }> = [];
    const result = await startRetailHubProductionServer({
      environment: validEnvironment,
      service: { handle: async () => ({ status: 200, headers: {}, body: { ok: true } }) },
      listen: async (_server, host, port) => { calls.push({ host, port }); },
      now: '2026-08-08T10:00:00.000Z',
    });
    expect(result.preflight.status).toBe('ready');
    expect(result.preflight.writeBackAllowed).toBe(false);
    expect(calls).toEqual([{ host: '127.0.0.1', port: 4180 }]);
    result.server.close();
  });
});
