import { describe, expect, it } from 'vitest';
import {
  createInMemoryRetailHubWebhookReplayStore,
  signRetailHubWebhook,
  verifyRetailHubWebhookSignature,
} from './webhook-signature';

const secret = 'retail-hub-test-secret-2026';
const body = JSON.stringify({ provider: 'upi', eventId: 'evt-1', amountPaise: 11800 });
const now = Date.parse('2026-08-14T10:00:00.000Z');

describe('Retail Hub webhook signatures', () => {
  it('verifies the exact raw body and timestamp', () => {
    const signature = signRetailHubWebhook(body, secret, now);
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: signature, secret, nowMs: now })).toEqual({ ok: true, timestamp: now / 1000, version: 'v1' });
  });

  it('rejects a missing or malformed header', () => {
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: undefined, secret, nowMs: now })).toEqual({ ok: false, reason: 'missing_signature' });
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: 'v1=not-a-signature', secret, nowMs: now })).toEqual({ ok: false, reason: 'malformed_signature' });
  });

  it('rejects tampered bodies and wrong secrets without throwing', () => {
    const signature = signRetailHubWebhook(body, secret, now);
    expect(verifyRetailHubWebhookSignature({ rawBody: `${body} `, signatureHeader: signature, secret, nowMs: now })).toEqual({ ok: false, reason: 'invalid_signature' });
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: signature, secret: 'short', nowMs: now })).toEqual({ ok: false, reason: 'invalid_secret' });
  });

  it('rejects stale and future signatures outside the replay window', () => {
    const old = signRetailHubWebhook(body, secret, now - 6 * 60 * 1000);
    const future = signRetailHubWebhook(body, secret, now + 6 * 60 * 1000);
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: old, secret, nowMs: now })).toEqual({ ok: false, reason: 'stale_signature' });
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: future, secret, nowMs: now })).toEqual({ ok: false, reason: 'stale_signature' });
  });

  it('rejects a replay after the first accepted delivery', () => {
    const replayStore = createInMemoryRetailHubWebhookReplayStore();
    const signature = signRetailHubWebhook(body, secret, now);
    const input = { rawBody: body, signatureHeader: signature, secret, nowMs: now, replayStore };
    expect(verifyRetailHubWebhookSignature(input)).toEqual({ ok: true, timestamp: now / 1000, version: 'v1' });
    expect(verifyRetailHubWebhookSignature(input)).toEqual({ ok: false, reason: 'replayed_signature' });
  });

  it('accepts harmless header ordering and ignores unknown fields', () => {
    const signature = signRetailHubWebhook(body, secret, now);
    const [, v1] = signature.split(',');
    const timestamp = signature.split(',')[0];
    expect(verifyRetailHubWebhookSignature({ rawBody: body, signatureHeader: `foo=bar,${v1},${timestamp}`, secret, nowMs: now })).toMatchObject({ ok: true });
  });
});
