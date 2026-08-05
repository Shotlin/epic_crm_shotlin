import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Award, Barcode, Banknote, CheckCircle2, ChevronRight, CircleAlert, CreditCard,
  Gift, Landmark, PackageSearch, PauseCircle, PlayCircle, Printer,
  ReceiptText, ShieldCheck, Sparkles, Store, Tag, Tags, WalletCards, X,
} from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type {
  CheckoutRetailSaleInput,
  CreateRetailCounterInput,
  DecideRetailCashierShiftCloseInput,
  DecideRetailCashierShiftVarianceResolutionInput,
  OpenRetailCashierShiftInput,
  RequestRetailCashierShiftCloseInput,
  RequestRetailCashierShiftVarianceResolutionInput,
  RetailTenderMethod,
} from '../shared/retail-pos-contracts';
import type { CreateRetailLoyaltyAccountInput } from '../shared/retail-loyalty-contracts';
import type { CreateRetailCustomerVisitInput, LinkRetailCustomerVisitInput } from '../shared/retail-customer-ops-contracts';
import type { ResolveRetailOfflineSaleInput, SyncRetailOfflineQueueInput, SyncRetailOfflineSaleInput } from '../shared/retail-offline-sync-contracts';
import { buildRetailProviderReadiness } from '../domain/retail-provider-readiness';
import { computeCreditLimitUtilisation } from '../domain/credit-control-report';
import './RetailPosWorkbench.css';

type Shift = RevenueOpsSnapshot['retailCashierShifts'][number];

type CartLine = {
  key: string;
  itemVariantId: string;
  batchId?: string;
  quantity: number;
  serialUnitIds: string[];
};

type HeldCart = {
  id: string;
  heldAt: string;
  customerAccountId?: string;
  cart: CartLine[];
  note: string;
};

type TenderDraft = { method: Extract<RetailTenderMethod, 'cash' | 'upi' | 'card' | 'store-credit' | 'customer-credit'>; amount: string; reference: string };

const shiftTenderMethods = [
  ['cash', 'Cash / drawer'], ['upi', 'UPI'], ['card', 'Card'], ['cheque', 'Cheque'],
  ['store-credit', 'Store credit'], ['customer-credit', 'Customer credit'], ['other', 'Other'],
] as const;

export interface RetailPosWorkbenchProps {
  revenue: RevenueOpsSnapshot;
  party: PartySnapshot;
  busy: boolean;
  activeActorId: string;
  onCreateCounter: (input: CreateRetailCounterInput) => Promise<void>;
  onOpenShift: (input: OpenRetailCashierShiftInput) => Promise<void>;
  onCheckout: (input: CheckoutRetailSaleInput) => Promise<void>;
  onQueueOfflineSale?: (input: CheckoutRetailSaleInput) => Promise<void>;
  onSyncOfflineSale?: (input: SyncRetailOfflineSaleInput) => Promise<void>;
  onSyncOfflineQueue?: (input: SyncRetailOfflineQueueInput) => Promise<void>;
  onResolveOfflineSale?: (input: ResolveRetailOfflineSaleInput) => Promise<void>;
  onCreateLoyaltyAccount?: (input: CreateRetailLoyaltyAccountInput) => Promise<void>;
  onCreateCustomerVisit?: (input: CreateRetailCustomerVisitInput) => Promise<void>;
  onLinkCustomerVisitToSale?: (input: LinkRetailCustomerVisitInput) => Promise<void>;
  onRequestClose: (input: RequestRetailCashierShiftCloseInput) => Promise<void>;
  onDecideClose: (input: DecideRetailCashierShiftCloseInput) => Promise<void>;
  onRequestVarianceResolution: (input: RequestRetailCashierShiftVarianceResolutionInput) => Promise<void>;
  onDecideVarianceResolution: (input: DecideRetailCashierShiftVarianceResolutionInput) => Promise<void>;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentTransactionKey(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `POS-${id}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The governed retail action could not be completed.';
}

function indiaDate(timestamp: string | undefined): string {
  if (!timestamp) return 'Pending evidence';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(timestamp));
}

function activeToday(from: string, to: string | undefined): boolean {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return from <= today && (!to || to >= today);
}

export function RetailPosWorkbench({
  revenue,
  party,
  busy,
  activeActorId,
  onCreateCounter,
  onOpenShift,
  onCheckout,
  onQueueOfflineSale,
  onSyncOfflineSale,
  onSyncOfflineQueue,
  onResolveOfflineSale,
  onCreateLoyaltyAccount,
  onCreateCustomerVisit,
  onLinkCustomerVisitToSale,
  onRequestClose,
  onDecideClose,
  onRequestVarianceResolution,
  onDecideVarianceResolution,
}: RetailPosWorkbenchProps): ReactNode {
  const activeCounters = useMemo(() => revenue.retailCounters.filter(({ active }) => active), [revenue.retailCounters]);
  const retailCustomerAccounts = useMemo(() => party.accounts.filter(({ status, relationship, companyId }) =>
    status === 'active' && relationship === 'customer' && companyId === revenue.scope.companyId,
  ), [party.accounts, revenue.scope.companyId]);
  const setupWarehouses = useMemo(() => revenue.warehouses.filter(({ active }) => active), [revenue.warehouses]);
  const [counterId, setCounterId] = useState(activeCounters[0]?.id ?? '');
  const [setupWarehouseId, setSetupWarehouseId] = useState(setupWarehouses[0]?.id ?? '');
  const [scanQuery, setScanQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([]);
  const [customerAccountId, setCustomerAccountId] = useState('');
  const [recipientTreatment, setRecipientTreatment] = useState<'registered' | 'unregistered'>('unregistered');
  const [recipientGstin, setRecipientGstin] = useState('');
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState(revenue.profile.defaultStateCode);
  const [voucherCode, setVoucherCode] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState<number | ''>('');
  const [notice, setNotice] = useState('');
  const [recoveryEvidence, setRecoveryEvidence] = useState('');
  const [conflictRecoveryEvidence, setConflictRecoveryEvidence] = useState<Record<string, string>>({});
  const transactionKey = useRef(currentTransactionKey());
  const [tenders, setTenders] = useState<TenderDraft[]>([
    { method: 'cash', amount: '', reference: `CASH-${transactionKey.current.slice(-12)}` },
    { method: 'upi', amount: '', reference: '' },
    { method: 'card', amount: '', reference: '' },
    { method: 'store-credit', amount: '', reference: '' },
    { method: 'customer-credit', amount: '', reference: '' },
  ]);
  const [reprintSale, setReprintSale] = useState<RevenueOpsSnapshot['retailSales'][number] | null>(null);

  const selectedCounter = activeCounters.find(({ id }) => id === counterId) ?? activeCounters[0];

  const activeCustomerStoreCredits = useMemo(() => {
    const targetAccountId = customerAccountId || selectedCounter?.walkInAccountId;
    if (!targetAccountId) return [];
    return (revenue.retailStoreCredits ?? []).filter(
      (c) => c.customerAccountId === targetAccountId && c.status === 'active' && c.availableAmount > 0,
    );
  }, [customerAccountId, selectedCounter?.walkInAccountId, revenue.retailStoreCredits]);
  const selectedLoyaltyAccount = useMemo(() => {
    const targetAccountId = customerAccountId || selectedCounter?.walkInAccountId;
    return targetAccountId ? revenue.retailLoyaltyAccounts.find((account) => account.customerAccountId === targetAccountId) : undefined;
  }, [customerAccountId, selectedCounter?.walkInAccountId, revenue.retailLoyaltyAccounts]);
  const normalizedVoucherCode = voucherCode.trim().toUpperCase();
  const requestedVoucher = useMemo(() => normalizedVoucherCode
    ? revenue.retailVouchers.find((voucher) => voucher.code.trim().toUpperCase() === normalizedVoucherCode)
    : undefined, [normalizedVoucherCode, revenue.retailVouchers]);
  const voucherNeedsRefresh = Boolean(normalizedVoucherCode && !requestedVoucher);

  const totalStoreCreditAvailable = useMemo(() => {
    return money(activeCustomerStoreCredits.reduce((total, c) => total + c.availableAmount, 0));
  }, [activeCustomerStoreCredits]);
  const activeCustomerCreditControl = useMemo(() => {
    const targetAccountId = customerAccountId || selectedCounter?.walkInAccountId;
    return targetAccountId
      ? revenue.creditLimitControls.find((control) => control.accountId === targetAccountId && control.status === 'approved')
      : undefined;
  }, [customerAccountId, revenue.creditLimitControls, selectedCounter?.walkInAccountId]);
  const activeCustomerCreditUtilisation = useMemo(() => {
    const targetAccountId = customerAccountId || selectedCounter?.walkInAccountId;
    if (!targetAccountId) return undefined;
    const asOfDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return computeCreditLimitUtilisation({ controls: revenue.creditLimitControls, receivables: revenue.receivables, asOfDate }).rows.find((row) => row.accountId === targetAccountId && row.status === 'approved');
  }, [customerAccountId, revenue.creditLimitControls, revenue.receivables, selectedCounter?.walkInAccountId]);
  const customerCreditBlocked = !activeCustomerCreditUtilisation || (activeCustomerCreditUtilisation.state === 'hold' && activeCustomerCreditUtilisation.blockNewOrders);
  const usesCustomerCredit = tenders.some((tender) => tender.method === 'customer-credit' && Number(tender.amount) > 0);

  useEffect(() => {
    setCounterId((current) => activeCounters.some(({ id }) => id === current) ? current : activeCounters[0]?.id ?? '');
  }, [activeCounters]);

  useEffect(() => {
    setSetupWarehouseId((current) => setupWarehouses.some(({ id }) => id === current) ? current : setupWarehouses[0]?.id ?? '');
  }, [setupWarehouses]);
  const selectedShift = revenue.retailCashierShifts.find((shift) => shift.counterId === selectedCounter?.id && shift.status !== 'closed');
  const actorShift = selectedShift?.cashierId === activeActorId && selectedShift.status === 'open' ? selectedShift : undefined;
  const reviewingShifts = revenue.retailCashierShifts.filter((shift) => shift.status === 'close-requested' && shift.cashierId !== activeActorId);
  const shiftTenderExpected = useMemo(() => {
    const totals = Object.fromEntries(shiftTenderMethods.map(([method]) => [method, 0])) as Record<(typeof shiftTenderMethods)[number][0], number>;
    if (!actorShift) return totals;
    revenue.retailSales.filter((sale) => sale.cashierShiftId === actorShift.id && sale.status === 'completed').flatMap((sale) => sale.tenders).forEach((tender) => {
      totals[tender.method] = money((totals[tender.method] ?? 0) + tender.amount);
    });
    revenue.retailReturns.filter((returnCase) => returnCase.status === 'approved').flatMap((returnCase) => returnCase.financialCredit?.settlements ?? []).filter((settlement) => settlement.cashierShiftId === actorShift.id && ['cash-refunded', 'provider-refunded'].includes(settlement.status)).forEach((settlement) => {
      const method = settlement.method === 'cash-refund' ? 'cash' : settlement.providerMethod ?? 'other';
      totals[method] = money((totals[method] ?? 0) - settlement.amount);
    });
    totals.cash = money(totals.cash + actorShift.openingCash);
    return totals;
  }, [actorShift, revenue.retailReturns, revenue.retailSales]);

  const activeCategories = useMemo(() => revenue.retailCatalogCategories.filter(({ active }) => active), [revenue.retailCatalogCategories]);
  const activeBrands = useMemo(() => revenue.retailCatalogBrands.filter(({ active }) => active), [revenue.retailCatalogBrands]);

  const counterReadiness = useMemo(() => {
    if (!selectedCounter) return [{ label: 'Counter configuration', ready: false, detail: 'Create a counter with an accountable sell-from bin.' }];
    const warehouse = revenue.warehouses.find(({ id, active }) => id === selectedCounter.warehouseId && active);
    const bin = revenue.storageBins.find(({ id, status }) => id === selectedCounter.sellFromBinId && status === 'available');
    const zone = bin && revenue.warehouseZones.find(({ id }) => id === bin.zoneId);
    const priceList = revenue.priceLists.find(({ id, active, status, effectiveFrom, effectiveTo }) => id === selectedCounter.priceListId && active && status === 'active' && activeToday(effectiveFrom, effectiveTo));
    const terms = revenue.paymentTerms.find(({ id, active, dueDays }) => id === selectedCounter.paymentTermId && active && dueDays === 0);
    return [
      { label: 'Sell-from bin', ready: Boolean(bin && zone && warehouse && zone.warehouseId === warehouse.id), detail: bin ? `${bin.code} is available` : 'Available bin required' },
      { label: 'Retail price book', ready: Boolean(priceList && (priceList.channel === 'retail' || priceList.channel === 'all')), detail: priceList ? `${priceList.code} is effective today` : 'Active retail price book required' },
      { label: 'Payment terms', ready: Boolean(terms), detail: terms ? 'Due on receipt' : 'Active due-on-receipt term required' },
      { label: 'Walk-in customer', ready: retailCustomerAccounts.some(({ id }) => id === selectedCounter.walkInAccountId), detail: retailCustomerAccounts.find(({ id }) => id === selectedCounter.walkInAccountId)?.displayName ?? 'Active in-scope Party Master customer required' },
    ];
  }, [retailCustomerAccounts, revenue.paymentTerms, revenue.priceLists, revenue.storageBins, revenue.warehouseZones, revenue.warehouses, selectedCounter]);

  const counterReady = Boolean(selectedCounter) && counterReadiness.every(({ ready }) => ready);
  const providerReadiness = useMemo(() => buildRetailProviderReadiness(revenue), [revenue]);
  const setupBins = useMemo(() => revenue.storageBins.filter(({ status, zoneId }) => {
    if (status !== 'available') return false;
    const zone = revenue.warehouseZones.find(({ id }) => id === zoneId);
    return zone?.warehouseId === setupWarehouseId && (zone.purpose === 'storage' || zone.purpose === 'picking');
  }), [revenue.storageBins, revenue.warehouseZones, setupWarehouseId]);

  const stockRows = useMemo(() => {
    if (!selectedCounter) return [];
    const query = scanQuery.trim().toLowerCase();
    return revenue.binBalances
      .filter((balance) => balance.binId === selectedCounter.sellFromBinId && balance.available > 0)
      .map((balance) => {
        const variant = revenue.itemVariants.find(({ id, active }) => id === balance.itemVariantId && active);
        const item = variant && revenue.inventoryItems.find(({ id, active }) => id === variant.itemId && active);
        const product = item && revenue.products.find(({ id, active, kind }) => id === item.productId && active && kind === 'goods');
        const price = product && revenue.priceListEntries
          .filter((entry) => entry.priceListId === selectedCounter.priceListId && entry.productId === product.id && activeToday(entry.effectiveFrom, entry.effectiveTo))
          .sort((left, right) => right.minimumQuantity - left.minimumQuantity)[0];
        const profile = item ? revenue.retailMerchandisingProfiles.find(({ itemId }) => itemId === item.id) : undefined;
        const category = profile ? revenue.retailCatalogCategories.find(({ id }) => id === profile.categoryId) : undefined;
        const brand = profile?.brandId ? revenue.retailCatalogBrands.find(({ id }) => id === profile.brandId) : undefined;
        const rackBin = profile?.rackBinId ? revenue.storageBins.find(({ id }) => id === profile.rackBinId) : undefined;

        return { balance, variant, item, product, price, profile, category, brand, rackBin };
      })
      .filter((row): row is typeof row & { variant: NonNullable<typeof row.variant>; product: NonNullable<typeof row.product>; price: NonNullable<typeof row.price> } => Boolean(row.variant && row.product && row.price))
      .filter(({ profile, category }) => {
        if (!selectedCategoryId) return true;
        return profile?.categoryId === selectedCategoryId || category?.parentCategoryId === selectedCategoryId;
      })
      .filter(({ profile }) => {
        if (!selectedBrandId) return true;
        return profile?.brandId === selectedBrandId;
      })
      .filter(({ variant, product, category, brand, rackBin, profile }) => {
        if (!query) return true;
        const keywords = profile?.searchKeywords?.join(' ') ?? '';
        const searchTarget = `${variant.sku} ${variant.barcode ?? ''} ${variant.name} ${product.name} ${category?.name ?? ''} ${brand?.name ?? ''} ${rackBin?.code ?? ''} ${keywords}`.toLowerCase();
        return searchTarget.includes(query);
      });
  }, [revenue.binBalances, revenue.inventoryItems, revenue.itemVariants, revenue.priceListEntries, revenue.products, revenue.retailCatalogCategories, revenue.retailCatalogBrands, revenue.retailMerchandisingProfiles, revenue.storageBins, scanQuery, selectedCategoryId, selectedBrandId, selectedCounter]);

  const cartRows = useMemo(() => cart.map((line) => {
    const stock = stockRows.find(({ balance }) => balance.itemVariantId === line.itemVariantId && balance.batchId === line.batchId)?.balance
      ?? revenue.binBalances.find((balance) => balance.binId === selectedCounter?.sellFromBinId && balance.itemVariantId === line.itemVariantId && balance.batchId === line.batchId);
    const variant = revenue.itemVariants.find(({ id }) => id === line.itemVariantId);
    const product = variant && revenue.inventoryItems.find(({ id }) => id === variant.itemId)
      ? revenue.products.find(({ id }) => id === revenue.inventoryItems.find((item) => item.id === variant.itemId)?.productId)
      : undefined;
    return { line, stock, variant, product };
  }), [cart, revenue.binBalances, revenue.inventoryItems, revenue.itemVariants, revenue.products, selectedCounter?.sellFromBinId, stockRows]);

  const tenderTotal = money(tenders.reduce((total, tender) => total + (Number(tender.amount) || 0), 0));
  const openSales = revenue.retailSales.filter((sale) => sale.counterId === selectedCounter?.id).slice(0, 6);

  function addToCart(itemVariantId: string, batchId: string | undefined, available: number): void {
    const key = `${itemVariantId}:${batchId ?? ''}`;
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) return current.map((line) => line.key === key ? { ...line, quantity: Math.min(available, money(line.quantity + 1)) } : line);
      return [...current, { key, itemVariantId, batchId, quantity: 1, serialUnitIds: [] }];
    });
    setNotice('Item added to local cart. Price, GST, availability, and tender equality are verified at checkout boundary.');
  }

  function updateLine(key: string, patch: Partial<CartLine>): void {
    setCart((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function holdCurrentCart(): void {
    if (!cart.length) return;
    const newHeldCart: HeldCart = {
      id: `HOLD-${Date.now().toString(36).toUpperCase()}`,
      heldAt: new Date().toISOString(),
      customerAccountId: customerAccountId || undefined,
      cart: [...cart],
      note: `Basket with ${cart.length} item(s)`,
    };
    setHeldCarts((prev) => [newHeldCart, ...prev]);
    setCart([]);
    setCustomerAccountId('');
    setNotice(`Cart held successfully as ${newHeldCart.id}. You can recall it anytime.`);
  }

  function recallHeldCart(heldCart: HeldCart): void {
    if (cart.length > 0) {
      if (!confirm('Active cart is not empty. Replacing active cart with held cart?')) return;
    }
    setCart(heldCart.cart);
    if (heldCart.customerAccountId) setCustomerAccountId(heldCart.customerAccountId);
    setHeldCarts((prev) => prev.filter((c) => c.id !== heldCart.id));
    setNotice(`Held cart ${heldCart.id} recalled into active basket.`);
  }

  async function submitCounter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setNotice('');
    try {
      await onCreateCounter({
        code: String(data.get('code')),
        name: String(data.get('name')),
        warehouseId: String(data.get('warehouseId')),
        sellFromBinId: String(data.get('sellFromBinId')),
        priceListId: String(data.get('priceListId')),
        walkInAccountId: String(data.get('walkInAccountId')),
        paymentTermId: String(data.get('paymentTermId')),
      });
      event.currentTarget.reset();
      setNotice('Retail counter configuration saved. It remains usable only while its bin, price book, and payment term pass the live setup gate.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function openShift(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCounter) return;
    const data = new FormData(event.currentTarget);
    setNotice('');
    try {
      await onOpenShift({ counterId: selectedCounter.id, openingCash: Number(data.get('openingCash')) });
      event.currentTarget.reset();
      setNotice('Cashier shift opened. Checkout is assigned only to this cashier and counter.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function buildCheckoutInput(): CheckoutRetailSaleInput | null {
    if (!selectedCounter || !actorShift || !cart.length || voucherNeedsRefresh) return null;
    const preparedTenders = tenders
      .filter((tender) => Number(tender.amount) > 0)
      .map((tender) => ({ method: tender.method, amount: money(Number(tender.amount)), reference: tender.reference.trim() }));
    return {
      counterId: selectedCounter.id,
      cashierShiftId: actorShift.id,
      transactionKey: transactionKey.current,
      customerAccountId: customerAccountId || undefined,
      recipientTreatment,
      recipientGstin: recipientTreatment === 'registered' ? recipientGstin.trim().toUpperCase() : undefined,
      placeOfSupplyStateCode,
      loyaltyPointsToRedeem: pointsToRedeem === '' ? undefined : pointsToRedeem,
      loyaltyAccountVersion: selectedLoyaltyAccount?.version,
      voucherCode: normalizedVoucherCode || undefined,
      voucherVersion: normalizedVoucherCode ? requestedVoucher?.version : undefined,
      saleAt: new Date().toISOString(),
      lines: cart.map(({ itemVariantId, batchId, quantity, serialUnitIds }) => ({ itemVariantId, binId: selectedCounter.sellFromBinId, batchId, quantity, serialUnitIds })),
      discountPolicyIds: selectedDiscountIds,
      tenders: preparedTenders,
    };
  }

  async function checkout(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (voucherNeedsRefresh) {
      setNotice('This voucher is not in the current configured-voucher view. Refresh before checkout; nothing has been applied.');
      return;
    }
    const input = buildCheckoutInput();
    if (!input) return;
    setNotice('');
    try {
      await onCheckout(input);
      setCart([]);
      setSelectedDiscountIds([]);
      setCustomerAccountId('');
      setRecipientTreatment('unregistered');
      setRecipientGstin('');
      setPlaceOfSupplyStateCode(revenue.profile.defaultStateCode);
      setVoucherCode('');
      setPointsToRedeem('');
      const nextTransactionKey = currentTransactionKey();
      transactionKey.current = nextTransactionKey;
      setTenders([
        { method: 'cash', amount: '', reference: `CASH-${nextTransactionKey.slice(-12)}` },
        { method: 'upi', amount: '', reference: '' },
        { method: 'card', amount: '', reference: '' },
        { method: 'store-credit', amount: '', reference: '' },
        { method: 'customer-credit', amount: '', reference: '' },
      ]);
      setNotice('Retail sale submitted to the atomic checkout boundary. A completed receipt appears only after invoice, tender, stock, and cost evidence all commit.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function queueOfflineSale(): Promise<void> {
    if (voucherNeedsRefresh) {
      setNotice('This voucher is not in the current configured-voucher view. Refresh before offline queueing; nothing has been applied.');
      return;
    }
    const input = buildCheckoutInput();
    if (!input || !onQueueOfflineSale) return;
    setNotice('');
    try {
      await onQueueOfflineSale(input);
      setCart([]);
      setSelectedDiscountIds([]);
      setVoucherCode('');
      setPointsToRedeem('');
      const nextTransactionKey = currentTransactionKey();
      transactionKey.current = nextTransactionKey;
      setNotice('Sale saved safely on this device. It will remain queued until you synchronize it.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function requestShiftClose(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!actorShift) return;
    const data = new FormData(event.currentTarget);
    const declaredTenders = shiftTenderMethods.every(([method]) => data.has(`declaredTender-${method}`))
      ? shiftTenderMethods.map(([method]) => ({ method, amount: Number(data.get(`declaredTender-${method}`) || 0) }))
      : undefined;
    setNotice('');
    try {
      await onRequestClose({ id: actorShift.id, declaredCash: Number(data.get('declaredCash')), declaredTenders, evidenceReference: String(data.get('evidenceReference')), expectedVersion: actorShift.version });
      setNotice('Shift close submitted for an independent review. A drawer variance cannot be auto-closed.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decideShiftClose(shift: Shift, decision: 'approved' | 'rejected', evidenceReference: string): Promise<void> {
    setNotice('');
    try {
      await onDecideClose({ id: shift.id, decision, evidenceReference, expectedVersion: shift.version });
      setNotice(`Shift close ${decision}. Cash evidence and any resulting state remain traceable.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return <section className="retail-pos-workbench" aria-labelledby="retail-pos-title">
    <header className="retail-pos-workbench__hero">
      <div>
        <span className="retail-pos-workbench__eyebrow"><Store size={14} aria-hidden="true" /> Retail counter</span>
        <h3 id="retail-pos-title">A disciplined counter, not a pretend payment terminal.</h3>
        <p>Every checkout is priced, taxed, invoiced, tendered and issued from one governed store bin. UPI and card references are captured as evidence; provider settlement is never assumed.</p>
      </div>
      <div className="retail-pos-workbench__boundary"><ShieldCheck size={17} aria-hidden="true" /><span><strong>India evidence boundary</strong>Cash shift close needs an independent reviewer.</span></div>
    </header>

    <div className="retail-pos-workbench__overview">
      <label className="retail-pos-workbench__counter-select">Active counter<select value={selectedCounter?.id ?? ''} onChange={(event) => setCounterId(event.target.value)}>{activeCounters.length ? activeCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.code} · {counter.name}</option>) : <option value="">No active counter</option>}</select></label>
      <div className="retail-pos-workbench__setup" aria-label="Counter setup readiness">
        {counterReadiness.map((item) => <div key={item.label} data-ready={item.ready}><i>{item.ready ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}</i><span><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}
      </div>
    </div>

    <div className="retail-pos-workbench__provider-readiness" aria-label="Provider and device readiness"><header><div><span>External evidence boundary</span><h4>Payment rails and counter devices</h4></div><ShieldCheck size={18} aria-hidden="true" /></header><div>{providerReadiness.map((item) => <article key={item.kind} data-status={item.status}><strong>{item.label}</strong><em>{item.status}</em><small>{item.detail}</small>{item.blockers.length ? <small className="retail-pos-workbench__guard">{item.blockers[0]}</small> : null}</article>)}</div></div>

    <div className="retail-pos-workbench__grid">
      <article className="retail-pos-workbench__station">
        <header><div><span>01 / Cashier custody</span><h4>Open the assigned shift</h4></div><WalletCards size={19} aria-hidden="true" /></header>
        {selectedCounter && !selectedShift ? <form onSubmit={(event) => void openShift(event)}><label>Opening cash <b>₹</b><input name="openingCash" type="number" min="0" step="0.01" defaultValue="0" required /></label><button className="button button--primary" disabled={busy || !counterReady}>Open shift at {selectedCounter.code}</button></form> : null}
        {selectedShift ? <div className="retail-pos-workbench__shift-card" data-status={selectedShift.status}><span>{selectedShift.number}</span><strong>{selectedShift.cashierId === activeActorId ? 'Your cashier shift' : 'Counter is assigned'}</strong><small>{selectedShift.cashierId === activeActorId ? 'You can checkout while this shift is open.' : `Assigned to ${selectedShift.cashierId}; do not share cashier custody.`}</small><dl><div><dt>Opened</dt><dd>{indiaDate(selectedShift.openedAt)}</dd></div><div><dt>Float</dt><dd>{inr.format(selectedShift.openingCash)}</dd></div><div><dt>Status</dt><dd>{selectedShift.status.replaceAll('-', ' ')}</dd></div></dl></div> : null}
        {!selectedCounter ? <p className="retail-pos-workbench__empty">Create and activate a governed retail counter before opening a cashier shift.</p> : null}
      </article>

      <article className="retail-pos-workbench__catalogue">
        <header>
          <div><span>02 / Touch catalogue & basket</span><h4>Issue only configured, available stock</h4></div>
          <Barcode size={19} aria-hidden="true" />
        </header>

        <label className="retail-pos-workbench__scan">
          <PackageSearch size={16} aria-hidden="true" />
          <span>Barcode, SKU, item name or keyword</span>
          <input value={scanQuery} onChange={(event) => setScanQuery(event.target.value)} placeholder="Scan 890… or search SKU, brand, rack, keyword" autoComplete="off" />
        </label>

        {activeCategories.length ? (
          <nav className="retail-pos-workbench__category-bar" aria-label="Category filters">
            <button
              type="button"
              className={`retail-pos-workbench__chip ${!selectedCategoryId ? 'retail-pos-workbench__chip--active' : ''}`}
              onClick={() => setSelectedCategoryId('')}
            >
              <Tags size={12} /> All Categories
            </button>
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`retail-pos-workbench__chip ${selectedCategoryId === cat.id ? 'retail-pos-workbench__chip--active' : ''}`}
                onClick={() => setSelectedCategoryId((curr) => (curr === cat.id ? '' : cat.id))}
              >
                {cat.parentCategoryId ? '↳ ' : ''}{cat.name}
              </button>
            ))}
          </nav>
        ) : null}

        {activeBrands.length ? (
          <nav className="retail-pos-workbench__brand-bar" aria-label="Brand filters">
            <span className="retail-pos-workbench__filter-label"><Tag size={11} /> Brands:</span>
            <button
              type="button"
              className={`retail-pos-workbench__chip retail-pos-workbench__chip--sm ${!selectedBrandId ? 'retail-pos-workbench__chip--active' : ''}`}
              onClick={() => setSelectedBrandId('')}
            >
              All
            </button>
            {activeBrands.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`retail-pos-workbench__chip retail-pos-workbench__chip--sm ${selectedBrandId === b.id ? 'retail-pos-workbench__chip--active' : ''}`}
                onClick={() => setSelectedBrandId((curr) => (curr === b.id ? '' : b.id))}
              >
                {b.name}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="retail-pos-workbench__stock-grid" aria-live="polite">
          {stockRows.length ? stockRows.map(({ balance, variant, price, category, brand, rackBin }) => {
            const inCartLine = cart.find((l) => l.itemVariantId === variant.id && l.batchId === balance.batchId);
            return (
              <div key={`${balance.id}:${price.id}`} className="retail-pos-workbench__product-card">
                <div className="retail-pos-workbench__card-header">
                  <div className="retail-pos-workbench__card-badges">
                    {category ? <span className="retail-pos-workbench__badge retail-pos-workbench__badge--cat">{category.name}</span> : null}
                    {brand ? <span className="retail-pos-workbench__badge retail-pos-workbench__badge--brand">{brand.name}</span> : null}
                    {rackBin ? <span className="retail-pos-workbench__badge retail-pos-workbench__badge--rack">Rack {rackBin.code}</span> : null}
                  </div>
                  <span className={`retail-pos-workbench__stock-pill ${balance.available <= 5 ? 'retail-pos-workbench__stock-pill--low' : ''}`}>
                    {balance.available} in stock
                  </span>
                </div>

                <div className="retail-pos-workbench__card-body">
                  <strong>{variant.name}</strong>
                  <small className="retail-pos-workbench__card-sku">
                    SKU: {variant.sku}{variant.barcode ? ` · Barcode: ${variant.barcode}` : ''}
                  </small>
                  {balance.batchId ? (
                    <small className="retail-pos-workbench__card-batch">
                      Batch: {revenue.inventoryBatches.find(({ id }) => id === balance.batchId)?.batchNumber ?? balance.batchId}
                    </small>
                  ) : null}
                </div>

                <div className="retail-pos-workbench__card-footer">
                  <div className="retail-pos-workbench__card-pricing">
                    <span className="retail-pos-workbench__card-price">{inr.format(price.unitPrice)}</span>
                    <small>{price.taxMode === 'inclusive' ? 'Tax incl.' : 'excl. tax'}</small>
                  </div>
                  <button
                    type="button"
                    className="button button--primary retail-pos-workbench__add-btn"
                    disabled={busy || !counterReady}
                    onClick={() => addToCart(variant.id, balance.batchId, balance.available)}
                  >
                    {inCartLine ? `Added (${inCartLine.quantity}) +` : '+ Add'}
                  </button>
                </div>
              </div>
            );
          }) : (
            <p className="retail-pos-workbench__empty">No price-backed, available goods match this counter’s bin, retail price book, and selected filters.</p>
          )}
        </div>

        <aside className="retail-pos-workbench__cart" aria-label="Retail cart">
          <header>
            <div>
              <strong>Cart ({cart.length} line{cart.length === 1 ? '' : 's'})</strong>
            </div>
            <div className="retail-pos-workbench__cart-actions">
              <button
                type="button"
                className="retail-pos-workbench__hold-btn"
                disabled={!cart.length}
                onClick={holdCurrentCart}
                title="Hold current cart for later recall"
              >
                <PauseCircle size={13} /> Hold Cart
              </button>
            </div>
          </header>

          {heldCarts.length ? (
            <div className="retail-pos-workbench__held-drawer">
              <span className="retail-pos-workbench__held-title"><PlayCircle size={13} /> Held Baskets ({heldCarts.length}):</span>
              <div className="retail-pos-workbench__held-list">
                {heldCarts.map((h) => (
                  <div key={h.id} className="retail-pos-workbench__held-item">
                    <span><strong>{h.id}</strong> ({h.cart.length} items)</span>
                    <button type="button" onClick={() => recallHeldCart(h)}>Recall</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {cartRows.length ? cartRows.map(({ line, stock, variant }) => <div className="retail-pos-workbench__cart-line" key={line.key}><div><strong>{variant?.name ?? line.itemVariantId}</strong><small>{variant?.sku ?? 'SKU unavailable'} · {stock?.available ?? 0} available</small></div><label>Qty<input type="number" min="0.001" max={stock?.available ?? undefined} step="any" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Math.max(0.001, Number(event.target.value) || 0.001) })} /></label><label>Serials <small>(comma separated)</small><input value={line.serialUnitIds.join(', ')} onChange={(event) => updateLine(line.key, { serialUnitIds: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder="Only if tracked" /></label><button type="button" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>Remove</button></div>) : <p className="retail-pos-workbench__empty">Scan a price-backed SKU or click '+ Add' on a product card. Exact total is calculated server-side.</p>}
        </aside>
      </article>

      <article className="retail-pos-workbench__checkout">
        <header><div><span>03 / Governed checkout</span><h4>Record tender evidence</h4></div><ReceiptText size={19} aria-hidden="true" /></header>
        <p className="retail-pos-workbench__checkout-note">Tender entries are intentionally not treated as settlement. The backend validates the exact GST invoice total, stock allocations, price tiers and tender equality before recording anything.</p>
        <fieldset><legend>Effective discounts</legend>{revenue.discountPolicies.filter(({ active, effectiveFrom, effectiveTo }) => active && activeToday(effectiveFrom, effectiveTo)).length ? revenue.discountPolicies.filter(({ active, effectiveFrom, effectiveTo }) => active && activeToday(effectiveFrom, effectiveTo)).map((policy) => <label key={policy.id} className="retail-pos-workbench__discount"><input type="checkbox" checked={selectedDiscountIds.includes(policy.id)} onChange={(event) => setSelectedDiscountIds((current) => event.target.checked ? [...current, policy.id] : current.filter((id) => id !== policy.id))} /><span><strong>{policy.name}</strong><small>{policy.method === 'percentage' ? `${policy.value}%` : inr.format(policy.value)} · subject to backend eligibility</small></span></label>) : <small>No active discount policy selected.</small>}</fieldset>
        <form onSubmit={(event) => void checkout(event)}>
          <div className="retail-pos-workbench__form-row"><label>Invoice treatment<select value={recipientTreatment} onChange={(event) => setRecipientTreatment(event.target.value as typeof recipientTreatment)}><option value="unregistered">B2C · unregistered</option><option value="registered">B2B · registered GSTIN</option></select><small>B2B requires a named customer and produces a registered-recipient tax invoice.</small></label><label>Place of supply state<input value={placeOfSupplyStateCode} onChange={(event) => setPlaceOfSupplyStateCode(event.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" maxLength={2} placeholder="27" required /></label></div>
          <label>{recipientTreatment === 'registered' ? 'B2B customer account' : 'B2C customer account'}<select value={customerAccountId} onChange={(event) => setCustomerAccountId(event.target.value)}><option value="">Walk-in customer (counter default)</option>{retailCustomerAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select><small>{recipientTreatment === 'registered' ? 'Select the Party Master account that owns the GSTIN evidence.' : 'Choose a known customer only when the Party Master record is active in this legal entity.'}</small></label>
          {recipientTreatment === 'registered' ? <label>Customer GSTIN<input value={recipientGstin} onChange={(event) => setRecipientGstin(event.target.value.toUpperCase())} minLength={15} maxLength={15} pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]" placeholder="27ABCDE1234F1Z5" required /><small>GSTIN state code must match the place-of-supply state.</small></label> : null}

          {activeCustomerStoreCredits.length ? (
            <div className="retail-pos-workbench__store-credit-banner">
              <Sparkles size={14} aria-hidden="true" />
              <div>
                <strong>Store Credit Available: {inr.format(totalStoreCreditAvailable)}</strong>
                <small>{activeCustomerStoreCredits.map((c) => `${c.number} (₹${c.availableAmount})`).join(', ')}</small>
              </div>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => {
                  const topCredit = activeCustomerStoreCredits[0];
                  if (!topCredit) return;
                  setTenders((current) => current.map((t) => t.method === 'store-credit' ? { ...t, amount: String(topCredit.availableAmount), reference: topCredit.number } : t));
                  setNotice(`Applied ${topCredit.number} (₹${topCredit.availableAmount}) to Store Credit tender.`);
                }}
              >
                Apply Credit
              </button>
            </div>
          ) : null}
          {activeCustomerCreditControl ? <div className="retail-pos-workbench__store-credit-banner"><Landmark size={14} aria-hidden="true" /><div><strong>Account credit approved: {inr.format(activeCustomerCreditControl.creditLimit)}</strong><small>{activeCustomerCreditControl.riskGrade}-grade · {activeCustomerCreditUtilisation ? `${inr.format(activeCustomerCreditUtilisation.availableCredit)} available · ${activeCustomerCreditUtilisation.utilisationPercent.toFixed(1)}% utilised` : 'Utilisation unavailable'} · {activeCustomerCreditControl.graceDays} grace days · counter sale remains open AR until paid</small>{activeCustomerCreditUtilisation?.state !== 'clear' ? <small className="retail-pos-workbench__guard">{activeCustomerCreditUtilisation?.nextAction === 'credit-hold' ? 'Credit hold: resolve exposure or overdue grace before checkout.' : 'Credit policy requires review before additional exposure.'}</small> : null}</div></div> : null}

          <div style={{ margin: '10px 0', padding: '10px', borderRadius: '6px', background: '#1e2330', border: '1px solid #2d3342' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                <Award size={14} /> Loyalty & Vouchers
              </span>
              <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '3px', background: '#3b82f6', color: '#fff', textTransform: 'uppercase' }}>
                {selectedLoyaltyAccount ? `${selectedLoyaltyAccount.tier} · ${selectedLoyaltyAccount.pointsBalance} pts` : 'No loyalty account'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="number"
                  min="1"
                  placeholder="Redeem Points"
                  value={pointsToRedeem}
                  onChange={(e) => setPointsToRedeem(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '0.75rem', background: '#0f1117', border: '1px solid #374151', borderRadius: '4px', color: '#fff' }}
                />
                <button
                  type="button"
                  className="button button--quiet"
                  style={{ fontSize: '0.68rem', padding: '4px 6px', whiteSpace: 'nowrap' }}
                  disabled={!selectedLoyaltyAccount || !pointsToRedeem || Number(pointsToRedeem) > (selectedLoyaltyAccount?.pointsBalance ?? 0)}
                  onClick={() => {
                    if (pointsToRedeem && pointsToRedeem > 0) {
                      setNotice(`${pointsToRedeem} loyalty points reserved for this atomic checkout.`);
                    }
                  }}
                >
                  Redeem
                </button>
                {!selectedLoyaltyAccount && customerAccountId ? <button type="button" className="button button--quiet" disabled={busy || !onCreateLoyaltyAccount} onClick={() => void onCreateLoyaltyAccount?.({ customerAccountId })}>Create account</button> : null}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Voucher Code"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '0.75rem', background: '#0f1117', border: '1px solid #374151', borderRadius: '4px', color: '#fff' }}
                />
              </div>
            </div>
            <div aria-live="polite" style={{ marginTop: '6px', fontSize: '0.7rem', color: voucherNeedsRefresh ? '#fbbf24' : '#9fb4d6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span>{normalizedVoucherCode
                ? requestedVoucher
                  ? <><Gift size={11} aria-hidden="true" /> Voucher <strong>{requestedVoucher.code}</strong> will be checked at checkout against version {requestedVoucher.version}. It is not applied until the receipt completes.</>
                  : <>Voucher will be checked at checkout. Refresh the configured voucher list before continuing; it is not applied.</>
                : <>Voucher will be checked at checkout. It cannot change the cart until the trusted receipt completes.</>}</span>
              {normalizedVoucherCode ? <button type="button" aria-label="Remove voucher code" onClick={() => setVoucherCode('')} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}><X size={12} /></button> : null}
            </div>
          </div>

          {onCreateCustomerVisit ? <div className="retail-pos-workbench__visit-capture"><span><strong>Capture customer visit</strong><small>Build a governed retail visit history even when the shopper does not purchase.</small></span><button type="button" className="button button--quiet" disabled={busy || !customerAccountId} onClick={() => { if (customerAccountId) void onCreateCustomerVisit({ customerAccountId, visitedAt: new Date().toISOString(), channel: 'store', purpose: 'purchase' }); }}>Record store visit</button></div> : null}
          <div className="retail-pos-workbench__tenders">{tenders.map((tender, index) => <div key={tender.method} data-method={tender.method}><span>{tender.method === 'cash' ? <Banknote size={17} /> : tender.method === 'upi' ? <Landmark size={17} /> : tender.method === 'card' ? <CreditCard size={17} /> : tender.method === 'customer-credit' ? <Landmark size={17} /> : <Sparkles size={17} />}{tender.method.toUpperCase()}</span><label>INR<input type="number" min="0" step="0.01" value={tender.amount} onChange={(event) => setTenders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} /></label><label>{tender.method === 'cash' ? 'Drawer reference' : tender.method === 'store-credit' ? 'Store Credit # (SC-xxxx)' : tender.method === 'customer-credit' ? 'Credit approval reference' : 'Provider evidence reference'}<input value={tender.reference} minLength={3} onChange={(event) => setTenders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} placeholder={tender.method === 'upi' ? 'UPI RRN / transaction ID' : tender.method === 'card' ? 'Card slip / approval ID' : tender.method === 'store-credit' ? 'SC-1001' : tender.method === 'customer-credit' ? 'CRL-26-27-00001' : 'Drawer count reference'} /></label></div>)}</div>
          <div className="retail-pos-workbench__tender-total"><span>Declared tender</span><strong>{inr.format(tenderTotal)}</strong><small>Exact invoice total is confirmed only by checkout; a mismatch writes no sale.</small></div>
          <button className="button button--primary" disabled={busy || !counterReady || !actorShift || !cart.length || (usesCustomerCredit && customerCreditBlocked)}>Complete governed checkout <ChevronRight size={16} /></button>
          {onQueueOfflineSale ? <button type="button" className="button button--quiet" disabled={busy || !counterReady || !actorShift || !cart.length} onClick={() => void queueOfflineSale()}>Save securely for offline sync</button> : null}
          {!actorShift ? <small className="retail-pos-workbench__guard">Checkout requires your own open cashier shift at this counter.</small> : null}
          {usesCustomerCredit && customerCreditBlocked ? <small className="retail-pos-workbench__guard">Customer-credit checkout is blocked until an approved account limit has available headroom and no overdue grace hold.</small> : null}
        </form>
      </article>
    </div>

    <div className="retail-pos-workbench__evidence-grid">
      <article>
        <header><div><span>Receipt evidence</span><h4>Latest counter sales</h4></div><ReceiptText size={18} aria-hidden="true" /></header>
        {openSales.length ? (
          <div className="retail-pos-workbench__receipt-list">
            {openSales.map((sale) => (
              <div key={sale.id}>
                {(() => { const visit = revenue.retailCustomerVisits.find((candidate) => !candidate.convertedSaleId && candidate.customerAccountId === sale.customerAccountId && Date.parse(candidate.visitedAt) <= Date.parse(sale.saleAt)); return <>
                <div>
                  <strong>{sale.number}</strong>
                  <small>{indiaDate(sale.completedAt ?? sale.saleAt)} · invoice {sale.invoiceId}</small>
                  <small>{sale.tenders.map((tender) => `${tender.method.toUpperCase()} ${inr.format(tender.amount)} · ${tender.reference}`).join(' | ')}</small>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <em data-status={sale.status}>{sale.status}</em>
                  <button type="button" className="button button--quiet" style={{ fontSize: '0.65rem', padding: '2px 6px' }} onClick={() => setReprintSale(sale)}>
                    <Printer size={12} /> View Receipt
                  </button>
                  {visit && onLinkCustomerVisitToSale ? <button type="button" className="button button--quiet" disabled={busy} style={{ fontSize: '0.65rem', padding: '2px 6px' }} onClick={() => void onLinkCustomerVisitToSale({ id: visit.id, saleId: sale.id, expectedVersion: visit.version })}>Attribute visit</button> : null}
                </div>
                </>; })()}
              </div>
            ))}
          </div>
        ) : <p className="retail-pos-workbench__empty">No retail receipt evidence for this counter yet.</p>}
      </article>
      <article><header><div><span>Drawer closure</span><h4>Close with review evidence</h4></div><ShieldCheck size={18} aria-hidden="true" /></header>{actorShift ? <form className="retail-pos-workbench__close-form" onSubmit={(event) => void requestShiftClose(event)}><label>Declared drawer cash <b>₹</b><input name="declaredCash" type="number" min="0" step="0.01" required /></label><label>Count-sheet / close evidence<input name="evidenceReference" minLength={3} placeholder="COUNT-… / safe-drop reference" required /></label><button disabled={busy}>Request independent close</button></form> : <p className="retail-pos-workbench__empty">Only the assigned cashier can request closure for an open shift.</p>}{reviewingShifts.length ? <div className="retail-pos-workbench__review-list">{reviewingShifts.map((shift) => <ShiftCloseReview key={shift.id} shift={shift} activeActorId={activeActorId} busy={busy} onDecide={decideShiftClose} onRequestVarianceResolution={onRequestVarianceResolution} onDecideVarianceResolution={onDecideVarianceResolution} />)}</div> : <small className="retail-pos-workbench__muted">No independent close review is waiting for you.</small>}</article>
    </div>

    {actorShift ? <article className="retail-pos-workbench__tender-close"><header><div><span>Drawer + tender closure</span><h4>Reconcile every payment rail</h4></div><ShieldCheck size={18} aria-hidden="true" /></header><form className="retail-pos-workbench__close-form" onSubmit={(event) => void requestShiftClose(event)}><label>Declared drawer cash <b>₹</b><input name="declaredCash" type="number" min="0" step="0.01" defaultValue={shiftTenderExpected.cash.toFixed(2)} required /></label><div className="retail-pos-workbench__tender-close-grid">{shiftTenderMethods.map(([method, label]) => <label key={method}>{label}<small>expected {inr.format(shiftTenderExpected[method])}</small><input name={`declaredTender-${method}`} type="number" min="0" step="0.01" defaultValue={shiftTenderExpected[method].toFixed(2)} required /></label>)}</div><label>Count-sheet / close evidence<input name="evidenceReference" minLength={3} placeholder="COUNT-… / safe-drop reference" required /></label><button disabled={busy}>Request independent close</button></form></article> : null}

    {revenue.retailOfflineSaleQueue.length ? (
      <article className="retail-pos-workbench__tender-close">
        <header>
          <div>
            <span>Offline store recovery</span>
            <h4>Sales waiting to synchronize</h4>
          </div>
          <div className="retail-pos-workbench__header-actions">
            <ShieldCheck size={18} aria-hidden="true" />
            {onSyncOfflineQueue && revenue.retailOfflineSaleQueue.some((item) => item.status === 'queued' && item.queuedBy === activeActorId) ? (
              <button type="button" className="button button--quiet" disabled={busy} onClick={() => void onSyncOfflineQueue({ limit: 20 })}>
                Sync my saved sales
              </button>
            ) : null}
          </div>
        </header>
        <p className="retail-pos-workbench__checkout-note">
          Saved sales stay local until the connection is available. Your saved sales can be synchronized normally. A different supervisor must review a conflict.
        </p>
        <div className="retail-pos-workbench__receipt-list">
          {revenue.retailOfflineSaleQueue.slice(0, 8).map((item) => {
            const isQueueOwner = item.queuedBy === activeActorId;
            const recoveryReference = conflictRecoveryEvidence[item.id] ?? '';
            const canResolve = item.status === 'conflict' && !isQueueOwner && onResolveOfflineSale;
            const canSubmitResolution = recoveryReference.trim().length >= 8;

            return (
              <div key={item.id} className="retail-pos-workbench__offline-queue-item">
                <div>
                  <strong>{item.transactionKey}</strong>
                  <small>{item.status} · attempt {item.attempts} · {indiaDate(item.queuedAt)}</small>
                  {item.conflictReason ? <small className="retail-pos-workbench__guard">{item.conflictReason}</small> : null}
                </div>
                <div className="retail-pos-workbench__offline-actions">
                  {item.status === 'queued' && onSyncOfflineSale && isQueueOwner ? (
                    <button type="button" className="button button--quiet" disabled={busy} onClick={() => void onSyncOfflineSale({ id: item.id, expectedVersion: item.version })}>
                      Synchronize
                    </button>
                  ) : null}
                  {item.status === 'conflict' && isQueueOwner ? (
                    <small className="retail-pos-workbench__guard">
                      An independent supervisor must resolve this conflict with recovery evidence.
                    </small>
                  ) : null}
                  {canResolve ? (
                    <div className="retail-pos-workbench__recovery-resolution">
                      <label>
                        Recovery evidence reference
                        <input
                          value={recoveryReference}
                          onChange={(event) => setConflictRecoveryEvidence((current) => ({ ...current, [item.id]: event.target.value }))}
                          minLength={8}
                          maxLength={240}
                          placeholder="POWER-FAIL-STORE-001"
                          required
                        />
                      </label>
                      <small>Use the incident, count-sheet, or payment-reconciliation reference. This action does not create a sale or refund.</small>
                      <div className="retail-pos-workbench__recovery-resolution-actions">
                        <button
                          type="button"
                          className="button button--quiet"
                          disabled={busy || !canSubmitResolution}
                          onClick={() => void onResolveOfflineSale({
                            id: item.id,
                            resolution: 'requeue',
                            reason: 'Supervisor reviewed recovery evidence and authorized a governed retry.',
                            recoveryEvidenceReference: recoveryReference.trim(),
                            expectedVersion: item.version,
                          })}
                        >
                          Requeue after review
                        </button>
                        <button
                          type="button"
                          className="button button--quiet"
                          disabled={busy || !canSubmitResolution}
                          onClick={() => void onResolveOfflineSale({
                            id: item.id,
                            resolution: 'discard',
                            reason: 'Supervisor reviewed recovery evidence and stopped this sale from posting.',
                            recoveryEvidenceReference: recoveryReference.trim(),
                            expectedVersion: item.version,
                          })}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {(revenue.retailOfflineSyncReceipts ?? []).length ? (
          <div className="retail-pos-workbench__sync-journal">
            <div className="retail-pos-workbench__sync-journal-heading">
              <strong>Recovery journal</strong>
              <small>Immutable local evidence · {(revenue.retailOfflineSyncReceipts ?? []).length} event{(revenue.retailOfflineSyncReceipts ?? []).length === 1 ? '' : 's'}</small>
            </div>
            <div className="retail-pos-workbench__sync-journal-list">
              {(revenue.retailOfflineSyncReceipts ?? []).slice(-8).reverse().map((receipt) => (
                <div key={receipt.id}>
                  <span><strong>{receipt.transactionKey}</strong><small>{receipt.status} · attempt {receipt.attempt} · {indiaDate(receipt.occurredAt)}</small></span>
                  <em>{receipt.evidenceReference ?? receipt.syncedSaleId ?? receipt.reason ?? 'local queue event'}</em>
                </div>
              ))}
            </div>
            <small className="retail-pos-workbench__checkout-note">The journal survives restart and stores checksums, actors, versions, and recovery references—not payment secrets or sale payloads.</small>
          </div>
        ) : null}
      </article>
    ) : null}

    {revenue.retailOfflineSaleQueue.some((item) => item.status === 'queued' && item.queuedBy !== activeActorId) && onSyncOfflineQueue ? <article className="retail-pos-workbench__tender-close retail-pos-workbench__recovery-card"><header><div><span>Supervisor recovery</span><h4>Resume another cashier’s saved sales</h4></div><ShieldCheck size={18} aria-hidden="true" /></header><p className="retail-pos-workbench__checkout-note">Use this after a power or network failure. A recovery reference is stored with every attempt; it does not bypass stock, GST, payment, or approval checks.</p><form className="retail-pos-workbench__close-form" onSubmit={(event) => { event.preventDefault(); const reference = recoveryEvidence.trim(); if (!reference) return; void onSyncOfflineQueue({ limit: 20, recoveryEvidenceReference: reference }); setRecoveryEvidence(''); }}><label>Recovery evidence reference<input value={recoveryEvidence} onChange={(event) => setRecoveryEvidence(event.target.value)} minLength={8} maxLength={240} placeholder="POWER-FAIL-STORE-001" required /></label><button className="button button--primary" disabled={busy}>Recover and sync queued sales</button></form></article> : null}

    {reprintSale ? (
      <div className="retail-pos-workbench__modal-overlay" role="dialog" aria-modal="true">
        <div className="retail-pos-workbench__receipt-modal">
          <header>
            <div>
              <span className="retail-pos-workbench__eyebrow">AUDITED DUPLICATE REPRINT</span>
              <h4>Receipt {reprintSale.number}</h4>
            </div>
            <button type="button" className="icon-button" onClick={() => setReprintSale(null)} aria-label="Close receipt modal">
              <X size={18} />
            </button>
          </header>
          <div className="retail-pos-workbench__receipt-body">
            <div className="retail-pos-workbench__receipt-header">
              <strong>EPIC BOS RETAIL COUNTER</strong>
              <small>GSTIN: {revenue.profile.gstin || 'Unregistered'} · Counter: {selectedCounter?.name}</small>
              <small>Invoice ID: {reprintSale.invoiceId} · Date: {indiaDate(reprintSale.completedAt ?? reprintSale.saleAt)}</small>
            </div>
            <div className="retail-pos-workbench__receipt-lines">
              {reprintSale.lines.map((l) => (
                <div key={l.id} className="retail-pos-workbench__receipt-line-row">
                  <span><strong>{l.description}</strong><small>HSN: {l.hsnSac} · Qty: {l.quantity} @ {inr.format(l.unitPrice)}</small></span>
                  <strong>{inr.format(l.lineTotal)}</strong>
                </div>
              ))}
            </div>
            <div className="retail-pos-workbench__receipt-tax">
              <div><span>Taxable Subtotal</span><span>{inr.format(reprintSale.taxPreview.taxableValue)}</span></div>
              <div><span>CGST + SGST</span><span>{inr.format(reprintSale.taxPreview.cgst + reprintSale.taxPreview.sgst)}</span></div>
              {reprintSale.taxPreview.cess ? <div><span>Cess</span><span>{inr.format(reprintSale.taxPreview.cess)}</span></div> : null}
              <div className="retail-pos-workbench__receipt-grand"><span>Grand Total</span><strong>{inr.format(reprintSale.taxPreview.grandTotal)}</strong></div>
            </div>
            <div className="retail-pos-workbench__receipt-tenders">
              <strong>Tender Breakdown:</strong>
              {reprintSale.tenders.map((t) => (
                <small key={t.id}>{t.method.toUpperCase()}: {inr.format(t.amount)} ({t.reference})</small>
              ))}
            </div>
            <div className="retail-pos-workbench__receipt-stamp">
              <ShieldCheck size={16} />
              <span>DUPLICATE AUDITED REPRINT · Printed by {activeActorId} at {indiaDate(new Date().toISOString())}</span>
            </div>
          </div>
        </div>
      </div>
    ) : null}

    <details className="retail-pos-workbench__setup-editor">
      <summary><Store size={16} aria-hidden="true" /><span><strong>Counter setup</strong><small>Connect a physical warehouse, sell-from bin, retail price book, walk-in customer and due-on-receipt payment term.</small></span></summary>
      <form onSubmit={(event) => void submitCounter(event)}>
        <div className="retail-pos-workbench__form-row"><label>Counter code<input name="code" placeholder="MUM-01" pattern="[A-Za-z0-9_-]{2,32}" required /></label><label>Counter name<input name="name" placeholder="Ground floor counter" required /></label></div>
        <div className="retail-pos-workbench__form-row"><label>Warehouse<select name="warehouseId" value={setupWarehouseId} onChange={(event) => setSetupWarehouseId(event.target.value)}>{setupWarehouses.length ? setupWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>) : <option value="">No active warehouse</option>}</select></label><label>Sell-from bin<select key={setupWarehouseId} name="sellFromBinId" defaultValue={setupBins[0]?.id ?? ''}>{setupBins.length ? setupBins.map((bin) => <option key={bin.id} value={bin.id}>{bin.code} · {bin.name}</option>) : <option value="">No available storage / picking bin</option>}</select></label></div>
        <div className="retail-pos-workbench__form-row"><label>Retail price book<select name="priceListId" defaultValue={revenue.priceLists.find(({ active, status, channel }) => active && status === 'active' && (channel === 'retail' || channel === 'all'))?.id ?? ''}>{revenue.priceLists.filter(({ active, status, channel }) => active && status === 'active' && (channel === 'retail' || channel === 'all')).map((list) => <option key={list.id} value={list.id}>{list.code} · {list.name}</option>)}</select></label><label>Due-on-receipt term<select name="paymentTermId" defaultValue={revenue.paymentTerms.find(({ active, dueDays }) => active && dueDays === 0)?.id ?? ''}>{revenue.paymentTerms.filter(({ active, dueDays }) => active && dueDays === 0).map((term) => <option key={term.id} value={term.id}>{term.code} · {term.name}</option>)}</select></label></div>
        <label>Walk-in customer account<select name="walkInAccountId" defaultValue={retailCustomerAccounts[0]?.id ?? ''} required><option value="">Choose active Party Master customer</option>{retailCustomerAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {account.id}</option>)}</select><small>Only an active Party Master customer in this legal entity can be used for walk-in receivables.</small></label>
        <button className="button button--quiet" disabled={busy}>Save governed counter</button>
      </form>
    </details>

    {notice ? <p className="retail-pos-workbench__notice" role="status">{notice}</p> : null}
  </section>;
}

function ShiftCloseReview({ shift, activeActorId, busy, onDecide, onRequestVarianceResolution, onDecideVarianceResolution }: { shift: Shift; activeActorId: string; busy: boolean; onDecide: (shift: Shift, decision: 'approved' | 'rejected', evidenceReference: string) => Promise<void>; onRequestVarianceResolution: (input: RequestRetailCashierShiftVarianceResolutionInput) => Promise<void>; onDecideVarianceResolution: (input: DecideRetailCashierShiftVarianceResolutionInput) => Promise<void> }): ReactNode {
  const [evidenceReference, setEvidenceReference] = useState('');
  const [varianceReason, setVarianceReason] = useState('');
  const [varianceEvidence, setVarianceEvidence] = useState('');
  const hasVariance = shift.variance !== 0 || (shift.tenderVariance ?? 0) !== 0;
  const canResolve = hasVariance && !shift.varianceResolutionStatus;
  const canDecideResolution = shift.varianceResolutionStatus === 'requested' && shift.varianceResolutionRequestedBy !== activeActorId;
  async function submitVarianceResolution(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onRequestVarianceResolution({ id: shift.id, reason: varianceReason, evidenceReference: varianceEvidence, expectedVersion: shift.version });
    setVarianceReason('');
    setVarianceEvidence('');
  }
  return <div className="retail-pos-workbench__review"><div><strong>{shift.number}</strong><small>Cashier {shift.cashierId} · declared {inr.format(shift.declaredCash ?? 0)} · expected {inr.format(shift.expectedCash ?? 0)} · cash variance {inr.format(shift.variance ?? 0)} · tender variance {inr.format(shift.tenderVariance ?? 0)}</small></div>{hasVariance ? <div className="retail-pos-workbench__variance-resolution"><strong>Finance variance resolution</strong>{shift.varianceResolutionStatus === 'approved' ? <small>Approved by {shift.varianceResolutionDecidedBy}; accounting journal evidence is ready.</small> : shift.varianceResolutionStatus === 'requested' ? <><small>Prepared by {shift.varianceResolutionRequestedBy}; independent finance decision required.</small><label>Decision evidence<input value={varianceEvidence} minLength={3} onChange={(event) => setVarianceEvidence(event.target.value)} placeholder="Variance decision reference" required /></label><div><button type="button" disabled={busy || !canDecideResolution || varianceEvidence.trim().length < 3} onClick={() => void onDecideVarianceResolution({ id: shift.id, decision: 'approved', evidenceReference: varianceEvidence, expectedVersion: shift.version })}>Approve variance + journal</button><button type="button" disabled={busy || !canDecideResolution || varianceEvidence.trim().length < 3} onClick={() => void onDecideVarianceResolution({ id: shift.id, decision: 'rejected', evidenceReference: varianceEvidence, expectedVersion: shift.version })}>Reject resolution</button></div></> : canResolve ? <form onSubmit={(event) => void submitVarianceResolution(event)}><label>Reason<input value={varianceReason} minLength={6} onChange={(event) => setVarianceReason(event.target.value)} placeholder="Explain the count or settlement difference" required /></label><label>Evidence reference<input value={varianceEvidence} minLength={3} onChange={(event) => setVarianceEvidence(event.target.value)} placeholder="Incident / bank / count evidence" required /></label><button type="submit" disabled={busy || varianceReason.trim().length < 6 || varianceEvidence.trim().length < 3}>Prepare finance resolution</button></form> : <small>Resolution {shift.varianceResolutionStatus}; refresh for the next independent action.</small>}</div> : null}<label>Review evidence<input value={evidenceReference} minLength={3} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Review reference" required /></label><div><button type="button" disabled={busy || evidenceReference.trim().length < 3 || (hasVariance && shift.varianceResolutionStatus !== 'approved')} onClick={() => void onDecide(shift, 'approved', evidenceReference)}>Approve shift close</button><button type="button" disabled={busy || evidenceReference.trim().length < 3} onClick={() => void onDecide(shift, 'rejected', evidenceReference)}>Return to cashier</button></div>{hasVariance && shift.varianceResolutionStatus !== 'approved' ? <small className="retail-pos-workbench__guard">Variance requires an approved finance resolution before shift closure.</small> : null}</div>;
}
