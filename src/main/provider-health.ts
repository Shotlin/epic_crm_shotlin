import type { ProviderConnector, ProviderConformanceCase, ProviderReconciliationRun, ProviderSubmission } from '../shared/provider-contracts';
import { providerConformanceMatchesCredentialRevision } from '../shared/provider-contracts';

export interface ProviderConnectorHealth {
  connectorId: string;
  status: 'healthy' | 'degraded' | 'blocked';
  credentialReady: boolean;
  conformanceReady: boolean;
  pendingHandoffs: number;
  reconciliationExceptions: number;
  reasons: string[];
}

export function summarizeProviderHealth(input: {
  connector: ProviderConnector;
  cases: ProviderConformanceCase[];
  submissions: ProviderSubmission[];
  reconciliations: ProviderReconciliationRun[];
}): ProviderConnectorHealth {
  const { connector } = input;
  const connectorCases = input.cases.filter(({ connectorId }) => connectorId === connector.id);
  const currentConnectorCases = connectorCases.filter((item) => providerConformanceMatchesCredentialRevision(connector, item));
  const connectorSubmissions = input.submissions.filter(({ connectorId }) => connectorId === connector.id);
  const connectorRuns = input.reconciliations.filter(({ connectorId }) => connectorId === connector.id);
  const reasons: string[] = [];
  const credentialReady = connector.credentialStatus === 'configured';
  const currentCapabilities = new Set(currentConnectorCases.filter((item) => item.result === 'passed' && item.assessedBy && item.evidenceReference && item.resultChecksum).map((item) => item.capability));
  const conformanceReady = (connector.conformanceStatus === 'sandbox-verified' || connector.conformanceStatus === 'production-approved')
    && connector.capabilities.every((capability) => currentCapabilities.has(capability) || (connector.capabilities.length === 1 && currentConnectorCases.some((item) => item.result === 'passed' && !item.capability)));
  if (!credentialReady) reasons.push('Credentials are not sealed.');
  if (!conformanceReady) reasons.push('Independent conformance approval for the current credential generation is incomplete.');
  const pendingHandoffs = connectorSubmissions.filter(({ status }) => status === 'handed-off').length;
  if (pendingHandoffs) reasons.push(`${pendingHandoffs} handoff(s) await external evidence.`);
  const reconciliationExceptions = connectorRuns.reduce((total, run) => total + run.items.filter(({ result }) => result !== 'matched').length, 0);
  if (reconciliationExceptions) reasons.push(`${reconciliationExceptions} reconciliation exception(s) require review.`);
  if (!currentConnectorCases.length && connector.environment === 'sandbox') reasons.push('No conformance case has been prepared for the current credential generation.');
  const status = !credentialReady || connector.conformanceStatus === 'suspended' ? 'blocked' : (reasons.length ? 'degraded' : 'healthy');
  return { connectorId: connector.id, status, credentialReady, conformanceReady, pendingHandoffs, reconciliationExceptions, reasons };
}
