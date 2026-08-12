import { describe, expect, it } from 'vitest';
import { assertRetailHubDeploymentReady, evaluateRetailHubDeploymentReadiness, RetailHubDeploymentReadinessError, type RetailHubDeploymentConfig } from './deployment-readiness';

const production: RetailHubDeploymentConfig = {
  environment: 'production',
  publicOrigin: 'https://hub.bakaloo.example',
  allowedOrigins: ['https://app.bakaloo.example', 'https://admin.bakaloo.example'],
  databaseUrl: 'postgresql://hub:secret@db.internal:5432/epic_hub',
  databaseRlsContextConfigured: true,
  redisUrl: 'rediss://cache.internal:6380',
  authMode: 'oidc',
  tlsEnabled: true,
  credentialVaultConfigured: true,
  observabilityConfigured: true,
  backupConfigured: true,
  storeEdgeWorkerConfigured: true,
  storeEdgeAtomicInboxConfigured: true,
  storeEdgeMetricsConfigured: true,
  storeEdgeRecoveryConfigured: true,
  sourceMode: 'shadow-read-only',
};

describe('Retail Hub deployment readiness', () => {
  it('accepts a fully configured shadow-only production deployment without exposing values', () => {
    const readiness = evaluateRetailHubDeploymentReadiness(production);
    expect(readiness).toMatchObject({ status: 'ready', environment: 'production', writeBackAllowed: false, blockers: [] });
    expect(JSON.stringify(readiness)).not.toContain('secret');
    expect(JSON.stringify(readiness)).not.toContain('internal');
    expect(() => assertRetailHubDeploymentReady(production)).not.toThrow();
  });

  it('holds a production deployment until every infrastructure and control boundary is present', () => {
    const readiness = evaluateRetailHubDeploymentReadiness({
      ...production,
      allowedOrigins: ['*'],
      databaseUrl: undefined,
      databaseRlsContextConfigured: false,
      redisUrl: undefined,
      authMode: 'none',
      tlsEnabled: false,
      credentialVaultConfigured: false,
      observabilityConfigured: false,
      backupConfigured: false,
      storeEdgeWorkerConfigured: false,
      storeEdgeAtomicInboxConfigured: false,
      storeEdgeMetricsConfigured: false,
      storeEdgeRecoveryConfigured: false,
    });
    expect(readiness.status).toBe('hold');
    expect(readiness.blockers).toEqual(expect.arrayContaining(['allowed-origins', 'authentication', 'transport-security', 'postgresql', 'database-rls-context', 'redis', 'credential-vault', 'observability', 'backup', 'store-edge-worker', 'store-edge-atomic-inbox', 'store-edge-metrics', 'store-edge-recovery']));
    expect(() => assertRetailHubDeploymentReady({ ...production, authMode: 'none' })).toThrow(RetailHubDeploymentReadinessError);
  });

  it('rejects write-enabled source mode even when deployment infrastructure is valid', () => {
    const readiness = evaluateRetailHubDeploymentReadiness({ ...production, sourceMode: 'write-enabled' });
    expect(readiness).toMatchObject({ status: 'hold', writeBackAllowed: false, blockers: ['source-mode'] });
  });

  it('allows development to run without cloud infrastructure but still requires explicit auth and origin safety', () => {
    const readiness = evaluateRetailHubDeploymentReadiness({
      environment: 'development',
      publicOrigin: 'http://localhost:4173',
      allowedOrigins: ['http://localhost:4173'],
      databaseRlsContextConfigured: false,
      authMode: 'trusted-proxy',
      tlsEnabled: false,
      credentialVaultConfigured: false,
      observabilityConfigured: false,
      backupConfigured: false,
      storeEdgeWorkerConfigured: false,
      storeEdgeAtomicInboxConfigured: false,
      storeEdgeMetricsConfigured: false,
      storeEdgeRecoveryConfigured: false,
      sourceMode: 'shadow-read-only',
    });
    expect(readiness).toMatchObject({ status: 'hold', blockers: ['credential-vault', 'observability', 'backup', 'store-edge-worker', 'store-edge-atomic-inbox', 'store-edge-metrics', 'store-edge-recovery'] });
    expect(readiness.checks.find(({ id }) => id === 'postgresql')?.status).toBe('pass');
    expect(readiness.checks.find(({ id }) => id === 'redis')?.status).toBe('pass');
  });

  it('rejects credentials embedded in origins and malformed database or Redis URLs', () => {
    const readiness = evaluateRetailHubDeploymentReadiness({
      ...production,
      publicOrigin: 'https://user:pass@hub.bakaloo.example',
      allowedOrigins: ['https://admin.bakaloo.example/path'],
      databaseUrl: 'https://not-postgres',
      redisUrl: 'https://not-redis',
    });
    expect(readiness.blockers).toEqual(expect.arrayContaining(['public-origin', 'allowed-origins', 'postgresql', 'redis']));
  });
});
