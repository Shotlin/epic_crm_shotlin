import { describe, expect, it, vi } from 'vitest';
import { buildBakalooCoverageMapUrl, createBakalooCoverageMapProviderFromVault } from './bakaloo-coverage-map';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
const shopId = '11111111-1111-4111-8111-111111111111';

function body() {
  return {
    success: true,
    data: {
      shop: { id: shopId, name: 'Bakaloo Salt Lake', lat: 22.58, lng: 88.41, city: 'Kolkata', state: 'West Bengal', pincode: '700091', isActive: true },
      serviceablePincodes: ['700091'],
      uncoveredPincodes: ['700092'],
      customers: [{ userId: 'customer-1', name: 'Asha', initial: 'A', lat: 22.59, lng: 88.42, pincode: '700091', hasActiveOrder: true }],
      boundaries: [{ pincode: '700091', count: 1, polygon: [[22.58, 88.41], [22.59, 88.42], [22.58, 88.43]] }],
      totalCustomers: 1,
    },
  };
}

describe('server-owned Bakaloo coverage-map provider', () => {
  it('resolves credentials only in the Hub, binds the request to the scope, and returns a safe projection', async () => {
    const requests: unknown[] = [];
    const provider = createBakalooCoverageMapProviderFromVault({
      baseUrl: 'https://bakaloo.example.in/api',
      credentialRef: 'bakaloo-prod-admin',
      vault: { resolve: vi.fn(async () => ({ revision: 4, headers: { authorization: 'Bearer server-only' } })) },
      requester: async (request) => { requests.push(request); return { status: 200, contentType: 'application/json; charset=utf-8', body: body() }; },
      now: () => '2026-08-10T12:00:00.000Z',
    });

    const projection = await provider(scope, shopId);
    expect(projection).toMatchObject({ schema: 'epic-bos-retail-hub-coverage-map.v1', source: 'bakaloo', writeBackAllowed: false, scope, totalCustomers: 1 });
    expect(projection.projectionChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(requests).toEqual([{ method: 'GET', url: `https://bakaloo.example.in/api/v1/admin/coverage-map/${shopId}`, headers: { authorization: 'Bearer server-only', accept: 'application/json' } }]);
  });

  it('fails closed if the vault generation rotates during the request', async () => {
    let reads = 0;
    const provider = createBakalooCoverageMapProviderFromVault({
      baseUrl: 'https://bakaloo.example.in',
      credentialRef: 'bakaloo-prod-admin',
      vault: { resolve: vi.fn(async () => ({ revision: ++reads, headers: { authorization: `Bearer-${reads}` } })) },
      requester: async () => ({ status: 200, contentType: 'application/json', body: body() }),
    });
    await expect(provider(scope, shopId)).rejects.toThrow(/rotated/i);
  });

  it('rejects fabricated coordinates and unsafe source URLs', async () => {
    expect(buildBakalooCoverageMapUrl('https://bakaloo.example.in/api', shopId)).toBe(`https://bakaloo.example.in/api/v1/admin/coverage-map/${shopId}`);
    expect(() => buildBakalooCoverageMapUrl('http://bakaloo.example.in', shopId)).toThrow(/HTTPS/i);
    const invalid = body();
    invalid.data.shop.lat = 0;
    invalid.data.shop.lng = 0;
    const provider = createBakalooCoverageMapProviderFromVault({
      baseUrl: 'https://bakaloo.example.in',
      credentialRef: 'bakaloo-prod-admin',
      vault: { resolve: vi.fn(async () => ({ revision: 1, headers: { authorization: 'Bearer server-only' } })) },
      requester: async () => ({ status: 200, contentType: 'application/json', body: invalid }),
    });
    await expect(provider(scope, shopId)).rejects.toThrow(/0,0|placeholder/i);
  });
});
