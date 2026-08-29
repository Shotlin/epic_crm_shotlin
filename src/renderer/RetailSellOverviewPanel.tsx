import {
  ArrowRight,
  Banknote,
  Barcode,
  CheckCircle2,
  CirclePlus,
  PackageOpen,
  ReceiptIndianRupee,
  Search,
  ShoppingCart,
  Store,
  WalletCards,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { computeRetailSellOverview } from '../domain/retail-sell-overview';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { RetailCashierShift, RetailCounter, RetailSale } from '../shared/retail-pos-contracts';

export interface RetailSellCatalogPreview {
  id: string;
  label: string;
  sku: string;
  /** Present only when governed merchandising maps the item to an active category. */
  category?: string;
  availableUnits: number;
  /** A price is shown only when an active counter price book supplies it. */
  unitPrice?: number;
}

export type RetailSellDestination = 'pos' | 'devices' | 'recovery' | 'returns';

export interface RetailSellOverviewPanelProps {
  counters: readonly RetailCounter[];
  shifts: readonly RetailCashierShift[];
  sales: readonly RetailSale[];
  offlineQueue?: RevenueOpsSnapshot['retailOfflineSaleQueue'];
  catalogProducts?: readonly RetailSellCatalogPreview[];
  onOpenAdvanced?: () => void;
  onOpenDestination?: (destination: RetailSellDestination) => void;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function formatReceiptMoment(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recorded time unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(parsed);
}

/**
 * A deliberately light POS front door. It previews only data that can be
 * traced to the local retail projection and sends every write to the governed
 * POS workbench.
 */
export function RetailSellOverviewPanel({
  counters,
  shifts,
  sales,
  offlineQueue = [],
  catalogProducts = [],
  onOpenAdvanced,
  onOpenDestination,
}: RetailSellOverviewPanelProps): ReactNode {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const report = useMemo(
    () => computeRetailSellOverview({ counters: [...counters], shifts: [...shifts], sales: [...sales], offlineQueue }),
    [counters, offlineQueue, sales, shifts],
  );
  const activeCounters = counters.filter((counter) => counter.active);
  const activeCounterNames = activeCounters.map((counter) => counter.name || counter.code).filter(Boolean);
  const counterState = report.summary.openShifts
    ? `${report.summary.openShifts} shift${report.summary.openShifts === 1 ? '' : 's'} open`
    : 'No open shift';
  const openDestination = (destination: RetailSellDestination): void => {
    if (onOpenDestination) {
      onOpenDestination(destination);
      return;
    }
    onOpenAdvanced?.();
  };
  const categories = useMemo(
    () => ['All', ...new Set(catalogProducts.map((product) => product.category?.trim()).filter((category): category is string => Boolean(category)))],
    [catalogProducts],
  );
  const filteredCatalogProducts = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('en-IN');
    return catalogProducts.filter((product) => {
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      const matchesSearch = !normalizedSearch || `${product.label} ${product.sku}`.toLocaleLowerCase('en-IN').includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [catalogProducts, searchText, selectedCategory]);

  return (
    <section className="retail-sell-overview retail-sell-overview--retail-front" data-testid="retail-sell-overview" aria-labelledby="retail-sell-overview-title">
      <header className="retail-sell-overview__header retail-sell-overview__header--retail-front">
        <div>
          <span className="eyebrow"><ShoppingCart size={14} aria-hidden="true" /> Counter sale</span>
          <h1 id="retail-sell-overview-title" className="retail-front-door__title">Sell simply. Keep every rupee accountable.</h1>
          <p>Scan or search inside the governed POS. This front door shows readiness and real receipts without creating an unfinished bill.</p>
        </div>
        <div className="retail-sell-overview__status" role="status" data-ready={report.summary.openShifts > 0}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{counterState}</span>
          <small>{activeCounters.length ? `${activeCounters.length} active sell point${activeCounters.length === 1 ? '' : 's'}` : 'Counter setup required'}</small>
        </div>
      </header>

      <div className="retail-sell-overview__metrics" aria-label="POS overview">
        <div><Store size={17} aria-hidden="true" /><span>Sell points</span><strong>{report.summary.activeCounters}</strong><small>active counters</small></div>
        <div><Banknote size={17} aria-hidden="true" /><span>Open shifts</span><strong>{report.summary.openShifts}</strong><small>cash custody in progress</small></div>
        <div><ReceiptIndianRupee size={17} aria-hidden="true" /><span>Receipts</span><strong>{report.summary.completedSales}</strong><small>completed local sales</small></div>
        <div><WalletCards size={17} aria-hidden="true" /><span>Average basket</span><strong>{inr.format(report.summary.averageBasket)}</strong><small>{inr.format(report.summary.billedValue)} billed total</small></div>
      </div>

      {(report.summary.offlineQueued || report.summary.offlineConflicts) ? (
        <div className="retail-sell-overview__offline" data-alert={report.summary.offlineConflicts > 0} role="status">
          <div>
            <strong>Offline checkout needs attention</strong>
            <span>{report.summary.offlineQueued} sale{report.summary.offlineQueued === 1 ? '' : 's'} waiting to sync · {report.summary.offlineConflicts} conflict{report.summary.offlineConflicts === 1 ? '' : 's'} · {report.summary.offlineRecoveryAttempts} recovery attempt{report.summary.offlineRecoveryAttempts === 1 ? '' : 's'}</span>
          </div>
          <button type="button" className="button button--quiet" onClick={() => openDestination('recovery')}>Review recovery <ArrowRight size={14} aria-hidden="true" /></button>
        </div>
      ) : null}

      <div className="retail-sell-overview__point-of-sale">
        <article className="retail-sell-overview__catalog" aria-labelledby="retail-sell-catalog-title">
          <header>
            <div>
              <span className="eyebrow">Products</span>
              <h3 id="retail-sell-catalog-title">Ready at this counter</h3>
              <p>Products appear only when current inventory and the selected counter’s price book agree.</p>
            </div>
            <div className="retail-sell-overview__header-actions">
              <button type="button" aria-label="Returns and exchange" className="retail-sell-overview__open-link" onClick={() => openDestination('returns')}>Returns and exchange <ArrowRight size={14} aria-hidden="true" /></button>
              <button type="button" className="retail-sell-overview__open-link" onClick={() => openDestination('pos')}>Open POS <ArrowRight size={14} aria-hidden="true" /></button>
            </div>
          </header>
          {catalogProducts.length ? (
            <div className="retail-sell-overview__catalog-content">
              <div className="retail-sell-overview__catalog-tools">
                <label className="retail-sell-overview__catalog-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Search price-ready products</span>
                  <input type="search" aria-label="Search price-ready products" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Scan barcode or search by name / SKU" />
                </label>
                {categories.length > 1 ? (
                  <div className="retail-sell-overview__category-tabs" role="group" aria-label="Price-ready product categories">
                    {categories.map((category) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>{category}</button>)}
                  </div>
                ) : null}
              </div>
              {filteredCatalogProducts.length ? (
                <div className="retail-sell-overview__product-grid" role="list" aria-label="Price-ready products">
                  {filteredCatalogProducts.map((product) => (
                    <div key={product.id} role="listitem">
                      <button type="button" className="retail-sell-overview__product" onClick={() => openDestination('pos')} aria-label={`Open ${product.label} in POS`}>
                        <span className="retail-sell-overview__product-icon"><Barcode size={16} aria-hidden="true" /></span>
                        <strong>{product.label}</strong>
                        <small>{product.sku}</small>
                        <span className="retail-sell-overview__product-meta">
                          <b>{product.unitPrice === undefined ? 'Price unavailable' : inr.format(product.unitPrice)}</b>
                          <em>{product.availableUnits.toLocaleString('en-IN')} available</em>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bharat-empty retail-sell-overview__catalog-empty" role="status">
                  <PackageOpen size={22} aria-hidden="true" />
                  <strong>No price-ready product matches this search.</strong>
                  <span>Change the category or scan a different product barcode.</span>
                  <button type="button" className="button button--quiet" onClick={() => { setSearchText(''); setSelectedCategory('All'); }}>Clear product filters</button>
                </div>
              )}
            </div>
          ) : (
            <div className="bharat-empty retail-sell-overview__catalog-empty">
              <PackageOpen size={22} aria-hidden="true" />
              <strong>No price-ready product is available here</strong>
              <span>Complete counter, inventory and price-book setup before scanning the first item.</span>
              <button type="button" className="button button--quiet" onClick={() => openDestination('devices')}>Open POS setup <ArrowRight size={14} aria-hidden="true" /></button>
            </div>
          )}
        </article>

        <article className="retail-sell-overview__current-bill" aria-labelledby="retail-sell-bill-title">
          <header>
            <div>
              <span className="eyebrow">Current bill</span>
              <h3 id="retail-sell-bill-title">Start a governed checkout</h3>
            </div>
            <span className="retail-sell-overview__walk-in">No bill in this overview</span>
          </header>
          <div className="retail-sell-overview__bill-empty">
            <ReceiptIndianRupee size={28} aria-hidden="true" />
            <strong>There is no draft bill on this page.</strong>
            <p>Open the POS to scan a barcode, select a customer, apply valid discounts, collect a tender and issue the receipt.</p>
          </div>
          <dl className="retail-sell-overview__counter-facts">
            <div><dt>Counter state</dt><dd>{counterState}</dd></div>
            <div><dt>Active counters</dt><dd>{activeCounterNames.length ? activeCounterNames.join(', ') : 'No active counter configured'}</dd></div>
            <div><dt>Offline queue</dt><dd>{report.summary.offlineQueued ? `${report.summary.offlineQueued} queued sale${report.summary.offlineQueued === 1 ? '' : 's'}` : 'Clear'}</dd></div>
          </dl>
          <button type="button" className="button button--primary retail-sell-overview__start-sale" onClick={() => openDestination('pos')}>
            <CirclePlus size={17} aria-hidden="true" /> Start a sale <ArrowRight size={15} aria-hidden="true" />
          </button>
          <small className="retail-sell-overview__keyboard-hint">Barcode, customer, discount, GST, tender and receipt controls stay in the accountable POS workbench.</small>
        </article>
      </div>

      <div className="retail-sell-overview__body">
        <article className="retail-sell-overview__recent" aria-labelledby="retail-sell-recent-title">
          <header>
            <div><span className="eyebrow">Latest receipts</span><h3 id="retail-sell-recent-title">What was sold recently</h3></div>
            <ReceiptIndianRupee size={18} aria-hidden="true" />
          </header>
          {report.recentSales.length ? (
            <div className="retail-sell-overview__sales" role="list" aria-label="Recent completed receipts">
              {report.recentSales.map((sale) => (
                <div key={sale.id} role="listitem">
                  <div><strong>{sale.number}</strong><small>{sale.counterLabel} · {formatReceiptMoment(sale.saleAt)}</small></div>
                  <div><strong>{inr.format(sale.value)}</strong><small>{sale.tenderMethods.join(' · ')}</small></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bharat-empty"><ReceiptIndianRupee size={22} aria-hidden="true" /><strong>No completed sale yet</strong><span>Start a governed sale when a counter is ready.</span></div>
          )}
        </article>

        <aside className="retail-sell-overview__guide" aria-labelledby="retail-sell-checklist-title">
          <header><span className="eyebrow">Counter checklist</span><h3 id="retail-sell-checklist-title">Ready for the next customer?</h3></header>
          <ol>
            <li><span>01</span><div><strong>Open shift</strong><small>Confirm the opening float and assigned counter.</small></div></li>
            <li><span>02</span><div><strong>Scan item</strong><small>Use the barcode, product and valid price evidence.</small></div></li>
            <li><span>03</span><div><strong>Collect tender</strong><small>Match every payment to the GST total before receipt.</small></div></li>
          </ol>
          <button type="button" className="button button--quiet" onClick={() => openDestination('pos')}>Open full POS controls <ArrowRight size={14} aria-hidden="true" /></button>
        </aside>
      </div>

      <footer className="retail-sell-overview__footer"><CheckCircle2 size={14} aria-hidden="true" /> This overview does not create a sale. The governed POS workbench owns stock, GST, tender, receipt and offline-sync writes.</footer>
    </section>
  );
}

function priceReadyCatalogPreview(revenue: RevenueOpsSnapshot): RetailSellCatalogPreview[] {
  const selectedCounter = revenue.retailCounters.find((counter) => counter.active);
  if (!selectedCounter) return [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const availableByVariant = new Map<string, number>();
  for (const balance of revenue.binBalances) {
    if (balance.binId !== selectedCounter.sellFromBinId || balance.available <= 0) continue;
    availableByVariant.set(balance.itemVariantId, (availableByVariant.get(balance.itemVariantId) ?? 0) + balance.available);
  }
  const itemById = new Map(revenue.inventoryItems.map((item) => [item.id, item]));
  const productById = new Map(revenue.products.map((product) => [product.id, product]));
  const profileByItemId = new Map(revenue.retailMerchandisingProfiles.map((profile) => [profile.itemId, profile]));
  const categoryById = new Map(revenue.retailCatalogCategories.filter((category) => category.active).map((category) => [category.id, category]));
  return revenue.itemVariants
    .filter((variant) => variant.active && (availableByVariant.get(variant.id) ?? 0) > 0)
    .map((variant): RetailSellCatalogPreview | undefined => {
      const item = itemById.get(variant.itemId);
      const product = item ? productById.get(item.productId) : undefined;
      const category = item ? categoryById.get(profileByItemId.get(item.id)?.categoryId ?? '') : undefined;
      if (!item?.active || !product?.active || product.kind !== 'goods') return undefined;
      const price = revenue.priceListEntries
        .filter((entry) => entry.priceListId === selectedCounter.priceListId && entry.productId === product.id && entry.minimumQuantity <= 1 && entry.effectiveFrom <= today && (!entry.effectiveTo || entry.effectiveTo >= today))
        .sort((left, right) => right.minimumQuantity - left.minimumQuantity)[0];
      return {
        id: variant.id,
        label: variant.name || item.name || product.name,
        sku: variant.sku || item.code,
        category: category?.name,
        availableUnits: availableByVariant.get(variant.id) ?? 0,
        unitPrice: price?.unitPrice,
      };
    })
    .filter((product): product is RetailSellCatalogPreview => product !== undefined)
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(0, 9);
}

export function RetailSellOverviewFromRevenue({ revenue, onOpenAdvanced, onOpenDestination }: { revenue: RevenueOpsSnapshot; onOpenAdvanced?: () => void; onOpenDestination?: (destination: RetailSellDestination) => void }): ReactNode {
  const catalogProducts = useMemo(() => priceReadyCatalogPreview(revenue), [revenue]);
  return <RetailSellOverviewPanel
    counters={revenue.retailCounters}
    shifts={revenue.retailCashierShifts}
    sales={revenue.retailSales}
    offlineQueue={revenue.retailOfflineSaleQueue}
    catalogProducts={catalogProducts}
    onOpenAdvanced={onOpenAdvanced}
    onOpenDestination={onOpenDestination}
  />;
}
