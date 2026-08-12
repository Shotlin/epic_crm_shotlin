import { readRetailHubDeploymentConfig, type RetailHubEnvironment } from './deployment-config';
import { evaluateRetailHubDeploymentReadiness, type RetailHubDeploymentCheck } from './deployment-readiness';

export interface RetailHubDeploymentPreflight {
  schema: 'epic-bos-retail-hub-deployment-preflight';
  generatedAt: string;
  status: 'ready' | 'hold';
  environment: 'development' | 'staging' | 'production';
  writeBackAllowed: false;
  /** Names only; no environment values or secret material are returned. */
  invalidKeys: readonly string[];
  checks: readonly RetailHubDeploymentCheck[];
  blockers: readonly string[];
}

/**
 * Produce a safe, machine-readable deployment report from an environment
 * object. This is suitable for CI or a control-room export: it never returns
 * URLs, credentials, headers, or other configuration values.
 */
export function createRetailHubDeploymentPreflight(
  environment: RetailHubEnvironment,
  now: string = new Date().toISOString(),
): RetailHubDeploymentPreflight {
  const result = readRetailHubDeploymentConfig(environment);
  const readiness = evaluateRetailHubDeploymentReadiness(result.config);
  const invalidBlockers = result.invalidKeys.map((key) => `invalid-config:${key}`);
  const blockers = [...new Set([...readiness.blockers, ...invalidBlockers])];
  return {
    schema: 'epic-bos-retail-hub-deployment-preflight',
    generatedAt: validTimestamp(now),
    status: blockers.length === 0 ? 'ready' : 'hold',
    environment: result.config.environment,
    writeBackAllowed: false,
    invalidKeys: result.invalidKeys,
    checks: readiness.checks,
    blockers,
  };
}

function validTimestamp(value: string): string {
  const normalized = value.trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) throw new Error('Deployment preflight timestamp must be a valid timestamp.');
  return normalized;
}
