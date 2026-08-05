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
    };
  } finally {
    database.close();
  }
}
