import { describe, expect, it } from 'vitest';
import { createWebhookDeliveryReceipt, summarizeWebhookDeliveries, verifyWebhookDeliveryReceipt } from './webhook-delivery-receipts';

describe('webhook delivery receipts', () => {
  it('creates and verifies immutable success evidence', () => {
    const receipt = createWebhookDeliveryReceipt({ id: 'attempt-1', eventId: 'event-1', subscriptionId: 'sub-1', idempotencyKey: 'idem-1', attemptedAt: '2026-07-18T10:00:00.000Z', outcome: 'delivered', responseCode: 202, responseReference: 'provider-accepted-1' });
    expect(verifyWebhookDeliveryReceipt(receipt)).toBe(true);
    expect(verifyWebhookDeliveryReceipt({ ...receipt, responseReference: 'altered' })).toBe(false);
  });

  it('requires error evidence for failures and classifies reconciliation outcomes', () => {
    expect(() => createWebhookDeliveryReceipt({ id: 'attempt-2', eventId: 'event-2', subscriptionId: 'sub-1', idempotencyKey: 'idem-2', attemptedAt: '2026-07-18T10:00:00.000Z', outcome: 'retryable', responseCode: 503 })).toThrow('error code');
    const receipts = [
      createWebhookDeliveryReceipt({ id: 'a', eventId: 'e1', subscriptionId: 's', idempotencyKey: 'i1', attemptedAt: '2026-07-18T10:00:00.000Z', outcome: 'delivered', responseCode: 200 }),
      createWebhookDeliveryReceipt({ id: 'b', eventId: 'e2', subscriptionId: 's', idempotencyKey: 'i2', attemptedAt: '2026-07-18T10:01:00.000Z', outcome: 'retryable', responseCode: 429, errorCode: 'rate-limited' }),
      createWebhookDeliveryReceipt({ id: 'c', eventId: 'e3', subscriptionId: 's', idempotencyKey: 'i3', attemptedAt: '2026-07-18T10:02:00.000Z', outcome: 'permanent-failure', responseCode: 400, errorCode: 'invalid-payload' }),
      createWebhookDeliveryReceipt({ id: 'd', eventId: 'e4', subscriptionId: 's', idempotencyKey: 'i4', attemptedAt: '2026-07-18T10:03:00.000Z', outcome: 'duplicate' }),
    ];
    expect(summarizeWebhookDeliveries(receipts)).toMatchObject({ total: 4, delivered: 1, retryable: 1, permanentFailures: 1, duplicates: 1 });
  });
});
