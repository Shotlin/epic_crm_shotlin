import { describe, expect, it } from 'vitest';
import { markAwaitingExternalAuth, preparePortalHandoff, recordPortalAcknowledgement } from './portal-handoff';

describe('portal handoff boundary', () => {
  it('prepares, gates, and records an external acknowledgement', () => {
    const prepared = preparePortalHandoff({ kind: 'supplier', scope: { companyId: 'c1', branchId: 'b1' }, recipientId: 'supplier-1', recipientLabel: 'Supplier One', actorId: 'maker' }, '2026-07-18T10:00:00.000Z');
    expect(prepared.status).toBe('prepared');
    expect(recordPortalAcknowledgement(prepared, 'ACK-TOO-EARLY').status).toBe('prepared');
    const awaiting = markAwaitingExternalAuth(prepared);
    expect(recordPortalAcknowledgement(awaiting, 'ACK-001')).toMatchObject({ status: 'acknowledged', externalReference: 'ACK-001' });
  });

  it('rejects missing recipients and does not mutate scope', () => {
    expect(() => preparePortalHandoff({ kind: 'customer', scope: { companyId: 'c1', branchId: 'b1' }, recipientId: '', recipientLabel: '', actorId: 'maker' })).toThrow('recipient');
    const scope = { companyId: 'c1', branchId: 'b1' };
    const request = preparePortalHandoff({ kind: 'customer', scope, recipientId: 'customer-1', recipientLabel: 'Customer One', actorId: 'maker' });
    scope.companyId = 'other';
    expect(request.scope.companyId).toBe('c1');
  });
});
