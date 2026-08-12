import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildRetailHubCoverageMapUrl, fetchRetailHubCoverageMap } from './retail-hub-coverage-map-client';
import { serializeRetailHubCoverageMapProjection } from '../shared/retail-hub-coverage-map-contracts';

const scope = { companyId: 'company-1', branchId: 'branch-1' };
const shopId = '11111111-1111-4111-8111-111111111111';
const data = {
  observedAt: '2026-08-10T09:55:00.000Z',
  shop: { id: shopId, name: 'Bakaloo Salt Lake', lat: 22.58, lng: 88.42, city: 'Kolkata', state: 'West Bengal', pincode: '700091', isActive: true },
  serviceablePincodes: ['700091', '700092'], uncoveredPincodes: ['700093'],
  customers: [{ userId: 'customer-1', name: 'Asha', initial: 'A', lat: 22.59, lng: 88.43, pincode: '700091', hasActiveOrder: true }],
  boundaries: [{ pincode: '700091', count: 1, polygon: [[22.58, 88.42], [22.59, 88.43], [22.58, 88.44]] as [number, number][] }], totalCustomers: 1,
};
const body = { success: true, data: { ...data, projectionChecksum: createHash('sha256').update(serializeRetailHubCoverageMapProjection(data), 'utf8').digest('hex') } };

describe('Retail Hub coverage-map client', () => {
  it('builds a credential-free scoped read URL', () => {
    expect(buildRetailHubCoverageMapUrl({ baseUrl: 'https://hub.example/api', shopId, scope })).toBe(`https://hub.example/api/v1/admin/coverage-map/${shopId}`);
    expect(() => buildRetailHubCoverageMapUrl({ baseUrl: 'http://hub.example', shopId, scope })).toThrow(/HTTPS/i);
  });

  it('validates Bakaloo coverage evidence and binds the active scope', async () => {
    const result = await fetchRetailHubCoverageMap({ baseUrl: 'https://hub.example/api', shopId, scope }, {
      now: () => '2026-08-10T10:00:00.000Z',
      request: async () => ({ status: 200, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(JSON.stringify(body)) }),
    });
    expect(result).toMatchObject({ schema: 'epic-bos-retail-hub-coverage-map.v1', source: 'bakaloo', writeBackAllowed: false, scope, totalCustomers: 1 });
    expect(result.observedAt).toBe('2026-08-10T09:55:00.000Z');
    expect(result.customers[0]?.hasActiveOrder).toBe(true);
  });

  it('rejects fabricated or malformed map evidence', async () => {
    await expect(fetchRetailHubCoverageMap({ baseUrl: 'https://hub.example/api', shopId, scope }, {
      now: () => '2026-08-10T10:00:00.000Z',
      request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ ...body, data: { ...body.data, shop: { ...body.data.shop, lat: 91 } } })) }),
    })).rejects.toThrow(/latitude/i);
    await expect(fetchRetailHubCoverageMap({ baseUrl: 'https://hub.example/api', shopId, scope }, {
      request: async () => ({ status: 200, contentType: 'text/html', body: new TextEncoder().encode('<html>') }),
    })).rejects.toThrow(/application\/json/i);
    await expect(fetchRetailHubCoverageMap({ baseUrl: 'https://hub.example/api', shopId, scope }, {
      now: () => '2026-08-10T10:00:00.000Z',
      request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ ...body, data: { ...body.data, projectionChecksum: '0'.repeat(64) } })) }),
    })).rejects.toThrow(/checksum/i);
    await expect(fetchRetailHubCoverageMap({ baseUrl: 'https://hub.example/api', shopId, scope }, {
      now: () => '2026-08-10T10:31:00.000Z',
      request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify(body)) }),
    })).rejects.toThrow(/stale/i);
    await expect(fetchRetailHubCoverageMap({ baseUrl: 'https://hub.example/api', shopId, scope }, {
      now: () => '2026-08-10T09:50:00.000Z',
      request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify(body)) }),
    })).rejects.toThrow(/future/i);
  });
});
