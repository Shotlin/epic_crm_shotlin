import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Barcode, Boxes, FolderTree, ImagePlus, Printer, ScanBarcode, Tags, Upload } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RETAIL_MERCHANDISING_IMAGE_RESOURCE } from '../shared/retail-catalog-contracts';
import type {
  AssignRetailBarcodeInput,
  CreateRetailBarcodeSequenceInput,
  CreateRetailCatalogBrandInput,
  CreateRetailCatalogCategoryInput,
  CreateRetailLabelPrintRunInput,
  CreateRetailProductComboInput,
  ResetRetailBarcodeSequenceInput,
  SaveRetailMerchandisingProfileInput,
} from '../shared/retail-catalog-contracts';
import './RetailCatalogWorkbench.css';

export interface RetailCatalogWorkbenchProps {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  onCreateCategory: (input: CreateRetailCatalogCategoryInput) => Promise<void>;
  onCreateBrand: (input: CreateRetailCatalogBrandInput) => Promise<void>;
  onSaveMerchandising: (input: SaveRetailMerchandisingProfileInput) => Promise<void>;
  onCreateBarcodeSequence: (input: CreateRetailBarcodeSequenceInput) => Promise<void>;
  onResetBarcodeSequence: (input: ResetRetailBarcodeSequenceInput) => Promise<void>;
  onAssignBarcode: (input: AssignRetailBarcodeInput) => Promise<void>;
  onCreateLabelRun: (input: CreateRetailLabelPrintRunInput) => Promise<void>;
  onCreateProductCombo?: (input: CreateRetailProductComboInput) => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The retail catalogue action could not be completed.';
}

function instant(value: string | undefined): string {
  if (!value) return 'not yet recorded';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function RetailCatalogWorkbench({
  revenue,
  busy,
  onCreateCategory,
  onCreateBrand,
  onSaveMerchandising,
  onCreateBarcodeSequence,
  onResetBarcodeSequence,
  onAssignBarcode,
  onCreateLabelRun,
  onCreateProductCombo,
}: RetailCatalogWorkbenchProps): ReactNode {
  const activeItems = useMemo(() => revenue.inventoryItems.filter(({ active }) => active), [revenue.inventoryItems]);
  const activeCategories = useMemo(() => revenue.retailCatalogCategories.filter(({ active }) => active), [revenue.retailCatalogCategories]);
  const activeBrands = useMemo(() => revenue.retailCatalogBrands.filter(({ active }) => active), [revenue.retailCatalogBrands]);
  const usableRacks = useMemo(() => revenue.storageBins.filter((bin) => {
    if (bin.status !== 'available') return false;
    const zone = revenue.warehouseZones.find(({ id }) => id === bin.zoneId);
    return Boolean(zone?.active && (zone.purpose === 'storage' || zone.purpose === 'picking'));
  }), [revenue.storageBins, revenue.warehouseZones]);
  const [selectedItemId, setSelectedItemId] = useState(activeItems[0]?.id ?? '');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setSelectedItemId((current) => activeItems.some(({ id }) => id === current) ? current : activeItems[0]?.id ?? '');
  }, [activeItems]);

  const selectedItem = activeItems.find(({ id }) => id === selectedItemId);
  const selectedProfile = selectedItem
    ? revenue.retailMerchandisingProfiles.find(({ itemId }) => itemId === selectedItem.id)
    : undefined;
  const selectedVariants = selectedItem
    ? revenue.itemVariants.filter(({ itemId, active }) => itemId === selectedItem.id && active)
    : [];

  const [itemAttachments, setItemAttachments] = useState<Array<{ id: string; fileName: string; mimeType: string }>>([]);

  useEffect(() => {
    if (!selectedItem?.id) {
      setItemAttachments([]);
      return;
    }
    void window.epicBos?.storage?.listAttachments({
      resource: RETAIL_MERCHANDISING_IMAGE_RESOURCE,
      resourceId: selectedItem.id,
    }).then((list) => {
      setItemAttachments(list ?? []);
    }).catch(() => setItemAttachments([]));
  }, [selectedItem?.id]);

  async function handleUploadImage(): Promise<void> {
    if (!selectedItem?.id) return;
    try {
      const added = await window.epicBos?.storage?.addAttachment({
        resource: RETAIL_MERCHANDISING_IMAGE_RESOURCE,
        resourceId: selectedItem.id,
      });
      if (added) {
        setItemAttachments((prev) => [added, ...prev]);
        setNotice(`Product image ${added.fileName} encrypted and attached to item.`);
      }
    } catch (err) {
      setNotice(message(err));
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await onCreateCategory({ code: String(data.get('code')), name: String(data.get('name')), parentCategoryId: String(data.get('parentCategoryId')) || undefined });
      event.currentTarget.reset();
      setNotice('Retail category saved. It changes presentation only; inventory, tax and prices remain governed separately.');
    } catch (error) { setNotice(message(error)); }
  }

  async function submitBrand(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await onCreateBrand({ code: String(data.get('code')), name: String(data.get('name')) });
      event.currentTarget.reset();
      setNotice('Retail brand saved for the active branch.');
    } catch (error) { setNotice(message(error)); }
  }

  async function submitMerchandising(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedItem) return;
    const data = new FormData(event.currentTarget);
    try {
      await onSaveMerchandising({
        itemId: selectedItem.id,
        categoryId: String(data.get('categoryId')),
        brandId: String(data.get('brandId')) || undefined,
        rackBinId: String(data.get('rackBinId')) || undefined,
        imageAttachmentId: String(data.get('imageAttachmentId')) || undefined,
        searchKeywords: String(data.get('searchKeywords')).split(',').map((value) => value.trim()).filter(Boolean),
        expectedVersion: selectedProfile?.version,
      });
      setNotice('Retail merchandising profile saved. The shelf reference points to an existing stock bin; it does not move stock.');
    } catch (error) { setNotice(message(error)); }
  }

  async function submitSequence(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await onCreateBarcodeSequence({
        code: String(data.get('code')),
        prefix: String(data.get('prefix')),
        digitCount: Number(data.get('digitCount')),
        nextNumber: Number(data.get('nextNumber')),
      });
      event.currentTarget.reset();
      setNotice('Barcode sequence created. Allocation is server-side and cannot overwrite an existing SKU barcode.');
    } catch (error) { setNotice(message(error)); }
  }

  return <section className="retail-catalog-workbench" aria-labelledby="retail-catalog-title">
    <header className="retail-catalog-workbench__hero">
      <div><span><Tags size={14} aria-hidden="true" /> Retail catalogue control</span><h3 id="retail-catalog-title">Organise what shoppers see without weakening inventory truth.</h3><p>Categories, brands, shelf references, barcode counters and label runs are branch-scoped operational master data. A merchandising edit never silently changes GST, price, stock, or a printed barcode.</p></div>
      <div className="retail-catalog-workbench__hero-counts"><div><strong>{activeCategories.length}</strong><small>active categories</small></div><div><strong>{activeBrands.length}</strong><small>active brands</small></div><div><strong>{revenue.retailMerchandisingProfiles.length}</strong><small>merchandised items</small></div></div>
    </header>

    <div className="retail-catalog-workbench__grid">
      <article className="retail-catalog-workbench__master-card">
        <header><div><span>01 / Discovery tree</span><h4>Categories and brands</h4></div><FolderTree size={19} aria-hidden="true" /></header>
        <form onSubmit={(event) => void submitCategory(event)}>
          <div className="retail-catalog-workbench__form-row"><label>Category code<input name="code" placeholder="GROCERY" required /></label><label>Category name<input name="name" placeholder="Grocery" required /></label></div>
          <label>Parent category (optional)<select name="parentCategoryId"><option value="">Top-level category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.parentCategoryId ? '↳ ' : ''}{category.code} · {category.name}</option>)}</select></label>
          <button className="button button--primary" disabled={busy}>Add category</button>
        </form>
        <form onSubmit={(event) => void submitBrand(event)} className="retail-catalog-workbench__brand-form">
          <div className="retail-catalog-workbench__form-row"><label>Brand code<input name="code" placeholder="FRESHCO" required /></label><label>Brand name<input name="name" placeholder="FreshCo" required /></label></div>
          <button disabled={busy}>Add brand</button>
        </form>
        <div className="retail-catalog-workbench__tree-list">{activeCategories.length ? activeCategories.map((category) => <div key={category.id}><span><strong>{category.name}</strong><small>{category.code}{category.parentCategoryId ? ` · subcategory of ${revenue.retailCatalogCategories.find(({ id }) => id === category.parentCategoryId)?.name ?? category.parentCategoryId}` : ' · top level'}</small></span><em>{revenue.retailMerchandisingProfiles.filter(({ categoryId }) => categoryId === category.id).length} items</em></div>) : <p>Start with a top-level category such as Grocery, Fashion, Electronics, Pharmacy, or Services.</p>}</div>
        {activeBrands.length ? <div className="retail-catalog-workbench__brand-chips">{activeBrands.map((brand) => <span key={brand.id}>{brand.code} · {brand.name}</span>)}</div> : null}
      </article>

      <article className="retail-catalog-workbench__merchandising-card">
        <header><div><span>02 / Shelf presentation</span><h4>Link an item to the shopper-facing catalogue</h4></div><Boxes size={19} aria-hidden="true" /></header>
        {activeItems.length ? <form onSubmit={(event) => void submitMerchandising(event)}>
          <label>Inventory item<select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} disabled={busy}>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <div className="retail-catalog-workbench__form-row"><label>Category<select name="categoryId" defaultValue={selectedProfile?.categoryId ?? ''} key={`category-${selectedItem?.id}-${selectedProfile?.version}`} required><option value="">Choose category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select></label><label>Brand<select name="brandId" defaultValue={selectedProfile?.brandId ?? ''} key={`brand-${selectedItem?.id}-${selectedProfile?.version}`}><option value="">No brand</option>{activeBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.code} · {brand.name}</option>)}</select></label></div>
          <label>Rack / shelf bin<select name="rackBinId" defaultValue={selectedProfile?.rackBinId ?? ''} key={`rack-${selectedItem?.id}-${selectedProfile?.version}`}><option value="">No rack reference</option>{usableRacks.map((bin) => { const zone = revenue.warehouseZones.find(({ id }) => id === bin.zoneId); return <option key={bin.id} value={bin.id}>{bin.code} · {bin.name} ({zone?.purpose ?? 'unknown'})</option>; })}</select></label>
          <div className="retail-catalog-workbench__form-row">
            <label>Product Image Attachment
              <select name="imageAttachmentId" defaultValue={selectedProfile?.imageAttachmentId ?? ''} key={`image-${selectedItem?.id}-${selectedProfile?.version}`}>
                <option value="">No product image attached</option>
                {itemAttachments.map((att) => (
                  <option key={att.id} value={att.id}>{att.fileName} ({att.mimeType})</option>
                ))}
                {selectedProfile?.imageAttachmentId && !itemAttachments.some((a) => a.id === selectedProfile.imageAttachmentId) ? (
                  <option value={selectedProfile.imageAttachmentId}>Attached image ({selectedProfile.imageAttachmentId.slice(0, 8)}...)</option>
                ) : null}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="button button--quiet" onClick={() => void handleUploadImage()} disabled={busy || !selectedItem}>
                <Upload size={14} aria-hidden="true" /> Upload Image
              </button>
            </div>
          </div>
          <label>Search keywords, comma separated<input name="searchKeywords" defaultValue={selectedProfile?.searchKeywords.join(', ') ?? ''} key={`keywords-${selectedItem?.id}-${selectedProfile?.version}`} placeholder="milk, dairy, breakfast" /></label>
          <div className="retail-catalog-workbench__item-context"><ImagePlus size={16} aria-hidden="true" /><span><strong>{selectedItem?.name}</strong><small>{selectedVariants.length} active SKU{selectedVariants.length === 1 ? '' : 's'} · {selectedProfile ? `profile v${selectedProfile.version}` : 'not yet merchandised'}</small></span></div>
          <button className="button button--primary" disabled={busy || !activeCategories.length}>Save shelf presentation</button>
        </form> : <p className="retail-catalog-workbench__empty">Create inventory items first; retail merchandising remains linked to your governed item master rather than duplicating products.</p>}
      </article>
    </div>

    <div className="retail-catalog-workbench__barcode-grid">
      <article className="retail-catalog-workbench__barcode-card">
        <header><div><span>03 / Barcode custody</span><h4>Allocate from a controlled counter</h4></div><Barcode size={19} aria-hidden="true" /></header>
        <form onSubmit={(event) => void submitSequence(event)}>
          <div className="retail-catalog-workbench__form-row"><label>Sequence code<input name="code" placeholder="STORE-01" required /></label><label>Numeric prefix<input name="prefix" inputMode="numeric" placeholder="8901" required /></label></div>
          <div className="retail-catalog-workbench__form-row"><label>Total digits<input name="digitCount" type="number" min="4" max="12" defaultValue="12" required /></label><label>Next allocation number<input name="nextNumber" type="number" min="1" defaultValue="5000" required /></label></div>
          <button disabled={busy}>Create barcode sequence</button>
        </form>
        <BarcodeAllocationForm revenue={revenue} busy={busy} onAssign={onAssignBarcode} onNotice={setNotice} />
        <div className="retail-catalog-workbench__sequence-list">{revenue.retailBarcodeSequences.length ? revenue.retailBarcodeSequences.map((sequence) => <BarcodeResetRow key={sequence.id} sequence={sequence} busy={busy} onReset={onResetBarcodeSequence} onNotice={setNotice} />) : <p>No barcode sequence configured. A generated barcode is optional; existing scanned barcodes remain preserved.</p>}</div>
      </article>

      <article className="retail-catalog-workbench__label-card">
        <header><div><span>04 / Label evidence</span><h4>Prepare a print run, then hand it to a device</h4></div><Printer size={19} aria-hidden="true" /></header>
        <LabelRunForm revenue={revenue} busy={busy} onCreate={onCreateLabelRun} onNotice={setNotice} />
        <div className="retail-catalog-workbench__label-list">{revenue.retailLabelPrintRuns.length ? revenue.retailLabelPrintRuns.slice(0, 8).map((run) => { const variant = revenue.itemVariants.find(({ id }) => id === run.itemVariantId); return <div key={run.id}><span><strong>{run.number} · {run.template}</strong><small>{variant?.sku ?? run.itemVariantId} · {run.barcode} · {run.quantity} label{run.quantity === 1 ? '' : 's'}</small><small>{run.evidenceReference} · {instant(run.requestedAt)}</small></span><em>ready for device</em></div>; }) : <p>No label run recorded. Printing itself remains a certified printer-adapter boundary.</p>}</div>
      </article>

      {onCreateProductCombo ? (
        <article className="retail-catalog-workbench__label-card">
          <header><div><span>05 / Product Combos</span><h4>Define bundles and kits</h4></div><Boxes size={19} aria-hidden="true" /></header>
          <ComboForm revenue={revenue} busy={busy} onCreate={onCreateProductCombo} onNotice={setNotice} />
          <div className="retail-catalog-workbench__label-list">
            {(revenue.retailProductCombos ?? []).length ? (revenue.retailProductCombos ?? []).map((combo) => {
              const parentVariant = revenue.itemVariants.find(({ id }) => id === combo.parentItemVariantId);
              return (
                <div key={combo.id}>
                  <span>
                    <strong>{combo.code} · {combo.name}</strong>
                    <small>Parent: {parentVariant?.sku ?? combo.parentItemVariantId} · {combo.components.length} component(s)</small>
                  </span>
                  <em>Active Combo</em>
                </div>
              );
            }) : <p>No product combos defined. Combo bundles link a parent SKU to component inventory items.</p>}
          </div>
        </article>
      ) : null}
    </div>

    <p className="retail-catalog-workbench__boundary"><ScanBarcode size={15} aria-hidden="true" /> Barcode allocation, reset and label evidence are accountable. The system never overwrites a scanned SKU barcode, sends a print job to an unconfigured device, or treats a rack reference as a stock transfer.</p>
    {notice ? <p className="retail-catalog-workbench__notice" role="status">{notice}</p> : null}
  </section>;
}

function BarcodeAllocationForm({ revenue, busy, onAssign, onNotice }: {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  onAssign: (input: AssignRetailBarcodeInput) => Promise<void>;
  onNotice: (notice: string) => void;
}): ReactNode {
  const sequences = revenue.retailBarcodeSequences.filter(({ active }) => active);
  const variants = revenue.itemVariants.filter(({ active, barcode }) => active && !barcode);
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? '');
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  useEffect(() => setSequenceId((current) => sequences.some(({ id }) => id === current) ? current : sequences[0]?.id ?? ''), [sequences]);
  useEffect(() => setVariantId((current) => variants.some(({ id }) => id === current) ? current : variants[0]?.id ?? ''), [variants]);
  const sequence = sequences.find(({ id }) => id === sequenceId);
  const variant = variants.find(({ id }) => id === variantId);
  return <form className="retail-catalog-workbench__allocate-form" onSubmit={(event) => { event.preventDefault(); if (!sequence || !variant) return; void onAssign({ sequenceId: sequence.id, itemVariantId: variant.id, expectedSequenceVersion: sequence.version, expectedVariantVersion: variant.version }).then(() => onNotice(`Barcode ${sequence.prefix}${sequence.nextNumber} allocated to ${variant.sku}.`)).catch((error) => onNotice(message(error))); }}>
    <strong>Allocate next barcode</strong>
    <div className="retail-catalog-workbench__form-row"><label>Sequence<select value={sequenceId} onChange={(event) => setSequenceId(event.target.value)} disabled={busy || !sequences.length}>{sequences.length ? sequences.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · next {entry.nextNumber}</option>) : <option value="">No active sequence</option>}</select></label><label>SKU without barcode<select value={variantId} onChange={(event) => setVariantId(event.target.value)} disabled={busy || !variants.length}>{variants.length ? variants.map((entry) => <option key={entry.id} value={entry.id}>{entry.sku} · {entry.name}</option>) : <option value="">All active SKUs have a barcode</option>}</select></label></div>
    <button type="submit" disabled={busy || !sequence || !variant}>Allocate server-side barcode</button>
  </form>;
}

function BarcodeResetRow({ sequence, busy, onReset, onNotice }: {
  sequence: RevenueOpsSnapshot['retailBarcodeSequences'][number];
  busy: boolean;
  onReset: (input: ResetRetailBarcodeSequenceInput) => Promise<void>;
  onNotice: (notice: string) => void;
}): ReactNode {
  const [nextNumber, setNextNumber] = useState(String(sequence.nextNumber));
  const [evidenceReference, setEvidenceReference] = useState('');
  useEffect(() => setNextNumber(String(sequence.nextNumber)), [sequence.nextNumber]);
  return <div className="retail-catalog-workbench__sequence-row"><span><strong>{sequence.code}</strong><small>{sequence.prefix || 'no prefix'} · {sequence.digitCount} digits · next {sequence.nextNumber}</small><small>{sequence.lastResetEvidence ? `last reset ${instant(sequence.lastResetAt)} · ${sequence.lastResetEvidence}` : 'No reset evidence recorded'}</small></span><form onSubmit={(event) => { event.preventDefault(); void onReset({ id: sequence.id, nextNumber: Number(nextNumber), evidenceReference, expectedVersion: sequence.version }).then(() => { setEvidenceReference(''); onNotice('Barcode sequence reset with accountable evidence. Previously printed barcodes were not changed.'); }).catch((error) => onNotice(message(error))); }}><input aria-label={`${sequence.code} next allocation`} type="number" min="1" value={nextNumber} onChange={(event) => setNextNumber(event.target.value)} required /><input aria-label={`${sequence.code} reset evidence`} value={evidenceReference} minLength={4} maxLength={240} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Reset evidence" required /><button disabled={busy || evidenceReference.trim().length < 4}>Reset next</button></form></div>;
}

function LabelRunForm({ revenue, busy, onCreate, onNotice }: {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  onCreate: (input: CreateRetailLabelPrintRunInput) => Promise<void>;
  onNotice: (notice: string) => void;
}): ReactNode {
  const printableVariants = revenue.itemVariants.filter(({ active, barcode }) => active && Boolean(barcode));
  const [variantId, setVariantId] = useState(printableVariants[0]?.id ?? '');
  useEffect(() => setVariantId((current) => printableVariants.some(({ id }) => id === current) ? current : printableVariants[0]?.id ?? ''), [printableVariants]);
  return <form className="retail-catalog-workbench__label-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (!variantId) return; void onCreate({ itemVariantId: variantId, quantity: Number(data.get('quantity')), template: String(data.get('template')) as CreateRetailLabelPrintRunInput['template'], evidenceReference: String(data.get('evidenceReference')) }).then(() => { event.currentTarget.reset(); onNotice('Print-ready label run recorded. A configured printer adapter may consume it later.'); }).catch((error) => onNotice(message(error))); }}>
    <label>Barcode SKU<select value={variantId} onChange={(event) => setVariantId(event.target.value)} disabled={busy || !printableVariants.length}>{printableVariants.length ? printableVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.sku} · {variant.barcode}</option>) : <option value="">No barcode SKU available</option>}</select></label>
    <div className="retail-catalog-workbench__form-row"><label>Template<select name="template" defaultValue="barcode"><option value="barcode">Barcode label</option><option value="shelf">Shelf strip</option><option value="price-tag">Price tag</option></select></label><label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" required /></label></div>
    <label>Evidence reference<input name="evidenceReference" minLength={3} maxLength={240} placeholder="GRN, purchase receipt or approved reprint record" required /></label>
    <button className="button button--primary" disabled={busy || !variantId}>Record label run</button>
  </form>;
}

function ComboForm({ revenue, busy, onCreate, onNotice }: {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  onCreate: (input: CreateRetailProductComboInput) => Promise<void>;
  onNotice: (notice: string) => void;
}): ReactNode {
  const activeVariants = revenue.itemVariants.filter(({ active }) => active);
  const [parentId, setParentId] = useState(activeVariants[0]?.id ?? '');
  const [componentId, setComponentId] = useState(activeVariants[1]?.id ?? activeVariants[0]?.id ?? '');
  const [componentQty, setComponentQty] = useState('1');

  useEffect(() => setParentId((curr) => activeVariants.some(({ id }) => id === curr) ? curr : activeVariants[0]?.id ?? ''), [activeVariants]);
  useEffect(() => setComponentId((curr) => activeVariants.some(({ id }) => id === curr) ? curr : activeVariants[1]?.id ?? activeVariants[0]?.id ?? ''), [activeVariants]);

  return <form className="retail-catalog-workbench__label-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!parentId || !componentId) return;
    void onCreate({
      code: String(data.get('code')),
      name: String(data.get('name')),
      parentItemVariantId: parentId,
      components: [{ itemVariantId: componentId, quantity: Number(componentQty) || 1 }],
    }).then(() => {
      event.currentTarget.reset();
      onNotice('Retail product combo created and linked to component inventory SKU.');
    }).catch((error) => onNotice(message(error)));
  }}>
    <div className="retail-catalog-workbench__form-row">
      <label>Combo code<input name="code" placeholder="COMBO-01" required /></label>
      <label>Combo name<input name="name" placeholder="Breakfast Twin Pack" required /></label>
    </div>
    <label>Parent Bundle SKU
      <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={busy || !activeVariants.length}>
        {activeVariants.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.name}</option>)}
      </select>
    </label>
    <div className="retail-catalog-workbench__form-row">
      <label>Component SKU
        <select value={componentId} onChange={(e) => setComponentId(e.target.value)} disabled={busy || !activeVariants.length}>
          {activeVariants.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.name}</option>)}
        </select>
      </label>
      <label>Qty per combo
        <input type="number" min="1" value={componentQty} onChange={(e) => setComponentQty(e.target.value)} required />
      </label>
    </div>
    <button className="button button--primary" disabled={busy || !parentId || !componentId}>
      Save Combo Definition
    </button>
  </form>;
}
