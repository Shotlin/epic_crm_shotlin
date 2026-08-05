import { describe, expect, it } from 'vitest';
import { signWebhookEnvelope, verifyWebhookEnvelope } from './webhook-security';

const secret = 'phase-four-webhook-secret-that-is-long-enough';
const unsigned = {
  id: 'evt-001', event: 'invoice.issued', occurredAt: '2026-07-17T10:00:00.000Z' as string,
  apiVersion: '2026-07-17' as const, companyId: 'company-india', branchId: 'branch-mumbai', payload: { invoiceId: 'INV-001' }, idempotencyKey: 'idem-001',
};

describe('webhook security', () => {
  it('accepts a current signed envelope', () => {
    const envelope = signWebhookEnvelope(unsigned, secret);
    expect(() => verifyWebhookEnvelope({ envelope, secret, now: '2026-07-17T10:01:00.000Z' })).not.toThrow();
  });

  it('rejects tampering, duplicates, and stale delivery', () => {
    const envelope = signWebhookEnvelope(unsigned, secret);
    expect(() => verifyWebhookEnvelope({ envelope: { ...envelope, event: 'invoice.cancelled' }, secret, now: '2026-07-17T10:01:00.000Z' })).toThrow('signature');
    expect(() => verifyWebhookEnvelope({ envelope, secret, now: '2026-07-17T10:01:00.000Z', seenIdempotencyKeys: new Set(['idem-001']) })).toThrow('idempotency');
    expect(() => verifyWebhookEnvelope({ envelope, secret, now: '2026-07-17T10:10:01.000Z' })).toThrow('replay window');
  });
});
