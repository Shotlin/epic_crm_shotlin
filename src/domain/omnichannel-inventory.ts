/**
 * omnichannel-inventory.ts
 *
 * Pillar 2 – Omnichannel Inventory Truth & Stock Reservation Engine
 *
 * Prevents stock overselling across Counter POS, Website, ONDC, Marketplaces (Amazon/Flipkart),
 * and WhatsApp by reserving stock atomically upon order receipt.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SalesChannelKind = 'pos-counter' | 'website-ecom' | 'ondc-network' | 'amazon-mws' | 'flipkart-seller' | 'whatsapp-biz';

export interface OmnichannelStockReservationInput {
  reservationId: string;
  channel: SalesChannelKind;
  remoteOrderId?: string;
  itemVariantId: string;
  warehouseId: string;
  binId: string;
  quantity: number;
  reservedAt: string;
  expiresAt: string; // 15-minute checkout hold
}

export interface OmnichannelStockBalance {
  itemVariantId: string;
  sku: string;
  name: string;
  physicalOnHand: number;
  activeReservationsTotal: number;
  availableToPromise: number; // physicalOnHand - activeReservationsTotal
  reservationsByChannel: Record<SalesChannelKind, number>;
  channelOversellRisk: boolean;
}

export interface ChannelReservationResult {
  reservationId: string;
  channel: SalesChannelKind;
  status: 'reserved' | 'stockout-rejected' | 'partial-reserved';
  requestedQuantity: number;
  reservedQuantity: number;
  availableToPromiseAfter: number;
  reservationExpiry: string;
  rejectionReason?: string;
}

/**
 * Evaluates available-to-promise (ATP) stock for a variant across physical balances and active reservations.
 */
export function calculateAvailableToPromise(
  itemVariantId: string,
  sku: string,
  name: string,
  physicalOnHand: number,
  activeReservations: OmnichannelStockReservationInput[],
): OmnichannelStockBalance {
  const variantReservations = activeReservations.filter((r) => r.itemVariantId === itemVariantId && new Date(r.expiresAt).getTime() > Date.now());

  const reservationsByChannel: Record<SalesChannelKind, number> = {
    'pos-counter': 0,
    'website-ecom': 0,
    'ondc-network': 0,
    'amazon-mws': 0,
    'flipkart-seller': 0,
    'whatsapp-biz': 0,
  };

  variantReservations.forEach((r) => {
    reservationsByChannel[r.channel] = round2((reservationsByChannel[r.channel] ?? 0) + r.quantity);
  });

  const activeReservationsTotal = round2(variantReservations.reduce((sum, r) => sum + r.quantity, 0));
  const availableToPromise = round2(Math.max(0, physicalOnHand - activeReservationsTotal));
  const channelOversellRisk = activeReservationsTotal > physicalOnHand;

  return {
    itemVariantId,
    sku,
    name,
    physicalOnHand,
    activeReservationsTotal,
    availableToPromise,
    reservationsByChannel,
    channelOversellRisk,
  };
}

/**
 * Reserves stock atomically for an incoming checkout / remote order across any channel.
 */
export function reserveOmnichannelStock(
  input: OmnichannelStockReservationInput,
  currentPhysicalOnHand: number,
  existingActiveReservations: OmnichannelStockReservationInput[],
  sku = 'SKU-TEMP',
  name = 'Item Temp',
): ChannelReservationResult {
  const atp = calculateAvailableToPromise(input.itemVariantId, sku, name, currentPhysicalOnHand, existingActiveReservations);

  if (atp.availableToPromise >= input.quantity) {
    return {
      reservationId: input.reservationId,
      channel: input.channel,
      status: 'reserved',
      requestedQuantity: input.quantity,
      reservedQuantity: input.quantity,
      availableToPromiseAfter: round2(atp.availableToPromise - input.quantity),
      reservationExpiry: input.expiresAt,
    };
  } else if (atp.availableToPromise > 0) {
    return {
      reservationId: input.reservationId,
      channel: input.channel,
      status: 'partial-reserved',
      requestedQuantity: input.quantity,
      reservedQuantity: atp.availableToPromise,
      availableToPromiseAfter: 0,
      reservationExpiry: input.expiresAt,
      rejectionReason: `Partial stock reservation: requested ${input.quantity}, only ${atp.availableToPromise} available.`,
    };
  } else {
    return {
      reservationId: input.reservationId,
      channel: input.channel,
      status: 'stockout-rejected',
      requestedQuantity: input.quantity,
      reservedQuantity: 0,
      availableToPromiseAfter: 0,
      reservationExpiry: input.expiresAt,
      rejectionReason: `Stockout: Item variant is out of stock across all active channels.`,
    };
  }
}
