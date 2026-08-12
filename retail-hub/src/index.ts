export {
  createRetailHubService,
  registerReadOnlyRetailHubRoutes,
} from './service';

export { createShadowImportRegistry } from './shadow-import-registry';

export type {
  FastifyCompatibleReply,
  FastifyCompatibleRequest,
  FastifyCompatibleServer,
  RetailHubRequest,
  RetailHubResponse,
  RetailHubService,
  RetailHubServiceOptions,
} from './service';

export type { ShadowImportRegistry } from './shadow-import-registry';

export {
  createInMemoryShadowImportReviewStore,
  createShadowImportReviewDecision,
} from './shadow-import-review';
export type {
  ShadowImportReviewDecision,
  ShadowImportReviewDecisionInput,
  ShadowImportReviewDecisionKind,
  ShadowImportReviewStore,
} from './shadow-import-review';

export {
  createPostgresShadowImportRepository,
  createPostgresShadowImportReviewStore,
  createRlsScopedSqlClient,
  shadowImportPostgresSchema,
} from './shadow-import-postgres-repository';

export type {
  ShadowImportPostgresRepository,
  ShadowImportScope,
  ShadowImportSqlClient,
  ShadowImportTransactionPool,
} from './shadow-import-postgres-repository';

export { createPostgresRetailHubService, retailHubPermissions } from './postgres-service';
export type {
  DurableRetailHubRequest,
  DurableRetailHubService,
  PostgresRetailHubServiceOptions,
  RetailHubAuthorization,
  RetailHubPermission,
  RetailHubShadowImportSourceStatus,
} from './postgres-service';

export { buildBakalooCoverageMapUrl, createBakalooCoverageMapProviderFromVault } from './bakaloo-coverage-map';
export type {
  BakalooCoverageMapProviderOptions,
  BakalooCoverageMapRequest,
  BakalooCoverageMapRequester,
  BakalooCoverageMapResponse,
  RetailHubCoverageMapBoundary,
  RetailHubCoverageMapCustomer,
  RetailHubCoverageMapProjection,
  RetailHubCoverageMapShop,
} from './bakaloo-coverage-map';

export { createNodeHttpRetailHubServer } from './node-http-adapter';
export type { NodeHttpRetailHubContext, NodeHttpRetailHubServerOptions } from './node-http-adapter';

export {
  createInMemoryRetailHubChannelOrderTransport,
  normalizeRetailHubChannelOrderEvent,
  parseRetailHubChannelOrderEnvelope,
  retailHubChannelOrderChannels,
  retailHubChannelOrderPermissions,
  retailHubChannelOrderStatuses,
  RetailHubChannelOrderValidationError,
} from './channel-order-transport';
export type {
  RetailHubChannelOrderAcceptResult,
  RetailHubChannelOrderChannel,
  RetailHubChannelOrderEvent,
  RetailHubChannelOrderIngestionMode,
  RetailHubChannelOrderLine,
  RetailHubChannelOrderOutcome,
  RetailHubChannelOrderPermission,
  RetailHubChannelOrderReceipt,
  RetailHubChannelOrderRecord,
  RetailHubChannelOrderStatus,
  RetailHubChannelOrderTransportStore,
  RetailHubChannelOrderEnvelope,
} from './channel-order-transport';

export {
  createPostgresRetailHubChannelOrderTransport,
  retailHubChannelOrderPostgresSchema,
} from './channel-order-transport-postgres';
export type { RetailHubChannelOrderPostgresStoreOptions } from './channel-order-transport-postgres';

export { startRetailHubProductionServer, RetailHubProductionStartupError } from './production-server';
export type { RetailHubProductionServerHandle, RetailHubProductionServerOptions } from './production-server';

export {
  checksumStoreEdgePayload,
  createInMemoryStoreEdgeSyncInbox,
  parseStoreEdgeSyncEvent,
  StoreEdgeSyncValidationError,
} from './store-edge-sync';

export { createPostgresStoreEdgeSyncRepository } from './store-edge-sync-postgres-repository';
export type { StoreEdgeSyncPostgresRepository } from './store-edge-sync-postgres-repository';

export {
  createInMemoryStoreEdgeSyncWorkStore,
  StoreEdgeSyncWorkerValidationError,
} from './store-edge-sync-worker';
export type {
  StoreEdgeSyncWorkClaimOptions,
  StoreEdgeSyncWorkItem,
  StoreEdgeSyncWorkStatus,
  StoreEdgeSyncWorkStore,
} from './store-edge-sync-worker';

export { createPostgresStoreEdgeSyncWorkerRepository } from './store-edge-sync-worker-postgres-repository';
export type { StoreEdgeSyncWorkerPostgresRepository } from './store-edge-sync-worker-postgres-repository';

export { createStoreEdgeSyncWorkerRuntime } from './store-edge-sync-worker-runtime';
export type {
  StoreEdgeSyncWorkerMetrics,
  StoreEdgeSyncWorkerMetricsStore,
  StoreEdgeSyncWorkerRunOptions,
  StoreEdgeSyncWorkerRunReport,
  StoreEdgeSyncWorkerRuntime,
  StoreEdgeSyncWorkProcessor,
} from './store-edge-sync-worker-runtime';
export { createPostgresStoreEdgeSyncWorkerMetricsRepository } from './store-edge-sync-worker-metrics-postgres-repository';
export type { StoreEdgeSyncWorkerMetricsPostgresRepository } from './store-edge-sync-worker-metrics-postgres-repository';
export type {
  StoreEdgeSyncAcceptResult,
  StoreEdgeSyncAtomicAcceptResult,
  StoreEdgeSyncEventInput,
  StoreEdgeSyncInbox,
  StoreEdgeSyncOutcome,
  StoreEdgeSyncReceipt,
  StoreEdgeSyncRecord,
} from './store-edge-sync';

export {
  assertRetailHubDeploymentReady,
  evaluateRetailHubDeploymentReadiness,
  RetailHubDeploymentReadinessError,
} from './deployment-readiness';

export { readRetailHubDeploymentConfig } from './deployment-config';
export type { RetailHubDeploymentConfigResult, RetailHubEnvironment } from './deployment-config';
export { createRetailHubDeploymentPreflight } from './deployment-preflight';
export type { RetailHubDeploymentPreflight } from './deployment-preflight';
export type {
  RetailHubAuthMode,
  RetailHubDeploymentCheck,
  RetailHubDeploymentConfig,
  RetailHubDeploymentEnvironment,
  RetailHubDeploymentReadiness,
  RetailHubSourceMode,
} from './deployment-readiness';

export {
  ingestShadowImportEvidenceJson,
  parseShadowImportEvidenceJson,
} from './shadow-import-ingest';

export { collectShadowImportEvidence } from './shadow-import-source-adapter';
export type {
  CollectShadowImportEvidenceInput,
  ShadowImportPullResult,
  ShadowImportSourceAdapter,
  ShadowImportSourcePage,
} from './shadow-import-source-adapter';

export { pullAndRegisterShadowImport } from './shadow-import-pull-runtime';
export type {
  RegisterShadowImportPullInput,
  RegisteredShadowImportPull,
} from './shadow-import-pull-runtime';

export { pullAndRegisterScopedShadowImport } from './shadow-import-postgres-pull-runtime';
export type {
  RegisterScopedShadowImportPullInput,
  RegisteredScopedShadowImportPull,
} from './shadow-import-postgres-pull-runtime';

export { pullAndRegisterBakalooShadowImportFromVault } from './bakaloo-shadow-vault-pull-runtime';
export type { RegisterBakalooShadowImportFromVaultOptions } from './bakaloo-shadow-vault-pull-runtime';

export { assertShadowImportPullReceipt, createShadowImportPullReceipt } from './shadow-import-pull-receipt';
export type { ShadowImportPullReceipt } from './shadow-import-pull-receipt';

export { assessShadowImportCutover, shadowImportCutoverCapabilities } from './shadow-import-cutover';
export type {
  ShadowImportCutoverAssessment,
  ShadowImportCutoverAssessmentInput,
  ShadowImportCutoverCapability,
} from './shadow-import-cutover';

export { createBakalooShadowHttpAdapter } from './bakaloo-shadow-http-adapter';
export type {
  BakalooShadowHttpAdapterOptions,
  BakalooShadowHttpRequest,
  BakalooShadowHttpRequester,
  BakalooShadowHttpResponse,
} from './bakaloo-shadow-http-adapter';

export { createBakalooShadowHttpAdapterFromVault } from './bakaloo-shadow-credential-vault';
export type {
  BakalooShadowCredentialMaterial,
  BakalooShadowCredentialVault,
  BakalooShadowCredentialVaultAdapterOptions,
  BakalooShadowVaultRequester,
} from './bakaloo-shadow-credential-vault';

export {
  buildShadowImportPlan,
  checksumShadowImportEvidence,
  shadowImportEntities,
} from './shadow-import';

export type {
  ExternalIdMap,
  ImportBatch,
  ImportCursor,
  ReconciliationEntityResult,
  ReconciliationReport,
  ShadowImportConflict,
  ShadowImportConflictKind,
  ShadowImportEntity,
  ShadowImportEvidence,
  ShadowImportEvidenceForChecksum,
  ShadowImportPlan,
  ShadowImportRecord,
  ShadowImportSource,
} from './shadow-import';

export { evaluateRetailHubShadowImportPreflight } from './shadow-import-preflight';
export type {
  RetailHubShadowImportPreflight,
  RetailHubShadowImportPreflightCheck,
  RetailHubShadowImportPreflightInput,
} from './shadow-import-preflight';
