export interface FetchRetailHubDeploymentPreflightInput {
  /** Credential-free HTTPS base URL; authentication stays server-side. */
  baseUrl: string;
}

export type RetailHubDeploymentEnvironment = 'development' | 'staging' | 'production';
export type RetailHubDeploymentCheckStatus = 'pass' | 'hold';

export interface RetailHubDeploymentCheck {
  id: string;
  status: RetailHubDeploymentCheckStatus;
  summary: string;
}

export interface RetailHubDeploymentPreflight {
  schema: 'epic-bos-retail-hub-deployment-preflight';
  generatedAt: string;
  status: 'ready' | 'hold';
  environment: RetailHubDeploymentEnvironment;
  writeBackAllowed: false;
  invalidKeys: readonly string[];
  checks: readonly RetailHubDeploymentCheck[];
  blockers: readonly string[];
}
