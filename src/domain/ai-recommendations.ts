export type AiRecommendationStatus = 'suggested' | 'approved-for-review' | 'dismissed';

export interface AiRecommendation {
  id: string;
  area: 'crm' | 'finance' | 'operations' | 'people' | 'service';
  title: string;
  rationale: string;
  confidence: number;
  generatedBy: string;
  status: AiRecommendationStatus;
  scope: { companyId: string; branchId: string };
}

export function approveRecommendation(recommendation: AiRecommendation, actorId: string): AiRecommendation {
  if (recommendation.generatedBy === actorId || recommendation.status !== 'suggested') return recommendation;
  return { ...recommendation, status: 'approved-for-review' };
}

export function dismissRecommendation(recommendation: AiRecommendation): AiRecommendation {
  if (recommendation.status !== 'suggested') return recommendation;
  return { ...recommendation, status: 'dismissed' };
}

export function filterRecommendations(recommendations: readonly AiRecommendation[], scope: { companyId: string; branchId: string }): AiRecommendation[] {
  return recommendations.filter(({ scope: itemScope }) => itemScope.companyId === scope.companyId && itemScope.branchId === scope.branchId);
}
