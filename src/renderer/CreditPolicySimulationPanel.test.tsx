import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreditPolicySimulationPanel } from './CreditPolicySimulationPanel';

const control = { id: 'control-1', number: 'CL-001', accountId: 'account-1', currency: 'INR' as const, creditLimit: 100000, warningThresholdPercent: 80, graceDays: 7, blockNewOrders: true, riskGrade: 'B' as const, rationale: 'Evidence reviewed', status: 'approved' as const, requestedBy: 'maker', requestedAt: '2026-08-01T00:00:00.000Z', version: 2 };

describe('CreditPolicySimulationPanel', () => {
  it('shows a read-only INR scenario from real receivable evidence', () => {
    render(<CreditPolicySimulationPanel accounts={[{ id: 'account-1', displayName: 'Bakaloo Retail' }]} controls={[control]} receivables={[{ id: 'r-1', invoiceId: 'i-1', accountId: 'account-1', invoiceNumber: 'INV-1', invoiceDate: '2026-07-01', dueDate: '2026-07-15', originalAmount: 80000, adjustmentAmount: 0, paidAmount: 0, outstandingAmount: 80000, status: 'due', version: 1 }]} dunningCases={[]} disputes={[]} />);
    expect(screen.getByRole('heading', { name: /what happens if we change/i })).toBeTruthy();
    expect(screen.getByText(/proposed limit/i)).toBeTruthy();
    expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0);
    expect(screen.getByText(/nothing is submitted or approved/i)).toBeTruthy();
  });

  it('stays empty until governed credit and receivable evidence exists', () => {
    render(<CreditPolicySimulationPanel accounts={[{ id: 'account-1', displayName: 'Bakaloo Retail' }]} controls={[]} receivables={[]} dunningCases={[]} disputes={[]} />);
    expect(screen.getByText(/approve a customer credit control/i)).toBeTruthy();
  });
});
