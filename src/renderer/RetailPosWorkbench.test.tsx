import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialPartyState, getPartySnapshot } from '../domain/party';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import { enqueueRetailOfflineSale } from '../domain/retail-offline-sync';
import type { CheckoutRetailSaleInput } from '../shared/retail-pos-contracts';
import type { ResolveRetailOfflineSaleInput } from '../shared/retail-offline-sync-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailPosWorkbench, type RetailPosWorkbenchProps } from './RetailPosWorkbench';

const generatedAt = '2026-08-02T09:00:00.000Z';

function offlineSaleInput(): CheckoutRetailSaleInput {
  return {
    counterId: 'counter-store',
    cashierShiftId: 'shift-store',
    transactionKey: 'POS-OFFLINE-UI-001',
    saleAt: '2026-08-02T08:50:00.000Z',
    lines: [{ itemVariantId: 'variant-tea', binId: 'bin-shelf', serialUnitIds: [], quantity: 2 }],
    discountPolicyIds: [],
    tenders: [{ method: 'cash', amount: 200, reference: 'CASH-OFFLINE-UI-001' }],
  };
}

function conflictRevenue(): RevenueOpsSnapshot {
  let state = createInitialRevenueOpsState();
  state = enqueueRetailOfflineSale(state, offlineSaleInput(), 'cashier-1', generatedAt, 'offline-ui-1');
  const queued = state.retailOfflineSaleQueue[0]!;
  state = {
    ...state,
    retailOfflineSaleQueue: [{
      ...queued,
      status: 'conflict',
      attempts: 1,
      conflictReason: 'Network recovery found a stock conflict.',
      version: 3,
    }],
  };
  return getRevenueOpsSnapshot(state, { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] }, generatedAt);
}

const party = getPartySnapshot(createInitialPartyState(), generatedAt);

/**
 * A checkout-ready counter snapshot. The renderer owns the draft reset, while
 * onCheckout is the external IPC boundary, so this is deliberately small but
 * includes a live counter, stock, price, cashier shift, and approved customer
 * credit control rather than asserting against component state.
 */
function checkoutReadyRevenue(): RevenueOpsSnapshot {
  const base = getRevenueOpsSnapshot(createInitialRevenueOpsState(), {
    opportunities: [],
    accounts: party.accounts,
    contacts: party.contacts,
    addresses: party.addresses,
    activeUserIds: [],
  }, generatedAt);

  return {
    ...base,
    profile: { ...base.profile, defaultStateCode: '27' },
    taxCodes: [{
      ...base.taxCodes[0]!,
      id: 'tax-retail-tea',
      code: '0902',
      kind: 'HSN',
      effectiveFrom: '2020-01-01',
      effectiveTo: '2099-12-31',
    }],
    products: [{
      ...base.products[0]!,
      id: 'product-retail-tea',
      sku: 'RETAIL-TEA',
      name: 'Retail tea',
      description: 'Price-backed retail goods.',
      kind: 'goods',
      uom: 'UNIT',
      taxCodeId: 'tax-retail-tea',
      effectiveFrom: '2020-01-01',
      effectiveTo: '2099-12-31',
      active: true,
    }],
    priceLists: [{
      ...base.priceLists[0]!,
      id: 'price-list-retail',
      code: 'RETAIL',
      name: 'Retail price list',
      channel: 'retail',
      effectiveFrom: '2020-01-01',
      effectiveTo: '2099-12-31',
      status: 'active',
      active: true,
    }],
    priceListEntries: [{
      ...base.priceListEntries[0]!,
      id: 'price-entry-retail-tea',
      priceListId: 'price-list-retail',
      productId: 'product-retail-tea',
      unitPrice: 100,
      taxMode: 'exclusive',
      minimumQuantity: 1,
      effectiveFrom: '2020-01-01',
      effectiveTo: '2099-12-31',
    }],
    warehouses: [{
      id: 'warehouse-store',
      code: 'STORE',
      name: 'Store warehouse',
      stateCode: '27',
      stockLocationId: 'location-store',
      active: true,
      version: 1,
    }],
    warehouseZones: [{
      id: 'zone-store-shelf',
      warehouseId: 'warehouse-store',
      code: 'SHELF',
      name: 'Retail shelf',
      purpose: 'picking',
      active: true,
      version: 1,
    }],
    storageBins: [{
      id: 'bin-store-shelf',
      zoneId: 'zone-store-shelf',
      code: 'SHELF-01',
      name: 'Retail shelf 01',
      capacity: 100,
      pickSequence: 1,
      status: 'available',
      version: 1,
    }],
    inventoryItems: [{
      id: 'item-retail-tea',
      productId: 'product-retail-tea',
      code: 'RETAIL-TEA',
      name: 'Retail tea',
      baseUomId: 'uom-unit',
      tracking: 'none',
      valuationMethod: 'fifo',
      active: true,
      version: 1,
    }],
    itemVariants: [{
      id: 'variant-retail-tea',
      itemId: 'item-retail-tea',
      sku: 'RETAIL-TEA-100G',
      name: 'Retail tea 100 g',
      attributes: {},
      barcode: '8901234567890',
      active: true,
      version: 1,
    }],
    binBalances: [{
      id: 'balance-retail-tea',
      binId: 'bin-store-shelf',
      itemVariantId: 'variant-retail-tea',
      quantity: 10,
      reserved: 0,
      picked: 0,
      available: 10,
      unitCost: 50,
      inventoryValue: 500,
      version: 1,
    }],
    retailCounters: [{
      id: 'counter-store',
      code: 'COUNTER-01',
      name: 'Main counter',
      warehouseId: 'warehouse-store',
      sellFromBinId: 'bin-store-shelf',
      priceListId: 'price-list-retail',
      walkInAccountId: 'account-northwind',
      paymentTermId: 'payment-term-due-receipt',
      active: true,
      version: 1,
    }],
    retailCashierShifts: [{
      id: 'shift-store',
      number: 'SHIFT-0001',
      counterId: 'counter-store',
      cashierId: 'cashier-1',
      openedAt: '2026-08-02T08:00:00.000Z',
      openingCash: 0,
      status: 'open',
      version: 1,
    }],
    creditLimitControls: [{
      id: 'credit-control-northwind',
      number: 'CRL-26-27-00001',
      accountId: 'account-northwind',
      currency: 'INR',
      creditLimit: 10000,
      warningThresholdPercent: 80,
      graceDays: 7,
      blockNewOrders: true,
      riskGrade: 'A',
      rationale: 'Approved counter customer credit for this fixture.',
      status: 'approved',
      requestedBy: 'credit-manager',
      requestedAt: '2026-08-01T08:00:00.000Z',
      decidedBy: 'credit-manager',
      decidedAt: '2026-08-01T08:01:00.000Z',
      version: 1,
    }],
  };
}

function renderCheckoutReady(onCheckout: RetailPosWorkbenchProps['onCheckout'], revenue = checkoutReadyRevenue()) {
  return render(
    <RetailPosWorkbench
      revenue={revenue}
      party={party}
      busy={false}
      activeActorId="cashier-1"
      onCreateCounter={async () => undefined}
      onOpenShift={async () => undefined}
      onCheckout={onCheckout}
      onRequestClose={async () => undefined}
      onDecideClose={async () => undefined}
      onRequestVarianceResolution={async () => undefined}
      onDecideVarianceResolution={async () => undefined}
    />,
  );
}

function renderRecovery(activeActorId: string, onResolveOfflineSale: RetailPosWorkbenchProps['onResolveOfflineSale']) {
  return render(
    <RetailPosWorkbench
      revenue={conflictRevenue()}
      party={party}
      busy={false}
      activeActorId={activeActorId}
      onCreateCounter={async () => undefined}
      onOpenShift={async () => undefined}
      onCheckout={async () => undefined}
      onResolveOfflineSale={onResolveOfflineSale}
      onRequestClose={async () => undefined}
      onDecideClose={async () => undefined}
      onRequestVarianceResolution={async () => undefined}
      onDecideVarianceResolution={async () => undefined}
    />,
  );
}

afterEach(() => cleanup());

describe('RetailPosWorkbench offline conflict recovery', () => {
  it('does not show a voucher as applied before the trusted checkout boundary validates it', async () => {
    const user = userEvent.setup();
    renderRecovery('cashier-1', vi.fn());

    await user.type(screen.getByPlaceholderText('Voucher Code'), 'MONSOON20');

    expect(screen.getByText(/voucher will be checked at checkout/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.queryByText(/voucher\s+MONSOON20\s+active/i)).toBeNull();
  });

  it('keeps resolution controls away from the cashier who created the conflict', () => {
    renderRecovery('cashier-1', vi.fn());

    expect(screen.getByText(/independent supervisor/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Requeue after review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });

  it('requires a labelled recovery reference before an independent supervisor can requeue by keyboard and click', async () => {
    const user = userEvent.setup();
    const onResolveOfflineSale = vi.fn<(input: ResolveRetailOfflineSaleInput) => Promise<void>>().mockResolvedValue(undefined);
    renderRecovery('supervisor-1', onResolveOfflineSale);

    const evidence = screen.getByRole('textbox', { name: 'Recovery evidence reference' });
    const requeue = screen.getByRole('button', { name: 'Requeue after review' });
    expect(requeue).toHaveProperty('disabled', true);

    evidence.focus();
    expect(document.activeElement).toBe(evidence);
    await user.keyboard('POWER-FAIL-STORE-001');
    expect(requeue).toHaveProperty('disabled', false);

    await user.click(requeue);
    expect(onResolveOfflineSale).toHaveBeenCalledWith(expect.objectContaining({
      id: 'offline-ui-1',
      resolution: 'requeue',
      recoveryEvidenceReference: 'POWER-FAIL-STORE-001',
      expectedVersion: 3,
    }));
  });
});

describe('RetailPosWorkbench checkout reset', () => {
  it('keeps a cash-only checkout available when the inactive customer-credit tender has no approved limit', async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn<RetailPosWorkbenchProps['onCheckout']>().mockResolvedValue(undefined);
    const revenue = { ...checkoutReadyRevenue(), creditLimitControls: [] };
    renderCheckoutReady(onCheckout, revenue);

    await user.click(screen.getByRole('button', { name: '+ Add' }));
    const cashTender = document.querySelector<HTMLElement>('[data-method="cash"]');
    expect(cashTender).toBeTruthy();
    await user.type(within(cashTender!).getByRole('spinbutton', { name: 'INR' }), '105');

    expect(screen.getByRole('button', { name: /complete governed checkout/i })).toHaveProperty('disabled', false);
  });

  it('keeps every configured tender rail available after a successful checkout', async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn<RetailPosWorkbenchProps['onCheckout']>().mockResolvedValue(undefined);
    renderCheckoutReady(onCheckout);

    await user.click(screen.getByRole('button', { name: '+ Add' }));
    const cashTender = document.querySelector<HTMLElement>('[data-method="cash"]');
    expect(cashTender).toBeTruthy();
    await user.type(within(cashTender!).getByRole('spinbutton', { name: 'INR' }), '105');
    await user.click(screen.getByRole('button', { name: /complete governed checkout/i }));

    await waitFor(() => expect(onCheckout).toHaveBeenCalledTimes(1));
    expect([...document.querySelectorAll<HTMLElement>('.retail-pos-workbench__tenders [data-method]')].map((tender) => tender.dataset.method)).toEqual([
      'cash',
      'upi',
      'card',
      'store-credit',
      'customer-credit',
    ]);
    const nextCustomerCreditTender = document.querySelector<HTMLElement>('.retail-pos-workbench__tenders [data-method="customer-credit"]');
    expect(nextCustomerCreditTender).toBeTruthy();
    expect((within(nextCustomerCreditTender!).getByRole('spinbutton', { name: 'INR' }) as HTMLInputElement).value).toBe('');
    expect((within(nextCustomerCreditTender!).getByRole('textbox', { name: 'Credit approval reference' }) as HTMLInputElement).value).toBe('');
  });
});
