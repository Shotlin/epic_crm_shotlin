export type PortalHandoffKind = 'customer' | 'supplier';
export type PortalHandoffStatus = 'prepared' | 'awaiting-external-auth' | 'acknowledged';

export interface PortalHandoffRequest {
  id: string;
  kind: PortalHandoffKind;
  scope: { companyId: string; branchId: string };
  recipientId: string;
  recipientLabel: string;
  status: PortalHandoffStatus;
  preparedBy: string;
  preparedAt: string;
  externalReference?: string;
}

export function preparePortalHandoff(input: { kind: PortalHandoffKind; scope: { companyId: string; branchId: string }; recipientId: string; recipientLabel: string; actorId: string }, now = new Date().toISOString()): PortalHandoffRequest {
  if (!input.recipientId.trim() || !input.recipientLabel.trim()) throw new Error('Portal handoff requires a recipient.');
  return { id: `portal-handoff-${input.kind}-${input.recipientId}-${now}`, kind: input.kind, scope: structuredClone(input.scope), recipientId: input.recipientId, recipientLabel: input.recipientLabel.trim(), status: 'prepared', preparedBy: input.actorId, preparedAt: now };
}

export function markAwaitingExternalAuth(request: PortalHandoffRequest): PortalHandoffRequest {
  if (request.status !== 'prepared') return request;
  return { ...request, status: 'awaiting-external-auth' };
}

export function recordPortalAcknowledgement(request: PortalHandoffRequest, externalReference: string): PortalHandoffRequest {
  if (request.status !== 'awaiting-external-auth' || !externalReference.trim()) return request;
  return { ...request, status: 'acknowledged', externalReference: externalReference.trim() };
}
