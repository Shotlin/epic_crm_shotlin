import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createStatutoryProviderReadProjection } from './statutory-provider-read-projection';

function controlledState() {
  const state = createInitialRevenueOpsState();
  state.statutoryAdapters = [{
    id: 'adapter-current', code: 'IRP-CURRENT', name: 'Current IRP adapter', provider: 'Certified Provider',
    environment: 'sandbox', baseUrl: 'https://example.test', statusPathTemplate: '/status/{id}', healthPath: '/health',
    capabilities: ['submit-irn'], credentialStatus: 'configured', health: 'healthy', active: true,
    createdBy: 'user-avery', createdAt: '2026-07-17T09:00:00.000Z', scope: structuredClone(state.scope), version: 1,
  }, {
    id: 'adapter-legacy', code: 'IRP-LEGACY', name: 'Legacy adapter', provider: 'Legacy Provider',
    environment: 'sandbox', baseUrl: 'https://legacy.test', statusPathTemplate: '/status/{id}', healthPath: '/health',
    capabilities: ['submit-irn'], credentialStatus: 'missing', health: 'unknown', active: false,
    createdBy: 'user-avery', createdAt: '2026-07-17T09:00:00.000Z', version: 1,
  }];
  state.providerConnectors = [{
    id: 'connector-current', code: 'PAY-CURRENT', name: 'Current payment connector', providerLegalName: 'Provider Limited',
    domain: 'banking', environment: 'sandbox', baseUrl: 'https://provider.test', statusPathTemplate: '/status/{id}',
    capabilities: ['payment-status-pull'], specificationVersion: '1.0', credentialStatus: 'configured',
    conformanceStatus: 'sandbox-verified', active: true, createdBy: 'user-avery', createdAt: '2026-07-17T09:00:00.000Z',
    scope: structuredClone(state.scope), version: 1,
  }];
  return state;
}

const readAllowed = () => ({ allowed: true, deniedFields: [] });

describe('statutory and provider read projection', () => {
  it('filters connector and adapter records by exact scope, excluding unscoped legacy records', () => {
    const projection = createStatutoryProviderReadProjection(controlledState(), readAllowed);
    expect(projection.statutoryAdapters.map(({ id }) => id)).toEqual(['adapter-current']);
    expect(projection.providerConnectors.map(({ id }) => id)).toEqual(['connector-current']);
  });

  it('hides statutory adapters and their credential metric when statutory adapter read access is denied', () => {
    const projection = createStatutoryProviderReadProjection(controlledState(), (resource) => (
      resource === 'statutory.adapter' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));
    expect(projection.statutoryAdapters).toEqual([]);
    expect(projection.hiddenCollections).toContain('statutoryAdapters');
    expect(projection.redactedMetrics).toContain('statutoryCredentialGaps');
  });

  it('hides provider connectors and their activation metrics when connector read access is denied', () => {
    const projection = createStatutoryProviderReadProjection(controlledState(), (resource) => (
      resource === 'provider.connector' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));
    expect(projection.providerConnectors).toEqual([]);
    expect(projection.redactedMetrics).toEqual(expect.arrayContaining(['providerCredentialGaps', 'providerConformanceGaps']));
  });
});
