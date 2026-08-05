import type {
  ExternalIdMap,
  ImportBatch,
  ImportCursor,
  ReconciliationReport,
  ShadowImportConflict,
  ShadowImportEntity,
  ShadowImportPlan,
} from './shadow-import';
import { shadowImportEntities } from './shadow-import';
import { createShadowImportRegistry, type ShadowImportRegistry } from './shadow-import-registry';

export interface RetailHubRequest {
  method: string;
  /** Path plus optional query string, or an absolute URL. */
  url: string;
}

export interface RetailHubResponse<TBody = unknown> {
  status: number;
  headers: Readonly<Record<string, string>>;
  body?: TBody;
}

export interface RetailHubServiceOptions {
  /**
   * Previously created read-only plans. They are cloned on construction so a
   * caller cannot alter served evidence after the service starts.
  */
  shadowImportPlans?: readonly ShadowImportPlan[];
  /** A future PostgreSQL-backed registry can be injected without route changes. */
  registry?: ShadowImportRegistry;
}

export interface RetailHubService {
  handle(request: RetailHubRequest): RetailHubResponse;
}

/**
 * A deliberate, read-only HTTP boundary. It has no credentials, no database
 * transport, no importer, and no endpoint able to mutate Bakaloo or Epic BOS.
 */
export function createRetailHubService(options: RetailHubServiceOptions = {}): RetailHubService {
  const registry = options.registry ?? createShadowImportRegistry(options.shadowImportPlans ?? []);

  return {
    handle(request: RetailHubRequest): RetailHubResponse {
      const method = request.method.toUpperCase();
      const url = parseUrl(request.url);

      if (method === 'OPTIONS') {
        return emptyResponse(204, { allow: 'GET, HEAD, OPTIONS' });
      }

      if (method !== 'GET' && method !== 'HEAD') {
        return jsonResponse(405, {
          error: 'read_only_boundary',
          message: 'Retail Hub shadow-import endpoints do not accept writes.',
        }, { allow: 'GET, HEAD, OPTIONS' });
      }

      const response = routeGet(url, registry);
      return method === 'HEAD' ? { ...response, body: undefined } : response;
    },
  };
}

function routeGet(url: URL, registry: ShadowImportRegistry): RetailHubResponse {
  const plans = registry.listPlans();
  if (url.pathname === '/health') {
    return jsonResponse(200, {
      service: 'epic-bos-retail-hub',
      mode: 'read-only-shadow-import',
      writeBackAllowed: false,
      liveSourceConnected: false,
      batchCount: plans.length,
    });
  }

  if (url.pathname === '/v1/shadow-imports/batches') {
    return jsonResponse(200, { batches: plans.map((plan) => plan.batch) });
  }

  const batchPath = /^\/v1\/shadow-imports\/batches\/([^/]+)$/.exec(url.pathname);
  if (batchPath?.[1] !== undefined) {
    const batchId = decodePathPart(batchPath[1]);
    const plan = registry.getPlan(batchId);
    return plan === undefined
      ? notFound('shadow-import batch')
      : jsonResponse(200, { batch: plan.batch });
  }

  if (url.pathname === '/v1/shadow-imports/external-id-maps') {
    const entity = readEntityFilter(url);
    if (entity instanceof Error) return badRequest(entity.message);
    return jsonResponse(200, {
      externalIdMaps: filterByBatch(plans, url.searchParams.get('batchId'))
        .flatMap((plan) => plan.externalIdMaps)
        .filter((map) => entity === undefined || map.entity === entity),
    });
  }

  if (url.pathname === '/v1/shadow-imports/cursors') {
    return jsonResponse(200, {
      cursors: filterByBatch(plans, url.searchParams.get('batchId')).flatMap((plan) => plan.cursors),
    });
  }

  if (url.pathname === '/v1/shadow-imports/conflicts') {
    return jsonResponse(200, {
      conflicts: filterByBatch(plans, url.searchParams.get('batchId')).flatMap((plan) => plan.conflicts),
    });
  }

  if (url.pathname === '/v1/shadow-imports/reconciliation') {
    const matchingPlans = filterByBatch(plans, url.searchParams.get('batchId'));
    return jsonResponse(200, { reconciliation: matchingPlans.map((plan) => plan.reconciliation) });
  }

  return notFound('route');
}

function filterByBatch(
  plans: readonly ShadowImportPlan[],
  batchId: string | null,
): readonly ShadowImportPlan[] {
  return batchId === null ? plans : plans.filter((plan) => plan.batch.id === batchId);
}

function readEntityFilter(url: URL): ShadowImportEntity | undefined | Error {
  const entity = url.searchParams.get('entity');
  if (entity === null) return undefined;
  return shadowImportEntities.includes(entity as ShadowImportEntity)
    ? entity as ShadowImportEntity
    : new Error('entity must be a supported shadow-import entity.');
}

function parseUrl(value: string): URL {
  try {
    return new URL(value, 'http://retail-hub.local');
  } catch {
    return new URL('/invalid', 'http://retail-hub.local');
  }
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function notFound(resource: string): RetailHubResponse {
  return jsonResponse(404, {
    error: 'not_found',
    message: `No ${resource} matches this read-only Retail Hub request.`,
  });
}

function badRequest(message: string): RetailHubResponse {
  return jsonResponse(400, { error: 'invalid_request', message });
}

function jsonResponse<TBody>(
  status: number,
  body: TBody,
  additionalHeaders: Readonly<Record<string, string>> = {},
): RetailHubResponse<TBody> {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...additionalHeaders,
    },
    body: clone(body),
  };
}

function emptyResponse(
  status: number,
  additionalHeaders: Readonly<Record<string, string>> = {},
): RetailHubResponse {
  return {
    status,
    headers: {
      'cache-control': 'no-store',
      ...additionalHeaders,
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Structural adapter only: Fastify can mount this without a Fastify runtime
 * dependency in the Electron workspace. Use the real Fastify instance later.
 */
export interface FastifyCompatibleRequest {
  method: string;
  url: string;
}

export interface FastifyCompatibleReply {
  code(status: number): FastifyCompatibleReply;
  header(name: string, value: string): FastifyCompatibleReply;
  send(body?: unknown): unknown;
}

export interface FastifyCompatibleServer {
  route(options: {
    method: readonly string[];
    url: string;
    handler: (request: FastifyCompatibleRequest, reply: FastifyCompatibleReply) => unknown;
  }): unknown;
}

/**
 * Registers a catch-all route that delegates to the same tested public seam.
 * It accepts all verbs so writes receive a truthful 405 response rather than
 * appearing to be unsupported by accident.
 */
export function registerReadOnlyRetailHubRoutes(
  server: FastifyCompatibleServer,
  service: RetailHubService,
): void {
  server.route({
    method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: '/*',
    handler: (request, reply) => {
      const response = service.handle(request);
      let responseWriter = reply.code(response.status);
      for (const [name, value] of Object.entries(response.headers)) {
        responseWriter = responseWriter.header(name, value);
      }
      return responseWriter.send(response.body);
    },
  });
}

// Exported aliases make the HTTP resource vocabulary discoverable to clients.
export type {
  ExternalIdMap,
  ImportBatch,
  ImportCursor,
  ReconciliationReport,
  ShadowImportConflict,
};
