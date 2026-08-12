import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConnector, ProviderSubmission } from '../shared/provider-contracts';
import { BusinessDatabase } from './database';
import { ProviderGatewayService } from './provider-gateway-service';

let directory = '';
let database: BusinessDatabase;

const connector: ProviderConnector = { id: '88888888-8888-4888-8888-888888888888', code: 'BANK-SECURE', name: 'Secure payment pack', providerLegalName: 'Example Bank Limited', domain: 'banking', environment: 'sandbox', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release', 'payment-status-pull'], specificationVersion: 'sandbox-2026.07', credentialStatus: 'configured', conformanceStatus: 'sandbox-verified', active: true, createdBy: 'admin', createdAt: '2026-07-18T00:00:00.000Z', version: 3 };
const submission: ProviderSubmission = { id: '99999999-9999-4999-8999-999999999999', number: 'PCX/26-27/00001', connectorId: connector.id, domain: 'banking', capability: 'payment-release', sourceKind: 'payment-proposal', sourceIds: ['payment-1'], payloadChecksum: 'a'.repeat(64), status: 'handed-off', preparedBy: 'maker', preparedAt: '2026-07-18T01:00:00.000Z', handedOffBy: 'releaser', handedOffAt: '2026-07-18T01:05:00.000Z', requestReference: 'PACK-001', version: 2 };

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'epic-bos-provider-'));
  database = new BusinessDatabase(path.join(directory, 'epic-bos.sqlite3'));
  await database.initialize();
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('ProviderGatewayService', () => {
  it('seals provider credentials at rest and performs only a bounded same-origin status pull', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('client-id')).toBe('client-epic');
      expect(headers.get('x-api-key')).toBe('api-secret');
      return new Response(JSON.stringify({ status: 'acknowledged', externalReference: 'BANK-ACK-001' }), { status: 200 });
    });
    const service = new ProviderGatewayService(database, Buffer.alloc(32, 5), fetchMock as unknown as typeof fetch);
    const fingerprint = service.configureCredentials({ connectorId: connector.id, clientId: 'client-epic', apiKey: 'api-secret', signingKey: 'private-material' }, 'finance-admin');
    const stored = database.getProviderSecret(connector.id);
    expect(fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(stored)).not.toContain('api-secret');
    expect(JSON.stringify(stored)).not.toContain('private-material');
    expect(service.getCredentialChecksum(connector.id)).toBe(stored?.checksum);
    const statuses = await service.pullStatuses(connector, [submission]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://bank.example.in/v1/status/PACK-001');
    expect(statuses).toEqual([{ submissionId: submission.id, remoteStatus: 'acknowledged', externalReference: 'BANK-ACK-001', remotePayloadChecksum: expect.any(String), errorMessage: undefined }]);
  });

  it('contains invalid provider responses per handoff', async () => {
    const service = new ProviderGatewayService(database, Buffer.alloc(32, 6), (async () => new Response(JSON.stringify({ status: 'provider-private' }), { status: 200 })) as typeof fetch);
    service.configureCredentials({ connectorId: connector.id, bearerToken: 'opaque-token' }, 'finance-admin');
    await expect(service.pullStatuses(connector, [submission])).resolves.toEqual([{ submissionId: submission.id, remoteStatus: 'error', errorMessage: 'Provider returned an unsupported canonical status.' }]);
  });

  it('executes only bounded same-origin commerce requests with vaulted credentials and idempotency evidence', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.method).toBe('GET');
      expect(headers.get('Idempotency-Key')).toBe('request-checksum');
      expect(headers.get('Authorization')).toBe('Bearer commerce-token');
      return new Response(JSON.stringify({ status: 'completed', evidenceReference: 'ONDC-ACK-1', recordsRead: 0, recordsAccepted: 0, recordsRejected: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const service = new ProviderGatewayService(database, Buffer.alloc(32, 7), fetchMock as unknown as typeof fetch);
    service.configureCredentials({ connectorId: connector.id, bearerToken: 'commerce-token' }, 'inventory-admin');
    const result = await service.requestJson(connector.id, connector.baseUrl, '/v1/orders', 'GET', undefined, 'request-checksum');
    expect(result).toMatchObject({ statusCode: 200, ok: true, responseChecksum: expect.stringMatching(/^[a-f0-9]{64}$/), responseByteLength: expect.any(Number) });
    await expect(service.requestJson(connector.id, connector.baseUrl, 'https://evil.example/v1/orders', 'GET')).rejects.toThrow('relative HTTPS path');
  });

  it('fails closed when a persisted credential envelope has an unknown key version', async () => {
    const service = new ProviderGatewayService(database, Buffer.alloc(32, 8));
    service.configureCredentials({ connectorId: connector.id, bearerToken: 'versioned-secret' }, 'inventory-admin');
    const stored = database.getProviderSecret(connector.id)!;
    database.upsertProviderSecret({ ...stored, keyVersion: 99 });

    await expect(service.requestJson(connector.id, connector.baseUrl, '/v1/orders', 'GET'))
      .rejects.toThrow(/unsupported key version 99/i);
  });
});
