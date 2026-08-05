import { useState, type ReactNode } from 'react';
import { CheckCircle2, Link2 } from 'lucide-react';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { DecideRetailCommerceCatalogMappingInput } from '../shared/retail-commerce-contracts';

type Props = {
  revenue: RevenueOpsSnapshot;
  busy: boolean;
  activeActorId: string;
  onDecide: (input: DecideRetailCommerceCatalogMappingInput) => Promise<void>;
};

export function RetailCommerceMappingApprovalPanel({ revenue, busy, activeActorId, onDecide }: Props): ReactNode {
  const [evidence, setEvidence] = useState('');
  const pending = revenue.retailCommerceCatalogMappings.filter((mapping) => mapping.status === 'prepared').slice(0, 12);
  if (!pending.length) return null;
  const canDecide = evidence.trim().length >= 4;
  return <section className="retail-returns-workbench__settlement-panel" aria-labelledby="retail-mapping-approval-title">
    <header><div><span><Link2 size={14} aria-hidden="true" /> 09 / Mapping governance</span><h4 id="retail-mapping-approval-title">Approve channel SKU mappings</h4></div><CheckCircle2 size={19} aria-hidden="true" /></header>
    <p className="retail-returns-workbench__settlement-intro">A mapping cannot drive marketplace orders or catalog pushes until a different operator verifies the remote SKU, local variant, GST identity, and connector scope.</p>
    <label>Real approval evidence<input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Reference the provider catalogue and local SKU review" /></label>
    <div className="retail-returns-workbench__history-list">{pending.map((mapping) => <div key={mapping.id}><div><strong>{mapping.remoteSku} · {revenue.itemVariants.find((variant) => variant.id === mapping.itemVariantId)?.sku ?? 'unknown SKU'}</strong><small>{revenue.retailCommerceConnectors.find((connector) => connector.id === mapping.connectorId)?.code ?? 'connector'} · maker {mapping.createdBy}</small></div>{mapping.createdBy === activeActorId ? <em>Awaiting independent reviewer</em> : <><button type="button" disabled={busy || !canDecide} onClick={() => void onDecide({ id: mapping.id, decision: 'approved', evidence: evidence.trim(), expectedVersion: mapping.version })}>Approve mapping</button><button type="button" disabled={busy || !canDecide} onClick={() => void onDecide({ id: mapping.id, decision: 'rejected', evidence: evidence.trim(), expectedVersion: mapping.version })}>Reject mapping</button></>}</div>)}</div>
  </section>;
}
