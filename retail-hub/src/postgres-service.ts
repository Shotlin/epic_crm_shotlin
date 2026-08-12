import type { ShadowImportEntity, ShadowImportPlan } from './shadow-import';
import { shadowImportEntities } from './shadow-import';
import { assessShadowImportCutover, shadowImportCutoverCapabilities, type ShadowImportCutoverCapability } from './shadow-import-cutover';
import type { ShadowImportPostgresRepository, ShadowImportScope } from './shadow-import-postgres-repository';
import type { RetailHubResponse } from './service';
import { createShadowImportReviewDecision, projectShadowImportReviewApprovalState, type ShadowImportReviewDecisionInput, type ShadowImportReviewStore } from './shadow-import-review';
import { evaluateRetailHubShadowImportPreflight } from './shadow-import-preflight';
import { evaluateRetailHubDeploymentReadiness, type RetailHubDeploymentConfig } from './deployment-readiness';
import { retailHubChannelOrderPermissions, type RetailHubChannelOrderPermission } from './channel-order-transport';
import type { RetailHubCoverageMapProjection } from './bakaloo-coverage-map';

export interface DurableRetailHubRequest {
  method: string;
  url: string;
  /** Parsed JSON body supplied by the trusted server adapter for review actions. */
  body?: unknown;
  /** Set only by an authenticated server adapter; renderer values are ignored. */
  scope?: ShadowImportScope;
  /** Set only by a trusted adapter; never derived from renderer headers. */
  authorization?: RetailHubAuthorization;
}

export interface DurableRetailHubService {
  handle(request: DurableRetailHubRequest): Promise<RetailHubResponse>;
}

export const retailHubPermissions = ['shadow-import:read', 'shadow-import:review', 'coverage-map:read', 'store-edge:sync', 'store-edge:observe', 'store-edge:recover', ...retailHubChannelOrderPermissions] as const;
export type RetailHubPermission = (typeof retailHubPermissions)[number] | RetailHubChannelOrderPermission;

/**
 * Trusted authorization evidence supplied by the server adapter. The Hub
 * never derives actor, scope, or permissions from renderer request fields.
 */
export interface RetailHubAuthorization {
  actorId: string;
  scope: ShadowImportScope;
  permissions: readonly RetailHubPermission[];
}

/** Non-secret source health supplied by the server-owned connector boundary. */
export interface RetailHubShadowImportSourceStatus {
  status: 'unconfigured' | 'configured' | 'reachable' | 'unreachable';
  credentialRevision?: number;
  checkedAt?: string;
  message?: string;
}

export interface PostgresRetailHubServiceOptions {
  repository: ShadowImportPostgresRepository;
  /** Resolves scope from trusted auth middleware, never from renderer input. */
  resolveScope: (request: DurableRetailHubRequest) => ShadowImportScope | undefined | Promise<ShadowImportScope | undefined>;
  /** Optional least-privilege auth seam. When supplied, it is authoritative over resolveScope. */
  resolveAuthorization?: (request: DurableRetailHubRequest) => RetailHubAuthorization | undefined | Promise<RetailHubAuthorization | undefined>;
  /** Internal review evidence store; it never writes to Bakaloo or business records. */
  reviewStore?: ShadowImportReviewStore;
  /** Resolves the current trusted credential generation for a source scope. */
  resolveShadowImportCredentialRevision?: (scope: ShadowImportScope) => number | undefined | Promise<number | undefined>;
  /** Optional server-owned live-source probe. Renderer requests cannot provide this state. */
  resolveShadowImportSourceStatus?: (scope: ShadowImportScope) => RetailHubShadowImportSourceStatus | Promise<RetailHubShadowImportSourceStatus>;
  /** Server-owned, read-only Bakaloo coverage-map projection provider. */
  resolveCoverageMap?: (scope: ShadowImportScope, shopId: string) => RetailHubCoverageMapProjection | undefined | Promise<RetailHubCoverageMapProjection | undefined>;
  /** Server-side deployment controls used by the read-only shadow preflight route. */
  deploymentConfig?: RetailHubDeploymentConfig;
  now?: () => string;
  createId?: () => string;
}

/** Async runtime binding for the scoped PostgreSQL repository. All routes remain read-only. */
export function createPostgresRetailHubService(options: PostgresRetailHubServiceOptions): DurableRetailHubService {
  return {
    async handle(request) {
      const method = request.method.toUpperCase();
      if (method === 'OPTIONS') return emptyResponse(204, { allow: 'GET, HEAD, OPTIONS' });
      const url = parseUrl(request.url);
      const isReviewDecisionRoute = url.pathname === '/v1/shadow-imports/review-decisions';
      if (method !== 'GET' && method !== 'HEAD' && !(method === 'POST' && isReviewDecisionRoute)) return jsonResponse(405, { error: 'read_only_boundary', message: 'Retail Hub shadow-import endpoints do not accept writes.' }, { allow: 'GET, HEAD, OPTIONS' });

      const authorization = options.resolveAuthorization
        ? await options.resolveAuthorization(request)
        : undefined;
      if (options.resolveAuthorization && !authorization) {
        return jsonResponse(403, { error: 'authorization_required', message: 'An authenticated Retail Hub actor is required.' });
      }
      const requiredPermission = method === 'POST'
        ? 'shadow-import:review'
        : isCoverageMapPath(url)
          ? 'coverage-map:read'
          : 'shadow-import:read';
      if (authorization && !hasPermission(authorization.permissions, requiredPermission)) {
        return jsonResponse(403, { error: 'permission_required', message: `The authenticated actor is not allowed to ${requiredPermission === 'shadow-import:review' ? 'review' : 'read'} shadow-import evidence.` });
      }
      if (method === 'POST' && !options.resolveAuthorization) return jsonResponse(403, { error: 'authorization_required', message: 'Review decisions require an authenticated reviewer.' });
      const scope = authorization?.scope ?? await options.resolveScope(request);
      if (!scope) return jsonResponse(403, { error: 'scope_required', message: 'An authenticated tenant, company, and branch scope is required.' });
      if (method === 'POST') return createReviewDecision(request, url, scope, authorization, options);
      if (isCoverageMapPath(url)) {
        const response = await routeCoverageMap(url, scope, options.resolveCoverageMap);
        return method === 'HEAD' ? { ...response, body: undefined } : response;
      }
      const plans = await options.repository.listPlans(scope);
      const needsCredentialRevision = url.pathname === '/v1/shadow-imports/review-decisions' || url.pathname === '/v1/shadow-imports/cutover' || url.pathname === '/v1/shadow-imports/preflight';
      const currentCredentialRevision = needsCredentialRevision && options.resolveShadowImportCredentialRevision
        ? await options.resolveShadowImportCredentialRevision(scope)
        : undefined;
      const sourceStatus = options.resolveShadowImportSourceStatus
        ? normalizeSourceStatus(await options.resolveShadowImportSourceStatus(scope))
        : { status: 'unconfigured' as const };
      const response = await routeGet(url, scope, plans, options.repository, options.reviewStore, currentCredentialRevision, sourceStatus, options.deploymentConfig);
      return method === 'HEAD' ? { ...response, body: undefined } : response;
    },
  };
}

function hasPermission(permissions: readonly RetailHubPermission[], required: RetailHubPermission): boolean {
  return permissions.includes(required) || (required === 'shadow-import:read' && permissions.includes('shadow-import:review'));
}

function isCoverageMapPath(url: URL): boolean {
  return /^\/v1\/admin\/coverage-map\/[^/]+$/u.test(url.pathname);
}

async function routeCoverageMap(url: URL, scope: ShadowImportScope, resolveCoverageMap?: PostgresRetailHubServiceOptions['resolveCoverageMap']): Promise<RetailHubResponse> {
  const coverageMapPath = /^\/v1\/admin\/coverage-map\/([^/]+)$/u.exec(url.pathname);
  if (!coverageMapPath?.[1]) return notFound('route');
  if (!resolveCoverageMap) return jsonResponse(503, { error: 'coverage_map_unavailable', message: 'Bakaloo coverage-map transport is not configured for this Hub.' });
  const shopId = decodePathPart(coverageMapPath[1]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(shopId)) return badRequest('shopId must be a UUID.');
  const projection = await resolveCoverageMap(scope, shopId);
  return projection === undefined ? notFound('coverage map') : jsonResponse(200, { success: true, data: projection, writeBackAllowed: false });
}

async function routeGet(url: URL, scope: ShadowImportScope, plans: readonly ShadowImportPlan[], repository: ShadowImportPostgresRepository, reviewStore?: ShadowImportReviewStore, currentCredentialRevision?: number, sourceStatus: RetailHubShadowImportSourceStatus = { status: 'unconfigured' }, deploymentConfig?: RetailHubDeploymentConfig): Promise<RetailHubResponse> {
  if (url.pathname === '/health') return jsonResponse(200, { service: 'epic-bos-retail-hub', mode: 'durable-read-only-shadow-import', writeBackAllowed: false, liveSourceConnected: sourceStatus.status === 'reachable', sourceStatus, batchCount: plans.length });
  if (url.pathname === '/v1/deployment/preflight') {
    if (!deploymentConfig) return jsonResponse(503, { error: 'deployment_config_unconfigured', message: 'Deployment preflight requires server-owned deployment configuration.' });
    return jsonResponse(200, { preflight: evaluateRetailHubDeploymentReadiness(deploymentConfig) });
  }
  if (url.pathname === '/v1/shadow-imports/source-status') return jsonResponse(200, { sourceStatus });
  if (url.pathname === '/v1/shadow-imports/batches') return jsonResponse(200, { batches: plans.map((plan) => plan.batch) });

  const batchPath = /^\/v1\/shadow-imports\/batches\/([^/]+)$/.exec(url.pathname);
  if (batchPath?.[1] !== undefined) {
    const plan = await repository.getPlan(scope, decodePathPart(batchPath[1]));
    return plan === undefined ? notFound('shadow-import batch') : jsonResponse(200, { batch: plan.batch });
  }
  const selected = filterByBatch(plans, url.searchParams.get('batchId'));
  if (url.pathname === '/v1/shadow-imports/external-id-maps') {
    const entity = readEntityFilter(url);
    if (entity instanceof Error) return badRequest(entity.message);
    return jsonResponse(200, { externalIdMaps: selected.flatMap((plan) => plan.externalIdMaps).filter((map) => entity === undefined || map.entity === entity) });
  }
  if (url.pathname === '/v1/shadow-imports/cursors') return jsonResponse(200, { cursors: selected.flatMap((plan) => plan.cursors) });
  if (url.pathname === '/v1/shadow-imports/conflicts') return jsonResponse(200, { conflicts: selected.flatMap((plan) => plan.conflicts) });
  if (url.pathname === '/v1/shadow-imports/reconciliation') return jsonResponse(200, { reconciliation: selected.map((plan) => plan.reconciliation) });
  if (url.pathname === '/v1/shadow-imports/preflight') {
    if (!deploymentConfig) return jsonResponse(503, { error: 'deployment_config_unconfigured', message: 'Shadow-import preflight requires server-owned deployment configuration.' });
    const batchId = url.searchParams.get('batchId');
    if (!batchId) return badRequest('batchId is required for shadow-import preflight.');
    const plan = await repository.getPlan(scope, batchId);
    if (!plan) return notFound('shadow-import batch');
    return jsonResponse(200, { preflight: evaluateRetailHubShadowImportPreflight({ deployment: deploymentConfig, scope, plan, requiredCredentialRevision: currentCredentialRevision }) });
  }
  if (url.pathname === '/v1/shadow-imports/pull-receipts') {
    if (!repository.listPullReceipts) return jsonResponse(503, { error: 'pull_receipt_store_unconfigured', message: 'Pull receipt persistence is not configured for this Hub deployment.' });
    return jsonResponse(200, { receipts: await repository.listPullReceipts(scope, url.searchParams.get('batchId') ?? undefined) });
  }
  if (url.pathname === '/v1/shadow-imports/review-decisions') {
    if (!reviewStore) return jsonResponse(503, { error: 'review_store_unconfigured', message: 'Review decision persistence is not configured for this Hub deployment.' });
    const decisions = await reviewStore.list(scope, url.searchParams.get('batchId') ?? undefined);
    return jsonResponse(200, { decisions: decisions.map((decision) => projectShadowImportReviewApprovalState(decision, currentCredentialRevision)) });
  }
  if (url.pathname === '/v1/shadow-imports/cutover') {
    if (!reviewStore) return jsonResponse(503, { error: 'review_store_unconfigured', message: 'Cutover assessment requires persisted review evidence.' });
    const batchId = url.searchParams.get('batchId');
    const capability = readCutoverCapability(url);
    if (!batchId || capability instanceof Error) return badRequest(capability instanceof Error ? capability.message : 'batchId is required for cutover assessment.');
    const plan = await repository.getPlan(scope, batchId);
    if (!plan) return notFound('shadow-import batch');
    const decisions = await reviewStore.list(scope, batchId);
    return jsonResponse(200, { assessment: assessShadowImportCutover({ plan, decisions, scope, capability, currentCredentialRevision }) });
  }
  return notFound('route');
}

async function createReviewDecision(
  request: DurableRetailHubRequest,
  url: URL,
  scope: ShadowImportScope,
  authorization: RetailHubAuthorization | undefined,
  options: PostgresRetailHubServiceOptions,
): Promise<RetailHubResponse> {
  if (url.pathname !== '/v1/shadow-imports/review-decisions') return notFound('route');
  if (!options.reviewStore) return jsonResponse(503, { error: 'review_store_unconfigured', message: 'Review decision persistence is not configured for this Hub deployment.' });
  if (!authorization) return jsonResponse(403, { error: 'authorization_required', message: 'Review decisions require an authenticated reviewer.' });
  const input = parseReviewDecisionInput(request.body);
  if (input instanceof Error) return badRequest(input.message);
  const plan = await options.repository.getPlan(scope, input.batchId);
  if (!plan) return notFound('shadow-import batch');
  try {
    const currentCredentialRevision = options.resolveShadowImportCredentialRevision
      ? await options.resolveShadowImportCredentialRevision(scope)
      : undefined;
    const decision = createShadowImportReviewDecision(plan, input, {
      actorId: authorization.actorId,
      scope,
      now: options.now?.() ?? new Date().toISOString(),
      id: options.createId?.() ?? `review-${Date.now()}`,
      currentCredentialRevision,
    });
    await options.reviewStore.append(scope, decision);
    return jsonResponse(201, { decision });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Review decision could not be recorded.');
  }
}

function parseReviewDecisionInput(body: unknown): ShadowImportReviewDecisionInput | Error {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return new Error('Review decision body must be a JSON object.');
  const value = body as Record<string, unknown>;
  if (typeof value.batchId !== 'string' || typeof value.decision !== 'string' || typeof value.reason !== 'string') return new Error('Review decision requires batchId, decision, and reason.');
  if (value.decision !== 'accepted' && value.decision !== 'rejected') return new Error('Review decision must be accepted or rejected.');
  return { batchId: value.batchId, decision: value.decision, reason: value.reason };
}

function normalizeSourceStatus(value: RetailHubShadowImportSourceStatus): RetailHubShadowImportSourceStatus {
  if (!value || !['unconfigured', 'configured', 'reachable', 'unreachable'].includes(value.status)) throw new Error('Retail Hub source status resolver returned an unsupported status.');
  if (value.credentialRevision !== undefined && (!Number.isInteger(value.credentialRevision) || value.credentialRevision < 1)) throw new Error('Retail Hub source status credential revision must be a positive integer.');
  return {
    status: value.status,
    ...(value.credentialRevision === undefined ? {} : { credentialRevision: value.credentialRevision }),
    ...(value.checkedAt === undefined ? {} : { checkedAt: value.checkedAt.slice(0, 80) }),
    ...(value.message === undefined ? {} : { message: value.message.slice(0, 500) }),
  };
}

function filterByBatch(plans: readonly ShadowImportPlan[], batchId: string | null): readonly ShadowImportPlan[] { return batchId === null ? plans : plans.filter((plan) => plan.batch.id === batchId); }
function readEntityFilter(url: URL): ShadowImportEntity | undefined | Error { const entity = url.searchParams.get('entity'); if (entity === null) return undefined; return shadowImportEntities.includes(entity as ShadowImportEntity) ? entity as ShadowImportEntity : new Error('entity must be a supported shadow-import entity.'); }
function readCutoverCapability(url: URL): ShadowImportCutoverCapability | Error { const capability = url.searchParams.get('capability'); return capability !== null && shadowImportCutoverCapabilities.includes(capability as ShadowImportCutoverCapability) ? capability as ShadowImportCutoverCapability : new Error('capability must be a supported shadow-import cutover capability.'); }
function parseUrl(value: string): URL { try { return new URL(value, 'http://retail-hub.local'); } catch { return new URL('/invalid', 'http://retail-hub.local'); } }
function decodePathPart(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
function notFound(resource: string): RetailHubResponse { return jsonResponse(404, { error: 'not_found', message: `No ${resource} matches this read-only Retail Hub request.` }); }
function badRequest(message: string): RetailHubResponse { return jsonResponse(400, { error: 'invalid_request', message }); }
function jsonResponse<TBody>(status: number, body: TBody, additionalHeaders: Readonly<Record<string, string>> = {}): RetailHubResponse<TBody> { return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...additionalHeaders }, body: clone(body) }; }
function emptyResponse(status: number, additionalHeaders: Readonly<Record<string, string>> = {}): RetailHubResponse { return { status, headers: { 'cache-control': 'no-store', ...additionalHeaders } }; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
