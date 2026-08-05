import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION,
  type BakalooRetailDemoResetPreview,
} from '../shared/bakaloo-retail-reset-contracts';
import { BakalooRetailDemoResetPanel } from './BakalooRetailDemoResetPanel';

const eligiblePreview: BakalooRetailDemoResetPreview = {
  eligible: true,
  confirmationPhrase: BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION,
  recordGroups: [
    { id: 'crm', label: 'Generic CRM records', count: 10, detail: 'Old USD pipeline and demo customers.' },
    { id: 'revenue', label: 'Generic sales setup', count: 6, detail: 'Old revenue sample and forecast series.' },
  ],
};

afterEach(() => cleanup());

describe('BakalooRetailDemoResetPanel', () => {
  it('renders nothing when the workspace is not positively eligible for the known demo reset', () => {
    const { container } = render(
      <BakalooRetailDemoResetPanel preview={{ ...eligiblePreview, eligible: false, blockedReason: 'A real record is present.' }} busy={false} onApply={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('requires the exact confirmation phrase before it submits the bounded reset request', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<BakalooRetailDemoResetPanel preview={eligiblePreview} busy={false} onApply={onApply} />);

    expect(screen.getByText('Generic CRM records')).toBeTruthy();
    expect(screen.getByText(/sign-in stays in place/i)).toBeTruthy();
    const confirmation = screen.getByLabelText('Type the confirmation phrase');
    const submit = screen.getByRole('button', { name: 'Create clean Bakaloo retail workspace' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.type(confirmation, 'RESET BAKALOO');
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await user.click(submit);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ confirmation: BAKALOO_RETAIL_DEMO_RESET_CONFIRMATION });
  });
});
