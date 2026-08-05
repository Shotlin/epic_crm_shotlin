import { describe, expect, it } from 'vitest';
import net from 'node:net';
import type { PartySnapshot } from '../shared/party-contracts';
import { BusinessDatabase } from './database';
import type { CrmDepthStore } from './crm-depth-store';
import type { CrmStore } from './crm-store';
import type { KernelStore } from './kernel-store';
import type { ProviderGatewayService } from './provider-gateway-service';
import { RevenueOpsStore } from './revenue-ops-store';
import type { StatutoryGatewayService } from './statutory-gateway-service';

function createStore(database: BusinessDatabase): RevenueOpsStore {
  const party = { accounts: [], contacts: [], addresses: [] } as unknown as PartySnapshot;
  return new RevenueOpsStore(
    database,
    { getSnapshot: () => ({ opportunities: [] }) } as unknown as CrmStore,
    { getSnapshot: () => party } as unknown as import('./party-store').PartyStore,
    { getSnapshot: () => ({ users: [] }) } as unknown as KernelStore,
    {} as CrmDepthStore,
    {} as StatutoryGatewayService,
    {} as ProviderGatewayService,
  );
}

async function startDeviceServer(): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer((socket) => {
    socket.once('data', () => socket.end('OK'));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    throw new Error('Device test server did not receive a TCP port.');
  }
  return { server, port: address.port };
}

async function stopDeviceServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe('retail device adapter profile store boundary', () => {
  it('persists an independently approved, non-operational profile without inventing physical-device success', async () => {
    const database = new BusinessDatabase(':memory:');
    await database.initialize();
    try {
      const store = createStore(database);
      await store.initialize();
      const draft = await store.createRetailDeviceAdapterProfile({
        code: 'SCALE-MANUAL-01',
        name: 'Counter weighing scale',
        kind: 'weighing-scale',
        deviceCode: 'SCALE-01',
        connection: 'manual',
        driver: { code: 'SCALE-MANUAL-PROCEDURE', version: '1.0.0', boundary: 'manual-evidence-only' },
        capabilities: ['weight-read', 'status-read'],
        configuration: { connection: 'manual', procedureReference: 'SCALE-CHECKLIST-001' },
      }, 'maker-1');
      const profile = draft.retailDeviceAdapterProfiles.find((candidate) => candidate.code === 'SCALE-MANUAL-01');
      expect(profile).toMatchObject({ status: 'draft', driver: { boundary: 'manual-evidence-only' } });

      const approved = await store.approveRetailDeviceAdapterProfile({ id: profile!.id, evidenceReference: 'SCALE-PROFILE-APPROVAL-001', expectedVersion: profile!.version }, 'approver-1');
      expect(approved.retailDeviceAdapterProfiles.find((candidate) => candidate.id === profile!.id)).toMatchObject({ status: 'approved', approvedBy: 'approver-1' });

      const reopened = createStore(database);
      await reopened.initialize();
      expect(reopened.getSnapshot().retailDeviceAdapterProfiles.find((candidate) => candidate.id === profile!.id)).toMatchObject({
        status: 'approved',
        deviceCode: 'SCALE-01',
        configuration: { connection: 'manual', procedureReference: 'SCALE-CHECKLIST-001' },
      });
    } finally {
      database.close();
    }
  });

  it('executes a later command through an operational profile only at its reviewed TCP endpoint', async () => {
    const database = new BusinessDatabase(':memory:');
    const { server, port } = await startDeviceServer();
    await database.initialize();
    try {
      const store = createStore(database);
      await store.initialize();
      const draft = await store.createRetailDeviceAdapterProfile({
        code: 'PRINTER-TCP-OP-01',
        name: 'Operational receipt printer',
        kind: 'escpos-printer',
        deviceCode: 'RECEIPT-OP-01',
        connection: 'network',
        driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
        capabilities: ['receipt-print', 'status-read'],
        configuration: { connection: 'network', host: '127.0.0.1', port },
      }, 'maker-1');
      const profile = draft.retailDeviceAdapterProfiles.find((candidate) => candidate.code === 'PRINTER-TCP-OP-01')!;
      const approved = await store.approveRetailDeviceAdapterProfile({ id: profile.id, evidenceReference: 'PRINTER-PROFILE-APPROVAL-001', expectedVersion: profile.version }, 'approver-1');
      const approvedProfile = approved.retailDeviceAdapterProfiles.find((candidate) => candidate.id === profile.id)!;
      const initialPrepared = await store.prepareRetailDeviceTransport({ profileId: profile.id, kind: 'escpos-printer', deviceCode: 'RECEIPT-OP-01', connection: 'network', command: 'print', payload: 'INITIAL-RECEIPT' }, 'operator-1');
      const initialCommand = initialPrepared.retailDeviceTransportEvidence.find((candidate) => candidate.status === 'prepared')!;
      const initialAcknowledged = await store.executeRetailDeviceTransport({ id: initialCommand.id, host: '127.0.0.1', port, payload: 'INITIAL-RECEIPT', expectedVersion: initialCommand.version }, 'witness-1');
      const acknowledgement = initialAcknowledged.retailDeviceTransportEvidence.find((candidate) => candidate.id === initialCommand.id)!;
      const certified = await store.recordRetailDeviceAdapterAcknowledgement({ id: profile.id, deviceAcknowledgementId: acknowledgement.id, evidenceReference: 'PRINTER-ACK-001', expectedVersion: approvedProfile.version }, 'certifier-1');
      const acknowledgedProfile = certified.retailDeviceAdapterProfiles.find((candidate) => candidate.id === profile.id)!;
      const active = await store.activateRetailDeviceAdapterProfile({ id: profile.id, expectedVersion: acknowledgedProfile.version }, 'release-1');
      expect(active.retailDeviceAdapterProfiles.find((candidate) => candidate.id === profile.id)).toMatchObject({ status: 'operational' });

      const followUpPrepared = await store.prepareRetailDeviceTransport({ profileId: profile.id, kind: 'escpos-printer', deviceCode: 'RECEIPT-OP-01', connection: 'network', command: 'print', payload: 'FOLLOW-UP-RECEIPT' }, 'operator-1');
      const followUp = followUpPrepared.retailDeviceTransportEvidence.find((candidate) => candidate.status === 'prepared')!;
      const result = await store.executeRetailDeviceTransport({ id: followUp.id, host: '127.0.0.1', port, payload: 'FOLLOW-UP-RECEIPT', expectedVersion: followUp.version }, 'witness-1');

      expect(result.retailDeviceTransportEvidence.find((candidate) => candidate.id === followUp.id)).toMatchObject({
        status: 'acknowledged',
        acknowledgementSource: 'network-tcp-execution',
        profileId: profile.id,
      });
    } finally {
      await stopDeviceServer(server);
      database.close();
    }
  });
});
