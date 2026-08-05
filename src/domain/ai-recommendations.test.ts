import { describe, expect, it } from 'vitest';
import { approveRecommendation, dismissRecommendation, filterRecommendations, type AiRecommendation } from './ai-recommendations';

const recommendation: AiRecommendation = { id: 'ai-1', area: 'finance', title: 'Review overdue receivable', rationale: 'A high-value invoice crossed the dunning threshold.', confidence: 0.91, generatedBy: 'ai-copilot', status: 'suggested', scope: { companyId: 'c1', branchId: 'b1' } };

describe('governed AI recommendations', () => {
  it('requires an independent human before approving for review', () => {
    expect(approveRecommendation(recommendation, 'ai-copilot').status).toBe('suggested');
    expect(approveRecommendation(recommendation, 'finance-approver').status).toBe('approved-for-review');
  });

  it('dismisses only suggested recommendations and filters by scope', () => {
    expect(dismissRecommendation(recommendation).status).toBe('dismissed');
    expect(dismissRecommendation({ ...recommendation, status: 'approved-for-review' }).status).toBe('approved-for-review');
    expect(filterRecommendations([recommendation, { ...recommendation, id: 'ai-other', scope: { companyId: 'c2', branchId: 'b2' } }], { companyId: 'c1', branchId: 'b1' })).toHaveLength(1);
  });
});
