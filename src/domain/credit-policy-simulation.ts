/**
 * credit-policy-simulation.ts
 *
 * Phase R8 – Advanced Credit-Policy Simulation & Multi-Tier Approval Scenario Engine
 *
 * Provides deterministic simulation, stress testing, risk grading, and multi-tier approval
 * workflow evaluation for customer credit limit adjustments and policy controls.
 */

import type { CreditLimitControl, CreditRiskGrade } from '../shared/collections-finance-contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Types & Contracts
// ---------------------------------------------------------------------------

export type SimulationScenarioType = 'conservative' | 'standard' | 'aggressive' | 'custom';

export interface CustomerCreditHistory {
  accountId: string;
  accountName: string;
  lifetimeRevenue: number;
  averageOrderValue: number;
  averageDaysToPay: number;
  onTimePaymentRate: number; // 0 to 100 percentage
  totalDunningCases: number;
  openDisputeAmount: number;
  currentExposure: number;
  existingCreditLimit: number;
  currentRiskGrade: CreditRiskGrade;
}

export interface CreditSimulationParameters {
  targetCreditLimit: number;
  graceDays: number;
  warningThresholdPercent: number;
  blockNewOrders: boolean;
  proposedRiskGrade: CreditRiskGrade;
}

export interface ScenarioSimulationResult {
  scenarioType: SimulationScenarioType;
  proposedCreditLimit: number;
  simulatedGraceDays: number;
  simulatedWarningThresholdPct: number;
  availableHeadroom: number;
  projectedExposure: number;
  projectedUtilizationPct: number;
  expectedLossRatePct: number;
  expectedLossAmount: number;
  workingCapitalRequirement: number;
  riskScore: number; // 0 to 100 (higher = riskier)
  recommendation: 'approve' | 'review' | 'decline';
  rationale: string;
}

export type ApprovalTier = 'auto' | 'manager' | 'finance-director' | 'board';

export interface CreditPolicyApprovalRequirement {
  tierRequired: ApprovalTier;
  approverRoles: string[];
  limitChangePercentage: number;
  riskGradeEscalation: boolean;
  requiresBoardSignoff: boolean;
  policyBreachWarning?: string;
}

// ---------------------------------------------------------------------------
// Domain Functions
// ---------------------------------------------------------------------------

/**
 * Calculates a customer's risk score (0-100) based on credit history and proposed parameters.
 */
export function calculateCustomerRiskScore(
  history: CustomerCreditHistory,
  proposedLimit: number,
): number {
  let score = 50; // base neutral score

  // DSD (Days Sales Outstanding) penalty / reward
  if (history.averageDaysToPay <= 15) score -= 15;
  else if (history.averageDaysToPay <= 30) score -= 5;
  else if (history.averageDaysToPay > 60) score += 20;

  // On-time payment rate
  if (history.onTimePaymentRate >= 95) score -= 15;
  else if (history.onTimePaymentRate >= 80) score -= 5;
  else if (history.onTimePaymentRate < 60) score += 20;

  // Dunning history
  score += Math.min(25, history.totalDunningCases * 5);

  // Open disputes
  if (history.openDisputeAmount > 0) {
    score += Math.min(15, Math.round((history.openDisputeAmount / Math.max(1, proposedLimit)) * 20));
  }

  // Credit expansion factor
  if (history.existingCreditLimit > 0) {
    const expansionRatio = proposedLimit / history.existingCreditLimit;
    if (expansionRatio > 2.0) score += 15;
    else if (expansionRatio > 1.5) score += 8;
  } else if (proposedLimit > 500000) {
    score += 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Simulates a specific credit scenario (conservative, standard, aggressive, or custom).
 */
export function simulateCreditScenario(
  history: CustomerCreditHistory,
  scenarioType: SimulationScenarioType,
  customParams?: CreditSimulationParameters,
): ScenarioSimulationResult {
  let proposedLimit = history.existingCreditLimit;
  let graceDays = 7;
  let warningThresholdPct = 80;

  switch (scenarioType) {
    case 'conservative':
      proposedLimit = round2(Math.max(history.currentExposure, history.averageOrderValue * 2));
      graceDays = 3;
      warningThresholdPct = 70;
      break;
    case 'standard':
      proposedLimit = round2(Math.max(history.existingCreditLimit, history.averageOrderValue * 4));
      graceDays = 7;
      warningThresholdPct = 80;
      break;
    case 'aggressive':
      proposedLimit = round2(Math.max(history.existingCreditLimit * 1.5, history.averageOrderValue * 8));
      graceDays = 15;
      warningThresholdPct = 90;
      break;
    case 'custom':
      if (customParams) {
        proposedLimit = customParams.targetCreditLimit;
      }
      break;
  }

  const riskScore = calculateCustomerRiskScore(history, proposedLimit);
  const availableHeadroom = round2(Math.max(0, proposedLimit - history.currentExposure));
  const projectedExposure = round2(history.currentExposure + Math.min(availableHeadroom * 0.6, history.averageOrderValue * 2));
  const projectedUtilizationPct = proposedLimit > 0 ? round2((projectedExposure / proposedLimit) * 100) : 0;

  // Expected Loss calculation (PD * LGD * EAD)
  const probabilityOfDefaultPct = round2(riskScore * 0.15); // e.g. score 60 -> 9% PD
  const lossGivenDefaultPct = 45; // standard commercial LGD
  const expectedLossRatePct = round2((probabilityOfDefaultPct * lossGivenDefaultPct) / 100);
  const expectedLossAmount = round2((projectedExposure * expectedLossRatePct) / 100);

  // Working capital impact
  const workingCapitalRequirement = round2(projectedExposure * (history.averageDaysToPay / 365));

  let recommendation: 'approve' | 'review' | 'decline' = 'approve';
  let rationale = `Scenario ${scenarioType} yields risk score ${riskScore}/100 with projected headroom ${availableHeadroom}.`;

  if (riskScore > 75 || expectedLossRatePct > 5.0) {
    recommendation = 'decline';
    rationale = `High default risk score (${riskScore}/100) or excessive expected loss rate (${expectedLossRatePct}%).`;
  } else if (riskScore > 50 || proposedLimit > history.existingCreditLimit * 1.5) {
    recommendation = 'review';
    rationale = `Moderate risk score (${riskScore}/100) or significant limit increase requires management signoff.`;
  }

  return {
    scenarioType,
    proposedCreditLimit: proposedLimit,
    simulatedGraceDays: graceDays,
    simulatedWarningThresholdPct: warningThresholdPct,
    availableHeadroom,
    projectedExposure,
    projectedUtilizationPct,
    expectedLossRatePct,
    expectedLossAmount,
    workingCapitalRequirement,
    riskScore,
    recommendation,
    rationale,
  };
}

/**
 * Evaluates the required approval tier for a requested CreditLimitControl change.
 */
export function determineApprovalRequirement(
  currentControl: CreditLimitControl | undefined,
  newControl: CreditLimitControl,
): CreditPolicyApprovalRequirement {
  const currentLimit = currentControl?.creditLimit ?? 0;
  const newLimit = newControl.creditLimit;

  const limitChangePercentage = currentLimit > 0
    ? round2(((newLimit - currentLimit) / currentLimit) * 100)
    : newLimit > 0 ? 100 : 0;

  const riskOrder: Record<CreditRiskGrade, number> = { A: 1, B: 2, C: 3, D: 4, watchlist: 5 };
  const currentGradeValue = currentControl ? riskOrder[currentControl.riskGrade] : 1;
  const newGradeValue = riskOrder[newControl.riskGrade];
  const riskGradeEscalation = newGradeValue > currentGradeValue;

  let tierRequired: ApprovalTier = 'auto';
  const approverRoles: string[] = [];
  let requiresBoardSignoff = false;
  let policyBreachWarning: string | undefined;

  if (newLimit > 5000000 || limitChangePercentage > 200 || newControl.riskGrade === 'watchlist') {
    tierRequired = 'board';
    approverRoles.push('role-finance-director', 'role-executive-board');
    requiresBoardSignoff = true;
    policyBreachWarning = 'Credit limit exceeds ₹50 Lakhs or involves watchlist account; requires Executive Board signoff.';
  } else if (newLimit > 1000000 || limitChangePercentage > 50 || riskGradeEscalation) {
    tierRequired = 'finance-director';
    approverRoles.push('role-finance-director');
  } else if (newLimit > 250000 || limitChangePercentage > 20) {
    tierRequired = 'manager';
    approverRoles.push('role-credit-manager', 'role-finance-approver');
  } else {
    tierRequired = 'auto';
    approverRoles.push('role-credit-analyst');
  }

  return {
    tierRequired,
    approverRoles,
    limitChangePercentage,
    riskGradeEscalation,
    requiresBoardSignoff,
    policyBreachWarning,
  };
}
