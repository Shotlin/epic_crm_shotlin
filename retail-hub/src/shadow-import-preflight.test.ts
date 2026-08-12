import { describe, expect, it } from 'vitest';
import { evaluateRetailHubShadowImportPreflight } from './shadow-import-preflight';
import type { RetailHubDeploymentConfig } from './deployment-readiness';
import type { ShadowImportPlan } from './shadow-import';

const deployment: RetailHubDeploymentConfig = {
  environment: 'production',
  publicOrigin: 'https://hub.bakaloo.in',
  allowedOrigins: ['https://admin.bakaloo.in'],
  databaseUrl: 'postgresql://hub:secret@db.internal:5432/retail_hub',
  databaseRlsContextConfigured: true,
  redisUrl: 'rediss://redis.internal:6380',
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

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

const plan: ShadowImportPlan = {
  batch: {
    id: 'bakaloo-batch-1',
    source: 'bakaloo',
    mode: 'shadow-read-only',
    writeBackAllowed: false,
    observedAt: '2026-08-06T10:00:00.000Z',
    credentialRevision: 7,
    status: 'ready-for-review',
    integrity: { algorithm: 'sha256', declaredChecksum: 'a'.repeat(64), computedChecksum: 'a'.repeat(64), checksumVerified: true },
  },
  externalIdMaps: [],
  cursors: [],
  conflicts: [],
  reconciliation: { batchId: 'bakaloo-batch-1', source: 'bakaloo', observedAt: '2026-08-06T10:00:00.000Z', status: 'reconciled', entities: [] },
};

describe('Retail Hub shadow-import preflight', () => {
  it('allows only a fully controlled, reconciled, credential-bound snapshot into review', () => {
    const result = evaluateRetailHubShadowImportPreflight({ deployment, scope, plan, requiredCredentialRevision: 7 });
    expect(result).toMatchObject({ status: 'ready-for-review', writeBackAllowed: false, blockers: [] });
    expect(result.checks.every(({ status }) => status === 'pass')).toBe(true);
  });

  it('holds missing evidence, stale credentials and any unresolved conflict', () => {
    const result = evaluateRetailHubShadowImportPreflight({
      deployment,
      scope: { ...scope, branchId: ' ' },
      plan: { ...plan, conflicts: [{ id: 'conflict-1', batchId: plan.batch.id, source: 'bakaloo', kind: 'unmapped-external-record', status: 'open', message: 'Map required.' }] },
      requiredCredentialRevision: 8,
    });
    expect(result.status).toBe('hold');
    expect(result.blockers).toEqual(expect.arrayContaining(['scope', 'conflicts', 'credential-generation']));
  });

  it('never converts an unsafe deployment or a write-enabled plan into approval', () => {
    // Simulate untrusted JSON crossing the runtime boundary; the TypeScript
    // contract intentionally makes writeBackAllowed impossible for callers.
    const unsafePlan = { ...plan, batch: { ...plan.batch, writeBackAllowed: true } } as unknown as ShadowImportPlan;
    const result = evaluateRetailHubShadowImportPreflight({
      deployment: { ...deployment, sourceMode: 'write-enabled', authMode: 'none' },
      scope,
      plan: unsafePlan,
      requiredCredentialRevision: 7,
    });
    expect(result.status).toBe('hold');
    expect(result.writeBackAllowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['deployment-readiness', 'write-back']));
  });
});
