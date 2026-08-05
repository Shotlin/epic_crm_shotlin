import { createHash } from 'node:crypto';

export type WebhookDeliveryOutcome = 'delivered' | 'retryable' | 'permanent-failure' | 'duplicate';

export interface WebhookDeliveryReceipt {
  id: string;
  eventId: string;
  subscriptionId: string;
  idempotencyKey: string;
  attemptedAt: string;
  outcome: WebhookDeliveryOutcome;
  responseCode?: number;
  responseReference?: string;
  errorCode?: string;
  checksum: string;
}

export interface WebhookDeliverySummary {
  total: number;
  delivered: number;
  retryable: number;
  permanentFailures: number;
  duplicates: number;
  checksum: string;
}

const validOutcome = (value: string): value is WebhookDeliveryOutcome => ['delivered', 'retryable', 'permanent-failure', 'duplicate'].includes(value);

/** Creates immutable evidence for one outbound attempt; it does not perform network I/O. */
export function createWebhookDeliveryReceipt(input: Omit<WebhookDeliveryReceipt, 'checksum'>): WebhookDeliveryReceipt {
  if (!input.id.trim() || !input.eventId.trim() || !input.subscriptionId.trim() || !input.idempotencyKey.trim()) throw new Error('Delivery receipt identity is incomplete.');
  if (!Number.isFinite(Date.parse(input.attemptedAt))) throw new Error('Delivery receipt timestamp is invalid.');
  if (!validOutcome(input.outcome)) throw new Error('Delivery receipt outcome is invalid.');
  if (input.responseCode !== undefined && (!Number.isInteger(input.responseCode) || input.responseCode < 100 || input.responseCode > 599)) throw new Error('Delivery response code is invalid.');
  if (input.outcome === 'delivered' && (input.responseCode === undefined || input.responseCode < 200 || input.responseCode >= 300)) throw new Error('Delivered receipt requires a successful response code.');
  if ((input.outcome === 'retryable' || input.outcome === 'permanent-failure') && !input.errorCode?.trim()) throw new Error('Failed delivery receipt requires an error code.');
  const checksum = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return { ...input, checksum };
}

export function verifyWebhookDeliveryReceipt(receipt: WebhookDeliveryReceipt): boolean {
  const { checksum, ...unsigned } = receipt;
  return Boolean(checksum) && checksum === createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
}

export function summarizeWebhookDeliveries(receipts: WebhookDeliveryReceipt[]): WebhookDeliverySummary {
  const delivered = receipts.filter(({ outcome }) => outcome === 'delivered').length;
  const retryable = receipts.filter(({ outcome }) => outcome === 'retryable').length;
  const permanentFailures = receipts.filter(({ outcome }) => outcome === 'permanent-failure').length;
  const duplicates = receipts.filter(({ outcome }) => outcome === 'duplicate').length;
  const unsigned = { total: receipts.length, delivered, retryable, permanentFailures, duplicates };
  return { ...unsigned, checksum: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') };
}
