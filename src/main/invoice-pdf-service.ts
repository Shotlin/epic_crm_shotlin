import { BrowserWindow, dialog } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RevenueOpsStore } from './revenue-ops-store';
import type { InvoiceDocumentReceipt, TaxInvoice } from '../shared/revenue-ops-contracts';

function html(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function inr(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

/**
 * A counter invoice is an atomic retail-sale record, not a synthetic sales
 * order. Keep the document wording aligned with that source of truth while
 * preserving the established sales-order wording for every legacy invoice.
 */
export function invoiceSourceLabel(invoice: Pick<TaxInvoice, 'sourceKind' | 'salesOrderId' | 'retailSaleId'>): string {
  if (invoice.sourceKind === 'retail-sale' || invoice.retailSaleId) {
    return `Retail counter sale ${invoice.retailSaleId ?? 'recorded at point of sale'}`;
  }
  return `Source order ${invoice.salesOrderId ?? ''}`.trimEnd();
}

function invoiceHtml(bundle: ReturnType<RevenueOpsStore['getInvoiceBundle']>): string {
  const { invoice, profile, bankAccount, account, contact, paymentTerm, receivable } = bundle;
  const rows = invoice.lines.map((line, index) => `<tr><td>${index + 1}</td><td><strong>${html(line.description)}</strong><small>${html(line.hsnSac)} · ${html(line.quantity)} × ${inr(line.listUnitPrice ?? line.unitPrice)}</small></td><td>${html(line.gstRate)}%</td><td>${inr(line.taxableValue)}</td></tr>`).join('');
  const taxLabel = invoice.taxPreview.treatment === 'intra-state' ? `CGST ${inr(invoice.taxPreview.cgst)} + SGST ${inr(invoice.taxPreview.sgst)}` : `IGST ${inr(invoice.taxPreview.igst)}`;
  const title = invoice.documentKind === 'tax-invoice' ? 'TAX INVOICE' : 'BILL OF SUPPLY';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#152d32;font-family:Arial,sans-serif;font-size:11px}.page{min-height:1122px;padding:40px 44px 34px;position:relative}.rail{position:absolute;inset:0 auto 0 0;width:10px;background:linear-gradient(#bb522b 0 34%,#e5aa38 34% 66%,#17675f 66%)}
  header{display:flex;justify-content:space-between;gap:28px;border-bottom:2px solid #152d32;padding-bottom:20px}.brand span{color:#bb522b;font-size:9px;font-weight:800;letter-spacing:1.5px}.brand b{display:block;margin-top:7px;font-size:23px}.brand p,.doc p{color:#627577;line-height:1.5}.doc{text-align:right}.doc h1{margin:0;font-size:27px;letter-spacing:-1px}.doc em{display:inline-block;margin-top:8px;padding:5px 7px;color:#17675f;border:1px solid #acd0c4;font-size:9px;font-style:normal;font-weight:800;text-transform:uppercase}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}.card{border:1px solid #d4dfdd;padding:13px;min-height:88px;background:#f6f8f7}.card label,.fact span{display:block;color:#657779;font-size:8px;font-weight:800;letter-spacing:1px;text-transform:uppercase}.card strong{display:block;margin:7px 0 3px;font-size:13px}.card small{color:#657779}.facts{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #d4dfdd;margin-bottom:20px}.fact{padding:10px;border-right:1px solid #d4dfdd}.fact:last-child{border:0}.fact b{display:block;margin-top:5px;font-size:10px}
  table{width:100%;border-collapse:collapse}th{padding:9px;background:#152d32;color:#fff;text-align:left;font-size:8px;letter-spacing:.8px}td{padding:11px 9px;border-bottom:1px solid #dce5e3;vertical-align:top}td:first-child{width:6%}td:nth-child(3){width:12%;text-align:right}td:last-child{width:20%;text-align:right}td small{display:block;margin-top:4px;color:#657779}
  .summary{width:47%;margin:18px 0 0 auto}.summary div{display:flex;justify-content:space-between;padding:7px;border-bottom:1px solid #dce5e3}.summary .total{margin-top:5px;padding:11px;background:#eaf3f0;border:0;font-size:14px}.export-proof{margin:16px 0 0;padding:12px 14px;border:2px solid #17675f;background:#edf5f2;text-align:center}.export-proof strong{display:block;color:#17675f;font-size:10px;letter-spacing:.5px}.export-proof small{display:block;margin-top:6px;color:#526967}.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}.notice{padding:11px 13px;border-left:4px solid #e5aa38;background:#fff8e8;color:#5d594d;line-height:1.45}.notice strong{display:block;color:#152d32}.irp{padding:11px 13px;border-left:4px solid #17675f;background:#edf5f2;line-height:1.45}.irp strong{display:block}.due{margin-top:18px;padding:12px 14px;background:#152d32;color:#fff;display:flex;justify-content:space-between;align-items:center}.due span{color:#b9c8c7;font-size:9px}.due b{font-size:17px}
  .bank{margin-top:16px;padding:12px 14px;border:1px solid #d4dfdd;background:#f6f8f7}.bank strong{display:block;color:#17675f;font-size:9px;letter-spacing:.8px;text-transform:uppercase}.bank small{display:block;margin-top:5px;color:#526967}
  footer{position:absolute;left:44px;right:44px;bottom:28px;padding-top:10px;border-top:1px solid #d4dfdd;display:flex;justify-content:space-between;color:#657779;font-size:8px}
  </style></head><body><main class="page"><div class="rail"></div><header><div class="brand"><span>REVENUE LEDGER</span><b>${html(profile.tradeName)}</b><p>${html(profile.legalName)}<br>GSTIN: ${html(profile.gstin || 'Not registered')}</p></div><div class="doc"><h1>${title}</h1><p>${html(invoice.number)}<br>Issued ${html(invoice.invoiceDate)}</p><em>${html(invoice.status)}</em></div></header>
  <section class="parties"><div class="card"><label>Bill to</label><strong>${html(account?.displayName ?? invoice.accountId)}</strong><small>${html(account?.legalName ?? '')}<br>GSTIN: ${html(invoice.recipientGstin || 'Unregistered')}</small></div><div class="card"><label>Commercial contact</label><strong>${contact ? `${html(contact.firstName)} ${html(contact.lastName)}` : 'Accounts payable'}</strong><small>${html(contact?.email ?? '')}</small></div></section>
  <section class="facts"><div class="fact"><span>Invoice date</span><b>${html(invoice.invoiceDate)}</b></div><div class="fact"><span>Due date</span><b>${html(invoice.dueDate)}</b></div><div class="fact"><span>Place of supply</span><b>State ${html(invoice.placeOfSupplyStateCode)}</b></div><div class="fact"><span>Payment terms</span><b>${html(paymentTerm?.name)}</b></div><div class="fact"><span>Reverse charge</span><b>${invoice.reverseCharge ? 'Yes' : 'No'}</b></div></section>
  ${invoice.exportEndorsement ? `<section class="export-proof"><strong>${html(invoice.exportEndorsement)}</strong><small>Destination ${html(invoice.destinationCountryCode ?? 'SEZ')} ${invoice.lutBondNumber ? ` · LUT/Bond ${html(invoice.lutBondNumber)}` : ' · IGST-paid route'}</small></section>` : ''}
  <table><thead><tr><th>#</th><th>Description / classification</th><th>GST</th><th>Taxable value</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="summary"><div><span>List subtotal</span><b>${inr(invoice.subtotal)}</b></div><div><span>Discount</span><b>- ${inr(invoice.discountTotal)}</b></div><div><span>${taxLabel}</span><b>${inr(invoice.taxPreview.totalTax)}</b></div><div class="total"><span>Invoice total</span><b>${inr(invoice.taxPreview.grandTotal)}</b></div></section>
  <section class="bank"><strong>Payment instructions</strong><small>${bankAccount ? `${html(bankAccount.name)} · ${html(bankAccount.bankName)} · A/C ${html(bankAccount.maskedAccountNumber)} · IFSC ${html(bankAccount.ifsc)}` : 'No primary bank account is configured for this branch. Confirm payment instructions through an authorized finance channel.'}</small></section>
  <div class="due"><span>Outstanding as generated</span><b>${inr(receivable?.outstandingAmount ?? invoice.amountDue)}</b></div>
  <section class="status-grid"><div class="notice"><strong>Document boundary</strong>This document was generated by Epic BOS. Applicable GST classification, place of supply, reverse charge and filing obligations require current-rule review.</div><div class="irp"><strong>IRP status: ${html(invoice.irpStatus)}</strong>${invoice.irn ? `IRN ${html(invoice.irn)}` : 'No IRN is represented unless an authorized IRP acknowledgement is recorded.'}</div></section>
  <footer><span>${html(invoice.number)} · ${html(invoiceSourceLabel(invoice))}</span><span>Currency INR · ${html(invoice.taxPreview.treatment)}</span></footer></main></body></html>`;
}

export class InvoicePdfService {
  public async export(parent: BrowserWindow | null, bundle: ReturnType<RevenueOpsStore['getInvoiceBundle']>, actorId: string): Promise<InvoiceDocumentReceipt | null> {
    if (bundle.invoice.status === 'draft') throw new Error('Issue the invoice before exporting its statutory document.');
    const fileName = `${bundle.invoice.number}.pdf`;
    const result = parent ? await dialog.showSaveDialog(parent, { title: 'Export invoice PDF', defaultPath: fileName, filters: [{ name: 'PDF document', extensions: ['pdf'] }] }) : await dialog.showSaveDialog({ title: 'Export invoice PDF', defaultPath: fileName, filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) return null;
    const renderWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    try {
      await renderWindow.loadURL(`data:text/html;base64,${Buffer.from(invoiceHtml(bundle), 'utf8').toString('base64')}`);
      const pdf = await renderWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
      await writeFile(result.filePath, pdf, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; await writeFile(result.filePath!, pdf); });
      return { id: randomUUID(), invoiceId: bundle.invoice.id, invoiceVersion: bundle.invoice.version, fileName: path.basename(result.filePath), size: pdf.byteLength, sha256: createHash('sha256').update(pdf).digest('hex'), generatedBy: actorId, generatedAt: new Date().toISOString() };
    } finally {
      renderWindow.destroy();
    }
  }
}
