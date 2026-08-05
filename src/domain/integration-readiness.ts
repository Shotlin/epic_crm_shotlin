import { providerConformanceMatchesCredentialRevision, providerCredentialLifecycle, providerCredentialRevision, type ProviderCapability, type ProviderConnector } from '../shared/provider-contracts';
import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type IntegrationReadiness = 'ready' | 'degraded' | 'blocked';

export interface IntegrationConnectorAssessment {
  connectorId: string;
  code: string;
  providerName: string;
  domain: ProviderConnector['domain'];
  environment: ProviderConnector['environment'];
  readiness: IntegrationReadiness;
  credentialReady: boolean;
  conformanceReady: boolean;
  requiredCapabilities: ProviderCapability[];
  missingCapabilities: ProviderCapability[];
  pendingHandoffs: number;
  reconciliationDrift: number;
  conformanceCaseCount: number;
  passedConformanceCases: number;
  conformanceEvidenceReferences: string[];
  invalidConformanceCases: number;
  staleCredentialCases: number;
  credentialRevision: number;
  credentialState: ReturnType<typeof providerCredentialLifecycle>;
  credentialExpiresAt?: string;
  blockers: string[];
  nextAction: 'configure-credentials' | 'complete-conformance' | 'add-capability' | 'await-response' | 'reconcile' | 'activate' | 'ready';
}

export interface IntegrationReadinessSummary {
  generatedAt: string;
  total: number;
  ready: number;
  degraded: number;
  blocked: number;
  assessments: IntegrationConnectorAssessment[];
}

type IntegrationSource = Pick<RevenueOpsSnapshot, 'scope' | 'providerConnectors' | 'providerConformanceCases' | 'providerSubmissions' | 'providerReconciliationRuns'>;

function inScope(state: IntegrationSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function requiredCapabilities(connector: ProviderConnector): ProviderCapability[] {
  if (connector.domain === 'banking') return ['payment-release', 'payment-status-pull', 'statement-pull'];
  if (connector.domain === 'payroll') return ['payroll-disbursement', 'payroll-status-pull', 'payslip-delivery'];
  if (connector.domain === 'messaging') return ['email-delivery', 'whatsapp-delivery'];
  return ['statutory-filing', 'statutory-status-pull'];
}

/** Aggregate connector health with explicit certification and reconciliation blockers. */
export function buildIntegrationReadiness(state: IntegrationSource, generatedAt = new Date().toISOString()): IntegrationReadinessSummary {
  const assessments = state.providerConnectors.filter((connector) => connector.active && inScope(state, connector)).map((connector) => {
    const required = requiredCapabilities(connector);
    const credentialState = providerCredentialLifecycle(connector, generatedAt);
    const missing = required.filter((capability) => !connector.capabilities.includes(capability));
    const cases = state.providerConformanceCases.filter((item) => item.connectorId === connector.id && inScope(state, item));
    const conformanceReady = connector.conformanceStatus === 'production-approved' || (connector.environment === 'sandbox' && connector.conformanceStatus === 'sandbox-verified');
    const staleCredentialCases = cases.filter((item) => !providerConformanceMatchesCredentialRevision(connector, item)).length;
    const currentCredentialCases = cases.filter((item) => providerConformanceMatchesCredentialRevision(connector, item));
    const invalidConformanceCases = currentCredentialCases.filter((item) => item.result !== 'passed' || item.environment !== connector.environment || !item.evidenceReference?.trim() || !/^[a-f0-9]{64}$/i.test(item.resultChecksum ?? '') || !item.assessedBy?.trim() || !item.assessedAt || !Number.isFinite(Date.parse(item.assessedAt))).length;
    const passedConformanceCases = currentCredentialCases.filter(({ result }) => result === 'passed').length;
    const conformanceEvidenceReferences = [...new Set(currentCredentialCases.map(({ evidenceReference }) => evidenceReference?.trim()).filter((reference): reference is string => Boolean(reference)))].sort();
    const conformanceBlocked = !conformanceReady || !cases.length || invalidConformanceCases > 0 || staleCredentialCases > 0;
    const pendingHandoffs = state.providerSubmissions.filter((submission) => submission.connectorId === connector.id && ['prepared', 'handed-off'].includes(submission.status) && inScope(state, submission)).length;
    const reconciliationDrift = state.providerReconciliationRuns.filter((run) => run.connectorId === connector.id && inScope(state, run)).reduce((sum, run) => sum + run.items.filter(({ result }) => result !== 'matched').length, 0);
    const blockers: string[] = [];
    if (credentialState === 'missing') blockers.push('Credentials are not configured in the protected vault.');
    if (credentialState === 'expired') blockers.push('Provider credentials have expired; reseal a new credential generation before any handoff.');
    if (credentialState === 'revoked') blockers.push('Provider credentials were revoked; reseal a new credential generation before any handoff.');
    if (!conformanceReady || !cases.length || invalidConformanceCases > 0) blockers.push('Provider conformance evidence is incomplete or independently unverified.');
    if (staleCredentialCases) blockers.push(`${staleCredentialCases} conformance case${staleCredentialCases === 1 ? '' : 's'} use an older credential revision and must be replayed.`);
    if (missing.length) blockers.push(`Required capabilities missing: ${missing.join(', ')}.`);
    if (pendingHandoffs) blockers.push(`${pendingHandoffs} handoff${pendingHandoffs === 1 ? '' : 's'} await external response.`);
    if (reconciliationDrift) blockers.push(`${reconciliationDrift} reconciliation exception${reconciliationDrift === 1 ? '' : 's'} require review.`);
    if (connector.conformanceStatus === 'suspended') blockers.push('Connector is suspended.');
    const readiness: IntegrationReadiness = connector.conformanceStatus === 'suspended' || credentialState !== 'configured' || missing.length || conformanceBlocked ? 'blocked' : blockers.length ? 'degraded' : 'ready';
    const nextAction: IntegrationConnectorAssessment['nextAction'] = credentialState !== 'configured' ? 'configure-credentials' : missing.length ? 'add-capability' : !conformanceReady || !cases.length || invalidConformanceCases > 0 || staleCredentialCases > 0 ? 'complete-conformance' : reconciliationDrift ? 'reconcile' : pendingHandoffs ? 'await-response' : connector.conformanceStatus !== 'production-approved' && connector.environment === 'production' ? 'activate' : 'ready';
    return { connectorId: connector.id, code: connector.code, providerName: connector.providerLegalName, domain: connector.domain, environment: connector.environment, readiness, credentialReady: credentialState === 'configured', conformanceReady, requiredCapabilities: required, missingCapabilities: missing, pendingHandoffs, reconciliationDrift, conformanceCaseCount: cases.length, passedConformanceCases, conformanceEvidenceReferences, invalidConformanceCases, staleCredentialCases, credentialRevision: providerCredentialRevision(connector), credentialState, credentialExpiresAt: connector.credentialExpiresAt, blockers: [...new Set(blockers)], nextAction };
  }).sort((left, right) => left.code.localeCompare(right.code));
  return { generatedAt, total: assessments.length, ready: assessments.filter(({ readiness }) => readiness === 'ready').length, degraded: assessments.filter(({ readiness }) => readiness === 'degraded').length, blocked: assessments.filter(({ readiness }) => readiness === 'blocked').length, assessments };
}
