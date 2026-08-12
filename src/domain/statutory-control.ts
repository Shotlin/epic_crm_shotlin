import { createHash, randomUUID } from 'node:crypto';
import type { RevenueOpsState, StatutoryExchange } from '../shared/revenue-ops-contracts';
import {
  statutoryCredentialRevision,
  statutoryEvidenceMatchesCredentialRevision,
} from '../shared/statutory-contracts';
import type {
  CanonicalPortalStatus,
  ConfigureStatutoryAdapterInput,
  ConsolidatedEwayBill,
  DigitalSignatureEvidence,
  PortalReconciliationItem,
  PortalReconciliationRun,
  PrepareConsolidatedEwayBillInput,
  PrepareStatutoryOperationInput,
  RecordConsolidatedEwayBillResponseInput,
  RecordStatutoryOperationResponseInput,
  StatutoryAdapter,
  StatutoryAdapterCapability,
  StatutoryOperation,
  SubmitConsolidatedEwayBillInput,
  SubmitStatutoryOperationInput,
} from '../shared/statutory-contracts';
import { isIndiaStateCode } from './revenue-ops';

const digest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clean = (value: string, label: string, min = 2, max = 160): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`);
  return normalized;
};
const fiscalNumber = (prefix: string, sequence: number, at: string): string => {
  const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${prefix}/${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${String(sequence).padStart(5, '0')}`;
};
const validDate = (value: string | undefined, label: string): string => {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`${label} is required and must be valid.`);
  return value;
};

const OPERATION_CAPABILITY: Record<StatutoryOperation['kind'], StatutoryAdapterCapability> = {
  'cancel-irn': 'cancel-irn', 'cancel-ewb': 'cancel-ewb', 'close-ewb': 'close-ewb', 'extend-ewb': 'extend-ewb',
};

function operationAdapter(state: RevenueOpsState, adapterId: string, capability: StatutoryAdapterCapability): StatutoryAdapter {
  const adapter = state.statutoryAdapters.find(({ id, active }) => id === adapterId && active);
  if (!adapter || !adapter.capabilities.includes(capability)) throw new Error(`Active statutory adapter with ${capability} capability not found.`);
  if (adapter.credentialStatus !== 'configured') throw new Error('Statutory adapter credentials are not configured in the encrypted vault.');
  return adapter;
}

function mutate(state: RevenueOpsState): RevenueOpsState {
  const next = structuredClone(state); next.revision += 1; return next;
}

export function configureStatutoryAdapter(state: RevenueOpsState, input: ConfigureStatutoryAdapterInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(code) || state.statutoryAdapters.some((candidate) => candidate.code === code)) throw new Error('Adapter code is invalid or already exists.');
  const base = new URL(input.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Adapter base URL must be a credential-free HTTPS origin or path.');
  for (const [path, label] of [[input.statusPathTemplate, 'Status path'], [input.healthPath, 'Health path']] as const) {
    if (!path.startsWith('/') || path.includes('://') || path.includes('..')) throw new Error(`${label} must be a safe same-origin path.`);
  }
  if (!input.statusPathTemplate.includes('{number}')) throw new Error('Status path template must contain {number}.');
  const capabilities = [...new Set(input.capabilities)];
  if (!capabilities.length) throw new Error('Adapter requires at least one capability.');
  const next = mutate(state);
  next.statutoryAdapters.push({ id, code, name: clean(input.name, 'Adapter name'), provider: clean(input.provider, 'Provider', 2, 120), environment: input.environment, baseUrl: base.toString().replace(/\/$/, ''), statusPathTemplate: input.statusPathTemplate.trim(), healthPath: input.healthPath.trim(), capabilities, credentialStatus: 'missing', credentialRevision: 0, health: 'unknown', active: true, createdBy: actorId, createdAt: now, version: 1 });
  return next;
}

export function markStatutoryCredentials(state: RevenueOpsState, adapterId: string, fingerprint: string): RevenueOpsState {
  const adapter = state.statutoryAdapters.find(({ id }) => id === adapterId);
  if (!adapter) throw new Error('Statutory adapter not found.');
  const unchanged = adapter.credentialStatus === 'configured' && adapter.credentialFingerprint === fingerprint;
  const next = mutate(state);
  next.statutoryAdapters = next.statutoryAdapters.map((candidate) => candidate.id === adapterId ? { ...candidate, credentialStatus: 'configured', credentialFingerprint: fingerprint, credentialRevision: unchanged ? Math.max(1, statutoryCredentialRevision(candidate)) : statutoryCredentialRevision(candidate) + 1, health: 'unknown', version: candidate.version + 1 } : candidate);
  return next;
}

export function prepareStatutoryOperation(state: RevenueOpsState, input: PrepareStatutoryOperationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const exchange = state.statutoryExchanges.find(({ id: exchangeId }) => exchangeId === input.exchangeId);
  if (!exchange || exchange.status !== 'acknowledged' || !exchange.externalNumber || !exchange.acknowledgedAt) throw new Error('Operation requires a currently acknowledged statutory exchange.');
  operationAdapter(state, input.adapterId, OPERATION_CAPABILITY[input.kind]);
  if (state.statutoryOperations.some(({ exchangeId, kind, status }) => exchangeId === exchange.id && kind === input.kind && !['failed', 'rejected'].includes(status))) throw new Error('An active operation of this kind already exists for the exchange.');
  const ageMs = Date.parse(now) - Date.parse(exchange.acknowledgedAt);
  if (input.kind === 'cancel-irn') {
    if (exchange.kind !== 'e-invoice') throw new Error('IRN cancellation requires an acknowledged e-invoice exchange.');
    if (ageMs < 0 || ageMs > 86400000) throw new Error('IRN cancellation must be prepared within 24 hours of acknowledgement.');
    if (!['1', '2', '3', '4'].includes(input.reasonCode)) throw new Error('Cancellation reason code must be 1, 2, 3, or 4.');
  }
  if (input.kind === 'cancel-ewb') {
    if (exchange.kind !== 'e-way-bill') throw new Error('E-way cancellation requires an acknowledged e-way-bill exchange.');
    if (ageMs < 0 || ageMs > 86400000) throw new Error('E-way bill cancellation must be prepared within 24 hours of generation.');
    if (!['1', '2', '3', '4'].includes(input.reasonCode)) throw new Error('Cancellation reason code must be 1, 2, 3, or 4.');
  }
  if (input.kind === 'close-ewb') {
    if (exchange.kind !== 'e-way-bill') throw new Error('Closure requires an acknowledged e-way-bill exchange.');
    const shipment = state.shipmentPackages.find(({ id: shipmentId }) => shipmentId === exchange.sourceId);
    if (!shipment || !['delivered', 'returned'].includes(shipment.status)) throw new Error('E-way bill closure requires delivered or returned shipment evidence.');
    const effective = validDate(input.effectiveDate, 'Closure date');
    if (effective.slice(0, 10) < exchange.acknowledgedAt.slice(0, 10) || effective.slice(0, 10) > now.slice(0, 10)) throw new Error('Closure date must be between EWB acknowledgement and today.');
  }
  if (input.kind === 'extend-ewb') {
    if (exchange.kind !== 'e-way-bill') throw new Error('Validity extension requires an acknowledged e-way-bill exchange.');
    const validUntil = validDate(exchange.validUntil, 'Current EWB validity');
    const delta = Date.parse(now) - Date.parse(validUntil);
    if (delta < -8 * 3600000 || delta > 8 * 3600000) throw new Error('E-way validity can be extended only from 8 hours before to 8 hours after expiry.');
    const requested = validDate(input.requestedValidUntil, 'Requested validity');
    if (Date.parse(requested) <= Date.parse(validUntil)) throw new Error('Requested validity must extend the current validity.');
    if (Date.parse(requested) > Date.parse(exchange.acknowledgedAt) + 360 * 86400000) throw new Error('E-way validity cannot extend beyond 360 days from generation.');
    if (![1, 2, 4, 5, 99].includes(Number(input.reasonCode))) throw new Error('Extension reason code must be 1, 2, 4, 5, or 99.');
    if (!input.fromPlace || !input.fromStateCode || !input.fromPincode || !isIndiaStateCode(input.fromStateCode) || !/^\d{6}$/.test(input.fromPincode)) throw new Error('Extension requires current place, state, and six-digit pincode.');
    if (!Number.isFinite(input.remainingDistanceKm) || input.remainingDistanceKm! <= 0) throw new Error('Extension requires positive remaining distance.');
    if (input.transportMode === 'road' && !input.vehicleNumber) throw new Error('Road extension requires vehicle number.');
    if (['rail', 'air', 'ship'].includes(input.transportMode ?? '') && !input.transportDocumentNumber) throw new Error('Rail, air, or ship extension requires transport document number.');
    if (input.transportMode === 'in-transit' && (!input.consignmentStatus || !input.transitType)) throw new Error('In-transit extension requires consignment and transit type.');
  }
  const remarks = clean(input.remarks, 'Operation remarks', 4, 50);
  const payload = { kind: input.kind, externalNumber: exchange.externalNumber, reasonCode: input.reasonCode, remarks, effectiveDate: input.effectiveDate, vehicleNumber: input.vehicleNumber, transportDocumentNumber: input.transportDocumentNumber, transportMode: input.transportMode, consignmentStatus: input.consignmentStatus, transitType: input.transitType, fromPlace: input.fromPlace, fromStateCode: input.fromStateCode, fromPincode: input.fromPincode, remainingDistanceKm: input.remainingDistanceKm, requestedValidUntil: input.requestedValidUntil };
  const adapter = operationAdapter(state, input.adapterId, OPERATION_CAPABILITY[input.kind]);
  const operation: StatutoryOperation = { id, number: fiscalNumber('STO', state.statutoryOperations.length + 1, now), kind: input.kind, exchangeId: exchange.id, adapterId: input.adapterId, credentialRevision: statutoryCredentialRevision(adapter), reasonCode: input.reasonCode, remarks, effectiveDate: input.effectiveDate, vehicleNumber: input.vehicleNumber?.trim().toUpperCase(), transportDocumentNumber: input.transportDocumentNumber?.trim(), transportMode: input.transportMode, consignmentStatus: input.consignmentStatus, transitType: input.transitType, fromPlace: input.fromPlace?.trim(), fromStateCode: input.fromStateCode, fromPincode: input.fromPincode, remainingDistanceKm: input.remainingDistanceKm, requestedValidUntil: input.requestedValidUntil, status: 'prepared', payloadChecksum: digest(payload), preparedBy: actorId, preparedAt: now, version: 1 };
  const next = mutate(state); next.statutoryOperations.unshift(operation); return next;
}

export function submitStatutoryOperation(state: RevenueOpsState, input: SubmitStatutoryOperationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const operation = state.statutoryOperations.find(({ id }) => id === input.id);
  if (!operation || operation.version !== input.expectedVersion || !['prepared', 'failed'].includes(operation.status)) throw new Error('Statutory operation is stale or cannot be submitted.');
  if (operation.preparedBy === actorId) throw new Error('Statutory operation requires an independent submitter.');
  const adapter = operationAdapter(state, operation.adapterId, OPERATION_CAPABILITY[operation.kind]);
  if (!statutoryEvidenceMatchesCredentialRevision(adapter, operation)) throw new Error('Statutory credentials changed after this operation was prepared. Prepare a new operation.');
  const next = mutate(state);
  next.statutoryOperations = next.statutoryOperations.map((candidate) => candidate.id === operation.id ? { ...candidate, status: 'submitted', requestReference: clean(input.requestReference, 'Request reference', 3, 160), submittedBy: actorId, submittedAt: now, errorCode: undefined, errorMessage: undefined, version: candidate.version + 1 } : candidate);
  return next;
}

export function recordStatutoryOperationResponse(state: RevenueOpsState, input: RecordStatutoryOperationResponseInput): RevenueOpsState {
  const operation = state.statutoryOperations.find(({ id }) => id === input.id);
  if (!operation || operation.version !== input.expectedVersion || operation.status !== 'submitted') throw new Error('Only a current submitted operation can receive a response.');
  const exchange = state.statutoryExchanges.find(({ id }) => id === operation.exchangeId)!;
  const next = mutate(state);
  if (input.outcome === 'failed') {
    next.statutoryOperations = next.statutoryOperations.map((candidate) => candidate.id === operation.id ? { ...candidate, status: 'failed', errorCode: clean(input.errorCode ?? '', 'Error code', 2, 80), errorMessage: clean(input.errorMessage ?? '', 'Error message', 4, 500), responseChecksum: digest(input), version: candidate.version + 1 } : candidate);
    return next;
  }
  const acknowledgedAt = validDate(input.acknowledgedAt, 'Operation acknowledgement time');
  const externalReference = clean(input.externalReference ?? '', 'External operation reference', 3, 160);
  next.statutoryOperations = next.statutoryOperations.map((candidate) => candidate.id === operation.id ? { ...candidate, status: 'acknowledged', externalReference, acknowledgedAt, responseChecksum: digest(input), version: candidate.version + 1 } : candidate);
  next.statutoryExchanges = next.statutoryExchanges.map((candidate) => candidate.id === exchange.id ? { ...candidate, status: operation.kind.startsWith('cancel') ? 'cancelled' : operation.kind === 'close-ewb' ? 'closed' : candidate.status, validUntil: operation.kind === 'extend-ewb' ? validDate(input.validUntil ?? operation.requestedValidUntil, 'Extended validity') : candidate.validUntil, portalStatus: operation.kind.startsWith('cancel') ? 'cancelled' : operation.kind === 'close-ewb' ? 'closed' : candidate.portalStatus, reconciliationState: 'unverified', version: candidate.version + 1 } : candidate);
  if (operation.kind === 'cancel-irn') next.invoices = next.invoices.map((invoice) => invoice.id === exchange.sourceId ? { ...invoice, irpStatus: 'cancelled', version: invoice.version + 1 } : invoice);
  return next;
}

export function prepareConsolidatedEwayBill(state: RevenueOpsState, input: PrepareConsolidatedEwayBillInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const adapter = operationAdapter(state, input.adapterId, 'consolidated-ewb');
  const exchangeIds = [...new Set(input.exchangeIds)];
  if (exchangeIds.length < 2 || exchangeIds.length !== input.exchangeIds.length) throw new Error('Consolidated EWB requires at least two unique e-way bills.');
  const exchanges = exchangeIds.map((exchangeId) => state.statutoryExchanges.find(({ id }) => id === exchangeId));
  if (exchanges.some((exchange) => !exchange || exchange.kind !== 'e-way-bill' || exchange.status !== 'acknowledged' || exchange.gstRegistrationId !== input.gstRegistrationId || !exchange.externalNumber)) throw new Error('Consolidation requires active acknowledged EWBs for one GST registration.');
  if (state.consolidatedEwayBills.some(({ exchangeIds: existing, status }) => !['failed', 'cancelled'].includes(status) && exchangeIds.some((exchangeId) => existing.includes(exchangeId)))) throw new Error('An EWB is already part of an active consolidated movement.');
  if (!isIndiaStateCode(input.fromStateCode)) throw new Error('Consolidated EWB requires a supported origin state.');
  if (input.transportMode === 'road' && !input.vehicleNumber?.trim()) throw new Error('Road consolidation requires vehicle number.');
  if (input.transportMode !== 'road' && !input.transportDocumentNumber?.trim()) throw new Error('Rail, air, or ship consolidation requires transport document number.');
  const payload = { ewbNumbers: exchanges.map((exchange) => exchange!.externalNumber), mode: input.transportMode, vehicleNumber: input.vehicleNumber, transportDocumentNumber: input.transportDocumentNumber, fromPlace: input.fromPlace, fromStateCode: input.fromStateCode };
  const record: ConsolidatedEwayBill = { id, number: fiscalNumber('CEWB', state.consolidatedEwayBills.length + 1, now), adapterId: input.adapterId, credentialRevision: statutoryCredentialRevision(adapter), gstRegistrationId: input.gstRegistrationId, exchangeIds, transportMode: input.transportMode, vehicleNumber: input.vehicleNumber?.trim().toUpperCase(), transportDocumentNumber: input.transportDocumentNumber?.trim(), fromPlace: clean(input.fromPlace, 'Origin place', 2, 120), fromStateCode: input.fromStateCode, status: 'prepared', payloadChecksum: digest(payload), preparedBy: actorId, preparedAt: now, version: 1 };
  const next = mutate(state); next.consolidatedEwayBills.unshift(record); return next;
}

export function submitConsolidatedEwayBill(state: RevenueOpsState, input: SubmitConsolidatedEwayBillInput, actorId: string): RevenueOpsState {
  const record = state.consolidatedEwayBills.find(({ id }) => id === input.id);
  if (!record || record.version !== input.expectedVersion || !['prepared', 'failed'].includes(record.status)) throw new Error('Consolidated EWB is stale or cannot be submitted.');
  if (record.preparedBy === actorId) throw new Error('Consolidated EWB requires an independent submitter.');
  const adapter = operationAdapter(state, record.adapterId, 'consolidated-ewb');
  if (!statutoryEvidenceMatchesCredentialRevision(adapter, record)) throw new Error('Statutory credentials changed after this consolidated bill was prepared. Prepare a new bill.');
  const next = mutate(state); next.consolidatedEwayBills = next.consolidatedEwayBills.map((candidate) => candidate.id === record.id ? { ...candidate, status: 'submitted', requestReference: clean(input.requestReference, 'Request reference', 3, 160), submittedBy: actorId, errorCode: undefined, errorMessage: undefined, version: candidate.version + 1 } : candidate); return next;
}

export function recordConsolidatedEwayBillResponse(state: RevenueOpsState, input: RecordConsolidatedEwayBillResponseInput): RevenueOpsState {
  const record = state.consolidatedEwayBills.find(({ id }) => id === input.id);
  if (!record || record.version !== input.expectedVersion || record.status !== 'submitted') throw new Error('Only a submitted consolidated EWB can receive a response.');
  const next = mutate(state);
  next.consolidatedEwayBills = next.consolidatedEwayBills.map((candidate) => candidate.id === record.id ? input.outcome === 'acknowledged' ? { ...candidate, status: 'acknowledged', externalNumber: clean(input.externalNumber ?? '', 'Consolidated EWB number', 12, 24), generatedAt: validDate(input.generatedAt, 'Generation time'), version: candidate.version + 1 } : { ...candidate, status: 'failed', errorCode: clean(input.errorCode ?? '', 'Error code', 2, 80), errorMessage: clean(input.errorMessage ?? '', 'Error message', 4, 500), version: candidate.version + 1 } : candidate);
  return next;
}

export interface VerifiedSignatureResult {
  exchangeId: string; adapterId?: string; artifact: DigitalSignatureEvidence['artifact']; algorithm: DigitalSignatureEvidence['algorithm']; certificateFingerprint: string; certificateSubject: string; certificateIssuer: string; certificateValidFrom: string; certificateValidTo: string; payloadChecksum: string; signatureChecksum: string; verified: boolean; verificationSource: DigitalSignatureEvidence['verificationSource'];
}

export function recordDigitalSignatureEvidence(state: RevenueOpsState, result: VerifiedSignatureResult, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const exchange = state.statutoryExchanges.find(({ id: exchangeId }) => exchangeId === result.exchangeId);
  if (!exchange || exchange.status !== 'acknowledged') throw new Error('Signature evidence requires an acknowledged statutory exchange.');
  if (state.digitalSignatureEvidence.some(({ exchangeId, artifact, payloadChecksum }) => exchangeId === result.exchangeId && artifact === result.artifact && payloadChecksum === result.payloadChecksum)) throw new Error('This signature evidence is already recorded.');
  const evidence: DigitalSignatureEvidence = { id, ...result, verifiedBy: actorId, verifiedAt: now };
  const next = mutate(state); next.digitalSignatureEvidence.unshift(evidence); return next;
}

function expectedRemoteStatus(exchange: StatutoryExchange): 'active' | 'cancelled' | 'closed' | 'not-found' | 'error' {
  if (exchange.status === 'cancelled') return 'cancelled';
  if (exchange.status === 'closed') return 'closed';
  return 'active';
}

export function applyPortalReconciliation(state: RevenueOpsState, adapterId: string, statuses: CanonicalPortalStatus[], actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const adapter = operationAdapter(state, adapterId, 'status-pull');
  const requestedExchangeIds = statuses.map(({ exchangeId }) => exchangeId);
  if (!requestedExchangeIds.length || new Set(requestedExchangeIds).size !== requestedExchangeIds.length) throw new Error('Reconciliation requires unique exchange results.');
  const next = mutate(state);
  const items: PortalReconciliationItem[] = statuses.map((status) => {
    const exchange = state.statutoryExchanges.find(({ id: exchangeId }) => exchangeId === status.exchangeId);
    if (!exchange) throw new Error('Reconciliation contains an unknown exchange.');
    const expected = expectedRemoteStatus(exchange);
    const result: PortalReconciliationItem['result'] = status.remoteStatus === 'error' ? 'error' : status.remoteStatus === 'not-found' ? 'missing' : status.remoteStatus === expected ? 'matched' : 'drift';
    return { exchangeId: exchange.id, localStatus: exchange.status, remoteStatus: status.remoteStatus, result, externalNumber: status.externalNumber, acknowledgementNumber: status.acknowledgementNumber, acknowledgedAt: status.acknowledgedAt, validUntil: status.validUntil, remotePayloadChecksum: status.remotePayloadChecksum, errorMessage: status.errorMessage };
  });
  next.statutoryExchanges = next.statutoryExchanges.map((exchange) => {
    const item = items.find(({ exchangeId }) => exchangeId === exchange.id); if (!item) return exchange;
    const remoteStatus = item.remoteStatus;
    const canAcknowledge = remoteStatus === 'active' && item.externalNumber && item.acknowledgementNumber && item.acknowledgedAt;
    return { ...exchange, status: remoteStatus === 'cancelled' ? 'cancelled' : remoteStatus === 'closed' ? 'closed' : canAcknowledge ? 'acknowledged' : exchange.status, externalNumber: canAcknowledge ? item.externalNumber : exchange.externalNumber, acknowledgementNumber: canAcknowledge ? item.acknowledgementNumber : exchange.acknowledgementNumber, acknowledgedAt: canAcknowledge ? item.acknowledgedAt : exchange.acknowledgedAt, validUntil: item.validUntil ?? exchange.validUntil, portalStatus: remoteStatus, reconciliationState: item.result, lastPulledAt: now, portalPayloadChecksum: item.remotePayloadChecksum, version: exchange.version + 1 } as StatutoryExchange;
  });
  for (const item of items) {
    const exchange = next.statutoryExchanges.find(({ id: exchangeId }) => exchangeId === item.exchangeId)!;
    if (exchange.kind === 'e-invoice' && ['acknowledged', 'cancelled'].includes(exchange.status)) next.invoices = next.invoices.map((invoice) => invoice.id === exchange.sourceId ? { ...invoice, irpStatus: exchange.status === 'cancelled' ? 'cancelled' : 'registered', irn: exchange.externalNumber ?? invoice.irn, irpAcknowledgementNumber: exchange.acknowledgementNumber ?? invoice.irpAcknowledgementNumber, irpAcknowledgedAt: exchange.acknowledgedAt ?? invoice.irpAcknowledgedAt, version: invoice.version + 1 } : invoice);
  }
  const runStatus: PortalReconciliationRun['status'] = items.every(({ result }) => result === 'error') ? 'failed' : items.some(({ result }) => result !== 'matched') ? 'completed-with-exceptions' : 'completed';
  const payload = { adapterId, items, requestedAt: now };
  const run: PortalReconciliationRun = { id, number: fiscalNumber('REC', state.portalReconciliationRuns.length + 1, now), adapterId: adapter.id, requestedExchangeIds, items, status: runStatus, requestedBy: actorId, requestedAt: now, completedAt: now, checksum: digest(payload) };
  next.portalReconciliationRuns.unshift(run);
  next.statutoryAdapters = next.statutoryAdapters.map((candidate) => candidate.id === adapter.id ? { ...candidate, lastPullAt: now, health: runStatus === 'failed' ? 'degraded' : 'healthy', lastHealthAt: now, version: candidate.version + 1 } : candidate);
  return next;
}
