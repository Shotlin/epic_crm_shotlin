import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { RevenueOpsState } from '../../../src/shared/revenue-ops-contracts';
import type { PosCheckoutE2eFixture } from './retail-checkout-fixture';

const REQUIRED_STATE_NAMESPACES = [
  'kernel',
  'crm',
  'party',
  'crm-depth',
  'revenue-ops-india',
  'retail-workspace-mode',
] as const;

export interface OwnerBootstrapDatabaseProof {
  databasePath: string;
  integrityCheck: string;
  migrationCount: number;
  credentialEmail: string | null;
  bootstrapGuard: {
    workspaceId: string;
    starterMode: string;
    status: string;
  } | null;
  stateNamespaces: string[];
  missingRequiredNamespaces: string[];
}

/**
 * This is independent durability evidence after a graceful desktop shutdown.
 * It does not create or mutate data; the UI action above is the only write.
 */
export function inspectOwnerBootstrapDatabase(
  databasePath: string,
  expectedEmail: string,
): OwnerBootstrapDatabaseProof {
  if (!existsSync(databasePath)) {
    throw new Error(`Expected Electron SQLite database was not created: ${databasePath}`);
  }
  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    readOnly: true,
  });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string;
    };
    const migration = database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
      count: number;
    };
    const credential = database.prepare(
      'SELECT email FROM credentials WHERE email = ? LIMIT 1',
    ).get(expectedEmail) as { email: string } | undefined;
    const guard = database.prepare(
      `SELECT workspace_id, starter_mode, status
       FROM workspace_bootstrap_guards
       WHERE starter_mode = 'clean' AND status = 'provisioned'
       ORDER BY provisioned_at DESC
       LIMIT 1`,
    ).get() as { workspace_id: string; starter_mode: string; status: string } | undefined;
    const rows = database.prepare(
      'SELECT namespace FROM state_documents WHERE namespace IN (?, ?, ?, ?, ?, ?) ORDER BY namespace',
    ).all(...REQUIRED_STATE_NAMESPACES) as Array<{ namespace: string }>;
    const stateNamespaces = rows.map(({ namespace }) => namespace);
    const missingRequiredNamespaces = REQUIRED_STATE_NAMESPACES.filter(
      (namespace) => !stateNamespaces.includes(namespace),
    );

    return {
      databasePath,
      integrityCheck: integrity.integrity_check,
      migrationCount: Number(migration.count),
      credentialEmail: credential?.email ?? null,
      bootstrapGuard: guard
        ? {
            workspaceId: guard.workspace_id,
            starterMode: guard.starter_mode,
            status: guard.status,
          }
        : null,
      stateNamespaces,
      missingRequiredNamespaces,
    };
  } finally {
    database.close();
  }
}

export interface RetailCheckoutDatabaseProof {
  databasePath: string;
  integrityCheck: string;
  sale: {
    id: string;
    number: string;
    cashierId: string;
    status: string;
    subtotal: number;
    grandTotal: number;
    cashTenderAmount: number;
    costTotal: number;
  };
  invoice: {
    id: string;
    status: string;
    amountDue: number;
  };
  paymentReceipt: {
    id: string;
    method: string;
    amount: number;
    reference: string;
    status: string;
  };
  stock: {
    quantity: number;
    available: number;
    inventoryValue: number;
  };
  retailLedger: {
    quantity: number;
    value: number;
    reference: string;
  };
  costJournal: {
    id: string;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
  shift: {
    status: string;
    cashierId: string;
    closedBy?: string;
    variance?: number;
  };
  returnCase: {
    status: string;
    requestedBy: string;
    inspectedBy?: string;
    approvedBy?: string;
    reason: string;
  };
  returnLedger: {
    quantity: number;
    value: number;
    reference: string;
  };
  returnCostJournal: {
    id: string;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
}

function retailState(database: DatabaseSync): RevenueOpsState {
  const row = database.prepare(
    `SELECT payload_json
     FROM state_documents
     WHERE namespace = 'revenue-ops-india'`,
  ).get() as { payload_json: string } | undefined;
  if (!row) throw new Error('Retail checkout evidence is missing its revenue operations state document.');
  return JSON.parse(row.payload_json) as RevenueOpsState;
}

/**
 * Read-only, independent evidence after the renderer has submitted the sale
 * and the packaged process has closed. The fixture only identifies expected
 * records; this function does not call the app's renderer, IPC, or domain
 * checkout implementation.
 */
export function inspectRetailCheckoutDatabase(
  databasePath: string,
  fixture: PosCheckoutE2eFixture,
): RetailCheckoutDatabaseProof {
  if (!existsSync(databasePath)) {
    throw new Error(`Expected Electron SQLite database was not created: ${databasePath}`);
  }
  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    readOnly: true,
  });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string;
    };
    const state = retailState(database);
    if (state.retailSales.length !== 1) {
      throw new Error(`Expected exactly one completed retail sale, found ${state.retailSales.length}.`);
    }
    const sale = state.retailSales[0];
    if (!sale || sale.counterId !== fixture.counterId || sale.status !== 'completed') {
      throw new Error('The expected completed isolated POS sale was not found.');
    }
    const cashTender = sale.tenders.find(({ method }) => method === 'cash');
    if (!cashTender) throw new Error('The completed POS sale is missing cash tender evidence.');
    const invoice = state.invoices.find(({ id }) => id === sale.invoiceId);
    if (!invoice) throw new Error('The completed POS sale is missing its invoice evidence.');
    const paymentReceipt = state.paymentReceipts.find(({ retailSaleId }) => retailSaleId === sale.id);
    if (!paymentReceipt) throw new Error('The completed POS sale is missing its payment receipt evidence.');
    const stock = state.binBalances.find(({ binId, itemVariantId }) =>
      binId === fixture.sellFromBinId && itemVariantId === fixture.itemVariantId,
    );
    if (!stock) throw new Error('The expected counter-bin stock balance was not found.');
    const retailLedger = state.inventoryLedger.find(({ type, reference }) =>
      type === 'retail-sale' && reference === sale.number,
    );
    if (!retailLedger) throw new Error('The completed POS sale is missing its retail inventory ledger evidence.');
    const costJournal = state.journalDrafts.find(({ sourceType, sourceId }) =>
      sourceType === 'retail-sale-cost' && sourceId === sale.id,
    );
    if (!costJournal) throw new Error('The completed POS sale is missing its cost journal evidence.');
    const shift = state.retailCashierShifts.find(({ id }) => id === sale.cashierShiftId);
    if (!shift) throw new Error('The completed POS sale is missing its cashier-shift evidence.');
    if (state.retailReturns.length !== 1) {
      throw new Error(`Expected exactly one packaged counter return, found ${state.retailReturns.length}.`);
    }
    const returnCase = state.retailReturns[0];
    if (!returnCase || returnCase.retailSaleId !== sale.id || returnCase.status !== 'approved') {
      throw new Error('The expected independently approved counter return was not found.');
    }
    const returnLedger = state.inventoryLedger.find(({ type, reference }) => (
      type === 'return' && reference === returnCase.number
    ));
    if (!returnLedger) throw new Error('The approved counter return is missing its physical return ledger evidence.');
    const returnCostJournal = state.journalDrafts.find(({ sourceType, sourceId }) => (
      sourceType === 'retail-return-cost' && sourceId === returnCase.id
    ));
    if (!returnCostJournal) throw new Error('The approved counter return is missing its COGS reversal journal draft.');

    return {
      databasePath,
      integrityCheck: integrity.integrity_check,
      sale: {
        id: sale.id,
        number: sale.number,
        cashierId: sale.cashierId,
        status: sale.status,
        subtotal: sale.subtotal,
        grandTotal: sale.taxPreview.grandTotal,
        cashTenderAmount: cashTender.amount,
        costTotal: sale.costTotal,
      },
      invoice: {
        id: invoice.id,
        status: invoice.status,
        amountDue: invoice.amountDue,
      },
      paymentReceipt: {
        id: paymentReceipt.id,
        method: paymentReceipt.method,
        amount: paymentReceipt.amount,
        reference: paymentReceipt.reference,
        status: paymentReceipt.status,
      },
      stock: {
        quantity: stock.quantity,
        available: stock.available,
        inventoryValue: stock.inventoryValue,
      },
      retailLedger: {
        quantity: retailLedger.quantity,
        value: retailLedger.value,
        reference: retailLedger.reference,
      },
      costJournal: {
        id: costJournal.id,
        totalDebit: costJournal.totalDebit,
        totalCredit: costJournal.totalCredit,
        balanced: costJournal.totalDebit === costJournal.totalCredit,
      },
      shift: {
        status: shift.status,
        cashierId: shift.cashierId,
        closedBy: shift.closedBy,
        variance: shift.variance,
      },
      returnCase: {
        status: returnCase.status,
        requestedBy: returnCase.requestedBy,
        inspectedBy: returnCase.inspectedBy,
        approvedBy: returnCase.approvedBy,
        reason: returnCase.reason,
      },
      returnLedger: {
        quantity: returnLedger.quantity,
        value: returnLedger.value,
        reference: returnLedger.reference,
      },
      returnCostJournal: {
        id: returnCostJournal.id,
        totalDebit: returnCostJournal.totalDebit,
        totalCredit: returnCostJournal.totalCredit,
        balanced: returnCostJournal.totalDebit === returnCostJournal.totalCredit,
      },
    };
  } finally {
    database.close();
  }
}

export interface RetailOfflineRecoveryDatabaseProof {
  databasePath: string;
  integrityCheck: string;
  queue: {
    status: string;
    attempts: number;
    queuedBy: string;
    syncedSaleId?: string;
    payloadChecksum: string;
  };
  journalStatuses: string[];
  sale: {
    id: string;
    number: string;
    status: string;
    cashierId: string;
    grandTotal: number;
  };
  stock: {
    quantity: number;
    available: number;
  };
}

/**
 * Read-only proof for the packaged offline-store recovery journey. It checks
 * the persisted queue and append-only journal rather than trusting a transient
 * renderer notice.
 */
export function inspectRetailOfflineRecoveryDatabase(
  databasePath: string,
  fixture: PosCheckoutE2eFixture,
): RetailOfflineRecoveryDatabaseProof {
  if (!existsSync(databasePath)) {
    throw new Error(`Expected Electron SQLite database was not created: ${databasePath}`);
  }
  const database = new DatabaseSync(databasePath, { allowExtension: false, readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const state = retailState(database);
    if (state.retailOfflineSaleQueue.length !== 1) {
      throw new Error(`Expected exactly one offline queue item, found ${state.retailOfflineSaleQueue.length}.`);
    }
    const queue = state.retailOfflineSaleQueue[0];
    if (!queue || queue.status !== 'synced' || queue.attempts !== 1 || queue.queuedBy !== 'user-avery' || !queue.syncedSaleId) {
      throw new Error('The offline queue item did not reach the governed synced state.');
    }
    const receipts = (state.retailOfflineSyncReceipts ?? []).filter((receipt) => receipt.transactionKey === queue.transactionKey);
    const journalStatuses = receipts.map((receipt) => receipt.status);
    for (const expected of ['queued', 'syncing', 'synced']) {
      if (!journalStatuses.includes(expected)) throw new Error(`Offline recovery journal is missing its ${expected} event.`);
    }
    const sale = state.retailSales.find((candidate) => candidate.id === queue.syncedSaleId);
    if (!sale || sale.status !== 'completed' || sale.cashierId !== 'user-avery' || sale.counterId !== fixture.counterId) {
      throw new Error('The synchronized offline sale is missing completed receipt evidence.');
    }
    const stock = state.binBalances.find(({ binId, itemVariantId }) => binId === fixture.sellFromBinId && itemVariantId === fixture.itemVariantId);
    if (!stock || stock.quantity !== fixture.stockQuantityAfterCheckout || stock.available !== fixture.stockQuantityAfterCheckout) {
      throw new Error('The synchronized offline sale did not reconcile the counter-bin stock balance.');
    }
    return {
      databasePath,
      integrityCheck: integrity.integrity_check,
      queue: {
        status: queue.status,
        attempts: queue.attempts,
        queuedBy: queue.queuedBy,
        syncedSaleId: queue.syncedSaleId,
        payloadChecksum: queue.payloadChecksum,
      },
      journalStatuses,
      sale: {
        id: sale.id,
        number: sale.number,
        status: sale.status,
        cashierId: sale.cashierId,
        grandTotal: sale.taxPreview.grandTotal,
      },
      stock: { quantity: stock.quantity, available: stock.available },
    };
  } finally {
    database.close();
  }
}

export interface RetailOfflineConflictDatabaseProof {
  databasePath: string;
  integrityCheck: string;
  queue: {
    status: string;
    attempts: number;
    queuedBy: string;
    resolvedBy?: string;
    resolutionEvidenceReference?: string;
    conflictReason?: string;
  };
  journalStatuses: string[];
  saleCount: number;
}

/**
 * Read-only proof for a packaged checksum-conflict recovery. A discarded
 * queue item must have an independent actor and evidence while producing no
 * sale, stock movement, payment, or refund side effect.
 */
export function inspectRetailOfflineConflictDatabase(databasePath: string): RetailOfflineConflictDatabaseProof {
  if (!existsSync(databasePath)) {
    throw new Error(`Expected Electron SQLite database was not created: ${databasePath}`);
  }
  const database = new DatabaseSync(databasePath, { allowExtension: false, readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const state = retailState(database);
    if (state.retailOfflineSaleQueue.length !== 1) {
      throw new Error(`Expected exactly one offline queue item, found ${state.retailOfflineSaleQueue.length}.`);
    }
    const queue = state.retailOfflineSaleQueue[0];
    if (!queue || queue.status !== 'discarded' || queue.attempts !== 1 || queue.queuedBy !== 'user-avery' || queue.resolvedBy !== 'user-priya' || queue.resolutionEvidenceReference !== 'POWER-FAIL-STORE-001') {
      throw new Error('The offline conflict did not reach the independently evidenced discarded state.');
    }
    const receipts = (state.retailOfflineSyncReceipts ?? []).filter((receipt) => receipt.transactionKey === queue.transactionKey);
    const journalStatuses = receipts.map((receipt) => receipt.status);
    for (const expected of ['queued', 'syncing', 'conflict', 'discarded']) {
      if (!journalStatuses.includes(expected)) throw new Error(`Offline conflict journal is missing its ${expected} event.`);
    }
    return {
      databasePath,
      integrityCheck: integrity.integrity_check,
      queue: {
        status: queue.status,
        attempts: queue.attempts,
        queuedBy: queue.queuedBy,
        resolvedBy: queue.resolvedBy,
        resolutionEvidenceReference: queue.resolutionEvidenceReference,
        conflictReason: queue.conflictReason,
      },
      journalStatuses,
      saleCount: state.retailSales.length,
    };
  } finally {
    database.close();
  }
}
