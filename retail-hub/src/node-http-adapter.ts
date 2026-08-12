import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { DurableRetailHubRequest, DurableRetailHubService, RetailHubAuthorization } from './postgres-service';
import type { RetailHubResponse } from './service';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import { parseStoreEdgeSyncEvent, StoreEdgeSyncValidationError, type StoreEdgeSyncAtomicAcceptResult, type StoreEdgeSyncEventInput, type StoreEdgeSyncInbox } from './store-edge-sync';
import { StoreEdgeSyncWorkerValidationError, type StoreEdgeSyncWorkStore } from './store-edge-sync-worker';
import type { StoreEdgeSyncWorkerMetrics } from './store-edge-sync-worker-runtime';
import {
  parseRetailHubChannelOrderEnvelope,
  type RetailHubChannelOrderTransportStore,
} from './channel-order-transport';

export interface NodeHttpRetailHubContext {
  /** Resolved by trusted middleware; request headers are never treated as scope. */
  scope?: ShadowImportScope;
  /** Optional server-owned authorization evidence for the durable service. */
  authorization?: RetailHubAuthorization;
}

export interface NodeHttpRetailHubServerOptions {
  service: DurableRetailHubService;
  /**
   * Auth middleware seam. The default returns no context, so every protected
   * route fails closed with 403 until a deployment supplies trusted auth.
   */
  resolveContext?: (request: IncomingMessage) => NodeHttpRetailHubContext | undefined | Promise<NodeHttpRetailHubContext | undefined>;
  /** Maximum JSON request body accepted by the review route. */
  maxBodyBytes?: number;
  /** Optional local sync inbox; absent means Store Edge sync remains unavailable. */
  storeEdgeInbox?: StoreEdgeSyncInbox;
  /**
   * Optional scope-bound worker queue for a non-atomic inbox implementation.
   * A PostgreSQL inbox exposing `acceptAndEnqueue` is preferred because it
   * commits the event, receipt, and work item together; this fallback exists
   * only for local/test wiring.
   */
  storeEdgeWorkStore?: StoreEdgeSyncWorkStore;
  /** Scope-bound metrics projection; never expose a process-global worker total. */
  storeEdgeWorkerMetrics?: (scope: ShadowImportScope) => StoreEdgeSyncWorkerMetrics | Promise<StoreEdgeSyncWorkerMetrics>;
  /** Optional authenticated channel-order evidence transport. */
  channelOrderTransport?: RetailHubChannelOrderTransportStore;
}

/**
 * Minimal Node HTTP adapter for the already-tested durable Hub service.
 *
 * This intentionally does not start a listener, read credentials, create a
 * database pool, or trust renderer-provided tenant/branch headers. A future
 * Fastify deployment can mount the same service behind real auth and TLS.
 */
export function createNodeHttpRetailHubServer(options: NodeHttpRetailHubServerOptions): Server {
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 1024 * 1024) {
    throw new Error('Retail Hub maxBodyBytes must be an integer between 1024 and 1048576.');
  }

  return createServer(async (request, response) => {
    try {
      const context = options.resolveContext ? await options.resolveContext(request) : undefined;
      const method = (request.method ?? 'GET').toUpperCase();
      const url = request.url ?? '/';
      const body = method === 'POST' && (isReviewDecisionPath(url) || isStoreEdgeSyncPath(url) || isStoreEdgeWorkerRecoveryPath(url) || isChannelOrderPath(url))
        ? await readJsonBody(request, maxBodyBytes)
        : undefined;
      if (isStoreEdgeSyncPath(url) || isStoreEdgeWorkerMetricsPath(url) || isStoreEdgeWorkerRecoveryPath(url) || isChannelOrderPath(url)) {
        const storeEdgeResponse = isStoreEdgeWorkerMetricsPath(url)
          ? await handleStoreEdgeWorkerMetricsRequest(method, url, context, options.storeEdgeWorkerMetrics)
          : isStoreEdgeWorkerRecoveryPath(url)
            ? await handleStoreEdgeWorkerRecoveryRequest(method, url, body, context, options.storeEdgeWorkStore)
          : isChannelOrderPath(url)
            ? await handleChannelOrderRequest(method, url, body, context, options.channelOrderTransport)
            : await handleStoreEdgeRequest(method, url, body, context, options.storeEdgeInbox, options.storeEdgeWorkStore);
        writeResponse(response, storeEdgeResponse.status, storeEdgeResponse.headers, storeEdgeResponse.body);
        return;
      }
      const serviceRequest: DurableRetailHubRequest = {
        method,
        url,
        ...(body === undefined ? {} : { body }),
        ...(context?.scope === undefined ? {} : { scope: context.scope }),
        ...(context?.authorization === undefined ? {} : { authorization: context.authorization }),
      };
      const result = await options.service.handle(serviceRequest);
      writeResponse(response, result.status, result.headers, result.body);
    } catch (error) {
      const status = error instanceof RequestBodyError ? error.status : 500;
      const body = error instanceof RequestBodyError
        ? { error: error.code, message: error.message }
        : { error: 'retail_hub_internal_error', message: 'The Retail Hub request could not be completed.' };
      writeResponse(response, status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body);
    }
  });
}

function isReviewDecisionPath(url: string): boolean {
  try {
    return new URL(url, 'http://retail-hub.local').pathname === '/v1/shadow-imports/review-decisions';
  } catch {
    return false;
  }
}

function isStoreEdgeSyncPath(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://retail-hub.local');
    return parsed.pathname === '/v1/store-edge/sync' || parsed.pathname === '/v1/store-edge/sync/receipts';
  } catch {
    return false;
  }
}

function isStoreEdgeWorkerMetricsPath(url: string): boolean {
  try {
    return new URL(url, 'http://retail-hub.local').pathname === '/v1/store-edge/worker/metrics';
  } catch {
    return false;
  }
}

function isStoreEdgeWorkerRecoveryPath(url: string): boolean {
  try {
    const pathname = new URL(url, 'http://retail-hub.local').pathname;
    return pathname === '/v1/store-edge/worker/dead-letters' || pathname === '/v1/store-edge/worker/dead-letters/requeue';
  } catch {
    return false;
  }
}

function isChannelOrderPath(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://retail-hub.local');
    return parsed.pathname === '/v1/channel-orders/events' || parsed.pathname === '/v1/channel-orders/receipts';
  } catch {
    return false;
  }
}

async function handleChannelOrderRequest(
  method: string,
  url: string,
  body: unknown,
  context: NodeHttpRetailHubContext | undefined,
  transport: RetailHubChannelOrderTransportStore | undefined,
): Promise<RetailHubResponse> {
  if (!transport) return jsonResponse(503, { error: 'channel_order_transport_unavailable', message: 'Channel-order transport is not configured for this Hub.' });
  if (!context?.scope || !context.authorization) return jsonResponse(403, { error: 'authorization_required', message: 'An authenticated channel-order actor and scope are required.' });
  if (context.authorization.scope.tenantId !== context.scope.tenantId || context.authorization.scope.companyId !== context.scope.companyId || context.authorization.scope.branchId !== context.scope.branchId) {
    return jsonResponse(403, { error: 'authorization_scope_mismatch', message: 'The authenticated channel-order scope does not match the request scope.' });
  }
  const parsed = new URL(url, 'http://retail-hub.local');
  if (method === 'GET' && parsed.pathname === '/v1/channel-orders/receipts') {
    if (!context.authorization.permissions.includes('channel-orders:read') && !context.authorization.permissions.includes('channel-orders:ingest')) return jsonResponse(403, { error: 'permission_required', message: 'The authenticated actor is not allowed to read channel-order receipts.' });
    return jsonResponse(200, { receipts: await transport.list(context.scope), writeBackAllowed: false });
  }
  if (method !== 'POST' || parsed.pathname !== '/v1/channel-orders/events') return jsonResponse(405, { error: 'channel_order_method_not_allowed', message: 'Channel-order transport accepts POST events and GET receipts only.' }, { allow: 'GET, POST, OPTIONS' });
  if (!context.authorization.permissions.includes('channel-orders:ingest')) return jsonResponse(403, { error: 'permission_required', message: 'The authenticated actor is not allowed to ingest channel-order evidence.' });
  try {
    const envelope = parseRetailHubChannelOrderEnvelope(body);
    const accepted = await transport.accept(envelope, context.scope, context.authorization.actorId);
    return jsonResponse(accepted.outcome === 'conflicted' ? 409 : accepted.outcome === 'idempotent' ? 200 : 202, { ...accepted, writeBackAllowed: false });
  } catch (error) {
    if (error instanceof Error && error.name === 'RetailHubChannelOrderValidationError') return jsonResponse(400, { error: 'invalid_channel_order', message: error.message });
    throw error;
  }
}

async function handleStoreEdgeWorkerMetricsRequest(
  method: string,
  url: string,
  context: NodeHttpRetailHubContext | undefined,
  metricsProvider: NodeHttpRetailHubServerOptions['storeEdgeWorkerMetrics'],
): Promise<RetailHubResponse> {
  if (!metricsProvider) return jsonResponse(503, { error: 'store_edge_metrics_unavailable', message: 'Store Edge worker metrics are not configured for this Hub.' });
  if (method !== 'GET') return jsonResponse(405, { error: 'store_edge_metrics_method_not_allowed', message: 'Store Edge worker metrics are read-only.' }, { allow: 'GET, OPTIONS' });
  if (!context?.scope || !context.authorization) return jsonResponse(403, { error: 'authorization_required', message: 'An authenticated Store Edge observer and scope are required.' });
  if (!context.authorization.permissions.includes('store-edge:observe')) return jsonResponse(403, { error: 'permission_required', message: 'The authenticated actor is not allowed to view Store Edge worker metrics.' });
  return jsonResponse(200, {
    metrics: await metricsProvider(context.scope),
    observedAt: new Date().toISOString(),
    writeBackAllowed: false,
  });
}

async function handleStoreEdgeWorkerRecoveryRequest(
  method: string,
  url: string,
  body: unknown,
  context: NodeHttpRetailHubContext | undefined,
  workStore: StoreEdgeSyncWorkStore | undefined,
): Promise<RetailHubResponse> {
  if (!workStore) return jsonResponse(503, { error: 'store_edge_worker_unavailable', message: 'Store Edge worker recovery is not configured for this Hub.' });
  if (!context?.scope || !context.authorization) return jsonResponse(403, { error: 'authorization_required', message: 'An authenticated Store Edge recovery actor and scope are required.' });
  if (context.authorization.scope.tenantId !== context.scope.tenantId || context.authorization.scope.companyId !== context.scope.companyId || context.authorization.scope.branchId !== context.scope.branchId) {
    return jsonResponse(403, { error: 'authorization_scope_mismatch', message: 'The authenticated Store Edge recovery scope does not match the request scope.' });
  }
  if (!context.authorization.permissions.includes('store-edge:recover')) return jsonResponse(403, { error: 'permission_required', message: 'The authenticated actor is not allowed to recover Store Edge dead letters.' });
  const parsed = new URL(url, 'http://retail-hub.local');
  if (method === 'GET' && parsed.pathname === '/v1/store-edge/worker/dead-letters') {
    const items = (await workStore.list(context.scope)).filter((item) => item.status === 'dead-letter');
    return jsonResponse(200, { workItems: items, writeBackAllowed: false });
  }
  if (method !== 'POST' || parsed.pathname !== '/v1/store-edge/worker/dead-letters/requeue') {
    return jsonResponse(405, { error: 'store_edge_worker_recovery_method_not_allowed', message: 'Store Edge recovery accepts GET dead letters and POST requeue only.' }, { allow: 'GET, POST, OPTIONS' });
  }
  try {
    const input = parseDeadLetterRecoveryRequest(body);
    const item = await workStore.requeueDeadLetter(context.scope, input.workId, context.authorization.actorId, input.reason, input.reference);
    return jsonResponse(202, { workItem: item, writeBackAllowed: false });
  } catch (error) {
    if (error instanceof StoreEdgeSyncWorkerValidationError) return jsonResponse(409, { error: 'store_edge_dead_letter_recovery_rejected', message: error.message });
    throw error;
  }
}

function parseDeadLetterRecoveryRequest(value: unknown): { workId: string; reason: string; reference: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreEdgeSyncWorkerValidationError('Store Edge recovery request must be an object.');
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.workId !== 'string' || candidate.workId.trim().length < 1 || candidate.workId.trim().length > 500) throw new StoreEdgeSyncWorkerValidationError('Store Edge recovery work ID is required.');
  if (typeof candidate.reason !== 'string' || candidate.reason.trim().length < 10 || candidate.reason.trim().length > 500) throw new StoreEdgeSyncWorkerValidationError('Store Edge recovery reason must be between 10 and 500 characters.');
  if (typeof candidate.reference !== 'string' || candidate.reference.trim().length < 3 || candidate.reference.trim().length > 200) throw new StoreEdgeSyncWorkerValidationError('Store Edge recovery reference must be between 3 and 200 characters.');
  return { workId: candidate.workId.trim(), reason: candidate.reason.trim(), reference: candidate.reference.trim() };
}

async function handleStoreEdgeRequest(
  method: string,
  url: string,
  body: unknown,
  context: NodeHttpRetailHubContext | undefined,
  inbox: StoreEdgeSyncInbox | undefined,
  workStore: StoreEdgeSyncWorkStore | undefined,
): Promise<RetailHubResponse> {
  if (!inbox) return jsonResponse(503, { error: 'store_edge_sync_unavailable', message: 'Store Edge sync is not configured for this Hub.' });
  if (!context?.scope || !context.authorization) return jsonResponse(403, { error: 'authorization_required', message: 'An authenticated Store Edge actor and scope are required.' });
  if (!context.authorization.permissions.includes('store-edge:sync')) return jsonResponse(403, { error: 'permission_required', message: 'The authenticated actor is not allowed to synchronize Store Edge evidence.' });
  const parsed = new URL(url, 'http://retail-hub.local');
  if (method === 'GET' && parsed.pathname === '/v1/store-edge/sync/receipts') {
    return jsonResponse(200, { receipts: await inbox.list(context.scope) });
  }
  if (method !== 'POST' || parsed.pathname !== '/v1/store-edge/sync') return jsonResponse(405, { error: 'store_edge_sync_method_not_allowed', message: 'Store Edge sync accepts POST events and GET receipts only.' }, { allow: 'GET, POST, OPTIONS' });
  try {
    const event = parseStoreEdgeSyncEvent(body);
    const atomicInbox = asAtomicInbox(inbox);
    const accepted = atomicInbox
      ? await atomicInbox.acceptAndEnqueue(event, context.scope, context.authorization.actorId)
      : await inbox.accept(event, context.scope, context.authorization.actorId);
    if (!atomicInbox && accepted.outcome !== 'conflicted' && accepted.record && workStore) {
      await workStore.enqueue(accepted.record, accepted.receipt.receivedAt);
    }
    return jsonResponse(accepted.outcome === 'conflicted' ? 409 : accepted.outcome === 'idempotent' ? 200 : 202, accepted);
  } catch (error) {
    if (error instanceof StoreEdgeSyncValidationError) return jsonResponse(400, { error: 'invalid_store_edge_sync', message: error.message });
    throw error;
  }
}

type AtomicStoreEdgeSyncInbox = StoreEdgeSyncInbox & {
  acceptAndEnqueue(input: StoreEdgeSyncEventInput, scope: ShadowImportScope, actorId: string, now?: string): Promise<StoreEdgeSyncAtomicAcceptResult>;
};

function asAtomicInbox(inbox: StoreEdgeSyncInbox): AtomicStoreEdgeSyncInbox | undefined {
  const candidate = inbox as Partial<AtomicStoreEdgeSyncInbox>;
  return typeof candidate.acceptAndEnqueue === 'function' ? candidate as AtomicStoreEdgeSyncInbox : undefined;
}

function jsonResponse(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): RetailHubResponse {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }, body };
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const declaredLength = request.headers['content-length'];
  if (declaredLength !== undefined) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) throw new RequestBodyError(400, 'invalid_content_length', 'Content-Length must be a non-negative integer.');
    if (length > maxBodyBytes) throw new RequestBodyError(413, 'request_body_too_large', 'Review request body exceeds the Retail Hub limit.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new RequestBodyError(413, 'request_body_too_large', 'Review request body exceeds the Retail Hub limit.');
    chunks.push(buffer);
  }
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) throw new RequestBodyError(415, 'json_content_type_required', 'Review requests must use application/json.');
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new RequestBodyError(400, 'invalid_json', 'Review request body must be valid JSON.');
  }
}

function writeResponse(response: ServerResponse, status: number, headers: Readonly<Record<string, string>>, body?: unknown): void {
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('x-content-type-options', 'nosniff');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  if (serialized !== undefined) {
    response.setHeader('content-length', Buffer.byteLength(serialized));
    response.end(serialized);
  } else {
    response.end();
  }
}

class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413 | 415, readonly code: string, message: string) {
    super(message);
    this.name = 'RequestBodyError';
  }
}
