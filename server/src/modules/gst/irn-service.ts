// E-invoice / e-way / IMS orchestration service (docs/05-india-compliance/01-gst.md).
// This is the actual compliance moat: it ties the posting engine to the GSP so every submitted
// invoice can get an IRN, an e-way bill, and feed 2A/2B matching via IMS — without re-implementing
// tax math (that stays in engine.ts; statutory and deterministic).
import { randomUUID } from 'node:crypto';
import { store } from '../../kernel/store.js';
import { getGsp, company } from '../../integrations/gsp/index.js';
import { buildEinvoicePayload } from './einvoice.js';
import { buildEwayPayload, needsEway } from './gstr1.js';
import { audit } from '../../kernel/audit.js';
import { publish } from '../../kernel/event-bus.js';
import type { EntityRow, InwardSupply, ImsAction } from '../../kernel/types.js';

const INVOICE_ENTITIES = new Set(['sales_invoice', 'pos_invoice']);

function einvoiceArgs(tenant: string, row: EntityRow) {
  const comp = company();
  const gst = row.data.__gst;
  let party: any = { name: 'Walk-in Customer', pos: comp.state };
  if (row.entity === 'sales_invoice' && row.data.customer) {
    const p = store.getRow(tenant, row.data.customer);
    party = {
      name: p?.data?.name || 'Customer',
      gstin: p?.data?.gstin,
      addr: p?.data?.addr,
      state: p?.data?.state,
      pos: row.data.place_of_supply,
    };
  }
  const payload = buildEinvoicePayload({ name: row.data.name, posting_date: row.data.posting_date, data: row.data }, comp, party, gst);
  return { payload, comp };
}

export async function generateIrnForInvoice(tenant: string, id: string) {
  const row = store.getRow(tenant, id);
  if (!row || !INVOICE_ENTITIES.has(row.entity)) throw new Error('not an invoice');
  if (row.status !== 'Submitted') throw new Error('invoice must be submitted first');
  if (!row.data.__gst) throw new Error('no GST computed (post the invoice)');
  if (row.data.__einvoice?.status === 'GENERATED') return row.data.__einvoice;

  const { payload, comp } = einvoiceArgs(tenant, row);
  const res = await getGsp().generateIrn(payload, comp);
  row.data.__einvoice = res;
  row.data.einvoice_status = 'GENERATED';
  store.updateRow(row);
  audit(tenant, 'system', 'gst:einvoice-generated', { entity: row.entity, row_id: id, after: { irn: res.irn } });
  publish(tenant, `${row.entity}.einvoice.generated.v1`, { id, irn: res.irn });
  return res;
}

export async function cancelIrnForInvoice(tenant: string, id: string, reason: string) {
  const row = store.getRow(tenant, id);
  if (!row?.data.__einvoice?.irn) throw new Error('no IRN to cancel');
  const r = await getGsp().cancelIrn(row.data.__einvoice.irn, reason || 'Data entry mistake');
  row.data.__einvoice.status = 'CANCELLED';
  row.data.einvoice_status = 'CANCELLED';
  store.updateRow(row);
  audit(tenant, 'system', 'gst:einvoice-cancelled', { entity: row.entity, row_id: id, after: { irn: row.data.__einvoice.irn } });
  return r;
}

export async function generateEwbForInvoice(tenant: string, id: string, transporter?: any) {
  const row = store.getRow(tenant, id);
  if (!row || !INVOICE_ENTITIES.has(row.entity)) throw new Error('not an invoice');
  const gst = row.data.__gst;
  if (!gst) throw new Error('no GST computed');
  if (!needsEway(gst)) throw new Error('e-way bill not required (below ₹50,000)');
  const { comp } = einvoiceArgs(tenant, row);
  const payload = buildEwayPayload({ name: row.data.name, posting_date: row.data.posting_date, data: row.data }, gst, transporter);
  (payload as any).userGstin = comp.gstin;
  const res = await getGsp().generateEwb(payload, comp);
  row.data.__eway = res;
  store.updateRow(row);
  audit(tenant, 'system', 'gst:eway-generated', { entity: row.entity, row_id: id, after: { ewbNo: res.ewbNo } });
  return res;
}

export async function getImsSupplies(tenant: string, period = currentPeriod()) {
  const remote = await getGsp().getInwardSupplies(period);
  const actions = store.imsOf(tenant);
  const byIrn = new Map(actions.map((a) => [a.irn, a]));
  const merged: InwardSupply[] = remote.map((s) => {
    const a = byIrn.get(s.irn);
    return a ? { ...s, status: a.action === 'ACC' ? 'ACCEPTED' : a.action === 'REJ' ? 'REJECTED' : 'PENDING' } : s;
  });
  return { period, supplies: merged };
}

export async function recordImsAction(
  tenant: string, irn: string, action: 'ACC' | 'REJ' | 'PEN', reason: string | undefined, actor: string,
) {
  const r = await getGsp().pushImsAction(irn, action, reason);
  const entry: ImsAction = {
    id: randomUUID(), tenant, irn, action, reason, actor, ts: new Date().toISOString(),
  };
  store.appendIms(entry);
  audit(tenant, actor, 'gst:ims-action', { after: { irn, action, reason } });
  return { ok: r.ok, entry };
}

function currentPeriod(): string {
  const d = new Date();
  return `${String(d.getFullYear() % 100).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
