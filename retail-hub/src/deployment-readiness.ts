export type RetailHubDeploymentEnvironment = 'development' | 'staging' | 'production';
export type RetailHubAuthMode = 'trusted-proxy' | 'oidc' | 'none';
export type RetailHubSourceMode = 'shadow-read-only' | 'parallel-run' | 'write-enabled';

export interface RetailHubDeploymentConfig {
  environment: RetailHubDeploymentEnvironment;
  publicOrigin: string;
  allowedOrigins: readonly string[];
  databaseUrl?: string;
  /** True only when the pool transaction wrapper sets all epic_bos.* RLS settings. */
  databaseRlsContextConfigured: boolean;
  redisUrl?: string;
  authMode: RetailHubAuthMode;
  tlsEnabled: boolean;
  credentialVaultConfigured: boolean;
  observabilityConfigured: boolean;
  backupConfigured: boolean;
  /** Store Edge worker lease/retry/dead-letter coordination is deployed. */
  storeEdgeWorkerConfigured: boolean;
  /** Store Edge ingress commits inbox, receipt, and work item atomically. */
  storeEdgeAtomicInboxConfigured: boolean;
  /** Store Edge worker metrics are durably projected and exported to observability. */
  storeEdgeMetricsConfigured: boolean;
  /** A tested Store Edge backup/restore and conflict-recovery drill is recorded. */
  storeEdgeRecoveryConfigured: boolean;
  /** Write-back is never accepted by this gate; cutover has a separate approval. */
  sourceMode: RetailHubSourceMode;
}

export interface RetailHubDeploymentCheck {
  id: string;
  status: 'pass' | 'hold';
  summary: string;
}

export interface RetailHubDeploymentReadiness {
  status: 'ready' | 'hold';
  environment: RetailHubDeploymentEnvironment;
  writeBackAllowed: false;
  checks: readonly RetailHubDeploymentCheck[];
  blockers: readonly string[];
}

/**
 * Evaluate a deployment without opening sockets, resolving secrets, or
 * contacting a provider. The result is intentionally value-free so it can be
 * safely shown in a release control room.
 */
export function evaluateRetailHubDeploymentReadiness(config: RetailHubDeploymentConfig): RetailHubDeploymentReadiness {
  const checks: RetailHubDeploymentCheck[] = [];
  const needsInfrastructure = config.environment !== 'development';
  const secureTransportRequired = config.environment !== 'development';

  checks.push(check('public-origin', isSafeOrigin(config.publicOrigin, secureTransportRequired), 'Public origin is explicit and uses HTTPS outside development.'));
  checks.push(check('allowed-origins', config.allowedOrigins.length > 0 && config.allowedOrigins.every((origin) => isSafeOrigin(origin, secureTransportRequired) && origin !== '*'), 'Allowed origins are explicit; wildcard browser access is rejected.'));
  checks.push(check('authentication', config.authMode !== 'none', 'A trusted proxy or OIDC authorization boundary is configured.'));
  checks.push(check('transport-security', !secureTransportRequired || config.tlsEnabled, 'TLS is enabled for staging and production.'));
  checks.push(check('postgresql', !needsInfrastructure || isDatabaseUrl(config.databaseUrl), 'A PostgreSQL connection is configured for durable Hub state.'));
  checks.push(check('database-rls-context', !needsInfrastructure || config.databaseRlsContextConfigured, 'The database pool sets tenant/company/branch RLS context inside each transaction.'));
  checks.push(check('redis', !needsInfrastructure || isRedisUrl(config.redisUrl), 'A Redis connection is configured for queues, idempotency and rate limits.'));
  checks.push(check('credential-vault', config.credentialVaultConfigured, 'Provider credentials are owned by a server-side vault.'));
  checks.push(check('observability', config.observabilityConfigured, 'Structured logs, metrics and error reporting are configured.'));
  checks.push(check('backup', config.backupConfigured, 'Database backup and restore ownership is configured.'));
  checks.push(check('store-edge-worker', config.storeEdgeWorkerConfigured, 'Store Edge worker leases, retries and dead-letter handling are deployed.'));
  checks.push(check('store-edge-atomic-inbox', config.storeEdgeAtomicInboxConfigured, 'Store Edge ingress commits the inbox event, receipt, and worker item in one transaction.'));
  checks.push(check('store-edge-metrics', config.storeEdgeMetricsConfigured, 'Store Edge worker health and queue metrics are durably persisted by legal scope and exported.'));
  checks.push(check('store-edge-recovery', config.storeEdgeRecoveryConfigured, 'Store Edge backup, restore and conflict-recovery evidence is current.'));
  checks.push(check('source-mode', config.sourceMode !== 'write-enabled', 'The deployment remains shadow-only or parallel-run; write-back requires a separate cutover decision.'));

  const blockers = checks.filter(({ status }) => status === 'hold').map(({ id }) => id);
  return { status: blockers.length === 0 ? 'ready' : 'hold', environment: config.environment, writeBackAllowed: false, checks, blockers };
}

export function assertRetailHubDeploymentReady(config: RetailHubDeploymentConfig): RetailHubDeploymentReadiness {
  const readiness = evaluateRetailHubDeploymentReadiness(config);
  if (readiness.status === 'hold') throw new RetailHubDeploymentReadinessError(readiness);
  return readiness;
}

export class RetailHubDeploymentReadinessError extends Error {
  constructor(readonly readiness: RetailHubDeploymentReadiness) {
    super(`Retail Hub deployment is on hold: ${readiness.blockers.join(', ')}.`);
    this.name = 'RetailHubDeploymentReadinessError';
  }
}

function check(id: string, passed: boolean, summary: string): RetailHubDeploymentCheck {
  return { id, status: passed ? 'pass' : 'hold', summary };
}

function isSafeOrigin(value: string, secureRequired: boolean): boolean {
  try {
    const origin = new URL(value);
    return origin.username === '' && origin.password === '' && origin.pathname === '/' && origin.search === '' && origin.hash === '' && (!secureRequired || origin.protocol === 'https:') && (origin.protocol === 'https:' || origin.protocol === 'http:') && origin.hostname !== '';
  } catch {
    return false;
  }
}

function isDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.hostname !== '' && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function isRedisUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'redis:' || url.protocol === 'rediss:') && url.hostname !== '';
  } catch {
    return false;
  }
}
