/**
 * credit-policy-simulation.test.ts
 *
 * Unit tests for credit policy simulation and approval scenario engine.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCustomerRiskScore,
  simulateCreditScenario,
  determineApprovalRequirement,
  type CustomerCreditHistory,
} from './credit-policy-simulation';
import type { CreditLimitControl } from '../shared/collections-finance-contracts';

const mockHistory: CustomerCreditHistory = {
  accountId: 'acc-101',
  accountName: 'Reliable Retail Pvt Ltd',
  lifetimeRevenue: 2500000,
  averageOrderValue: 120000,
  averageDaysToPay: 22,
  onTimePaymentRate: 92,
  totalDunningCases: 0,
  openDisputeAmount: 0,
  currentExposure: 150000,
  existingCreditLimit: 300000,
  currentRiskGrade: 'B',
};

describe('credit-policy-simulation domain', () => {
  it('calculates customer risk score accurately for low-risk account', () => {
    const score = calculateCustomerRiskScore(mockHistory, 400000);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeLessThan(50); // Good payment history should lower score
  });

  it('increases risk score for high DSD and dunning cases', () => {
    const riskyHistory: CustomerCreditHistory = {
      ...mockHistory,
      averageDaysToPay: 75,
      onTimePaymentRate: 45,
      totalDunningCases: 3,
      openDisputeAmount: 100000,
    };
    const score = calculateCustomerRiskScore(riskyHistory, 600000);
    expect(score).toBeGreaterThan(60);
  });

  it('simulates conservative, standard, and aggressive scenarios', () => {
    const conservative = simulateCreditScenario(mockHistory, 'conservative');
    const standard = simulateCreditScenario(mockHistory, 'standard');
    const aggressive = simulateCreditScenario(mockHistory, 'aggressive');

    expect(conservative.proposedCreditLimit).toBeLessThanOrEqual(standard.proposedCreditLimit);
    expect(standard.proposedCreditLimit).toBeLessThanOrEqual(aggressive.proposedCreditLimit);

    expect(conservative.recommendation).toBe('approve');
    expect(standard.workingCapitalRequirement).toBeGreaterThan(0);
  });

  it('determines approval tier based on limit change and risk grade', () => {
    const currentControl: CreditLimitControl = {
      id: 'cl-1',
      number: 'CL-001',
      accountId: 'acc-101',
      currency: 'INR',
      creditLimit: 200000,
      warningThresholdPercent: 80,
      graceDays: 7,
      blockNewOrders: false,
      riskGrade: 'B',
      rationale: 'Initial limit',
      status: 'approved',
      requestedBy: 'user-1',
      requestedAt: '2025-01-01T00:00:00Z',
      version: 1,
    };

    // Small increase -> auto or manager
    const smallIncrease: CreditLimitControl = {
      ...currentControl,
      creditLimit: 220000,
    };
    const smallReq = determineApprovalRequirement(currentControl, smallIncrease);
    expect(smallReq.tierRequired).toBe('auto');

    // Large increase -> director or board
    const largeIncrease: CreditLimitControl = {
      ...currentControl,
      creditLimit: 6000000,
      riskGrade: 'watchlist',
    };
    const largeReq = determineApprovalRequirement(currentControl, largeIncrease);
    expect(largeReq.tierRequired).toBe('board');
    expect(largeReq.requiresBoardSignoff).toBe(true);
  });
});
