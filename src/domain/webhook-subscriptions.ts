import { browserChecksum } from '../shared/browser-checksum';

export const WEBHOOK_EVENTS = ['crm.lead.created', 'sales.order.confirmed', 'finance.invoice.issued', 'inventory.stock.changed', 'service.ticket.updated'] as const;
export type WebhookEventType = typeof WEBHOOK_EVENTS[number];
export type WebhookSubscriptionStatus = 'eligible' | 'blocked';

export interface WebhookSubscription {
  id: string;
  name: string;
  companyId: string;
  branchId: string;
  endpointReference: string;
  events: WebhookEventType[];
  secretConfigured: boolean;
  active: boolean;
  createdBy: string;
}

export interface WebhookSubscriptionAssessment {
  subscriptionId: string;
  status: WebhookSubscriptionStatus;
  blockers: string[];
  eventCount: number;
}

export interface WebhookSubscriptionCatalog {
  scope: { companyId: string; branchId: string };
  assessments: WebhookSubscriptionAssessment[];
  checksum: string;
}

export interface WebhookDispatchRequest {
  event: WebhookEventType;
  companyId: string;
  branchId: string;
}

export interface WebhookDispatchDecision {
  event: WebhookEventType;
  eligibleSubscriptionIds: string[];
  skipped: Array<{ subscriptionId: string; reason: string }>;
}

/** Evaluates endpoint subscriptions before any event can cross the signed delivery boundary. */
export function assessWebhookSubscriptions(input: { scope: { companyId: string; branchId: string }; subscriptions: WebhookSubscription[] }): WebhookSubscriptionCatalog {
  const assessments: WebhookSubscriptionAssessment[] = input.subscriptions.map((subscription) => {
    const blockers: string[] = [];
    if (subscription.companyId !== input.scope.companyId || subscription.branchId !== input.scope.branchId) blockers.push('Subscription scope does not match the active company and branch.');
    if (!subscription.endpointReference.trim()) blockers.push('Endpoint reference is missing.');
    if (!subscription.events.length) blockers.push('At least one event type is required.');
    if (subscription.events.some((event) => !WEBHOOK_EVENTS.includes(event))) blockers.push('Subscription contains an unsupported event type.');
    if (!subscription.secretConfigured) blockers.push('Signing secret is not configured in the credential vault.');
    if (!subscription.active) blockers.push('Subscription is inactive.');
    if (!subscription.createdBy.trim()) blockers.push('Accountable subscription owner is missing.');
    return { subscriptionId: subscription.id, status: blockers.length ? 'blocked' : 'eligible', blockers, eventCount: subscription.events.length };
  });
  const unsigned = { scope: input.scope, assessments };
  const checksum = browserChecksum(JSON.stringify(unsigned));
  return { ...unsigned, checksum };
}

export function verifyWebhookSubscriptionCatalog(catalog: WebhookSubscriptionCatalog): boolean {
  const expected = browserChecksum(JSON.stringify({ scope: catalog.scope, assessments: catalog.assessments }));
  return Boolean(catalog.checksum) && catalog.checksum === expected;
}

/** Selects recipients without creating a delivery or bypassing subscription readiness. */
export function selectWebhookRecipients(input: { request: WebhookDispatchRequest; subscriptions: WebhookSubscription[] }): WebhookDispatchDecision {
  const eligibleSubscriptionIds: string[] = [];
  const skipped: Array<{ subscriptionId: string; reason: string }> = [];
  for (const subscription of input.subscriptions) {
    const reason = subscription.companyId !== input.request.companyId || subscription.branchId !== input.request.branchId
      ? 'Subscription scope does not match the event.'
      : !subscription.active
        ? 'Subscription is inactive.'
        : !subscription.secretConfigured
          ? 'Signing secret is not configured.'
          : !subscription.events.includes(input.request.event)
            ? 'Event is not allowed by the subscription.'
            : !subscription.endpointReference.trim()
              ? 'Endpoint reference is missing.'
              : null;
    if (reason) skipped.push({ subscriptionId: subscription.id, reason });
    else eligibleSubscriptionIds.push(subscription.id);
  }
  return { event: input.request.event, eligibleSubscriptionIds, skipped };
}
