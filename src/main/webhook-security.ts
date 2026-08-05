import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SignedWebhookEnvelope, VerifyWebhookInput } from '../shared/integration-contracts';

function canonicalEnvelope(envelope: Omit<SignedWebhookEnvelope, 'signature'>): string {
  return JSON.stringify({
    id: envelope.id,
    event: envelope.event,
    occurredAt: envelope.occurredAt,
    apiVersion: envelope.apiVersion,
    companyId: envelope.companyId,
    branchId: envelope.branchId,
    payload: envelope.payload,
    idempotencyKey: envelope.idempotencyKey,
  });
}

export function signWebhookEnvelope(
  envelope: Omit<SignedWebhookEnvelope, 'signature'>,
  secret: string,
): SignedWebhookEnvelope {
  if (secret.length < 32) throw new Error('Webhook secret must contain at least 32 characters.');
  return {
    ...envelope,
    signature: createHmac('sha256', secret).update(canonicalEnvelope(envelope)).digest('hex'),
  };
}

export function verifyWebhookEnvelope(input: VerifyWebhookInput): void {
  const { envelope, secret, now = new Date().toISOString(), maxAgeSeconds = 300, seenIdempotencyKeys } = input;
  if (!/^[a-f0-9]{64}$/i.test(envelope.signature)) throw new Error('Webhook signature format is invalid.');
  if (!envelope.id || !envelope.event || !envelope.companyId || !envelope.branchId || !envelope.idempotencyKey) throw new Error('Webhook envelope is incomplete.');
  if (seenIdempotencyKeys?.has(envelope.idempotencyKey)) throw new Error('Webhook idempotency key has already been processed.');
  const occurredAt = Date.parse(envelope.occurredAt);
  const current = Date.parse(now);
  if (!Number.isFinite(occurredAt) || !Number.isFinite(current) || Math.abs(current - occurredAt) > maxAgeSeconds * 1000) throw new Error('Webhook timestamp is outside the accepted replay window.');
  const expected = signWebhookEnvelope({ ...envelope, signature: undefined } as Omit<SignedWebhookEnvelope, 'signature'>, secret).signature;
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(envelope.signature, 'hex'))) throw new Error('Webhook signature does not match the envelope.');
}
