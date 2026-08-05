import { useState, type FormEvent, type ReactNode } from 'react';
import { Printer, Scale, ShieldCheck, UploadCloud } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type {
  ApplyRetailCatalogBulkEditInput,
  CreateRetailLabelPrintDispatchInput,
  CreateRetailPrinterAdapterInput,
  CreateRetailScaleProfileInput,
  DecideRetailLabelPrintDispatchInput,
  PrepareRetailCatalogBulkEditInput,
  TestRetailPrinterAdapterInput,
} from '../shared/retail-catalog-operations-contracts';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Catalog operation could not be completed.';

type EvidenceByRecord = Record<string, string>;

export function RetailCatalogOperationsWorkbench({
  revenue,
  busy,
  activeActorId,
  onCreateScale,
  onCreatePrinter,
  onTestPrinter,
  onCreateDispatch,
  onDecideDispatch,
  onPrepareBulk,
  onApplyBulk,
}: {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  onCreateScale?: (input: CreateRetailScaleProfileInput) => Promise<void>;
  onCreatePrinter?: (input: CreateRetailPrinterAdapterInput) => Promise<void>;
  onTestPrinter?: (input: TestRetailPrinterAdapterInput) => Promise<void>;
  onCreateDispatch?: (input: CreateRetailLabelPrintDispatchInput) => Promise<void>;
  onDecideDispatch?: (input: DecideRetailLabelPrintDispatchInput) => Promise<void>;
  onPrepareBulk?: (input: PrepareRetailCatalogBulkEditInput) => Promise<void>;
  onApplyBulk?: (input: ApplyRetailCatalogBulkEditInput) => Promise<void>;
}): ReactNode {
  const [notice, setNotice] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(revenue.itemVariants[0]?.id ?? '');
  const [selectedUom, setSelectedUom] = useState(revenue.uoms.find((item) => item.category === 'weight')?.id ?? revenue.uoms[0]?.id ?? '');
  const [selectedRun, setSelectedRun] = useState(revenue.retailLabelPrintRuns[0]?.id ?? '');
  const [selectedPrinter, setSelectedPrinter] = useState(revenue.retailPrinterAdapters.find((item) => item.status === 'certified')?.id ?? '');
  const [dispatchEvidence, setDispatchEvidence] = useState<EvidenceByRecord>({});
  const [bulkApprovalEvidence, setBulkApprovalEvidence] = useState<EvidenceByRecord>({});
  const firstItem = revenue.inventoryItems[0];
  const firstCategory = revenue.retailCatalogCategories[0];

  async function submitScale(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onCreateScale) return;
    const data = new FormData(event.currentTarget);
    try {
      await onCreateScale({
        itemVariantId: selectedVariant,
        uomId: selectedUom,
        pricingBasis: String(data.get('pricingBasis')) as CreateRetailScaleProfileInput['pricingBasis'],
        decimalPrecision: Number(data.get('precision')),
        minimumQuantity: Number(data.get('minimum')),
        maximumQuantity: Number(data.get('maximum')),
        barcodePrefix: String(data.get('prefix') ?? '') || undefined,
      });
      setNotice('Scale profile saved; POS validates the configured weight precision and range locally.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function submitPrinter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onCreatePrinter) return;
    const data = new FormData(event.currentTarget);
    try {
      await onCreatePrinter({
        code: String(data.get('code')),
        name: String(data.get('name')),
        connection: String(data.get('connection')) as CreateRetailPrinterAdapterInput['connection'],
        model: String(data.get('model') ?? '') || undefined,
        supportedTemplates: ['shelf', 'barcode', 'price-tag'],
      });
      setNotice('Printer adapter registered. Record an observed test before using it for a prepared label handoff.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function submitPrinterTest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onTestPrinter) return;
    const adapter = revenue.retailPrinterAdapters.find((item) => item.status !== 'certified' && item.status !== 'disabled');
    const evidenceReference = String(new FormData(event.currentTarget).get('printerTestEvidence') ?? '').trim();
    if (!adapter) {
      setNotice('No draft printer adapter is ready for a test record.');
      return;
    }
    try {
      await onTestPrinter({ id: adapter.id, evidenceReference, expectedVersion: adapter.version });
      setNotice('Operator printer-test evidence recorded. This is not a driver certification or a hardware acknowledgement.');
      event.currentTarget.reset();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function submitBulk(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onPrepareBulk || !firstItem || !firstCategory) return;
    try {
      await onPrepareBulk({
        changes: [{
          itemId: firstItem.id,
          categoryId: firstCategory.id,
          searchKeywords: [firstItem.name, 'retail'],
          expectedVersion: revenue.retailMerchandisingProfiles.find((item) => item.itemId === firstItem.id)?.version,
        }],
      });
      setNotice('Bulk catalog edit prepared for independent review and application.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decideDispatch(
    dispatch: RevenueOpsSnapshot['retailLabelPrintDispatches'][number],
    decision: DecideRetailLabelPrintDispatchInput['decision'],
  ): Promise<void> {
    const evidenceReference = dispatchEvidence[dispatch.id]?.trim() ?? '';
    if (evidenceReference.length < 3 || !onDecideDispatch) return;
    try {
      await onDecideDispatch({ id: dispatch.id, decision, evidenceReference, expectedVersion: dispatch.version });
      setDispatchEvidence((current) => ({ ...current, [dispatch.id]: '' }));
      setNotice(decision === 'acknowledged'
        ? 'Observed label output acknowledgement recorded with the operator evidence you entered.'
        : 'Device handoff failure recorded with the operator evidence you entered.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function applyBulk(edit: RevenueOpsSnapshot['retailCatalogBulkEdits'][number]): Promise<void> {
    const evidenceReference = bulkApprovalEvidence[edit.id]?.trim() ?? '';
    if (evidenceReference.length < 3 || !onApplyBulk) return;
    try {
      await onApplyBulk({ id: edit.id, evidenceReference, expectedVersion: edit.version });
      setBulkApprovalEvidence((current) => ({ ...current, [edit.id]: '' }));
      setNotice('Bulk catalog edit applied with the independent approval evidence you entered.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const certifiedPrinter = revenue.retailPrinterAdapters.find((item) => item.id === selectedPrinter && item.status === 'certified');
  const activeRun = revenue.retailLabelPrintRuns.find((item) => item.id === selectedRun);

  return <section className="retail-returns-workbench__settlement-panel">
    <header>
      <div><span>07 / Retail catalog operations</span><h4>Scales, printers, and controlled bulk merchandising</h4></div>
      <ShieldCheck size={19} aria-hidden="true" />
    </header>
    <p className="retail-returns-workbench__settlement-intro">Device delivery and bulk edits are evidence workflows. A scale profile changes quantity validation only. Printer records never claim that bytes reached hardware until a different operator records observed output evidence.</p>

    <div className="retail-exchange-form__row">
      <form onSubmit={(event) => void submitScale(event)}>
        <strong><Scale size={15} /> Scale / weight profile</strong>
        <label>SKU<select value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)}>{revenue.itemVariants.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
        <label>Weight UOM<select value={selectedUom} onChange={(event) => setSelectedUom(event.target.value)}>{revenue.uoms.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.category}</option>)}</select></label>
        <div className="retail-exchange-form__row">
          <label>Basis<select name="pricingBasis"><option value="per-weight">Per weight</option><option value="per-unit">Per unit</option></select></label>
          <label>Decimals<input name="precision" type="number" min="0" max="6" defaultValue="3" /></label>
        </div>
        <div className="retail-exchange-form__row">
          <label>Min<input name="minimum" type="number" min="0.001" step="any" defaultValue="0.001" /></label>
          <label>Max<input name="maximum" type="number" min="0.001" step="any" defaultValue="1000" /></label>
          <label>Barcode prefix<input name="prefix" placeholder="Optional" /></label>
        </div>
        <button className="button button--primary" disabled={busy || !selectedVariant}>Save scale profile</button>
      </form>

      <form onSubmit={(event) => void submitPrinter(event)}>
        <strong><Printer size={15} /> Printer adapter</strong>
        <label>Code<input name="code" placeholder="TSC-COUNTER-1" required /></label>
        <label>Name<input name="name" placeholder="Counter thermal printer" required /></label>
        <div className="retail-exchange-form__row">
          <label>Connection<select name="connection"><option>usb</option><option>network</option><option>bluetooth</option><option>manual</option></select></label>
          <label>Model<input name="model" placeholder="ESC/POS model" /></label>
        </div>
        <button className="button button--primary" disabled={busy}>Register adapter</button>
      </form>
    </div>

    <div className="retail-exchange-form__row">
      <form onSubmit={(event) => void submitPrinterTest(event)}>
        <label>Printer test evidence<input name="printerTestEvidence" placeholder="Observed test page / device acknowledgement reference" minLength={3} required /></label>
        <button type="submit" disabled={busy || !onTestPrinter || !revenue.retailPrinterAdapters.some((item) => item.status !== 'certified' && item.status !== 'disabled')}>Record printer test evidence</button>
        <small>Enter evidence you actually observed. A local test record is not a USB/Bluetooth driver certification or a transport acknowledgement.</small>
      </form>
      <select value={selectedPrinter} onChange={(event) => setSelectedPrinter(event.target.value)}>
        <option value="">Certified printer</option>
        {revenue.retailPrinterAdapters.filter((item) => item.status === 'certified').map((item) => <option key={item.id} value={item.id}>{item.code} · {item.model ?? item.connection}</option>)}
      </select>
      <select value={selectedRun} onChange={(event) => setSelectedRun(event.target.value)}>
        <option value="">Label run</option>
        {revenue.retailLabelPrintRuns.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.template} · {item.quantity}</option>)}
      </select>
      <button type="button" disabled={busy || !onCreateDispatch || !certifiedPrinter || !activeRun} onClick={() => {
        if (onCreateDispatch && certifiedPrinter && activeRun) {
          void onCreateDispatch({ labelPrintRunId: activeRun.id, printerAdapterId: certifiedPrinter.id });
        }
      }}>Prepare device handoff</button>
    </div>

    <div className="retail-returns-workbench__history-list">
      {revenue.retailLabelPrintDispatches.slice(0, 6).map((dispatch) => {
        const independentOperator = dispatch.requestedBy !== activeActorId;
        const evidence = dispatchEvidence[dispatch.id] ?? '';
        return <div key={dispatch.id}>
          <div><strong>{dispatch.status} · {dispatch.payloadChecksum.slice(0, 10)}</strong><small>{dispatch.labelPrintRunId} → {dispatch.printerAdapterId}</small></div>
          {dispatch.status === 'prepared' && onDecideDispatch ? <div className="retail-returns-workbench__settlement-decision">
            <label>Independent output acknowledgement evidence<input value={evidence} minLength={3} maxLength={240} onChange={(event) => setDispatchEvidence((current) => ({ ...current, [dispatch.id]: event.target.value }))} placeholder={independentOperator ? 'Observed label count, test page, or operator record' : 'Independent device operator required'} disabled={busy || !independentOperator} /></label>
            <div>
              <button type="button" disabled={busy || !independentOperator || evidence.trim().length < 3} onClick={() => void decideDispatch(dispatch, 'acknowledged')}>Record observed output</button>
              <button type="button" className="retail-returns-workbench__reject" disabled={busy || !independentOperator || evidence.trim().length < 3} onClick={() => void decideDispatch(dispatch, 'failed')}>Record handoff failure</button>
            </div>
            {!independentOperator ? <small>Only an operator other than the requester can record device output or failure.</small> : null}
          </div> : null}
        </div>;
      })}
    </div>

    <form onSubmit={(event) => void submitBulk(event)}>
      <strong><UploadCloud size={15} /> Bulk catalog edit</strong>
      <p>Prepare a governed branch edit for the first active item; production imports can submit up to 500 deduplicated changes through the same seam.</p>
      <button className="button button--primary" disabled={busy || !onPrepareBulk || !firstItem || !firstCategory}>Prepare bulk edit</button>
    </form>

    {revenue.retailCatalogBulkEdits.slice(0, 6).map((edit) => {
      const independentReviewer = edit.requestedBy !== activeActorId;
      const evidence = bulkApprovalEvidence[edit.id] ?? '';
      return <div key={edit.id} className="retail-returns-workbench__history-list">
        <span>{edit.number} · {edit.status} · {edit.changes.length} item(s) · checksum {edit.checksum.slice(0, 10)}</span>
        {edit.status === 'prepared' && onApplyBulk ? <div className="retail-returns-workbench__settlement-decision">
          <label>Independent bulk approval evidence<input value={evidence} minLength={3} maxLength={240} onChange={(event) => setBulkApprovalEvidence((current) => ({ ...current, [edit.id]: event.target.value }))} placeholder={independentReviewer ? 'Merchandising review, approval ticket, or signed checklist' : 'Independent reviewer required'} disabled={busy || !independentReviewer} /></label>
          <button type="button" disabled={busy || !independentReviewer || evidence.trim().length < 3} onClick={() => void applyBulk(edit)}>Apply approved bulk edit</button>
          {!independentReviewer ? <small>Only a reviewer other than the requester can apply this bulk change.</small> : null}
        </div> : null}
      </div>;
    })}

    {notice ? <p className="retail-returns-workbench__notice" role="status">{notice}</p> : null}
  </section>;
}
