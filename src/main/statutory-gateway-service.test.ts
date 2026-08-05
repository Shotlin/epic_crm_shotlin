import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatutoryExchange } from '../shared/revenue-ops-contracts';
import type { StatutoryAdapter } from '../shared/statutory-contracts';
import { BusinessDatabase } from './database';
import { StatutoryGatewayService } from './statutory-gateway-service';

let directory = '';
let database: BusinessDatabase;

const adapter: StatutoryAdapter = { id: 'adapter-secure', code: 'GSP-SECURE', name: 'Secure GSP', provider: 'Provider', environment: 'sandbox', baseUrl: 'https://gsp.example.in', statusPathTemplate: '/v1/status/{kind}/{number}', healthPath: '/v1/health', capabilities: ['status-pull', 'signature-verify'], credentialStatus: 'configured', health: 'unknown', active: true, createdBy: 'admin', createdAt: '2026-07-15T00:00:00.000Z', version: 2 };
const exchange: StatutoryExchange = { id: 'exchange-1', kind: 'e-way-bill', sourceId: 'shipment-1', sourceNumber: 'SHP-1', gstRegistrationId: 'gst-1', idempotencyKey: 'gst:ewb:1', payloadChecksum: 'a'.repeat(64), status: 'acknowledged', externalNumber: '181000000001', acknowledgementNumber: 'ACK-1', acknowledgedAt: '2026-07-15T01:00:00.000Z', preparedBy: 'maker', preparedAt: '2026-07-15T00:30:00.000Z', version: 3 };

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-statutory-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('StatutoryGatewayService', () => {
  it('encrypts adapter credentials at rest and uses them only for a bounded HTTPS pull', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('client-id')).toBe('client-epic');
      expect(headers.get('client-secret')).toBe('never-persist-plain');
      expect(headers.get('x-api-key')).toBe('api-secret');
      return new Response(JSON.stringify({ status: 'active', externalNumber: '181000000001', acknowledgementNumber: 'ACK-1', acknowledgedAt: '2026-07-15T01:00:00.000Z', validUntil: '2026-07-16T01:00:00.000Z' }), { status: 200 });
    });
    const fetcher = fetchMock as unknown as typeof fetch;
    const service = new StatutoryGatewayService(database, Buffer.alloc(32, 7), fetcher);
    const fingerprint = service.configureCredentials({ adapterId: adapter.id, clientId: 'client-epic', clientSecret: 'never-persist-plain', apiKey: 'api-secret' }, 'finance-admin');
    const stored = database.getStatutoryAdapterSecret(adapter.id);
    expect(fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(stored?.encryptedPayload).not.toContain('never-persist-plain');
    expect(JSON.stringify(stored)).not.toContain('api-secret');
    expect(stored).toMatchObject({ adapterId: adapter.id, keyVersion: 1, updatedBy: 'finance-admin' });
    const statuses = await service.pullStatuses(adapter, [exchange]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://gsp.example.in/v1/status/e-way-bill/181000000001');
    expect(statuses[0]).toMatchObject({ exchangeId: 'exchange-1', remoteStatus: 'active', externalNumber: '181000000001', validUntil: '2026-07-16T01:00:00.000Z' });
  });

  it('contains provider failures per exchange and rejects malformed certificate evidence', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'provider-private-state' }), { status: 200 })) as unknown as typeof fetch;
    const service = new StatutoryGatewayService(database, Buffer.alloc(32, 9), fetcher);
    service.configureCredentials({ adapterId: adapter.id, bearerToken: 'opaque-token' }, 'finance-admin');
    await expect(service.pullStatuses(adapter, [exchange])).resolves.toEqual([{ exchangeId: 'exchange-1', remoteStatus: 'error', errorMessage: 'Adapter returned an unsupported canonical status.' }]);
    expect(() => service.verifySignature({ exchangeId: exchange.id, artifact: 'signed-json', algorithm: 'RSA-SHA256', payloadBase64: Buffer.from('payload').toString('base64'), signatureBase64: Buffer.from('signature').toString('base64'), certificatePem: '-----BEGIN CERTIFICATE-----\nnot-a-certificate\n-----END CERTIFICATE-----' })).toThrow();
  });
});
