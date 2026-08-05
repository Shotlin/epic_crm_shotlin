import { describe, expect, it } from 'vitest';
import {
  createRetailReportDeliveryPlan,
  decideRetailReportDeliveryPlan,
  prepareRetailReportDeliveryAttempt,
  recordRetailReportDeliveryResult,
  type RetailReportDeliveryState,
} from './report-delivery';

const scope = { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' };

function initial(): RetailReportDeliveryState {
  return { plans: [], attempts: [] };
}

describe('retail report delivery governance', () => {
  it('requires consented recipients and an independent approval before preparing a scheduled handoff', () => {
    const created = createRetailReportDeliveryPlan(initial(), {
      reportPackId: 'finance-control',
      channel: 'whatsapp',
      providerConnectorId: 'messaging-whatsapp-1',
      frequency: 'daily',
      runDay: undefined,
      windowStart: '10:00',
      windowEnd: '12:00',
      effectiveFrom: '2026-07-30',
      recipients: [{ id: 'contact-1', kind: 'customer-contact', label: 'Accounts', destination: '+919876543210', consentId: 'consent-finance-1' }],
      notes: 'Daily finance control pack for the authorised accounts contact.',
    }, 'maker-1', scope, 'delivery-1', '2026-07-30T04:00:00.000Z');
    expect(created.plans[0]).toMatchObject({ id: 'delivery-1', status: 'draft', version: 1, channel: 'whatsapp', providerConnectorId: 'messaging-whatsapp-1' });
    expect(() => decideRetailReportDeliveryPlan(created, { id: 'delivery-1', decision: 'approved', expectedVersion: 1, remarks: 'same maker' }, 'maker-1', '2026-07-30T04:05:00.000Z', scope)).toThrow('independent');
    const approved = decideRetailReportDeliveryPlan(created, { id: 'delivery-1', decision: 'approved', expectedVersion: 1, remarks: 'Verified consent and scope.' }, 'checker-1', '2026-07-30T04:05:00.000Z', scope);
    const prepared = prepareRetailReportDeliveryAttempt(approved, { id: 'delivery-1', expectedVersion: 2, now: '2026-07-30T05:00:00.000Z' }, 'scheduler-1', scope, 'attempt-1');
    expect(prepared.attempts[0]).toMatchObject({ id: 'attempt-1', status: 'prepared', slotKey: '2026-07-30', recipientCount: 1, version: 1 });
    expect(() => prepareRetailReportDeliveryAttempt(prepared, { id: 'delivery-1', expectedVersion: 2, now: '2026-07-30T05:30:00.000Z' }, 'scheduler-1', scope, 'attempt-2')).toThrow('already');
    const handedOff = recordRetailReportDeliveryResult(prepared, { id: 'attempt-1', outcome: 'handed-off', externalReference: 'MSG-001', expectedVersion: 1 }, 'provider-adapter', scope, '2026-07-30T05:10:00.000Z');
    expect(handedOff.attempts[0]).toMatchObject({ status: 'handed-off', externalReference: 'MSG-001', version: 2 });
  });

  it('rejects customer delivery without affirmative consent evidence', () => {
    expect(() => createRetailReportDeliveryPlan(initial(), {
      reportPackId: 'executive-pulse', channel: 'email', frequency: 'weekly', runDay: 1, windowStart: '09:00', windowEnd: '10:00', effectiveFrom: '2026-07-30',
      recipients: [{ id: 'contact-1', kind: 'customer-contact', label: 'Owner', destination: 'owner@example.in' }], notes: 'Weekly pack.',
    }, 'maker-1', scope, 'delivery-2', '2026-07-30T04:00:00.000Z')).toThrow('consent');
  });
});
