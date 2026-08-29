import { BrowserWindow, dialog } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RevenueOpsStore } from './revenue-ops-store';
import type { QuoteDocumentReceipt } from '../shared/revenue-ops-contracts';

function html(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function inr(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function quoteHtml(bundle: ReturnType<RevenueOpsStore['getQuoteBundle']>): string {
  const { quote, profile, account, contact } = bundle;
  const lineRows = quote.lines.map((line, index) => `<tr><td>${index + 1}</td><td><strong>${html(line.description)}</strong><small>${html(line.hsnSac)} · ${html(line.quantity)} × ${inr(line.listUnitPrice ?? line.unitPrice)}</small></td><td>${html(line.gstRate)}%</td><td>${inr(line.discountAmount ?? 0)}</td><td>${inr(line.taxableValue)}</td></tr>`).join('');
  const taxLabel = `${quote.taxPreview.treatment === 'intra-state' ? `CGST ${inr(quote.taxPreview.cgst)} + SGST ${inr(quote.taxPreview.sgst)}` : `IGST ${inr(quote.taxPreview.igst)}`}${quote.taxPreview.cess ? ` + Cess ${inr(quote.taxPreview.cess)}` : ''}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; } * { box-sizing: border-box; } body { margin: 0; color: #102b2c; font-family: Arial, sans-serif; font-size: 11px; background: #fff; }
    .page { min-height: 1122px; padding: 42px 46px 36px; position: relative; } .topline { height: 8px; background: linear-gradient(90deg,#d9672b 0 36%,#f0b84b 36% 69%,#1a6d62 69%); position:absolute; inset:0 0 auto; }
    header { display:flex; justify-content:space-between; gap:32px; border-bottom:1px solid #bdd0c9; padding-bottom:22px; } .brand b { display:block; font-size:23px; letter-spacing:-.7px; } .brand span { color:#d9672b; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; }
    .document { text-align:right; } .document h1 { margin:0; font-size:29px; letter-spacing:-1px; } .document p { margin:6px 0 0; color:#526866; }
    .parties { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:24px 0; } .card { border:1px solid #d5e0dc; border-radius:10px; padding:14px; min-height:92px; } .card label { display:block; color:#697b79; font-size:9px; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:8px; } .card strong { display:block; font-size:14px; margin-bottom:4px; }
    .facts { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#d5e0dc; border:1px solid #d5e0dc; border-radius:10px; overflow:hidden; margin-bottom:22px; } .facts div { background:#f6f8f7; padding:12px; } .facts span { display:block; color:#697b79; font-size:9px; text-transform:uppercase; margin-bottom:5px; } .facts b { font-size:11px; }
    table { border-collapse:collapse; width:100%; } th { background:#102b2c; color:white; text-align:left; padding:10px; font-size:9px; letter-spacing:.8px; text-transform:uppercase; } td { border-bottom:1px solid #dde5e2; padding:12px 10px; vertical-align:top; } td:nth-child(1){width:6%} td:nth-child(3){width:10%} td:nth-child(4),td:nth-child(5){width:17%;text-align:right} td small { display:block; color:#697b79; margin-top:4px; }
    .summary { width:46%; margin:20px 0 0 auto; } .summary div { display:flex; justify-content:space-between; padding:7px 4px; border-bottom:1px solid #e1e8e5; } .summary .total { background:#edf4f1; border:0; border-radius:8px; padding:12px; margin-top:6px; font-size:15px; }
    .notice { margin-top:24px; padding:12px 14px; border-left:4px solid #f0b84b; background:#fff8e9; color:#5c5547; line-height:1.5; } footer { position:absolute; left:46px; right:46px; bottom:32px; display:flex; justify-content:space-between; border-top:1px solid #d5e0dc; padding-top:12px; color:#697b79; font-size:9px; }
  </style></head><body><main class="page"><div class="topline"></div><header><div class="brand"><span>Commercial Foundry</span><b>${html(profile.tradeName)}</b><p>${html(profile.legalName)}<br>GSTIN: ${html(profile.gstin || 'Not configured')}</p></div><div class="document"><h1>QUOTATION</h1><p>${html(quote.number)} · Revision ${quote.revisionNumber}<br>${html(quote.status.toUpperCase())}</p></div></header>
  <section class="parties"><div class="card"><label>Prepared for</label><strong>${html(account?.displayName ?? quote.accountId)}</strong><span>${html(account?.legalName ?? '')}</span></div><div class="card"><label>Commercial contact</label><strong>${contact ? `${html(contact.firstName)} ${html(contact.lastName)}` : 'Buying committee'}</strong><span>${html(contact?.email ?? '')}</span></div></section>
  <section class="facts"><div><span>Valid until</span><b>${html(quote.validUntil)}</b></div><div><span>Place of supply</span><b>State code ${html(quote.placeOfSupplyStateCode)}</b></div><div><span>Recipient</span><b>${html(quote.recipientTreatment)}</b></div><div><span>Currency</span><b>INR</b></div></section>
  <table><thead><tr><th>#</th><th>Product / classification</th><th>GST</th><th>Discount</th><th>Taxable</th></tr></thead><tbody>${lineRows}</tbody></table>
  <section class="summary"><div><span>List subtotal</span><b>${inr(quote.subtotal)}</b></div><div><span>Discount</span><b>- ${inr(quote.discountTotal)}</b></div><div><span>${taxLabel}</span><b>${inr(quote.taxPreview.totalTax)}</b></div><div class="total"><span>Grand total</span><b>${inr(quote.taxPreview.grandTotal)}</b></div></section>
  <aside class="notice"><strong>Commercial tax preview</strong><br>This quotation is not a tax invoice. HSN/SAC classification and GST treatment are governed reference data and must be verified for the actual supply before invoicing.</aside>
  <footer><span>Generated by Epic BOS · ${html(profile.tradeName)}</span><span>Pricing as of ${html(quote.pricingAsOf)} · ${html(quote.taxPreview.determination)}</span></footer></main></body></html>`;
}

export class QuotePdfService {
  public async export(parent: BrowserWindow | null, bundle: ReturnType<RevenueOpsStore['getQuoteBundle']>, actorId: string): Promise<QuoteDocumentReceipt | null> {
    const fileName = `${bundle.quote.number}-r${bundle.quote.revisionNumber}.pdf`;
    const result = parent ? await dialog.showSaveDialog(parent, { title: 'Export governed quotation PDF', defaultPath: fileName, filters: [{ name: 'PDF document', extensions: ['pdf'] }] }) : await dialog.showSaveDialog({ title: 'Export governed quotation PDF', defaultPath: fileName, filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
    if (result.canceled || !result.filePath) return null;
    const renderWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    try {
      const encoded = Buffer.from(quoteHtml(bundle), 'utf8').toString('base64');
      await renderWindow.loadURL(`data:text/html;base64,${encoded}`);
      const pdf = await renderWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
      await writeFile(result.filePath, pdf, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
        await writeFile(result.filePath!, pdf);
      });
      return { id: randomUUID(), quoteId: bundle.quote.id, quoteVersion: bundle.quote.version, fileName: path.basename(result.filePath), size: pdf.byteLength, sha256: createHash('sha256').update(pdf).digest('hex'), generatedBy: actorId, generatedAt: new Date().toISOString() };
    } finally {
      renderWindow.destroy();
    }
  }
}
