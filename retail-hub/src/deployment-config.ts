import type {
  RetailHubDeploymentConfig,
} from './deployment-readiness';

/** A deliberately narrow environment seam; callers may pass process.env without exposing it. */
export type RetailHubEnvironment = Readonly<Record<string, string | undefined>>;

export interface RetailHubDeploymentConfigResult {
  config: RetailHubDeploymentConfig;
  invalidKeys: readonly string[];
}

/**
 * Build the readiness input from deployment configuration without returning any
 * secret values. Missing, malformed, or unsupported values become conservative
 * holds in the readiness evaluator.
 */
export function readRetailHubDeploymentConfig(environment: RetailHubEnvironment): RetailHubDeploymentConfigResult {
  const invalidKeys: string[] = [];
  const deploymentEnvironment = readEnum(environment.RETAIL_HUB_ENVIRONMENT, ['development', 'staging', 'production'] as const, 'RETAIL_HUB_ENVIRONMENT', invalidKeys, 'development');
  const authMode = readEnum(environment.RETAIL_HUB_AUTH_MODE, ['trusted-proxy', 'oidc', 'none'] as const, 'RETAIL_HUB_AUTH_MODE', invalidKeys, 'none');
  const sourceMode = readEnum(environment.RETAIL_HUB_SOURCE_MODE, ['shadow-read-only', 'parallel-run', 'write-enabled'] as const, 'RETAIL_HUB_SOURCE_MODE', invalidKeys, 'shadow-read-only');
  const allowedOrigins = splitList(environment.RETAIL_HUB_ALLOWED_ORIGINS);

  return {
    config: {
      environment: deploymentEnvironment,
      publicOrigin: environment.RETAIL_HUB_PUBLIC_ORIGIN?.trim() ?? '',
      allowedOrigins,
      databaseUrl: environment.DATABASE_URL?.trim() || undefined,
      databaseRlsContextConfigured: readBoolean(environment.RETAIL_HUB_DATABASE_RLS_CONTEXT_CONFIGURED, 'RETAIL_HUB_DATABASE_RLS_CONTEXT_CONFIGURED', invalidKeys),
      redisUrl: environment.REDIS_URL?.trim() || undefined,
      authMode,
      tlsEnabled: readBoolean(environment.RETAIL_HUB_TLS_ENABLED, 'RETAIL_HUB_TLS_ENABLED', invalidKeys),
      credentialVaultConfigured: readBoolean(environment.RETAIL_HUB_CREDENTIAL_VAULT_CONFIGURED, 'RETAIL_HUB_CREDENTIAL_VAULT_CONFIGURED', invalidKeys),
      observabilityConfigured: readBoolean(environment.RETAIL_HUB_OBSERVABILITY_CONFIGURED, 'RETAIL_HUB_OBSERVABILITY_CONFIGURED', invalidKeys),
      backupConfigured: readBoolean(environment.RETAIL_HUB_BACKUP_CONFIGURED, 'RETAIL_HUB_BACKUP_CONFIGURED', invalidKeys),
      storeEdgeWorkerConfigured: readBoolean(environment.RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED, 'RETAIL_HUB_STORE_EDGE_WORKER_CONFIGURED', invalidKeys),
      storeEdgeAtomicInboxConfigured: readBoolean(environment.RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED, 'RETAIL_HUB_STORE_EDGE_ATOMIC_INBOX_CONFIGURED', invalidKeys),
      storeEdgeMetricsConfigured: readBoolean(environment.RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED, 'RETAIL_HUB_STORE_EDGE_METRICS_CONFIGURED', invalidKeys),
      storeEdgeRecoveryConfigured: readBoolean(environment.RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED, 'RETAIL_HUB_STORE_EDGE_RECOVERY_CONFIGURED', invalidKeys),
      sourceMode,
    },
    invalidKeys,
  };
}

function splitList(value: string | undefined): readonly string[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function readBoolean(value: string | undefined, key: string, invalidKeys: string[]): boolean {
  if (value === 'true') return true;
  if (value === 'false' || value === undefined) {
    if (value === undefined) invalidKeys.push(key);
    return false;
  }
  invalidKeys.push(key);
  return false;
}

function readEnum<T extends readonly string[]>(value: string | undefined, allowed: T, key: string, invalidKeys: string[], fallback: T[number]): T[number] {
  if (value && (allowed as readonly string[]).includes(value)) return value as T[number];
  if (value !== undefined) invalidKeys.push(key);
  return value === undefined ? fallback : (allowed[0] as T[number]);
}
