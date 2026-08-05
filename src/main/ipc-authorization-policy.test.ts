import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../shared/contracts';
import {
  IPC_AUTHORIZATION_POLICY,
  assertIpcAuthorizationPolicyComplete,
  getIpcAuthorizationPolicy,
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
