import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from '../domain/revenue-ops';
import type { PartyAccount, PartySnapshot } from '../shared/party-contracts';
import type { CrmDepthStore } from './crm-depth-store';
import type { CrmStore } from './crm-store';
import { BusinessDatabase } from './database';
import type { KernelStore } from './kernel-store';
import type { ProviderGatewayService } from './provider-gateway-service';
import { RevenueOpsStore } from './revenue-ops-store';
import type { StatutoryGatewayService } from './statutory-gateway-service';

const activeScopeCompanyId = 'company-northstar-us';
const partyBoundaryMessage = /active Party Master customer account in the current legal entity/;

function customer(id: string, companyId: string, status: PartyAccount['status']): PartyAccount {
  return {
    id,
    tenantId: 'tenant-northstar',
    companyId,
    displayName: `Customer ${id}`,
    legalName: `Customer ${id} Private Limited`,
    domain: `${id}.example.in`,
    industry: 'Retail',
    relationship: 'customer',
    ownerId: 'user-avery',
    status,
    version: 1,
  };
}

async function createStore(accounts: PartyAccount[], withRetailCounter = false): Promise<{ store: RevenueOpsStore; database: BusinessDatabase }> {
  const database = new BusinessDatabase(':memory:');
  await database.initialize();
  const revenue = createInitialRevenueOpsState();
  if (withRetailCounter) {
    revenue.retailCounters = [{
      id: 'counter-store-01',
      code: 'POS-01',
      name: 'Main counter',
      warehouseId: 'warehouse-store',
      sellFromBinId: 'bin-store-shelf',
      priceListId: 'price-list-store-retail',
      walkInAccountId: 'account-walk-in',
      paymentTermId: 'payment-term-due-receipt',
      active: true,
      scope: structuredClone(revenue.scope),
      version: 1,
    }];
  }
  database.saveState('revenue-ops-india', revenue.schemaVersion, revenue.revision, revenue);
  const party = { accounts, contacts: [], addresses: [] } as unknown as PartySnapshot;
  const store = new RevenueOpsStore(
    database,
    { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore,
    { getSnapshot: () => party } as unknown as import('./party-store').PartyStore,
    { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore,
    {} as CrmDepthStore,
    {} as StatutoryGatewayService,
    {} as ProviderGatewayService,
  );
  await store.initialize();
  return { store, database };
}

async function expectCounterRejected(accounts: PartyAccount[]): Promise<void> {
  const { store, database } = await createStore(accounts);
  try {
    expect(() => store.createRetailCounter({
      code: 'POS-01',
      name: 'Main counter',
      warehouseId: 'warehouse-store',
      sellFromBinId: 'bin-store-shelf',
      priceListId: 'price-list-store-retail',
      walkInAccountId: accounts[0]!.id,
      paymentTermId: 'payment-term-due-receipt',
    }, 'user-avery')).toThrow(partyBoundaryMessage);
  } finally {
    database.close();
  }
}

async function expectExplicitCheckoutCustomerRejected(accounts: PartyAccount[]): Promise<void> {
  const { store, database } = await createStore(accounts, true);
  try {
    expect(() => store.checkoutRetailSale({
      counterId: 'counter-store-01',
      cashierShiftId: 'shift-store-01',
      transactionKey: 'POS-CUSTOMER-BOUNDARY-01',
      customerAccountId: accounts[0]!.id,
      saleAt: '2026-07-15T09:15:00.000Z',
      lines: [{
        itemVariantId: 'variant-retail-tea',
        binId: 'bin-store-shelf',
        serialUnitIds: [],
        quantity: 1,
      }],
      discountPolicyIds: [],
      tenders: [{ method: 'cash', amount: 1, reference: 'CASH-BOUNDARY-01' }],
    }, 'cashier-ava')).toThrow(partyBoundaryMessage);
  } finally {
    database.close();
  }
}

describe('retail Party Master boundary', () => {
  it('rejects inactive and cross-company customers when creating a retail counter', async () => {
    await expectCounterRejected([customer('inactive-customer', activeScopeCompanyId, 'inactive')]);
    await expectCounterRejected([customer('foreign-customer', 'company-other', 'active')]);
  });

  it('rejects inactive and cross-company explicit customers before retail checkout begins', async () => {
    await expectExplicitCheckoutCustomerRejected([customer('inactive-customer', activeScopeCompanyId, 'inactive')]);
    await expectExplicitCheckoutCustomerRejected([customer('foreign-customer', 'company-other', 'active')]);
  });
});
