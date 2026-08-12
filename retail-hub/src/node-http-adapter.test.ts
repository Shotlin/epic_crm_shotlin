import { request } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createNodeHttpRetailHubServer } from './node-http-adapter';
import { createPostgresRetailHubService } from './postgres-service';
import type { RetailHubAuthorization } from './postgres-service';
import type { ShadowImportPostgresRepository } from './shadow-import-postgres-repository';
import { checksumStoreEdgePayload, createInMemoryStoreEdgeSyncInbox } from './store-edge-sync';
import { createInMemoryStoreEdgeSyncWorkStore } from './store-edge-sync-worker';
import { createInMemoryRetailHubChannelOrderTransport } from './channel-order-transport';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function service() {
  const repository: ShadowImportPostgresRepository = {
    listPlans: vi.fn(async () => []),
    getPlan: vi.fn(),
    replacePlan: vi.fn(),
  };
  return createPostgresRetailHubService({
    repository,
    resolveScope: () => scope,
    resolveAuthorization: (request) => request.authorization as RetailHubAuthorization | undefined,
  });
}

async function withServer(run: (port: number) => Promise<void>, options: Parameters<typeof createNodeHttpRetailHubServer>[0] = { service: service() }) {
  const server = createNodeHttpRetailHubServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');
  try {
    await run(address.port);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function httpRequest(port: number, method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const requestHandle = request({ hostname: '127.0.0.1', port, path, method, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    requestHandle.on('error', reject);
    if (body !== undefined) requestHandle.write(body);
    requestHandle.end();
  });
}

describe('Node Retail Hub HTTP adapter', () => {
  it('fails closed without trusted authorization context', async () => {
    await withServer(async (port) => {
      const response = await httpRequest(port, 'GET', '/health');
      expect(response.status).toBe(403);
      expect(response.body).toContain('authorization_required');
    });
  });

  it('passes trusted server context and keeps write verbs read-only', async () => {
    const authorizedService = createPostgresRetailHubService({
      repository: { listPlans: vi.fn(async () => []), getPlan: vi.fn(), replacePlan: vi.fn() },
      resolveScope: () => scope,
      resolveAuthorization: (request) => request.authorization,
    });
    await withServer(async (port) => {
      const health = await httpRequest(port, 'GET', '/health');
      expect(health.status).toBe(200);
      expect(JSON.parse(health.body)).toMatchObject({ writeBackAllowed: false, liveSourceConnected: false });
      const write = await httpRequest(port, 'PUT', '/v1/shadow-imports/batches', '{}', { 'content-type': 'application/json' });
      expect(write.status).toBe(405);
      expect(write.body).toContain('read_only_boundary');
    }, {
      service: authorizedService,
      resolveContext: () => ({ scope, authorization: { actorId: 'manager-1', scope, permissions: ['shadow-import:read'] } }),
    });
  });

  it('bounds and validates review JSON before it reaches the service', async () => {
    await withServer(async (port) => {
      const tooLarge = await httpRequest(port, 'POST', '/v1/shadow-imports/review-decisions', JSON.stringify({ reason: 'x'.repeat(1100) }), { 'content-type': 'application/json' });
      expect(tooLarge.status).toBe(413);
      const malformed = await httpRequest(port, 'POST', '/v1/shadow-imports/review-decisions', '{', { 'content-type': 'application/json' });
      expect(malformed.status).toBe(400);
      expect(malformed.body).toContain('invalid_json');
      const nonJson = await httpRequest(port, 'POST', '/v1/shadow-imports/review-decisions', 'decision', { 'content-type': 'text/plain' });
      expect(nonJson.status).toBe(415);
      expect(nonJson.body).toContain('json_content_type_required');
    }, { service: service(), maxBodyBytes: 1024 });
  });

  it('accepts only trusted Store Edge sync context and exposes receipt evidence', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'store-edge-receipt-1');
    const workStore = createInMemoryStoreEdgeSyncWorkStore(() => 'store-edge-work-1');
    const payload = { saleNumber: 'POS/26-27/00001', status: 'completed', grandTotalInr: 118 };
    const event = {
      eventId: 'evt-store-edge-1',
      eventType: 'retail.sale.completed',
      aggregateId: 'sale-1',
      transactionKey: 'POS-OFFLINE-001',
      sequence: 1,
      producedAt: '2026-08-06T10:00:00.000Z',
      payloadChecksum: checksumStoreEdgePayload(payload),
      payload,
    };
    await withServer(async (port) => {
      const denied = await httpRequest(port, 'POST', '/v1/store-edge/sync', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(denied.status).toBe(403);
    }, { service: service(), storeEdgeInbox: inbox });
    await withServer(async (port) => {
      const accepted = await httpRequest(port, 'POST', '/v1/store-edge/sync', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(accepted.status).toBe(202);
      expect(accepted.body).toContain('store-edge-receipt-1');
      const receipts = await httpRequest(port, 'GET', '/v1/store-edge/sync/receipts');
      expect(receipts.status).toBe(200);
      expect(receipts.body).toContain('evt-store-edge-1');
    }, {
      service: service(),
      storeEdgeInbox: inbox,
      storeEdgeWorkStore: workStore,
      resolveContext: () => ({ scope, authorization: { actorId: 'cashier-1', scope, permissions: ['store-edge:sync'] } }),
    });
    await expect(workStore.list(scope)).resolves.toMatchObject([{ eventId: 'evt-store-edge-1', status: 'pending' }]);
  });

  it('re-enqueues an idempotent event through the worker boundary without duplicating work', async () => {
    const inbox = createInMemoryStoreEdgeSyncInbox(() => 'store-edge-receipt-2');
    const workStore = createInMemoryStoreEdgeSyncWorkStore(() => 'store-edge-work-2');
    const payload = { saleNumber: 'POS/26-27/00002', status: 'completed', grandTotalInr: 236 };
    const event = {
      eventId: 'evt-store-edge-2', eventType: 'retail.sale.completed', aggregateId: 'sale-2',
      transactionKey: 'POS-OFFLINE-002', sequence: 1, producedAt: '2026-08-06T10:00:00.000Z',
      payloadChecksum: checksumStoreEdgePayload(payload), payload,
    };
    await withServer(async (port) => {
      const first = await httpRequest(port, 'POST', '/v1/store-edge/sync', JSON.stringify(event), { 'content-type': 'application/json' });
      const retry = await httpRequest(port, 'POST', '/v1/store-edge/sync', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(first.status).toBe(202);
      expect(retry.status).toBe(200);
    }, {
      service: service(), storeEdgeInbox: inbox, storeEdgeWorkStore: workStore,
      resolveContext: () => ({ scope, authorization: { actorId: 'cashier-1', scope, permissions: ['store-edge:sync'] } }),
    });
    await expect(workStore.list(scope)).resolves.toHaveLength(1);
  });

  it('prefers an atomic inbox/outbox method and does not perform a second queue write', async () => {
    const payload = { saleNumber: 'POS/26-27/00003', status: 'completed', grandTotalInr: 354 };
    const event = {
      eventId: 'evt-store-edge-3', eventType: 'retail.sale.completed', aggregateId: 'sale-3',
      transactionKey: 'POS-OFFLINE-003', sequence: 1, producedAt: '2026-08-06T10:00:00.000Z',
      payloadChecksum: checksumStoreEdgePayload(payload), payload,
    };
    const accepted = {
      outcome: 'recorded' as const,
      receipt: { id: 'receipt-atomic-3', ...event, outcome: 'recorded' as const, actorId: 'cashier-1', receivedAt: '2026-08-06T10:01:00.000Z', scope },
      record: { ...event, scope, receivedAt: '2026-08-06T10:01:00.000Z', receivedBy: 'cashier-1' },
      workItemId: 'evt-store-edge-3:work',
    };
    const atomicInbox = {
      accept: vi.fn(async () => { throw new Error('non-atomic accept must not be called'); }),
      acceptAndEnqueue: vi.fn(async () => accepted),
      list: vi.fn(async () => []),
    };
    const fallbackWorkStore = createInMemoryStoreEdgeSyncWorkStore();
    await withServer(async (port) => {
      const response = await httpRequest(port, 'POST', '/v1/store-edge/sync', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(response.status).toBe(202);
    }, {
      service: service(), storeEdgeInbox: atomicInbox, storeEdgeWorkStore: fallbackWorkStore,
      resolveContext: () => ({ scope, authorization: { actorId: 'cashier-1', scope, permissions: ['store-edge:sync'] } }),
    });
    expect(atomicInbox.acceptAndEnqueue).toHaveBeenCalledOnce();
    expect(atomicInbox.accept).not.toHaveBeenCalled();
    await expect(fallbackWorkStore.list(scope)).resolves.toHaveLength(0);
  });

  it('accepts only authenticated, scope-matched channel-order evidence', async () => {
    const transport = createInMemoryRetailHubChannelOrderTransport(() => '00000000-0000-0000-0000-000000000010');
    const event = {
      mode: 'shadow',
      event: {
        channel: 'website', connectionId: 'bakaloo-web-1', externalOrderId: 'order-10', externalEventId: 'event-10',
        occurredAt: '2026-08-08T10:00:00.000Z', status: 'received', currency: 'INR', totalAmountPaise: 11800,
        lines: [{ externalLineId: 'line-10', sku: 'RICE-5KG', quantity: 1, unitAmountPaise: 11800 }],
      },
    };
    await withServer(async (port) => {
      const denied = await httpRequest(port, 'POST', '/v1/channel-orders/events', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(denied.status).toBe(403);
    }, { service: service(), channelOrderTransport: transport });
    await withServer(async (port) => {
      const accepted = await httpRequest(port, 'POST', '/v1/channel-orders/events', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(accepted.status).toBe(202);
      expect(accepted.body).toContain('writeBackAllowed');
      const retry = await httpRequest(port, 'POST', '/v1/channel-orders/events', JSON.stringify(event), { 'content-type': 'application/json' });
      expect(retry.status).toBe(200);
      const receipts = await httpRequest(port, 'GET', '/v1/channel-orders/receipts');
      expect(receipts.status).toBe(200);
      expect(receipts.body).toContain('event-10');
    }, {
      service: service(),
      channelOrderTransport: transport,
      resolveContext: () => ({ scope, authorization: { actorId: 'manager-1', scope, permissions: ['channel-orders:ingest', 'channel-orders:read'] } }),
    });
  });

  it('rejects a channel-order actor whose trusted scope does not match the resolved scope', async () => {
    const transport = createInMemoryRetailHubChannelOrderTransport();
    const body = JSON.stringify({ mode: 'shadow', event: { channel: 'website', connectionId: 'web', externalOrderId: 'order-11', externalEventId: 'event-11', occurredAt: '2026-08-08T10:00:00.000Z', status: 'received', currency: 'INR', totalAmountPaise: 100, lines: [{ externalLineId: 'line-11', sku: 'SKU-1', quantity: 1, unitAmountPaise: 100 }] } });
    await withServer(async (port) => {
      const response = await httpRequest(port, 'POST', '/v1/channel-orders/events', body, { 'content-type': 'application/json' });
      expect(response.status).toBe(403);
      expect(response.body).toContain('authorization_scope_mismatch');
    }, {
      service: service(),
      channelOrderTransport: transport,
      resolveContext: () => ({ scope, authorization: { actorId: 'manager-1', scope: { ...scope, branchId: 'branch-2' }, permissions: ['channel-orders:ingest'] } }),
    });
  });

  it('exposes scoped dead-letter evidence and requires explicit recovery authority', async () => {
    const workStore = createInMemoryStoreEdgeSyncWorkStore(() => 'dead-letter-work-1');
    const payload = { saleNumber: 'POS/26-27/00009', status: 'completed', grandTotalInr: 999 };
    await workStore.enqueue({
      eventId: 'evt-dead-letter-1', eventType: 'retail.sale.completed', aggregateId: 'sale-dead-letter-1', transactionKey: 'POS-OFFLINE-009', sequence: 1,
      producedAt: '2026-08-06T10:00:00.000Z', payloadChecksum: checksumStoreEdgePayload(payload), payload, scope,
      receivedAt: '2026-08-06T10:00:01.000Z', receivedBy: 'cashier-1',
    }, '2026-08-06T10:01:00.000Z');
    const claimed = await workStore.claim(scope, { workerId: 'worker-1', now: '2026-08-06T10:03:00.000Z' });
    await workStore.retry(scope, 'dead-letter-work-1', 'worker-1', 'Permanent Hub rejection', '2026-08-06T10:03:01.000Z', 0, 1, claimed[0]?.leaseToken);
    await withServer(async (port) => {
      const denied = await httpRequest(port, 'GET', '/v1/store-edge/worker/dead-letters');
      expect(denied.status).toBe(403);
    }, { service: service(), storeEdgeWorkStore: workStore, resolveContext: () => ({ scope, authorization: { actorId: 'cashier-1', scope, permissions: ['store-edge:observe'] } }) });
    await withServer(async (port) => {
      const listed = await httpRequest(port, 'GET', '/v1/store-edge/worker/dead-letters');
      expect(listed.status).toBe(200);
      expect(listed.body).toContain('evt-dead-letter-1');
      const recovered = await httpRequest(port, 'POST', '/v1/store-edge/worker/dead-letters/requeue', JSON.stringify({ workId: 'dead-letter-work-1', reason: 'Provider issue corrected and replay approved.', reference: 'INC-2026-0007' }), { 'content-type': 'application/json' });
      expect(recovered.status).toBe(202);
      expect(recovered.body).toContain('INC-2026-0007');
    }, { service: service(), storeEdgeWorkStore: workStore, resolveContext: () => ({ scope, authorization: { actorId: 'manager-1', scope, permissions: ['store-edge:recover'] } }) });
    await expect(workStore.list(scope)).resolves.toMatchObject([{ status: 'retryable', requeueCount: 1 }]);
  });

  it('exposes only an injected, scope-bound worker metrics projection', async () => {
    const metrics = { runs: 2, claimed: 4, completed: 3, retryable: 1, deadLetter: 0, lastRunAt: '2026-08-06T10:00:00.000Z' };
    const metricsProvider = vi.fn(async (requestedScope) => {
      expect(requestedScope).toEqual(scope);
      return metrics;
    });
    await withServer(async (port) => {
      const unavailable = await httpRequest(port, 'GET', '/v1/store-edge/worker/metrics');
      expect(unavailable.status).toBe(503);
    }, { service: service() });
    await withServer(async (port) => {
      const denied = await httpRequest(port, 'GET', '/v1/store-edge/worker/metrics');
      expect(denied.status).toBe(403);
    }, {
      service: service(),
      storeEdgeWorkerMetrics: metricsProvider,
      resolveContext: () => ({ scope, authorization: { actorId: 'cashier-1', scope, permissions: ['store-edge:sync'] } }),
    });
    await withServer(async (port) => {
      const response = await httpRequest(port, 'GET', '/v1/store-edge/worker/metrics');
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ metrics, writeBackAllowed: false });
      expect(typeof JSON.parse(response.body).observedAt).toBe('string');
    }, {
      service: service(),
      storeEdgeWorkerMetrics: metricsProvider,
      resolveContext: () => ({ scope, authorization: { actorId: 'manager-1', scope, permissions: ['store-edge:observe'] } }),
    });
    expect(metricsProvider).toHaveBeenCalledTimes(1);
  });
});
