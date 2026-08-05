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
  shadowImportPostgresSchema,
} from './shadow-import-postgres-repository';

export type {
  ShadowImportPostgresRepository,
  ShadowImportScope,
  ShadowImportSqlClient,
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
