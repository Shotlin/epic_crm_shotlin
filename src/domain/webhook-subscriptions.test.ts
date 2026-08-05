import { describe, expect, it } from 'vitest';
import { assessWebhookSubscriptions, selectWebhookRecipients, verifyWebhookSubscriptionCatalog } from './webhook-subscriptions';

describe('webhook subscriptions', () => {
  it('allows only active, scoped, secret-backed subscriptions', () => {
    const catalog = assessWebhookSubscriptions({ scope: { companyId: 'c1', branchId: 'b1' }, subscriptions: [{ id: 'sub-1', name: 'ERP events', companyId: 'c1', branchId: 'b1', endpointReference: 'vault://webhooks/erp', events: ['sales.order.confirmed', 'finance.invoice.issued'], secretConfigured: true, active: true, createdBy: 'user-1' }] });
    expect(catalog.assessments[0]).toMatchObject({ status: 'eligible', blockers: [], eventCount: 2 });
    expect(verifyWebhookSubscriptionCatalog(catalog)).toBe(true);
  });

  it('fails closed on cross-scope, missing secret, inactive, and unsupported subscriptions', () => {
    const catalog = assessWebhookSubscriptions({ scope: { companyId: 'c1', branchId: 'b1' }, subscriptions: [{ id: 'sub-2', name: 'Unsafe', companyId: 'c2', branchId: 'b9', endpointReference: '', events: ['sales.order.confirmed', 'unknown.event'] as never[], secretConfigured: false, active: false, createdBy: '' }] });
    expect(catalog.assessments[0]?.status).toBe('blocked');
    expect(catalog.assessments[0]?.blockers.length).toBeGreaterThanOrEqual(5);
    expect(verifyWebhookSubscriptionCatalog({ ...catalog, assessments: catalog.assessments.map((item) => ({ ...item, eventCount: 99 })) })).toBe(false);
  });

  it('selects only eligible recipients for an event without performing delivery', () => {
    const decision = selectWebhookRecipients({ request: { event: 'sales.order.confirmed', companyId: 'c1', branchId: 'b1' }, subscriptions: [
      { id: 'eligible', name: 'ERP', companyId: 'c1', branchId: 'b1', endpointReference: 'vault://erp', events: ['sales.order.confirmed'], secretConfigured: true, active: true, createdBy: 'user-1' },
      { id: 'wrong-scope', name: 'Other', companyId: 'c2', branchId: 'b1', endpointReference: 'vault://other', events: ['sales.order.confirmed'], secretConfigured: true, active: true, createdBy: 'user-1' },
      { id: 'wrong-event', name: 'CRM', companyId: 'c1', branchId: 'b1', endpointReference: 'vault://crm', events: ['crm.lead.created'], secretConfigured: true, active: true, createdBy: 'user-1' },
    ] });
    expect(decision.eligibleSubscriptionIds).toEqual(['eligible']);
    expect(decision.skipped).toEqual(expect.arrayContaining([{ subscriptionId: 'wrong-scope', reason: 'Subscription scope does not match the event.' }, { subscriptionId: 'wrong-event', reason: 'Event is not allowed by the subscription.' }]));
  });
});
