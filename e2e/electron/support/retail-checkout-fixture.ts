import { createCatalogProduct, createGstTaxCode, createPriceList, createPriceListEntry } from '../../../src/domain/commercial';
import { WORKSPACE_OWNER_ID, createRole, createUser } from '../../../src/domain/kernel';
import { createStockLocation } from '../../../src/domain/fulfilment-control';
import {
  createInventoryItem,
  createItemVariant,
  createPutawayTask,
  createStorageBin,
  createWarehouse,
  createWarehouseZone,
  receiveInventory,
  transitionWarehouseTask,
} from '../../../src/domain/inventory-warehouse';
import { createAccount, createCleanPartyState } from '../../../src/domain/party';
import { createRetailCounter } from '../../../src/domain/retail-pos';
import { createCleanRevenueOpsState } from '../../../src/domain/revenue-ops';
import { BusinessDatabase } from '../../../src/main/database';
import { AuthService } from '../../../src/main/auth-service';
import type { PartyState } from '../../../src/shared/party-contracts';
import type { KernelState } from '../../../src/shared/kernel-contracts';
import type { RevenueOpsState } from '../../../src/shared/revenue-ops-contracts';

/**
 * Deliberately small, named fixture for a disposable certification profile.
 * It is not a shipped starter, a demo workspace, or an import path. The one
 * product exists solely long enough to prove that a rendered POS checkout can
 * create durable commercial, financial and physical-stock evidence.
 */
export const POS_CHECKOUT_E2E_FIXTURE = {
  counterId: 'e2e-pos-counter',
  counterCode: 'E2E-POS-01',
  customerAccountId: 'e2e-walk-in-customer',
  productId: 'e2e-pos-tea-product',
  itemVariantId: 'e2e-pos-tea-variant',
  sellFromBinId: 'e2e-pos-shelf-bin',
  unitPrice: 100,
  unitCost: 60,
  grandTotal: 118,
  stockQuantityBeforeCheckout: 20,
  stockQuantityAfterCheckout: 19,
  stockQuantityAfterApprovedReturn: 20,
  cashTenderReference: 'E2E-CASH-0001',
} as const;

export type PosCheckoutE2eFixture = typeof POS_CHECKOUT_E2E_FIXTURE;

const FIXTURE_OCCURRED_AT = '2026-08-04T08:00:00.000Z';
const FIXTURE_RECEIVED_AT = '2026-08-04T08:05:00.000Z';

function fixtureProfile(state: RevenueOpsState): RevenueOpsState {
  return {
    ...state,
    revision: state.revision + 1,
    profile: {
      ...state.profile,
      legalName: 'Isolated E2E Retail Certification',
      tradeName: 'Isolated E2E Retail Certification',
      gstRegistered: true,
      gstin: '27ABCDE1234F1Z5',
      defaultStateCode: '27',
      version: state.profile.version + 1,
    },
  };
}

function activateFixturePriceList(state: RevenueOpsState): RevenueOpsState {
  const priceList = state.priceLists.find(({ id }) => id === 'e2e-pos-retail-price-list');
  if (!priceList) throw new Error('The isolated POS fixture price list was not created.');
  return {
    ...state,
    revision: state.revision + 1,
    priceLists: state.priceLists.map((candidate) => candidate.id === priceList.id
      ? {
        ...candidate,
        status: 'active' as const,
        active: true,
        activatedBy: 'e2e:fixture',
        activatedAt: FIXTURE_OCCURRED_AT,
        version: candidate.version + 1,
      }
      : candidate),
  };
}

function createFixtureParty(): PartyState {
  return createAccount(
    createCleanPartyState(),
    {
      displayName: 'E2E Walk-in Customer',
      legalName: 'E2E Walk-in Customer',
      domain: 'e2e-customer.invalid',
      industry: 'Retail certification',
      relationship: 'customer',
      ownerId: WORKSPACE_OWNER_ID,
    },
    WORKSPACE_OWNER_ID,
    POS_CHECKOUT_E2E_FIXTURE.customerAccountId,
    FIXTURE_OCCURRED_AT,
  );
}

function createFixtureRevenueOps(): RevenueOpsState {
  let state = fixtureProfile(createCleanRevenueOpsState());
  state = createGstTaxCode(state, {
    code: '0902',
    kind: 'HSN',
    description: 'Tea for isolated retail checkout certification.',
    gstRate: 18,
    cessRate: 0,
    effectiveFrom: '2020-01-01',
    effectiveTo: '2099-12-31',
    sourceLabel: 'GST HSN certification fixture',
    sourceUrl: 'https://www.gst.gov.in/',
    reviewStatus: 'verified',
  }, 'e2e-pos-tea-tax-code', FIXTURE_OCCURRED_AT);
  state = createCatalogProduct(state, {
    sku: 'E2E-POS-TEA',
    name: 'E2E POS Certification Tea',
    description: 'One isolated item used only to certify packaged POS checkout.',
    kind: 'goods',
    uom: 'UNIT',
    taxCodeId: 'e2e-pos-tea-tax-code',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2099-12-31',
  }, POS_CHECKOUT_E2E_FIXTURE.productId);
  state = createPriceList(state, {
    code: 'E2E-POS-RETAIL',
    name: 'Isolated POS certification retail price',
    channel: 'retail',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2099-12-31',
  }, 'e2e-pos-retail-price-list');
  state = createPriceListEntry(state, {
    priceListId: 'e2e-pos-retail-price-list',
    productId: POS_CHECKOUT_E2E_FIXTURE.productId,
    unitPrice: POS_CHECKOUT_E2E_FIXTURE.unitPrice,
    taxMode: 'exclusive',
    minimumQuantity: 1,
    effectiveFrom: '2020-01-01',
    effectiveTo: '2099-12-31',
  }, 'e2e-pos-tea-price');
  state = activateFixturePriceList(state);
  state = createStockLocation(state, {
    code: 'E2E-STORE',
    name: 'Isolated E2E store',
    stateCode: '27',
  }, 'e2e-pos-stock-location');
  state = createInventoryItem(state, {
    productId: POS_CHECKOUT_E2E_FIXTURE.productId,
    code: 'E2E-POS-TEA',
    name: 'E2E POS Certification Tea',
    baseUomId: 'uom-unit',
    tracking: 'none',
    valuationMethod: 'fifo',
  }, 'e2e-pos-tea-item');
  state = createItemVariant(state, {
    itemId: 'e2e-pos-tea-item',
    sku: 'E2E-POS-TEA-100G',
    name: 'E2E POS Certification Tea 100 g',
    attributes: { pack: '100g' },
    barcode: '8900000000001',
  }, POS_CHECKOUT_E2E_FIXTURE.itemVariantId);
  state = createWarehouse(state, {
    code: 'E2E-STORE',
    name: 'Isolated E2E store',
    stateCode: '27',
    stockLocationId: 'e2e-pos-stock-location',
  }, 'e2e-pos-warehouse');
  state = createWarehouseZone(state, {
    warehouseId: 'e2e-pos-warehouse',
    code: 'E2E-RCV',
    name: 'Isolated receiving',
    purpose: 'receiving',
  }, 'e2e-pos-receiving-zone');
  state = createWarehouseZone(state, {
    warehouseId: 'e2e-pos-warehouse',
    code: 'E2E-SHELF',
    name: 'Isolated sell shelf',
    purpose: 'picking',
  }, 'e2e-pos-shelf-zone');
  state = createStorageBin(state, {
    zoneId: 'e2e-pos-receiving-zone',
    code: 'E2E-RCV-01',
    name: 'Isolated receiving bin',
    capacity: 100,
    pickSequence: 1,
  }, 'e2e-pos-receiving-bin');
  state = createStorageBin(state, {
    zoneId: 'e2e-pos-shelf-zone',
    code: 'E2E-SHELF-01',
    name: 'Isolated sell shelf bin',
    capacity: 100,
    pickSequence: 10,
  }, POS_CHECKOUT_E2E_FIXTURE.sellFromBinId);
  state = receiveInventory(state, {
    warehouseId: 'e2e-pos-warehouse',
    receivingBinId: 'e2e-pos-receiving-bin',
    itemVariantId: POS_CHECKOUT_E2E_FIXTURE.itemVariantId,
    quantity: POS_CHECKOUT_E2E_FIXTURE.stockQuantityBeforeCheckout,
    uomId: 'uom-unit',
    unitCost: POS_CHECKOUT_E2E_FIXTURE.unitCost,
    reference: 'E2E-GRN-0001',
    receivedAt: FIXTURE_RECEIVED_AT,
    serialNumbers: [],
  }, 'e2e:fixture', FIXTURE_RECEIVED_AT);
  state = createPutawayTask(state, {
    itemVariantId: POS_CHECKOUT_E2E_FIXTURE.itemVariantId,
    fromBinId: 'e2e-pos-receiving-bin',
    toBinId: POS_CHECKOUT_E2E_FIXTURE.sellFromBinId,
    quantity: POS_CHECKOUT_E2E_FIXTURE.stockQuantityBeforeCheckout,
    assignedTo: 'e2e fixture operator',
    dueAt: '2026-08-04T08:10:00.000Z',
    priority: 'high',
  }, 'e2e:fixture', 'e2e-pos-putaway', FIXTURE_RECEIVED_AT);
  state = transitionWarehouseTask(state, {
    id: 'e2e-pos-putaway',
    toStatus: 'in-progress',
    expectedVersion: 1,
  }, 'e2e:fixture', '2026-08-04T08:06:00.000Z');
  state = transitionWarehouseTask(state, {
    id: 'e2e-pos-putaway',
    toStatus: 'completed',
    expectedVersion: 2,
  }, 'e2e:fixture', '2026-08-04T08:07:00.000Z');
  return createRetailCounter(state, {
    code: POS_CHECKOUT_E2E_FIXTURE.counterCode,
    name: 'Isolated POS certification counter',
    warehouseId: 'e2e-pos-warehouse',
    sellFromBinId: POS_CHECKOUT_E2E_FIXTURE.sellFromBinId,
    priceListId: 'e2e-pos-retail-price-list',
    walkInAccountId: POS_CHECKOUT_E2E_FIXTURE.customerAccountId,
    paymentTermId: 'payment-term-due-receipt',
  }, POS_CHECKOUT_E2E_FIXTURE.counterId);
}

/**
 * Seeds a temporary, fully isolated profile after UI owner enrollment. It
 * rejects any non-empty commercial state rather than risk overwriting a
 * profile that was accidentally reused outside this E2E test.
 */
export async function seedIsolatedRetailCheckoutFixture(
  databasePath: string,
): Promise<PosCheckoutE2eFixture> {
  const database = new BusinessDatabase(databasePath);
  await database.initialize();
  try {
    const currentRevenue = database.loadState<RevenueOpsState>('revenue-ops-india');
    const currentParty = database.loadState<PartyState>('party');
    if (!currentRevenue || !currentParty) {
      throw new Error('The isolated E2E profile was not bootstrapped before POS fixture seeding.');
    }
    if (
      currentRevenue.payload.products.length > 0 ||
      currentRevenue.payload.retailSales.length > 0 ||
      currentRevenue.payload.retailCounters.length > 0 ||
      currentParty.payload.accounts.length > 0
    ) {
      throw new Error('Refusing to seed the POS fixture into a non-empty profile.');
    }

    const party = createFixtureParty();
    const revenue = createFixtureRevenueOps();
    database.saveState('party', party.schemaVersion, party.revision, party);
    database.saveState('revenue-ops-india', revenue.schemaVersion, revenue.revision, revenue);
    return POS_CHECKOUT_E2E_FIXTURE;
  } finally {
    database.close();
  }
}

/**
 * Creates only the protected credential needed to prove independent shift
 * review. The clean workspace already contains the finance-approver identity
 * in its kernel state; this helper never changes production data and never
 * stores a raw password in the business state.
 */
export async function provisionIsolatedCashReviewer(databasePath: string): Promise<{
  email: string;
  temporaryPassword: string;
  newPassword: string;
}> {
  const database = new BusinessDatabase(databasePath);
  await database.initialize();
  const email = 'e2e.cash.reviewer@epic-bos.invalid';
  const temporaryPassword = 'EpicE2E#2026!CashTemp';
  const newPassword = 'EpicE2E#2026!CashReview';
  try {
    const kernel = database.loadState<KernelState>('kernel');
    if (!kernel) throw new Error('The clean kernel fixture is missing its kernel state.');
    let kernelState = kernel.payload;
    const reviewerRoleId = 'role-e2e-cash-reviewer';
    if (!kernelState.roles.some(({ id }) => id === reviewerRoleId)) {
      kernelState = createRole(kernelState, {
        name: 'E2E cash reviewer',
        description: 'Isolated packaged-test role for independent cash-close approval.',
        grantIds: [
          'grant-kernel-admin',
          'grant-crm-read',
          'grant-party-master',
          'grant-crm-configuration-governance',
          'grant-workspace-read',
          'grant-sales-commercial-operator',
          'grant-sales-commercial-approver',
          'grant-inventory-execution-governance',
        ],
      }, reviewerRoleId, '2026-08-06T08:00:00.000Z');
      database.saveState('kernel', kernel.schemaVersion, kernel.revision, kernelState);
    }
    const reviewerUser = kernelState.users.find((user) => user.id === 'user-priya');
    if (!reviewerUser) {
      kernelState = createUser(kernelState, {
        email,
        displayName: 'E2E Cash Reviewer',
        roleIds: [reviewerRoleId, 'role-finance-approver'],
        companyIds: [kernelState.context.companyId],
        branchIds: [kernelState.context.branchId],
      }, 'user-priya', '2026-08-06T08:00:00.000Z');
      database.saveState('kernel', kernelState.schemaVersion, kernelState.revision, kernelState);
    } else {
      const requiredRoles = [reviewerRoleId, 'role-finance-approver'];
      const nextRoleIds = [...new Set([...reviewerUser.roleIds, ...requiredRoles])];
      if (nextRoleIds.length !== reviewerUser.roleIds.length) {
        reviewerUser.roleIds = nextRoleIds;
        reviewerUser.version += 1;
        database.saveState('kernel', kernel.schemaVersion, kernel.revision, kernelState);
      }
    }
    await new AuthService(database).provisionUser('user-priya', email, 'E2E Cash Reviewer', temporaryPassword);
    return { email, temporaryPassword, newPassword };
  } finally {
    database.close();
  }
}
