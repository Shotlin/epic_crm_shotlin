import type { OperatingRecordScope } from './revenue-ops-contracts';

export type RetailScalePricingBasis = 'per-unit' | 'per-weight';
export type RetailPrinterConnection = 'usb' | 'network' | 'bluetooth' | 'manual';
export type RetailPrinterStatus = 'draft' | 'configured' | 'certified' | 'disabled';
export type RetailLabelDispatchStatus = 'prepared' | 'handed-off' | 'acknowledged' | 'failed';
export type RetailBulkEditStatus = 'prepared' | 'applied' | 'rejected';

export interface RetailScaleProfile {
  id: string;
  itemVariantId: string;
  uomId: string;
  pricingBasis: RetailScalePricingBasis;
  decimalPrecision: number;
  minimumQuantity: number;
  maximumQuantity: number;
  barcodePrefix?: string;
  active: boolean;
  scope?: OperatingRecordScope;
  version: number;
}

export interface RetailPrinterAdapter {
  id: string;
  code: string;
  name: string;
  connection: RetailPrinterConnection;
  model?: string;
  status: RetailPrinterStatus;
  supportedTemplates: Array<'shelf' | 'barcode' | 'price-tag'>;
  lastTestEvidence?: string;
  lastTestedAt?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface RetailLabelPrintDispatch {
  id: string;
  labelPrintRunId: string;
  printerAdapterId: string;
  status: RetailLabelDispatchStatus;
  payloadChecksum: string;
  /** Deterministic ESC/POS bytes awaiting a certified physical adapter. */
  payloadProtocol?: 'escpos-thermal-v1';
  payloadByteLength?: number;
  payloadBase64?: string;
  requestedBy: string;
  requestedAt: string;
  handoffEvidence?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  failureReason?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface RetailBulkEditChange {
  itemId: string;
  categoryId: string;
  brandId?: string;
  rackBinId?: string;
  searchKeywords: string[];
  expectedVersion?: number;
}

export interface RetailCatalogBulkEdit {
  id: string;
  number: string;
  changes: RetailBulkEditChange[];
  checksum: string;
  status: RetailBulkEditStatus;
  requestedBy: string;
  requestedAt: string;
  appliedBy?: string;
  appliedAt?: string;
  decisionEvidence?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailScaleProfileInput { itemVariantId: string; uomId: string; pricingBasis: RetailScalePricingBasis; decimalPrecision: number; minimumQuantity: number; maximumQuantity: number; barcodePrefix?: string; }
export interface CreateRetailPrinterAdapterInput { code: string; name: string; connection: RetailPrinterConnection; model?: string; supportedTemplates: RetailPrinterAdapter['supportedTemplates']; }
export interface TestRetailPrinterAdapterInput { id: string; evidenceReference: string; expectedVersion: number; }
export interface CreateRetailLabelPrintDispatchInput { labelPrintRunId: string; printerAdapterId: string; }
export interface DecideRetailLabelPrintDispatchInput { id: string; decision: 'acknowledged' | 'failed'; evidenceReference: string; expectedVersion: number; }
export interface PrepareRetailCatalogBulkEditInput { changes: RetailBulkEditChange[]; }
export interface ApplyRetailCatalogBulkEditInput { id: string; evidenceReference: string; expectedVersion: number; }
