import { createHash, randomUUID } from 'node:crypto';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import type {
  ApproveProviderConnectorInput,
  CanonicalProviderStatus,
  ConfigureProviderConnectorInput,
  CreateProviderConformanceCaseInput,
  HandOffProviderSubmissionInput,
  ProviderCapability,
  ProviderConnector,
  ProviderConformanceCase,
  ProviderDomain,
  ProviderReconciliationItem,
  PrepareProviderSubmissionInput,
  RecordProviderConformanceResultInput,
  RecordProviderSubmissionResponseInput,
  PlanProviderConformancePackInput,
} from '../shared/provider-contracts';
import { providerConformanceMatchesCredentialRevision, providerCredentialLifecycle, providerCredentialRevision } from '../shared/provider-contracts';
import type {
  RetailReportDeliveryAttempt,
  RetailReportDeliveryPlan,
} from '../shared/report-delivery-contracts';

const digest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, min = 2, max = 240): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const fiscalNumber = (prefix: string, sequence: number, at: string): string => {
  const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${prefix}/${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`;
};
const mutate = (state: RevenueOpsState): RevenueOpsState => ({ ...structuredClone(state), revision: state.revision + 1 });

const currentPassedConformance = (state: RevenueOpsState, connector: ProviderConnector) => state.providerConformanceCases.filter((item) =>
  item.connectorId === connector.id
    && item.environment === connector.environment
    && item.result === 'passed'
    && Boolean(item.assessedBy)
    && providerConformanceMatchesCredentialRevision(connector, item),
);

const hasCurrentCapabilityCoverage = (state: RevenueOpsState, connector: ProviderConnector, assessorToExclude?: string): boolean => {
  const passed = currentPassedConformance(state, connector).filter((item) => !assessorToExclude || item.assessedBy !== assessorToExclude);
  return connector.capabilities.every((capability) => passed.some((item) => item.capability === capability || (!item.capability && connector.capabilities.length === 1)));
};

const capabilityDomain: Record<ProviderCapability, ProviderDomain> = {
  'payment-release': 'banking', 'payment-status-pull': 'banking', 'statement-pull': 'banking',
  'payroll-disbursement': 'payroll', 'payroll-status-pull': 'payroll', 'payslip-delivery': 'payroll',
  'statutory-filing': 'statutory', 'statutory-status-pull': 'statutory',
  'email-delivery': 'messaging', 'whatsapp-delivery': 'messaging',
};

export interface ProviderMessagingSourceContext {
  plans: RetailReportDeliveryPlan[];
  attempts: RetailReportDeliveryAttempt[];
}

function connectorFor(state: RevenueOpsState, id: string): ProviderConnector {
  const connector = state.providerConnectors.find((candidate) => candidate.id === id && candidate.active);
  if (!connector) throw new Error('Active provider connector not found.');
  return connector;
}

function sameScope(left: { companyId: string; branchId: string }, right: { companyId: string; branchId: string }): boolean {
  return left.companyId === right.companyId && left.branchId === right.branchId;
}

function validateMessagingSources(
  state: RevenueOpsState,
  connector: ProviderConnector,
  capability: ProviderCapability,
  sourceIds: string[],
  context?: ProviderMessagingSourceContext,
): void {
  if (!context) throw new Error('Messaging handoff requires the scoped report-delivery registry. Refresh and retry.');
  const expectedChannel = capability === 'email-delivery' ? 'email' : capability === 'whatsapp-delivery' ? 'whatsapp' : undefined;
  if (!expectedChannel) throw new Error('This messaging capability cannot prepare a provider handoff.');
  const planById = new Map(context.plans.map((plan) => [plan.id, plan]));
  const attemptById = new Map(context.attempts.map((attempt) => [attempt.id, attempt]));
  for (const sourceId of sourceIds) {
    const attempt = attemptById.get(sourceId);
    if (!attempt || !sameScope(attempt.scope, state.scope)) throw new Error('Messaging handoff requires report-delivery attempts from the active company and branch.');
    if (attempt.status !== 'prepared') throw new Error('Messaging handoff requires report-delivery attempts that are prepared and not already handed off.');
    if (attempt.channel !== expectedChannel) throw new Error(`Provider capability ${capability} requires ${expectedChannel} report-delivery attempts.`);
    const plan = planById.get(attempt.planId);
    if (!plan || !sameScope(plan.scope, state.scope) || plan.status !== 'approved') throw new Error('Messaging handoff requires an approved, in-scope report-delivery plan.');
    if (plan.channel !== expectedChannel) throw new Error('Report-delivery plan channel does not match the provider capability.');
    if (plan.providerConnectorId && plan.providerConnectorId !== connector.id) throw new Error('Report-delivery plan is bound to a different provider connector.');
    if (!plan.recipients.length || plan.recipients.some((recipient) => recipient.kind === 'customer-contact' && !recipient.consentId?.trim())) throw new Error('Messaging handoff requires affirmative consent evidence for every customer recipient.');
  }
  const alreadySubmitted = state.providerSubmissions.some((submission) => submission.connectorId === connector.id && submission.capability === capability && ['prepared', 'handed-off'].includes(submission.status) && submission.sourceIds.some((sourceId) => sourceIds.includes(sourceId)));
  if (alreadySubmitted) throw new Error('A prepared or handed-off provider submission already references one of these delivery attempts.');
}

function sourceKindFor(state: RevenueOpsState, connector: ProviderConnector, capability: ProviderCapability, sourceIds: string[], messagingSources?: ProviderMessagingSourceContext) {
  const { domain } = connector;
  if (!sourceIds.length || sourceIds.length > 200 || new Set(sourceIds).size !== sourceIds.length) throw new Error('Choose 1-200 unique source records.');
  if (domain === 'banking' && capability === 'payment-release') {
    if (sourceIds.some((id) => !state.paymentProposals.some((item) => item.id === id && item.status === 'released'))) throw new Error('Banking handoff requires released payment proposals.');
    return 'payment-proposal' as const;
  }
  if (domain === 'payroll' && ['payroll-disbursement', 'payslip-delivery'].includes(capability)) {
    if (sourceIds.some((id) => !state.payrollRuns.some((item) => item.id === id && item.status === 'finalized'))) throw new Error('Payroll handoff requires finalized payroll runs.');
    return 'payroll-run' as const;
  }
  if (domain === 'statutory' && capability === 'statutory-filing') {
    if (sourceIds.some((id) => !state.payrollStatutoryObligations.some((item) => item.id === id && ['calculated', 'reported'].includes(item.status)))) throw new Error('Statutory handoff requires calculated or reported payroll obligations.');
    return 'payroll-obligation' as const;
  }
  if (domain === 'messaging' && ['email-delivery', 'whatsapp-delivery'].includes(capability)) {
    validateMessagingSources(state, connector, capability, sourceIds, messagingSources);
    return 'report-delivery-attempt' as const;
  }
  throw new Error('This connector capability cannot prepare a provider handoff.');
}

export function configureProviderConnector(state: RevenueOpsState, input: ConfigureProviderConnectorInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(code) || state.providerConnectors.some((item) => item.code === code)) throw new Error('Provider connector code is invalid or already exists.');
  const base = new URL(input.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Provider base URL must be a credential-free HTTPS origin or path.');
  const statusPathTemplate = input.statusPathTemplate.trim();
  if (!statusPathTemplate.startsWith('/') || statusPathTemplate.includes('://') || statusPathTemplate.includes('..') || !statusPathTemplate.includes('{reference}')) throw new Error('Status path must be a safe same-origin path containing {reference}.');
  const capabilities = [...new Set(input.capabilities)];
  if (!capabilities.length || capabilities.some((capability) => capabilityDomain[capability] !== input.domain)) throw new Error('Provider capabilities must belong to its selected domain.');
  const next = mutate(state);
  next.providerConnectors.unshift({ id, code, name: clean(input.name, 'Connector name'), providerLegalName: clean(input.providerLegalName, 'Provider legal name'), domain: input.domain, environment: input.environment, baseUrl: base.toString().replace(/\/$/, ''), statusPathTemplate, capabilities, specificationVersion: clean(input.specificationVersion, 'Specification version', 1, 80), credentialStatus: 'missing', credentialRevision: 0, conformanceStatus: 'draft', active: true, createdBy: actorId, createdAt: now, version: 1 });
  return next;
}

export function markProviderCredentials(state: RevenueOpsState, connectorId: string, fingerprint: string): RevenueOpsState {
  const connector = connectorFor(state, connectorId);
  const unchanged = connector.credentialStatus === 'configured'
    && connector.credentialFingerprint === fingerprint
    && connector.credentialExpiresAt === undefined
    && connector.credentialRevokedAt === undefined;
  const next = mutate(state);
  next.providerConnectors = next.providerConnectors.map((item) => item.id === connectorId ? {
    ...item,
    credentialStatus: 'configured',
    credentialFingerprint: fingerprint,
    credentialExpiresAt: undefined,
    credentialRevision: unchanged ? Math.max(1, providerCredentialRevision(item)) : providerCredentialRevision(item) + 1,
    credentialRevokedAt: undefined,
    credentialRevocationReason: undefined,
    conformanceStatus: unchanged ? item.conformanceStatus : 'draft',
    approvedBy: unchanged ? item.approvedBy : undefined,
    approvedAt: unchanged ? item.approvedAt : undefined,
    version: item.version + 1,
  } : item);
  return next;
}

/** Seal a credential generation with an optional expiry without ever storing raw secrets. */
export function markProviderCredentialsWithExpiry(
  state: RevenueOpsState,
  connectorId: string,
  fingerprint: string,
  expiresAt?: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('Provider credential sealing requires a valid timestamp.');
  if (expiresAt !== undefined && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= nowMs)) {
    throw new Error('Provider credential expiry must be a valid future timestamp.');
  }
  const connector = connectorFor(state, connectorId);
  const unchanged = connector.credentialStatus === 'configured'
    && connector.credentialFingerprint === fingerprint
    && connector.credentialExpiresAt === expiresAt
    && providerCredentialLifecycle(connector, now) === 'configured';
  if (unchanged) return mutate(state);
  const next = mutate(state);
  next.providerConnectors = next.providerConnectors.map((item) => item.id === connectorId ? {
    ...item,
    credentialStatus: 'configured',
    credentialFingerprint: fingerprint,
    credentialExpiresAt: expiresAt,
    credentialRevokedAt: undefined,
    credentialRevocationReason: undefined,
    credentialRevision: providerCredentialRevision(item) + 1,
    conformanceStatus: 'draft',
    approvedBy: undefined,
    approvedAt: undefined,
    version: item.version + 1,
  } : item);
  return next;
}

/** Revoke the active credential generation and invalidate approval immediately. */
export function revokeProviderCredentials(
  state: RevenueOpsState,
  connectorId: string,
  reason: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const connector = connectorFor(state, connectorId);
  if (!Number.isFinite(Date.parse(now))) throw new Error('Credential revocation requires a valid timestamp.');
  const cleanedReason = clean(reason, 'Credential revocation reason', 4, 240);
  if (providerCredentialLifecycle(connector, now) === 'revoked') return mutate(state);
  const next = mutate(state);
  next.providerConnectors = next.providerConnectors.map((item) => item.id === connectorId ? {
    ...item,
    credentialRevokedAt: now,
    credentialRevocationReason: cleanedReason,
    conformanceStatus: 'draft',
    approvedBy: undefined,
    approvedAt: undefined,
    version: item.version + 1,
  } : item);
  return next;
}

export function createProviderConformanceCase(state: RevenueOpsState, input: CreateProviderConformanceCaseInput, actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = connectorFor(state, input.connectorId);
  const capability = input.capability ?? (connector.capabilities.length === 1 ? connector.capabilities[0] : undefined);
  if (capability && !connector.capabilities.includes(capability)) throw new Error('Conformance capability is not declared by this provider connector.');
  if (input.paymentRail && connector.domain !== 'banking') throw new Error('Payment rail tags are only valid for banking connectors.');
  if (input.deliveryChannel && connector.domain !== 'messaging') throw new Error('Delivery channel tags are only valid for messaging connectors.');
  const next = mutate(state);
  const deliveryChannel = connector.domain === 'messaging'
    ? input.deliveryChannel ?? (capability === 'email-delivery' ? 'email' : capability === 'whatsapp-delivery' ? 'whatsapp' : undefined)
    : undefined;
  const record: ProviderConformanceCase = { id, connectorId: connector.id, capability, paymentRail: connector.domain === 'banking' ? input.paymentRail : undefined, deliveryChannel, suiteName: clean(input.suiteName, 'Conformance suite'), suiteVersion: clean(input.suiteVersion, 'Suite version', 1, 80), scenario: clean(input.scenario, 'Scenario', 8, 500), environment: connector.environment, credentialRevision: providerCredentialRevision(connector), result: 'planned', preparedBy: actorId, preparedAt: now, version: 1 };
  next.providerConformanceCases.unshift(record);
  return next;
}

/**
 * Plans a complete capability pack without certifying or activating a provider.
 * Existing planned/passed cases are retained, making the action safe to repeat
 * after a provider adds credentials or a reviewer returns one scenario.
 */
export function planProviderConformancePack(state: RevenueOpsState, input: PlanProviderConformancePackInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const connector = connectorFor(state, input.connectorId);
  const suiteName = clean(input.suiteName, 'Conformance suite');
  const suiteVersion = clean(input.suiteVersion, 'Suite version', 1, 80);
  const scenarioByCapability: Record<ProviderCapability, string> = {
    'payment-release': 'Idempotent payment release, rejection and response evidence',
    'payment-status-pull': 'Payment status pull, retry and drift reconciliation',
    'statement-pull': 'Statement pull, duplicate line protection and match evidence',
    'payroll-disbursement': 'Payroll disbursement batch, rejection and acknowledgement evidence',
    'payroll-status-pull': 'Payroll status pull, retry and provider drift reconciliation',
    'payslip-delivery': 'Private payslip delivery, recipient acknowledgement and failure evidence',
    'statutory-filing': 'Statutory filing submission, rejection and portal response evidence',
    'statutory-status-pull': 'Statutory portal status pull and reconciliation evidence',
    'email-delivery': 'Email report delivery, bounce/opt-out and acknowledgement evidence',
    'whatsapp-delivery': 'WhatsApp report delivery, DLT/template/opt-out and acknowledgement evidence',
  };
  let next = state;
  for (const capability of connector.capabilities) {
    const existing = next.providerConformanceCases.some((item) => item.connectorId === connector.id && item.environment === connector.environment && item.capability === capability && providerConformanceMatchesCredentialRevision(connector, item) && ['planned', 'passed'].includes(item.result));
    if (existing) continue;
    const deliveryChannel = capability === 'email-delivery' ? 'email' : capability === 'whatsapp-delivery' ? 'whatsapp' : undefined;
    next = createProviderConformanceCase(next, { connectorId: connector.id, capability, deliveryChannel, suiteName, suiteVersion, scenario: scenarioByCapability[capability] }, actorId, randomUUID(), now);
  }
  return next;
}

export function recordProviderConformanceResult(state: RevenueOpsState, input: RecordProviderConformanceResultInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const record = state.providerConformanceCases.find((item) => item.id === input.id);
  if (!record || record.version !== input.expectedVersion || record.result !== 'planned') throw new Error('Conformance case is stale or no longer awaiting assessment.');
  const connector = connectorFor(state, record.connectorId);
  if (providerCredentialLifecycle(connector, now) !== 'configured' || !providerConformanceMatchesCredentialRevision(connector, record)) throw new Error('Conformance case belongs to an expired, revoked, or older credential revision. Plan a fresh capability replay.');
  if (record.preparedBy === actorId) throw new Error('Conformance case maker cannot assess the same case.');
  if (!/^[a-fA-F0-9]{64}$/.test(input.resultChecksum)) throw new Error('Conformance result checksum must be a SHA-256 digest.');
  const next = mutate(state);
  next.providerConformanceCases = next.providerConformanceCases.map((item) => item.id === record.id ? { ...item, result: input.result, evidenceReference: clean(input.evidenceReference, 'Conformance evidence reference', 4, 240), resultChecksum: input.resultChecksum.toLowerCase(), assessedBy: actorId, assessedAt: now, version: item.version + 1 } : item);
  return next;
}

export function approveProviderConnector(state: RevenueOpsState, input: ApproveProviderConnectorInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const connector = state.providerConnectors.find((item) => item.id === input.id);
  if (!connector || connector.version !== input.expectedVersion || !connector.active) throw new Error('Provider connector is stale or inactive.');
  if (providerCredentialLifecycle(connector, now) !== 'configured') throw new Error('Provider connector credentials must be current and sealed before activation.');
  const passed = currentPassedConformance(state, connector).filter((item) => item.assessedBy !== actorId);
  const allCapabilitiesCovered = hasCurrentCapabilityCoverage(state, connector, actorId);
  if (!passed.length || !allCapabilitiesCovered) throw new Error('Independent passed conformance evidence for the current credential revision is required for every declared provider capability.');
  const next = mutate(state);
  next.providerConnectors = next.providerConnectors.map((item) => item.id === connector.id ? { ...item, conformanceStatus: connector.environment === 'production' ? 'production-approved' : 'sandbox-verified', approvedBy: actorId, approvedAt: now, version: item.version + 1 } : item);
  return next;
}

export function prepareProviderSubmission(state: RevenueOpsState, input: PrepareProviderSubmissionInput, actorId: string, id = randomUUID(), now = new Date().toISOString(), messagingSources?: ProviderMessagingSourceContext): RevenueOpsState {
  const connector = connectorFor(state, input.connectorId);
  if (providerCredentialLifecycle(connector, now) !== 'configured') throw new Error('Provider credentials are expired or revoked. Reseal credentials before preparing a handoff.');
  if (!connector.capabilities.includes(input.capability)) throw new Error('Connector does not declare the requested provider capability.');
  if (connector.conformanceStatus !== (connector.environment === 'production' ? 'production-approved' : 'sandbox-verified')) throw new Error('Connector needs approved conformance evidence before preparing a handoff.');
  if (!hasCurrentCapabilityCoverage(state, connector)) throw new Error('Connector needs current credential conformance evidence before preparing a handoff.');
  const sourceKind = sourceKindFor(state, connector, input.capability, input.sourceIds, messagingSources);
  const next = mutate(state);
  next.providerSubmissions.unshift({ id, number: fiscalNumber('PCX', state.providerSubmissions.length + 1, now), connectorId: connector.id, domain: connector.domain, capability: input.capability, credentialRevision: providerCredentialRevision(connector), sourceKind, sourceIds: [...input.sourceIds], payloadChecksum: digest({ connectorId: connector.id, capability: input.capability, sourceIds: input.sourceIds }), status: 'prepared', preparedBy: actorId, preparedAt: now, version: 1 });
  return next;
}

export function handOffProviderSubmission(state: RevenueOpsState, input: HandOffProviderSubmissionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const submission = state.providerSubmissions.find((item) => item.id === input.id);
  if (!submission || submission.version !== input.expectedVersion || submission.status !== 'prepared') throw new Error('Provider handoff is stale or not prepared.');
  const connector = connectorFor(state, submission.connectorId);
  if (providerCredentialLifecycle(connector, now) !== 'configured') throw new Error('Provider credentials are expired or revoked. Stop this handoff and reseal credentials.');
  if (connector.credentialRevision !== undefined && submission.credentialRevision !== connector.credentialRevision) throw new Error('Provider credentials changed after this packet was prepared. Prepare a new provider handoff.');
  if (submission.preparedBy === actorId) throw new Error('Provider handoff requires an independent operator.');
  const next = mutate(state);
  next.providerSubmissions = next.providerSubmissions.map((item) => item.id === submission.id ? { ...item, status: 'handed-off', handedOffBy: actorId, handedOffAt: now, requestReference: clean(input.requestReference, 'Provider request reference', 4, 160), version: item.version + 1 } : item);
  return next;
}

export function recordProviderSubmissionResponse(state: RevenueOpsState, input: RecordProviderSubmissionResponseInput, now = new Date().toISOString(), actorId?: string): RevenueOpsState {
  const submission = state.providerSubmissions.find((item) => item.id === input.id);
  if (!submission || submission.version !== input.expectedVersion || submission.status !== 'handed-off') throw new Error('Only a handed-off provider request can receive an external response.');
  if (actorId && submission.handedOffBy === actorId) throw new Error('Provider response reconciliation requires an independent operator.');
  if (input.outcome === 'acknowledged' && !input.externalReference) throw new Error('Acknowledged provider response requires an external reference.');
  if (input.outcome === 'failed' && !input.errorMessage) throw new Error('Failed provider response requires an error message.');
  if (!/^[a-fA-F0-9]{64}$/.test(input.responseChecksum ?? '')) throw new Error('Provider response evidence requires a SHA-256 checksum.');
  const next = mutate(state);
  next.providerSubmissions = next.providerSubmissions.map((item) => item.id === submission.id ? { ...item, status: input.outcome, externalStatus: input.outcome, externalReference: input.externalReference ? clean(input.externalReference, 'External reference', 3, 160) : undefined, externalReceivedAt: input.receivedAt && Number.isFinite(Date.parse(input.receivedAt)) ? input.receivedAt : now, responseChecksum: input.responseChecksum && /^[a-fA-F0-9]{64}$/.test(input.responseChecksum) ? input.responseChecksum.toLowerCase() : undefined, errorCode: input.errorCode ? clean(input.errorCode, 'Provider error code', 2, 80) : undefined, errorMessage: input.errorMessage ? clean(input.errorMessage, 'Provider error message', 4, 500) : undefined, version: item.version + 1 } : item);
  return next;
}

export function applyProviderReconciliation(state: RevenueOpsState, connectorId: string, statuses: CanonicalProviderStatus[], actorId: string, id = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const connector = connectorFor(state, connectorId);
  const statusById = new Map(statuses.map((status) => [status.submissionId, status]));
  const items: ProviderReconciliationItem[] = statuses.map((status) => {
    const submission = state.providerSubmissions.find((item) => item.id === status.submissionId);
    const localStatus = submission?.status ?? 'prepared';
    const expected = localStatus === 'acknowledged' ? 'acknowledged' : localStatus === 'failed' ? 'failed' : 'pending';
    return { submissionId: status.submissionId, localStatus, remoteStatus: status.remoteStatus, result: status.remoteStatus === 'error' ? 'error' : status.remoteStatus === expected ? 'matched' : 'drift', externalReference: status.externalReference, remotePayloadChecksum: status.remotePayloadChecksum, errorMessage: status.errorMessage };
  });
  const next = mutate(state);
  next.providerSubmissions = next.providerSubmissions.map((item) => {
    const status = statusById.get(item.id);
    if (!status || status.remoteStatus === 'error' || status.remoteStatus === 'pending') return item;
    if (!status.remotePayloadChecksum || !/^[a-fA-F0-9]{64}$/.test(status.remotePayloadChecksum)) throw new Error('Provider reconciliation requires a SHA-256 checksum for every acknowledged or failed response.');
    return { ...item, status: status.remoteStatus, externalStatus: status.remoteStatus, externalReference: status.externalReference ?? item.externalReference, externalReceivedAt: now, responseChecksum: status.remotePayloadChecksum.toLowerCase(), errorMessage: status.remoteStatus === 'failed' ? status.errorMessage ?? item.errorMessage : undefined, version: item.version + 1 };
  });
  next.providerReconciliationRuns.unshift({ id, number: fiscalNumber('PCR', state.providerReconciliationRuns.length + 1, now), connectorId: connector.id, submissionIds: statuses.map(({ submissionId }) => submissionId), items, status: items.some((item) => item.result === 'error') ? 'failed' : items.some((item) => item.result === 'drift') ? 'completed-with-exceptions' : 'completed', requestedBy: actorId, requestedAt: now, completedAt: now, checksum: digest(items) });
  return next;
}
