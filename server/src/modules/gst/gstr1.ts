// GSTR-1 projection + e-way bill helper (docs/05-india-compliance/01-gst.md).
import type { GstBreakdown } from './engine.js';

const EWAY_THRESHOLD = 50000; // ₹50,000 consignment value triggers e-way

export function needsEway(gst: GstBreakdown): boolean {
  return gst.grandTotal >= EWAY_THRESHOLD;
}

export function buildEwayPayload(
  invoice: { name: string; posting_date: string; data: any },
  gst: GstBreakdown,
  transporter?: { id?: string; name?: string; docNo?: string; docDt?: string },
) {
  // EWB v1.0.1 shape (subset). distance is required by IRP; default 0 for manual entry.
  return {
    version: '1.0.1',
    userGstin: '', // filled from company at call time
    supplyType: gst.intraState ? 'O' : 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: invoice.name,
    docDate: invoice.posting_date,
    fromGstin: '', toGstin: '',
    totalValue: gst.grandTotal,
    cgstValue: gst.totalCgst, sgstValue: gst.totalSgst, igstValue: gst.totalIgst,
    taxableAmount: gst.totalTaxable,
    transDistance: 0,
    transporter: transporter || {},
  };
}

// Aggregate submitted invoices into a GSTR-1 B2B/B2C shape for a period.
// `isB2b` resolves whether the buyer is registered (has a GSTIN) — passed by the caller so
// this module stays decoupled from the store.
export function buildGstr1(
  invoices: { data: any; gst?: GstBreakdown }[],
  isB2b: (data: any) => boolean = () => false,
) {
  const b2b: any[] = [];
  const b2c: any[] = [];
  for (const inv of invoices) {
    const g = inv.gst;
    if (!g) continue;
    const line = {
      invNo: inv.data.name, invDt: inv.data.posting_date,
      taxable: g.totalTaxable, cgst: g.totalCgst, sgst: g.totalSgst, igst: g.totalIgst,
      hsn: g.lines.map((l) => l.hsn).join(','),
    };
    if (isB2b(inv.data)) b2b.push(line); else b2c.push(line);
  }
  return { b2b, b2c, periodTotals: { invoices: invoices.length } };
}

// Aggregate submitted credit/debit notes (CDNR) for a period. `origInvNo` resolves the original
// invoice number from the referenced row so the return lines up under the right B2B party.
export function buildCdnr(
  notes: { data: any; gst?: GstBreakdown }[],
  origInvNo: (data: any) => string,
) {
  const cdnr = notes.map((n) => ({
    ntNo: n.data.name,
    ntDt: n.data.posting_date,
    origInvNo: origInvNo(n.data),
    taxable: n.gst?.totalTaxable || 0,
    cgst: n.gst?.totalCgst || 0,
    sgst: n.gst?.totalSgst || 0,
    igst: n.gst?.totalIgst || 0,
  }));
  return { cdnr, periodTotals: { notes: notes.length } };
}
