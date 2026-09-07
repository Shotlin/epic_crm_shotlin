import { describe, expect, it } from 'vitest';
import { buildBakalooMetrics, createBakalooDemoMetricsSeed, type BakalooMetricInput } from './bakaloo-metrics-kernel';

function metric(input: ReturnType<typeof buildBakalooMetrics>, key: string) {
  const result = input.metrics.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Missing metric ${key}`);
  return result;
}

describe('Bakaloo metrics kernel', () => {
  const completeInput: BakalooMetricInput = {
    sourceMode: 'imported',
    period: { from: '2026-08-01', to: '2026-08-02' },
    serviceableHouseholds: { '394101': 1_000 },
    marketingSpendMinor: 1_000,
    fixedStoreCostMinor: 1_200,
    techAndHeadOfficeCostMinor: 500,
    npsResponses: [10, 9, 6, 8],
    orders: [
      {
        id: 'o-1', customerId: 'c-1', pincode: '394101', placedAt: '2026-08-01T10:00:00.000Z',
        promisedDeliveryAt: '2026-08-01T10:59:00.000Z', deliveredAt: '2026-08-01T10:45:00.000Z', status: 'delivered',
        grossMinor: 10_000, discountMinor: 500, refundMinor: 0, cogsMinor: 5_000, paymentCostMinor: 100, deliveryCostMinor: 300,
      },
      {
        id: 'o-2', customerId: 'c-1', pincode: '394101', placedAt: '2026-08-02T10:00:00.000Z',
        promisedDeliveryAt: '2026-08-02T10:59:00.000Z', deliveredAt: '2026-08-02T11:05:00.000Z', status: 'delivered',
        grossMinor: 8_000, discountMinor: 0, refundMinor: 500, cogsMinor: 4_000, paymentCostMinor: 80, deliveryCostMinor: 300,
      },
      {
        id: 'o-3', customerId: 'c-2', pincode: '394101', placedAt: '2026-08-02T12:00:00.000Z',
        promisedDeliveryAt: null, deliveredAt: null, status: 'cancelled',
        grossMinor: 7_000, discountMinor: 0, refundMinor: 0, cogsMinor: 0, paymentCostMinor: 0, deliveryCostMinor: 0,
      },
    ],
  };

  it('calculates traceable retail, margin and service metrics without a fixed margin assumption', () => {
    const snapshot = buildBakalooMetrics(completeInput);
    expect(metric(snapshot, 'ordersDelivered')).toMatchObject({ value: 2, state: 'available' });
    expect(metric(snapshot, 'netRevenue')).toMatchObject({ value: 17_000, state: 'available' });
    expect(metric(snapshot, 'averageOrderValue')).toMatchObject({ value: 8_500, state: 'available' });
    expect(metric(snapshot, 'dailyOrderDensity')).toMatchObject({ value: 1, state: 'available' });
    expect(metric(snapshot, 'repeatRate')).toMatchObject({ value: 100, state: 'available' });
    expect(metric(snapshot, 'cancellationRate')).toMatchObject({ state: 'available' });
    expect(metric(snapshot, 'cancellationRate').value).toBeCloseTo(100 / 3, 12);
    expect(metric(snapshot, 'slaAdherence')).toMatchObject({ value: 50, state: 'available' });
    expect(metric(snapshot, 'cm1')).toMatchObject({ value: 8_000, state: 'available' });
    expect(metric(snapshot, 'cm2')).toMatchObject({ value: 7_220, state: 'available' });
    expect(metric(snapshot, 'cm3')).toMatchObject({ value: 6_020, state: 'available' });
    expect(metric(snapshot, 'cm4')).toMatchObject({ value: 4_520, state: 'available' });
    expect(metric(snapshot, 'nps')).toMatchObject({ value: 25, state: 'available' });
  });

  it('marks unknown inputs unavailable instead of presenting a fabricated zero or margin', () => {
    const incomplete: BakalooMetricInput = {
      ...completeInput,
      serviceableHouseholds: null,
      marketingSpendMinor: null,
      orders: completeInput.orders.map((order, index) => index === 0 ? { ...order, cogsMinor: null } : order),
      npsResponses: null,
    };
    const snapshot = buildBakalooMetrics(incomplete);
    expect(metric(snapshot, 'dailyOrderDensity')).toMatchObject({ value: null, state: 'unavailable' });
    expect(metric(snapshot, 'cm1')).toMatchObject({ value: null, state: 'unavailable' });
    expect(metric(snapshot, 'cm4')).toMatchObject({ value: null, state: 'unavailable' });
    expect(metric(snapshot, 'nps')).toMatchObject({ value: null, state: 'unavailable' });
  });

  it('produces deterministic, explicitly-labelled 90-day demo data', () => {
    const first = createBakalooDemoMetricsSeed('2026-06-01');
    const second = createBakalooDemoMetricsSeed('2026-06-01');
    expect(first.label).toContain('not live');
    expect(first.input.sourceMode).toBe('demo');
    expect(first.input.orders).toHaveLength(583);
    expect(first.input).toEqual(second.input);
    expect(metric(buildBakalooMetrics(first.input), 'cm3')).toMatchObject({ state: 'available', sourceMode: 'demo' });
  });
});
