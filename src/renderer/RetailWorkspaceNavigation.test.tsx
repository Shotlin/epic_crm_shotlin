import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetailWorkspaceNavigation } from './RetailWorkspaceNavigation';

afterEach(() => cleanup());

describe('RetailWorkspaceNavigation', () => {
  it('shows every retailer task as a labelled, accessible navigation button', () => {
    render(<RetailWorkspaceNavigation activeRoute="home" onNavigate={vi.fn()} />);

    const navigation = screen.getByRole('navigation', { name: 'Retail workspaces' });
    expect(navigation).toBeTruthy();

    for (const label of ['Home', 'Sell', 'Stock', 'Deliver', 'Customers', 'Money', 'Insights', 'Setup']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }

    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-keyshortcuts')).toBe('Alt+1');
    expect(screen.getByRole('button', { name: 'Setup' }).getAttribute('aria-keyshortcuts')).toBe('Alt+8');
  });

  it('sends the exact direct workspace route when an operator chooses a task', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<RetailWorkspaceNavigation activeRoute="home" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Deliver' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0]?.[0]).toMatchObject({
      id: 'deliver',
      label: 'Deliver',
      workbenchId: 'retail-delivery',
      adapter: {
        key: 'deliver',
        target: { kind: 'bharat', workspaceId: 'operations', bharatTab: 'fulfilment' },
      },
    });
  });

  it('keeps selection understandable when a stale route is supplied', () => {
    render(<RetailWorkspaceNavigation activeRoute="legacy-crm" onNavigate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
  });

  it('fails closed when no specialist workspace access is explicitly granted', () => {
    render(<RetailWorkspaceNavigation activeRoute="stock" onNavigate={vi.fn()} onAdvancedNavigate={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Retail extensions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CRM' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finance' })).toBeNull();
  });

  it('keeps submodules in the left rail and exposes only policy-approved specialist workspaces', async () => {
    const user = userEvent.setup();
    const onAdvancedNavigate = vi.fn();
    render(
      <RetailWorkspaceNavigation
        activeRoute="stock"
        onNavigate={vi.fn()}
        onAdvancedNavigate={onAdvancedNavigate}
        advancedWorkspaceIds={['finance', 'settings']}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open Products & variants' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Stock control' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Retail extensions/i }));
    await user.click(screen.getByRole('button', { name: 'Finance' }));
    expect(onAdvancedNavigate).toHaveBeenCalledWith('finance');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'CRM' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Operations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'People' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Service' })).toBeNull();
  });

  it('sends the selected left-rail submodule as a concrete task instead of reopening its parent overview', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onNavigateSubmodule = vi.fn();
    render(<RetailWorkspaceNavigation activeRoute="stock" onNavigate={onNavigate} onNavigateSubmodule={onNavigateSubmodule} />);

    await user.click(screen.getByRole('button', { name: 'Open Purchasing' }));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onNavigateSubmodule).toHaveBeenCalledWith(expect.objectContaining({
      route: expect.objectContaining({ id: 'stock' }),
      submodule: expect.objectContaining({ id: 'purchasing', label: 'Purchasing' }),
    }));
  });

  it('keeps every stacked retail task addressable through the left rail', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onNavigateSubmodule = vi.fn();
    render(<RetailWorkspaceNavigation activeRoute="home" onNavigate={onNavigate} onNavigateSubmodule={onNavigateSubmodule} />);

    const tasks: Array<[string, string, string]> = [
      ['Home', 'Overview', 'overview'], ['Home', 'Attention queue', 'attention'], ['Home', 'Store pulse', 'store-pulse'],
      ['Sell', 'Point of sale', 'pos'], ['Sell', 'Online orders', 'orders'], ['Sell', 'Returns & exchanges', 'returns'], ['Sell', 'Products & pricing', 'pricing'],
      ['Stock', 'Products & variants', 'products'], ['Stock', 'Stock control', 'control'], ['Stock', 'Purchasing', 'purchasing'], ['Stock', 'Replenishment', 'replenishment'],
      ['Deliver', 'Order queue', 'queue'], ['Deliver', 'Delivery control', 'dispatch'], ['Deliver', 'Branch transfers', 'branches'], ['Deliver', 'RTO & returns', 'returns'],
      ['Customers', 'Customer 360', 'customer-360'], ['Customers', 'Loyalty & vouchers', 'loyalty'], ['Customers', 'Campaigns', 'campaigns'], ['Customers', 'Data quality', 'data-quality'],
      ['Money', 'Cash register', 'cash'], ['Money', 'Payments & settlements', 'settlements'], ['Money', 'GST & invoices', 'gst'], ['Money', 'Finance close', 'close'],
      ['Insights', 'Executive dashboard', 'executive'], ['Insights', 'Sales & margin', 'sales-margin'], ['Insights', 'Stock & expiry', 'stock-risk'], ['Insights', 'Outlets & team', 'outlets'],
      ['Setup', 'Stores & users', 'stores'], ['Setup', 'Devices', 'devices'], ['Setup', 'Integrations', 'integrations'], ['Setup', 'Recovery & release', 'recovery'],
    ];

    for (const [routeLabel, submoduleLabel, submoduleId] of tasks) {
      const submoduleButton = screen.queryByRole('button', { name: `Open ${submoduleLabel}` });
      if (!submoduleButton) await user.click(screen.getByRole('button', { name: routeLabel }));
      await user.click(screen.getByRole('button', { name: `Open ${submoduleLabel}` }));
      expect(onNavigateSubmodule).toHaveBeenLastCalledWith(expect.objectContaining({
        route: expect.objectContaining({ label: routeLabel }),
        submodule: expect.objectContaining({ id: submoduleId, label: submoduleLabel }),
      }));
    }
  });

  it('forwards every explicitly granted retail extension and never creates ungranted entries', async () => {
    const user = userEvent.setup();
    const onAdvancedNavigate = vi.fn();
    const allowed = ['command', 'crm', 'sales', 'finance', 'operations', 'people', 'service', 'intelligence', 'settings'] as const;
    const labels = ['Command', 'CRM', 'Sales', 'Finance', 'Operations', 'People', 'Service', 'Intelligence', 'Settings'];
    render(
      <RetailWorkspaceNavigation
        activeRoute="home"
        onNavigate={vi.fn()}
        onAdvancedNavigate={onAdvancedNavigate}
        advancedWorkspaceIds={allowed}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Retail extensions/i }));
    for (const [index, label] of labels.entries()) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(onAdvancedNavigate).toHaveBeenLastCalledWith(allowed[index]);
    }
    expect(screen.queryByRole('button', { name: 'Human resources' })).toBeNull();
  });
});
