import { CloudCog, FileCheck2, FileSearch, ReceiptIndianRupee, ShieldCheck, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type {
  ConfigureRetailCommerceCredentialsInput,
  ConvertRetailPurchaseOcrInput,
  CreateRetailCommerceConnectorInput,
  CreateRetailCommerceSyncInput,
  CreateRetailPurchaseOcrInput,
  CreateRetailSettlementReconciliationInput,
  DecideRetailPurchaseOcrInput,
  DecideRetailSettlementReconciliationInput,
  ExecuteRetailCommerceSyncInput,
  ImportRetailCommerceOrderInput,
  RecordRetailCommerceSyncInput,
} from '../shared/retail-commerce-contracts';

type Props = {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  /** Retained for the shell contract. Production writes are deliberately not exposed from this summary surface. */
  onCreateOcr?: (input: CreateRetailPurchaseOcrInput) => Promise<void>;
  onDecideOcr?: (input: DecideRetailPurchaseOcrInput) => Promise<void>;
  onConvertOcr?: (input: ConvertRetailPurchaseOcrInput) => Promise<void>;
  onCreateConnector?: (input: CreateRetailCommerceConnectorInput) => Promise<void>;
  onConfigureCredentials?: (input: ConfigureRetailCommerceCredentialsInput) => Promise<void>;
  onCreateSync?: (input: CreateRetailCommerceSyncInput) => Promise<void>;
  onExecuteSync?: (input: ExecuteRetailCommerceSyncInput) => Promise<void>;
  onRecordSync?: (input: RecordRetailCommerceSyncInput) => Promise<void>;
  onImportOrder?: (input: ImportRetailCommerceOrderInput) => Promise<void>;
  onCreateSettlement?: (input: CreateRetailSettlementReconciliationInput) => Promise<void>;
  onDecideSettlement?: (input: DecideRetailSettlementReconciliationInput) => Promise<void>;
};

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/**
 * A deliberately read-only boundary between store operations and external
 * commerce systems. It never creates a connector, imports a provider order,
 * captures a settlement, approves OCR, or records a provider outcome. Those
 * actions must originate from a trusted Retail Hub/provider envelope and then
 * appear here as governed local evidence.
 */
export function RetailCommerceWorkbench({ revenue }: Props): ReactNode {
  const connectors = revenue.retailCommerceConnectors.slice(0, 8);
  const syncRuns = revenue.retailCommerceSyncRuns.slice(0, 8);
  const orders = revenue.retailCommerceOrders.slice(0, 8);
  const settlements = revenue.retailSettlementReconciliations.slice(0, 8);
  const ocrDocuments = revenue.retailPurchaseOcrDocuments.slice(0, 8);
  const preparedRuns = revenue.retailCommerceSyncRuns.filter((run) => run.status === 'prepared').length;
  const unresolvedSettlementCount = revenue.retailSettlementReconciliations.filter((settlement) => settlement.status !== 'matched' && settlement.status !== 'resolved').length;

  return (
    <section className="retail-returns-workbench__settlement-panel" aria-labelledby="retail-commerce-status-title" data-testid="retail-commerce-status">
      <header>
        <div>
          <span><CloudCog size={14} aria-hidden="true" /> Retail Hub boundary</span>
          <h4 id="retail-commerce-status-title">External commerce status</h4>
        </div>
        <ShieldCheck size={19} aria-hidden="true" />
      </header>
      <p className="retail-returns-workbench__settlement-intro">
        Provider and Hub responses are the only source for external orders, settlement results, OCR documents, and connector state. This screen is read-only: it cannot create data, approve evidence, or claim a provider response.
      </p>

      <section className="retail-commerce-health" aria-label="External commerce evidence summary">
        <header>
          <div>
            <span>GOVERNED EVIDENCE</span>
            <h4>What has actually reached Epic BOS</h4>
          </div>
          <strong>{preparedRuns + unresolvedSettlementCount} item{preparedRuns + unresolvedSettlementCount === 1 ? '' : 's'} need review</strong>
        </header>
        <div className="retail-exchange-form__row">
          <div><strong>Connectors</strong><small>{connectors.length} recorded; credentials and certification are shown only after secure configuration.</small></div>
          <div><strong>Provider syncs</strong><small>{revenue.retailCommerceSyncRuns.length} evidence record{revenue.retailCommerceSyncRuns.length === 1 ? '' : 's'}; {preparedRuns} awaiting a trusted outcome.</small></div>
          <div><strong>External orders</strong><small>{revenue.retailCommerceOrders.length} provider-sourced order{revenue.retailCommerceOrders.length === 1 ? '' : 's'} recorded.</small></div>
          <div><strong>Settlements</strong><small>{revenue.retailSettlementReconciliations.length} recorded; {unresolvedSettlementCount} still require reconciliation.</small></div>
        </div>
      </section>

      <section className="retail-returns-workbench__history-list" aria-label="Connector evidence">
        <strong><CloudCog size={15} aria-hidden="true" /> Connector evidence</strong>
        {connectors.length ? connectors.map((connector) => (
          <div key={connector.id}>
            <div>
              <strong>{connector.code} / {connector.channel}</strong>
              <small>{connector.environment} / {connector.status} / credentials {connector.credentialStatus} / {connector.lastSyncAt ?? 'no provider sync evidence yet'}</small>
            </div>
            <em data-status={connector.status}>{connector.status}</em>
          </div>
        )) : <p className="retail-returns-workbench__empty">No connector evidence is recorded. Configure an approved provider through Setup before any Hub request can be prepared.</p>}
      </section>

      <section className="retail-returns-workbench__history-list" aria-label="Provider sync evidence">
        <strong><FileCheck2 size={15} aria-hidden="true" /> Provider sync evidence</strong>
        {syncRuns.length ? syncRuns.map((run) => (
          <div key={run.id}>
            <div>
              <strong>{run.number} / {run.kind} / {run.status}</strong>
              <small>{run.recordsAccepted} accepted / {run.recordsRejected} rejected / {run.evidenceReference ?? 'awaiting a canonical provider response'}</small>
            </div>
            <em data-status={run.status}>{run.status}</em>
          </div>
        )) : <p className="retail-returns-workbench__empty">No provider sync has been recorded. A local form cannot stand in for a Hub or provider response.</p>}
      </section>

      <div className="retail-exchange-form__row">
        <section className="retail-returns-workbench__history-list" aria-label="Recorded provider orders">
          <strong><ShoppingBag size={15} aria-hidden="true" /> Recorded provider orders</strong>
          {orders.length ? orders.map((order) => (
            <div key={order.id}>
              <div>
                <strong>{order.orderNumber} / {order.status}</strong>
                <small>{order.lines.length} line{order.lines.length === 1 ? '' : 's'} / {inr.format(order.totalAmount)} / checksum {order.remotePayloadChecksum.slice(0, 12)}</small>
              </div>
              <em data-status={order.status}>{order.status}</em>
            </div>
          )) : <p className="retail-returns-workbench__empty">No provider-sourced orders are recorded. Orders appear only after a verified Hub or provider envelope is accepted.</p>}
        </section>
        <section className="retail-returns-workbench__history-list" aria-label="Recorded settlement evidence">
          <strong><ReceiptIndianRupee size={15} aria-hidden="true" /> Recorded settlement evidence</strong>
          {settlements.length ? settlements.map((settlement) => (
            <div key={settlement.id}>
              <div>
                <strong>{settlement.settlementReference} / {settlement.status}</strong>
                <small>Net {inr.format(settlement.netAmount)} / variance {inr.format(settlement.varianceAmount)} / checksum {settlement.remotePayloadChecksum.slice(0, 12)}</small>
              </div>
              <em data-status={settlement.status}>{settlement.status}</em>
            </div>
          )) : <p className="retail-returns-workbench__empty">No settlement evidence is recorded. Settlement amounts must come from a provider payload, never a manually entered total.</p>}
        </section>
      </div>

      <section className="retail-returns-workbench__history-list" aria-label="Recorded purchase OCR evidence">
        <strong><FileSearch size={15} aria-hidden="true" /> Recorded purchase OCR evidence</strong>
        {ocrDocuments.length ? ocrDocuments.map((document) => (
          <div key={document.id}>
            <div>
              <strong>{document.number} / {document.status}</strong>
              <small>{document.fileName} / {Math.round(document.extractionConfidence * 100)}% extracted confidence / checksum {document.fileChecksum.slice(0, 12)}</small>
            </div>
            <em data-status={document.status}>{document.status}</em>
          </div>
        )) : <p className="retail-returns-workbench__empty">No OCR evidence is recorded. Uploads and OCR decisions belong to the verified provider workflow, not this retail summary.</p>}
      </section>

      <aside className="retail-returns-workbench__guard">
        <ShieldCheck size={14} aria-hidden="true" />
        Next: review a shadow-import export before Hub verification, configure credentials in restricted Setup, then let the authenticated provider pull or push create the evidence shown here. No demo orders, sandbox endpoints, fabricated acknowledgements, or manual settlement totals are available in the retail workspace.
      </aside>
    </section>
  );
}
