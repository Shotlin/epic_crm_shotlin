import { createHmac, timingSafeEqual } from 'node:crypto';

export type RetailHubWebhookVerificationReason =
  | 'missing_signature'
  | 'malformed_signature'
  | 'invalid_secret'
  | 'stale_signature'
  | 'invalid_signature'
  | 'replayed_signature';

export type RetailHubWebhookVerification =
  | { ok: true; timestamp: number; version: 'v1' }
  | { ok: false; reason: RetailHubWebhookVerificationReason };

export interface RetailHubWebhookReplayStore {
  /** Returns false when this signature key was already consumed. */
  consume(key: string, expiresAtMs: number, nowMs: number): boolean;
}

/**
 * Small in-memory replay guard for a single Hub process. Production hosts
 * should inject a shared store (Redis/Postgres) so multiple instances share
 * the same replay boundary.
 */
export function createInMemoryRetailHubWebhookReplayStore(): RetailHubWebhookReplayStore {
  const entries = new Map<string, number>();
  return {
    consume(key, expiresAtMs, nowMs) {
      for (const [storedKey, expiry] of entries) {
        if (expiry <= nowMs) entries.delete(storedKey);
      }
      if (entries.has(key)) return false;
      entries.set(key, expiresAtMs);
      return true;
    },
  };
}

/**
 * Produces the provider-neutral `t=<unix-seconds>,v1=<hex>` format consumed
 * by the verifier. The raw body must be signed exactly as received.
 */
export function signRetailHubWebhook(rawBody: string, secret: string, timestampMs = Date.now()): string {
  const normalizedSecret = normalizeSecret(secret);
  const timestamp = Math.floor(timestampMs / 1000);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Webhook timestamp must be a non-negative unix timestamp.');
  return `t=${timestamp},v1=${digest(rawBody, normalizedSecret, timestamp)}`;
}

export function verifyRetailHubWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | undefined;
  secret: string;
  nowMs?: number;
  toleranceMs?: number;
  replayStore?: RetailHubWebhookReplayStore;
}): RetailHubWebhookVerification {
  if (!input.signatureHeader?.trim()) return { ok: false, reason: 'missing_signature' };
  let secret: string;
  try {
    secret = normalizeSecret(input.secret);
  } catch {
    return { ok: false, reason: 'invalid_secret' };
  }
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) return { ok: false, reason: 'malformed_signature' };
  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs = input.toleranceMs ?? 5 * 60 * 1000;
  if (!Number.isSafeInteger(nowMs) || !Number.isInteger(toleranceMs) || toleranceMs < 1 || toleranceMs > 24 * 60 * 60 * 1000) {
    return { ok: false, reason: 'stale_signature' };
  }
  const age = nowMs - parsed.timestamp * 1000;
  if (Math.abs(age) > toleranceMs) return { ok: false, reason: 'stale_signature' };

  const expected = digest(input.rawBody, secret, parsed.timestamp);
  if (!equalHex(expected, parsed.signature)) return { ok: false, reason: 'invalid_signature' };

  if (input.replayStore && !input.replayStore.consume(`${parsed.timestamp}:${parsed.signature}`, parsed.timestamp * 1000 + toleranceMs, nowMs)) {
    return { ok: false, reason: 'replayed_signature' };
  }
  return { ok: true, timestamp: parsed.timestamp, version: 'v1' };
}

function normalizeSecret(value: string): string {
  if (typeof value !== 'string' || value.trim().length < 16 || value.length > 4096) throw new Error('Webhook secret must contain 16-4096 characters.');
  return value;
}

function digest(rawBody: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

function parseSignatureHeader(value: string): { timestamp: number; signature: string } | undefined {
  let timestamp: number | undefined;
  let signature: string | undefined;
  for (const segment of value.split(',')) {
    const [key, ...parts] = segment.trim().split('=');
    const content = parts.join('=').trim();
    if (key === 't' && timestamp === undefined && /^\d{1,20}$/u.test(content)) timestamp = Number(content);
    if (key === 'v1' && signature === undefined && /^[a-f0-9]{64}$/iu.test(content)) signature = content.toLowerCase();
  }
  if (timestamp === undefined || !Number.isSafeInteger(timestamp) || signature === undefined) return undefined;
  return { timestamp, signature };
}

function equalHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
