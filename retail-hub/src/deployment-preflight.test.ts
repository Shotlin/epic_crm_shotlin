import { describe, expect, it } from 'vitest';
import { createRetailHubDeploymentPreflight } from './deployment-preflight';

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
} as const;

describe('Retail Hub deployment preflight artifact', () => {
  it('returns a ready, value-free report for a complete shadow deployment', () => {
    const report = createRetailHubDeploymentPreflight(validEnvironment, '2026-08-06T10:00:00.000Z');
    expect(report).toMatchObject({ schema: 'epic-bos-retail-hub-deployment-preflight', status: 'ready', environment: 'production', writeBackAllowed: false, invalidKeys: [], blockers: [], generatedAt: '2026-08-06T10:00:00.000Z' });
    expect(JSON.stringify(report)).not.toContain('password');
    expect(JSON.stringify(report)).not.toContain('db.internal');
  });

  it('turns missing and malformed configuration into named hold blockers', () => {
    const report = createRetailHubDeploymentPreflight({ RETAIL_HUB_ENVIRONMENT: 'production', RETAIL_HUB_TLS_ENABLED: 'maybe' }, '2026-08-06T10:00:00.000Z');
    expect(report.status).toBe('hold');
    expect(report.writeBackAllowed).toBe(false);
    expect(report.invalidKeys).toEqual(expect.arrayContaining(['RETAIL_HUB_TLS_ENABLED', 'RETAIL_HUB_DATABASE_RLS_CONTEXT_CONFIGURED', 'RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED', 'RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED']));
    expect(report.blockers).toContain('invalid-config:RETAIL_HUB_TLS_ENABLED');
  });

  it('rejects an invalid report timestamp instead of emitting ambiguous evidence', () => {
    expect(() => createRetailHubDeploymentPreflight(validEnvironment, 'not-a-time')).toThrow(/timestamp/i);
  });
});
