import { BUSINESS_MODULE_CATALOG, summarizeBusinessModuleCatalog } from './business-module-catalog';
import { BUSINESS_WORKFLOW_CATALOG, summarizeBusinessWorkflows } from './business-workflow-catalog';
import { PHASE_READINESS_CATALOG, summarizePhaseReadiness } from './phase-readiness-catalog';
import { PROVIDER_READINESS_CATALOG, summarizeProviderReadiness } from './provider-readiness-catalog';

export interface DemoHandoffPacket {
  generatedAt: string;
  product: string;
  moduleSummary: ReturnType<typeof summarizeBusinessModuleCatalog>;
  workflowSummary: ReturnType<typeof summarizeBusinessWorkflows>;
  phaseSummary: ReturnType<typeof summarizePhaseReadiness>;
  providerSummary: ReturnType<typeof summarizeProviderReadiness>;
  modules: typeof BUSINESS_MODULE_CATALOG;
  workflows: typeof BUSINESS_WORKFLOW_CATALOG;
  phases: typeof PHASE_READINESS_CATALOG;
  providers: typeof PROVIDER_READINESS_CATALOG;
}

export function buildDemoHandoffPacket(now = new Date()): DemoHandoffPacket {
  return {
    generatedAt: now.toISOString(),
    product: 'EPIC Business Operating System',
    moduleSummary: summarizeBusinessModuleCatalog(),
    workflowSummary: summarizeBusinessWorkflows(),
    phaseSummary: summarizePhaseReadiness(),
    providerSummary: summarizeProviderReadiness(),
    modules: BUSINESS_MODULE_CATALOG,
    workflows: BUSINESS_WORKFLOW_CATALOG,
    phases: PHASE_READINESS_CATALOG,
    providers: PROVIDER_READINESS_CATALOG,
  };
}
