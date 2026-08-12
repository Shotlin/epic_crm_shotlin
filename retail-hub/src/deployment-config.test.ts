import { describe, expect, it } from 'vitest';
import { readRetailHubDeploymentConfig } from './deployment-config';
import { evaluateRetailHubDeploymentReadiness } from './deployment-readiness';

const productionEnvironment = {
  RETAIL_HUB_ENVIRONMENT: 'production',
  RETAIL_HUB_PUBLIC_ORIGIN: 'https://hub.bakaloo.in',
  RETAIL_HUB_ALLOWED_ORIGINS: 'https://admin.bakaloo.in, https://app.bakaloo.in',
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

describe('Retail Hub deployment environment boundary', () => {
  it('maps a fully configured production environment without exposing values', () => {
    const result = readRetailHubDeploymentConfig(productionEnvironment);
    expect(result.invalidKeys).toEqual([]);
    expect(evaluateRetailHubDeploymentReadiness(result.config).status).toBe('ready');
  });

  it('conservatively holds when required flags are missing', () => {
    const result = readRetailHubDeploymentConfig({ RETAIL_HUB_ENVIRONMENT: 'production' });
    expect(result.invalidKeys).toContain('RETAIL_HUB_DATABASE_RLS_CONTEXT_CONFIGURED');
    expect(result.invalidKeys).toContain('RETAIL_HUB_CREDENTIAL_VAULT_CONFIGURED');
    expect(evaluateRetailHubDeploymentReadiness(result.config).status).toBe('hold');
  });

  it('rejects malformed booleans and unsupported enum values without widening access', () => {
    const result = readRetailHubDeploymentConfig({ RETAIL_HUB_ENVIRONMENT: 'production', RETAIL_HUB_AUTH_MODE: 'basic', RETAIL_HUB_TLS_ENABLED: 'yes', RETAIL_HUB_SOURCE_MODE: 'live' });
    expect(result.invalidKeys).toEqual(expect.arrayContaining(['RETAIL_HUB_AUTH_MODE', 'RETAIL_HUB_SOURCE_MODE', 'RETAIL_HUB_TLS_ENABLED', 'RETAIL_HUB_DATABASE_RLS_CONTEXT_CONFIGURED', 'RETAIL_HUB_CREDENTIAL_VAULT_CONFIGURED', 'RETAIL_HUB_OBSERVABILITY_CONFIGURED', 'RETAIL_HUB_BACKUP_CONFIGURED', 'RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED', 'RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED', 'RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED', 'RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED']));
    expect(result.invalidKeys).toHaveLength(11);
    expect(result.config.authMode).toBe('trusted-proxy');
    expect(result.config.sourceMode).toBe('shadow-read-only');
    expect(result.config.tlsEnabled).toBe(false);
  });
});
