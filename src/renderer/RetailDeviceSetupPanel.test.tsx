import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RetailDeviceAdapterProfile } from '../shared/retail-device-profile-contracts';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { RetailDeviceSetupPanel } from './RetailDeviceSetupPanel';

const generatedAt = '2026-08-02T12:00:00.000Z';

function revenueWithProfiles(profiles: RetailDeviceAdapterProfile[] = []): RevenueOpsSnapshot {
  const state = createInitialRevenueOpsState();
  state.retailDeviceAdapterProfiles = profiles;
  return getRevenueOpsSnapshot(state, {
    opportunities: [],
    accounts: [],
    contacts: [],
    addresses: [],
    activeUserIds: [],
  }, generatedAt);
}

function renderPanel(revenue = revenueWithProfiles()) {
  return render(
    <RetailDeviceSetupPanel
      revenue={revenue}
      activeActorId="maker-1"
      busy={false}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onApprove={vi.fn().mockResolvedValue(undefined)}
      onPrepare={vi.fn().mockResolvedValue(undefined)}
      onRecordAcknowledgement={vi.fn().mockResolvedValue(undefined)}
      onActivate={vi.fn().mockResolvedValue(undefined)}
      onSuspend={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

afterEach(() => cleanup());

describe('RetailDeviceSetupPanel', () => {
  it('uses one plain setup form and keeps a new device clearly non-operational', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <RetailDeviceSetupPanel
        revenue={revenueWithProfiles()}
        activeActorId="maker-1"
        busy={false}
        onCreate={onCreate}
        onApprove={vi.fn().mockResolvedValue(undefined)}
        onPrepare={vi.fn().mockResolvedValue(undefined)}
        onRecordAcknowledgement={vi.fn().mockResolvedValue(undefined)}
        onActivate={vi.fn().mockResolvedValue(undefined)}
        onSuspend={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/No device setup saved yet/i)).toBeTruthy();
    expect(screen.getByText(/does not install a USB or Bluetooth driver/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Device type'), 'escpos-printer');
    await user.selectOptions(screen.getByLabelText('Connection'), 'network');
    await user.type(screen.getByLabelText('Setup code'), 'PRINTER-TCP-01');
    await user.type(screen.getByLabelText('Device name'), 'Counter receipt printer');
    await user.type(screen.getByLabelText('Device code'), 'RECEIPT-01');
    await user.type(screen.getByLabelText('Driver code'), 'GENERIC-ESC-POS-TCP');
    await user.clear(screen.getByLabelText('Driver version'));
    await user.type(screen.getByLabelText('Driver version'), '1.0.0');
    await user.type(screen.getByLabelText('Network host'), '192.168.10.42');
    await user.clear(screen.getByLabelText('Network port'));
    await user.type(screen.getByLabelText('Network port'), '9100');
    await user.click(screen.getByRole('button', { name: 'Save device setup' }));

    expect(onCreate).toHaveBeenCalledWith({
      code: 'PRINTER-TCP-01',
      name: 'Counter receipt printer',
      kind: 'escpos-printer',
      deviceCode: 'RECEIPT-01',
      connection: 'network',
      driver: { code: 'GENERIC-ESC-POS-TCP', version: '1.0.0', boundary: 'network-tcp-boundary' },
      capabilities: ['receipt-print', 'status-read'],
      configuration: { connection: 'network', host: '192.168.10.42', port: 9100 },
    });
  });

  it('shows USB as a diagnostic-only boundary instead of a live device claim', () => {
    const profile: RetailDeviceAdapterProfile = {
      id: 'device-profile-usb-1',
      code: 'SCAN-USB-01',
      name: 'Counter scanner',
      kind: 'barcode-scanner',
      deviceCode: 'SCAN-01',
      connection: 'usb',
      driver: { code: 'GENERIC-SCANNER', version: '1.0.0', boundary: 'web-serial-diagnostic-only' },
      capabilities: ['barcode-input', 'status-read'],
      configuration: { connection: 'usb', vendorId: '1A2B', productId: '3C4D', baudRate: 9600 },
      configurationChecksum: 'a'.repeat(64),
      status: 'acknowledged',
      createdBy: 'maker-1',
      createdAt: generatedAt,
      scope: { companyId: 'company-northstar-us', branchId: 'branch-northstar-hq' },
      version: 3,
    };

    renderPanel(revenueWithProfiles([profile]));

    expect(screen.getByText('Counter scanner')).toBeTruthy();
    expect(screen.getByText(/USB diagnostic only/i)).toBeTruthy();
    expect(screen.getByText(/cannot be marked live until a real native driver/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enable device' })).toBeNull();
  });
});
