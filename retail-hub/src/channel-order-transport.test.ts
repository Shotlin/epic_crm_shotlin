import { describe, expect, it } from 'vitest';
import {
  createInMemoryRetailHubChannelOrderTransport,
  normalizeRetailHubChannelOrderEvent,
  parseRetailHubChannelOrderEnvelope,
} from './channel-order-transport';
import type { RetailHubChannelOrderStatus } from './channel-order-transport';

const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

function event(status: RetailHubChannelOrderStatus = 'received', eventId = 'evt-1') {
  return {
    channel: 'website' as const,
    connectionId: 'bakaloo-web-1',
    externalOrderId: 'order-1',
    externalEventId: eventId,
    occurredAt: '2026-08-08T10:00:00.000Z',
    status,
    currency: 'INR' as const,
    totalAmountPaise: 11800,
    lines: [{ externalLineId: 'line-1', sku: 'RICE-5KG', quantity: 1, unitAmountPaise: 11800 }],
  };
}

describe('Retail Hub channel-order transport', () => {
  it('normalizes INR evidence and computes a stable identity/digest', () => {
    const normalized = normalizeRetailHubChannelOrderEvent({ ...event(), currency: 'inr' });
    expect(normalized).toMatchObject({ currency: 'INR', identityKey: 'website:bakaloo-web-1:order-1' });
    expect(normalized.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed for non-INR, duplicate lines, and missing event envelope', () => {
    expect(() => normalizeRetailHubChannelOrderEvent({ ...event(), currency: 'USD' })).toThrow(/only INR/i);
    expect(() => normalizeRetailHubChannelOrderEvent({ ...event(), lines: [event().lines[0], event().lines[0]] })).toThrow(/unique/i);
    expect(() => parseRetailHubChannelOrderEnvelope({ mode: 'shadow' })).toThrow(/event/i);
  });

  it('normalizes optional provider payment evidence and binds it into the digest', () => {
    const normalized = normalizeRetailHubChannelOrderEvent({
      ...event(),
      paymentEvidence: {
        status: 'captured', provider: 'bakaloo-payments', providerEventId: 'pay-event-1',
        paymentReference: 'PAY-1001', amountPaise: 11800, currency: 'INR', payloadChecksum: 'a'.repeat(64),
      },
    });
    expect(normalized.paymentEvidence).toMatchObject({ status: 'captured', paymentReference: 'PAY-1001', amountPaise: 11800 });
    expect(normalized.sourceDigest).not.toBe(normalizeRetailHubChannelOrderEvent(event()).sourceDigest);
  });

  it('rejects malformed or non-INR provider payment evidence', () => {
    const evidence = {
      status: 'captured', provider: 'bakaloo-payments', providerEventId: 'pay-event-1',
      paymentReference: 'PAY-1001', amountPaise: 11800, currency: 'INR', payloadChecksum: 'a'.repeat(64),
    };
    expect(() => normalizeRetailHubChannelOrderEvent({ ...event(), paymentEvidence: { ...evidence, currency: 'USD' } })).toThrow(/paymentEvidence.*INR/i);
    expect(() => normalizeRetailHubChannelOrderEvent({ ...event(), paymentEvidence: { ...evidence, payloadChecksum: 'bad' } })).toThrow(/SHA-256/i);
  });

  it('records scoped events idempotently and preserves conflicts without provider writes', async () => {
    const transport = createInMemoryRetailHubChannelOrderTransport(() => '00000000-0000-0000-0000-000000000001');
    const first = await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent(event()) }, scope, 'actor-1');
    expect(first.outcome).toBe('recorded');
    const retry = await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent(event()) }, scope, 'actor-1');
    expect(retry.outcome).toBe('idempotent');
    const drift = await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent({ ...event(), lines: [{ externalLineId: 'line-1', sku: 'RICE-5KG', quantity: 2, unitAmountPaise: 11800 }] }) }, scope, 'actor-1');
    expect(drift.outcome).toBe('conflicted');
    await expect(transport.list(scope)).resolves.toHaveLength(3);
  });

  it('allows governed mode to promote a previously shadow-observed identity', async () => {
    const transport = createInMemoryRetailHubChannelOrderTransport(() => '00000000-0000-0000-0000-000000000002');
    await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent(event()) }, scope, 'actor-1');
    const governed = await transport.accept({ mode: 'governed', event: normalizeRetailHubChannelOrderEvent({ ...event('accepted'), externalEventId: 'evt-2', occurredAt: '2026-08-08T10:01:00.000Z' }) }, scope, 'actor-2');
    expect(governed.outcome).toBe('recorded');
    expect(governed.record?.mode).toBe('governed');
  });

  it('rejects a backward status transition as a conflict', async () => {
    const transport = createInMemoryRetailHubChannelOrderTransport(() => '00000000-0000-0000-0000-000000000003');
    await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent(event('accepted')) }, scope, 'actor-1');
    const backward = await transport.accept({ mode: 'shadow', event: normalizeRetailHubChannelOrderEvent({ ...event('received'), externalEventId: 'evt-2' }) }, scope, 'actor-1');
    expect(backward.outcome).toBe('conflicted');
    expect(backward.receipt.detail).toMatch(/Cannot move accepted to received/);
  });
});
