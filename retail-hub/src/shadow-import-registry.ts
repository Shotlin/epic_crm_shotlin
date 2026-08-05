import type { ShadowImportPlan } from './shadow-import';

/**
 * Persistence seam for reviewed shadow-import evidence. The first adapter is
 * deliberately in-memory so the read-only Hub can be exercised without
 * silently creating a database, network connection, or live-source writer.
 * PostgreSQL can implement this interface later without changing routes.
 */
export interface ShadowImportRegistry {
  listPlans(): readonly ShadowImportPlan[];
  getPlan(batchId: string): ShadowImportPlan | undefined;
  /** Immutable server-side registration; existing evidence cannot be replaced. */
  registerPlan(plan: ShadowImportPlan): void;
  /** Internal ingestion seam; HTTP routes never expose this mutation. */
  replacePlan(plan: ShadowImportPlan): void;
}

export function createShadowImportRegistry(
  initialPlans: readonly ShadowImportPlan[] = [],
): ShadowImportRegistry {
  const plans = new Map<string, ShadowImportPlan>();
  initialPlans.forEach((plan) => {
    const batchId = plan.batch.id.trim();
    if (plans.has(batchId)) throw new Error(`Duplicate shadow-import batch id: ${batchId}`);
    insertPlan(plans, plan);
  });

  return {
    listPlans: () => [...plans.values()].map(clone),
    getPlan: (batchId) => {
      const plan = plans.get(batchId);
      return plan === undefined ? undefined : clone(plan);
    },
    registerPlan: (plan) => {
      const batchId = plan.batch.id.trim();
      if (plans.has(batchId)) throw new Error(`Shadow-import batch already exists: ${batchId}`);
      insertPlan(plans, plan);
    },
    replacePlan: (plan) => {
      insertPlan(plans, plan);
    },
  };
}

function insertPlan(
  plans: Map<string, ShadowImportPlan>,
  plan: ShadowImportPlan,
): void {
  const batchId = plan.batch.id.trim();
  if (!batchId) throw new Error('Shadow-import batch ID must not be blank.');
  plans.set(batchId, clone(plan));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
