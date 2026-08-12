import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../shared/contracts';
import {
  IPC_AUTHORIZATION_POLICY,
  assertIpcAuthorizationPolicyComplete,
  getIpcAuthorizationPolicy,
  requiresRevenueOperationsResponseProjection,
} from './ipc-authorization-policy';

describe('IPC authorization policy manifest', () => {
  it('classifies every declared channel and denies unknown channel names', () => {
    expect(() => assertIpcAuthorizationPolicyComplete()).not.toThrow();
    expect(Object.keys(IPC_AUTHORIZATION_POLICY).sort()).toEqual(
      Object.keys(IPC_CHANNELS).sort(),
    );
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(getIpcAuthorizationPolicy(channel)).toBeTruthy();
    }
    expect(() => getIpcAuthorizationPolicy('epic-bos:unknown:route')).toThrow(/not declared/i);
  });

  it('does not permit a session-only fallback for a declared business route', () => {
    for (const policy of Object.values(IPC_AUTHORIZATION_POLICY)) {
      expect(policy.mode).not.toBe('session');
    }
  });

  it('keeps dynamic attachment channels delegated and explicitly fail-closed by resource', () => {
    const channels = [
      IPC_CHANNELS.storageListAttachments,
      IPC_CHANNELS.storageAddAttachment,
      IPC_CHANNELS.storageExportAttachment,
    ];
    for (const channel of channels) {
      const policy = getIpcAuthorizationPolicy(channel);
      expect(policy.mode).toBe('delegated');
      expect(policy).toHaveProperty('reason');
      expect(policy).not.toHaveProperty('resource');
    }
  });

  it('keeps password changes self-bound to the authenticated session', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.authChangePassword)).toEqual({
      mode: 'delegated',
      reason: 'The authenticated password-change handler is self-bound to the active session token.',
    });
  });

  it('projects every non-trusted Revenue Operations response before it crosses IPC', () => {
    const delegatedRetailPolicy = getIpcAuthorizationPolicy(IPC_CHANNELS.retailCreateExchange);
    expect(delegatedRetailPolicy.mode).toBe('permission');
    expect(
      requiresRevenueOperationsResponseProjection(
        IPC_CHANNELS.retailSyncOfflineQueue,
        delegatedRetailPolicy,
      ),
    ).toBe(true);
    expect(
      requiresRevenueOperationsResponseProjection(
        IPC_CHANNELS.authLogin,
        getIpcAuthorizationPolicy(IPC_CHANNELS.authLogin),
      ),
    ).toBe(false);
  });

  it('promotes restore, certification export, and communication delivery to exact permissions', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.storageListRestoreDrills)).toEqual({
      mode: 'permission', resource: 'kernel.backup', action: 'read', scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.storageRunRestoreDrill)).toEqual({
      mode: 'permission', resource: 'kernel.backup', action: 'admin', scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.integrationExportRetailCertificationPack)).toEqual({
      mode: 'permission', resource: 'release.control', action: 'export', scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthRecordCommunicationDelivery)).toEqual({
      mode: 'permission', resource: 'crm.communication', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailCreateUnifiedOrderPickTasks)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailDecideCommissionPayoutBatch)).toEqual({
      mode: 'permission', resource: 'finance.payables', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailExecuteCommerceSync)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailDecideCommerceConflictResolution)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'revenue-operations-bound',
    });
  });

  it('requires scoped release and GST permissions for high-impact cutover and statutory commands', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsCreateRetailCutoverPlan)).toEqual({
      mode: 'permission',
      resource: 'release.control',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsAdvanceRetailCutover)).toEqual({
      mode: 'permission',
      resource: 'release.control',
      action: 'approve',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsCreateGstRegistration)).toEqual({
      mode: 'permission',
      resource: 'sales.catalog',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsDecidePlaceOfSupplyReview)).toEqual({
      mode: 'permission',
      resource: 'sales.commercial',
      action: 'approve',
      scope: 'revenue-operations-bound',
    });
  });

  it('keeps collections, settlement, and treasury mutations on explicit controls', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.collectionsDecideCreditLimit)).toEqual({
      mode: 'permission', resource: 'finance.credit-limit', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.financeCommitBankStatement)).toEqual({
      mode: 'permission', resource: 'finance.bank-statement-import', action: 'post', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.financeConfirmBankMatch)).toEqual({
      mode: 'permission', resource: 'finance.bank-reconciliation', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.treasuryCreatePaymentProposal)).toEqual({
      mode: 'permission', resource: 'treasury.payment', action: 'submit', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.treasuryReleasePaymentProposal)).toEqual({
      mode: 'permission', resource: 'treasury.payment', action: 'post', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.treasuryResolveSettlementException)).toEqual({
      mode: 'permission', resource: 'treasury.settlement-exception', action: 'approve', scope: 'revenue-operations-bound',
    });
  });

  it('keeps offline and omnichannel order transitions on explicit sales/inventory controls', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailEnqueueOfflineSale)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailSyncHubStoreEdgeQueue)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailSaveHubStoreEdgeSyncPolicy)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailResolveOfflineSale)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailIngestUnifiedOrder)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailPrepareUnifiedOrderHandoff)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailReserveUnifiedOrderStock)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailRecordUnifiedOrderCarrierCallback)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
    });
  });

  it('keeps exchange, inter-branch, and marketplace mutations explicit', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailCreateExchange)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailRecordCreditNotePortalResponse)).toEqual({
      mode: 'permission', resource: 'finance.receivable', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailReceiveInterBranchTransfer)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailExecuteCommercePushBatch)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailTransitionCommerceOrder)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
    });
  });

  it('keeps payroll and workforce approvals explicit', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.payrollCreateRun)).toEqual({
      mode: 'permission', resource: 'payroll.run', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.payrollFinalizeRun)).toEqual({
      mode: 'permission', resource: 'payroll.run', action: 'post', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.payrollReimburseExpense)).toEqual({
      mode: 'permission', resource: 'payroll.expense-claim', action: 'post', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.workforceDecideAttendance)).toEqual({
      mode: 'permission', resource: 'workforce.attendance', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.payrollPublishPayslip)).toEqual({
      mode: 'permission', resource: 'payroll.payslip', action: 'post', scope: 'revenue-operations-bound',
    });
  });

  it('keeps bootstrap routes trusted and canonical finance routes scoped', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.authLogin)).toEqual({ mode: 'trusted' });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.generalLedgerPostJournal)).toEqual({
      mode: 'permission',
      resource: 'finance.journal',
      action: 'post',
      scope: 'ledger-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.generalLedgerPrepareProjectRevenueRecognitionPosting)).toEqual({
      mode: 'permission',
      resource: 'finance.journal',
      action: 'create',
      scope: 'ledger-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.generalLedgerPrepareRetailReturnCostPosting)).toEqual({
      mode: 'permission',
      resource: 'finance.journal',
      action: 'create',
      scope: 'ledger-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.financialCreateBillingClaim)).toEqual({
      mode: 'permission',
      resource: 'finance.journal',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.storageCreateDatabaseBackup)).toEqual({
      mode: 'permission',
      resource: 'kernel.backup',
      action: 'admin',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.kernelTransitionWorkflow)).toEqual({
      mode: 'permission', resource: 'kernel.workflow', action: 'update', scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.kernelDecideApproval)).toEqual({
      mode: 'permission', resource: 'kernel.approval', action: 'approve', scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailWorkspaceApplyDemoReset)).toEqual({
      mode: 'permission',
      resource: 'kernel.tenant',
      action: 'admin',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailWorkspaceGetStatus)).toEqual({
      mode: 'permission',
      resource: 'operations.workspace',
      action: 'read',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.releaseAutoUpdateStatus)).toEqual({
      mode: 'permission',
      resource: 'release.control',
      action: 'read',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmCreateLead)).toEqual({
      mode: 'permission',
      resource: 'crm.opportunity',
      action: 'create',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.partyExecuteMerge)).toEqual({
      mode: 'permission',
      resource: 'crm.party',
      action: 'update',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsDecideQuoteApproval)).toEqual({
      mode: 'permission',
      resource: 'sales.commercial',
      action: 'approve',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsPeopleReadProjection)).toEqual({
      mode: 'permission',
      resource: 'operations.workspace',
      action: 'read',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsIssueInvoice)).toEqual({
      mode: 'permission',
      resource: 'finance.receivable',
      action: 'post',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsApplyUnappliedReceipt)).toEqual({
      mode: 'permission',
      resource: 'finance.receivable',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsCreateDiscountPolicy)).toEqual({
      mode: 'permission',
      resource: 'sales.pricing',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsDecidePriceListApproval)).toEqual({
      mode: 'permission',
      resource: 'sales.pricing',
      action: 'approve',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsCreateTerritory)).toEqual({
      mode: 'permission',
      resource: 'sales.geography',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthUpdatePipeline)).toEqual({
      mode: 'permission',
      resource: 'crm.configuration',
      action: 'update',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthCreateCampaign)).toEqual({
      mode: 'permission',
      resource: 'crm.configuration',
      action: 'create',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsCreateSegment)).toEqual({
      mode: 'permission',
      resource: 'crm.configuration',
      action: 'create',
      scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthPreviewLeadImport)).toEqual({
      mode: 'permission',
      resource: 'crm.import',
      action: 'create',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthCommitImport)).toEqual({
      mode: 'permission',
      resource: 'crm.import',
      action: 'submit',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthConfigureAdapter)).toEqual({
      mode: 'permission',
      resource: 'crm.integration',
      action: 'update',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.crmDepthRecordCommunication)).toEqual({
      mode: 'permission',
      resource: 'crm.communication',
      action: 'create',
      scope: 'active',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.inventoryDecideCycleCount)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.inventoryCreateWarehouse)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.assetDecideManagedAsset)).toEqual({
      mode: 'permission', resource: 'finance.asset-register', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.maintenanceVerifyWorkOrder)).toEqual({
      mode: 'permission', resource: 'maintenance.work-order', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.procurementDecidePo)).toEqual({
      mode: 'permission', resource: 'procurement.purchase-order', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.workforceDecideAvailability)).toEqual({
      mode: 'permission', resource: 'workforce.availability', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsUpdateFulfilmentTask)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailCreateReturnRequest)).toEqual({
      mode: 'permission', resource: 'sales.commercial', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailInspectReturn)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailDecideReturn)).toEqual({
      mode: 'permission', resource: 'inventory.execution', action: 'approve', scope: 'revenue-operations-bound',
    });
  });

  it('keeps catalog import, accounting close creation, and UOM creation behind explicit permissions', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.revenueOpsImportRetailProductPack)).toEqual({
      mode: 'permission', resource: 'sales.catalog', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.financialCreateClosePeriod)).toEqual({
      mode: 'permission', resource: 'finance.period', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.inventoryCreateUom)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
    });
  });

  it('keeps project currency, retainer, margin, and entitlement mutations explicitly scoped', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.financialConsumeEntitlement)).toEqual({
      mode: 'permission', resource: 'finance.entitlement', action: 'update', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.commercialCreateExchangeRate)).toEqual({
      mode: 'permission', resource: 'commercial.currency', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.commercialDecideRetainer)).toEqual({
      mode: 'permission', resource: 'commercial.retainer', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.commercialReviewMargin)).toEqual({
      mode: 'permission', resource: 'commercial.margin', action: 'approve', scope: 'revenue-operations-bound',
    });
  });

  it('binds every permissioned shared operating-state route to its persisted company and branch', () => {
    const prefixes = [
      'epic-bos:revenue-ops:', 'epic-bos:statutory:', 'epic-bos:provider:',
      'epic-bos:collections:', 'epic-bos:finance:', 'epic-bos:procurement:',
      'epic-bos:treasury:', 'epic-bos:manufacturing:', 'epic-bos:delivery:',
      'epic-bos:asset:', 'epic-bos:maintenance:',
      'epic-bos:workforce:', 'epic-bos:payroll:', 'epic-bos:financial:',
      'epic-bos:commercial:', 'epic-bos:inventory:', 'epic-bos:retail:',
    ];

    for (const channel of Object.values(IPC_CHANNELS)) {
      if (!prefixes.some((prefix) => channel.startsWith(prefix))) continue;
      const policy = getIpcAuthorizationPolicy(channel);
      if (policy.mode === 'permission') {
        expect(policy.scope).toBe('revenue-operations-bound');
      }
    }
  });

  it('keeps every COD custody command in its governed physical or finance permission boundary', () => {
    const expected = [
      [IPC_CHANNELS.revenueOpsCreateCodCollectionCase, 'finance.receivable', 'create'],
      [IPC_CHANNELS.revenueOpsRecordCodHandover, 'inventory.execution', 'update'],
      [IPC_CHANNELS.revenueOpsRecordCodCarrierCollection, 'inventory.execution', 'update'],
      [IPC_CHANNELS.financeRecordCodRemittance, 'finance.receivable', 'create'],
      [IPC_CHANNELS.financeMatchCodBank, 'finance.bank-reconciliation', 'approve'],
      [IPC_CHANNELS.financeCloseCodShortfall, 'finance.bank-reconciliation', 'approve'],
      [IPC_CHANNELS.revenueOpsRecordCodException, 'inventory.execution', 'update'],
    ] as const;

    for (const [channel, resource, action] of expected) {
      expect(getIpcAuthorizationPolicy(channel)).toEqual({
        mode: 'permission', resource, action, scope: 'revenue-operations-bound',
      });
    }
  });

  it('keeps device adapter profile changes within the governed inventory-master boundary', () => {
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailPrepareDeviceTransport)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailRecordDeviceTransport)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailExecuteDeviceTransport)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailRetryDeviceTransport)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailPreflightDeviceTransport)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailRecordDevicePreflightEvidence)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailCreateDeviceAdapterProfile)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'create', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailApproveDeviceAdapterProfile)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailRecordDeviceAdapterAcknowledgement)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'approve', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailActivateDeviceAdapterProfile)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'admin', scope: 'revenue-operations-bound',
    });
    expect(getIpcAuthorizationPolicy(IPC_CHANNELS.retailSuspendDeviceAdapterProfile)).toEqual({
      mode: 'permission', resource: 'inventory.master', action: 'admin', scope: 'revenue-operations-bound',
    });
  });
});
