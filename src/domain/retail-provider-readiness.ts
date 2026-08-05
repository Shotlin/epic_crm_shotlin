import type { RevenueOpsState } from '../shared/revenue-ops-contracts';
import { providerConformanceMatchesCredentialRevision } from '../shared/provider-contracts';

type RetailProviderReadinessSource = Pick<RevenueOpsState, 'scope' | 'providerConnectors' | 'providerConformanceCases' | 'retailPrinterAdapters' | 'retailLabelPrintDispatches' | 'retailScaleProfiles'>;

export type RetailProviderReadinessKind = 'upi' | 'card' | 'printer' | 'scale';
export type RetailProviderReadinessStatus = 'ready' | 'blocked' | 'external';

export interface RetailProviderReadiness {
  kind: RetailProviderReadinessKind;
  label: string;
  status: RetailProviderReadinessStatus;
  detail: string;
  blockers: string[];
  evidenceReferences: string[];
}

const inScope = (state: RetailProviderReadinessSource, value: { scope?: RetailProviderReadinessSource['scope'] }): boolean => {
  const scope = value.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};

function bankingReadiness(state: RetailProviderReadinessSource, kind: 'upi' | 'card'): RetailProviderReadiness {
  const connectors = state.providerConnectors.filter((connector) =>
    connector.domain === 'banking' && connector.environment === 'production' && connector.active && inScope(state, connector),
  );
  const connector = connectors.find((candidate) =>
    candidate.credentialStatus === 'configured'
      && candidate.conformanceStatus === 'production-approved'
      && candidate.capabilities.includes('payment-status-pull')
      && candidate.capabilities.includes('statement-pull'),
  );
  const cases = connector ? state.providerConformanceCases.filter((test) =>
    test.connectorId === connector.id && test.environment === 'production' && test.result === 'passed' && providerConformanceMatchesCredentialRevision(connector, test) && inScope(state, test),
  ) : [];
  const blockers: string[] = [];
  if (!connectors.length) blockers.push('No active production banking connector is configured.');
  if (connectors.length && !connector) blockers.push('Banking connector needs configured credentials, payment-status and statement-pull capabilities, production approval, and passed conformance evidence.');
  if (connector && !cases.length) blockers.push('At least one production conformance scenario must pass before this rail is ready.');
  const evidenceReferences = [...new Set(cases.map(({ evidenceReference }) => evidenceReference).filter((reference): reference is string => Boolean(reference)))];
  return {
    kind,
    label: kind === 'upi' ? 'UPI provider rail' : 'Card provider rail',
    status: connector && cases.length ? 'ready' : connectors.length ? 'external' : 'blocked',
    detail: connector && cases.length ? `${connector.providerLegalName} certified for provider status and statement evidence.` : 'Recorded POS references remain internal evidence until a provider is certified.',
    blockers,
    evidenceReferences,
  };
}

export function buildRetailProviderReadiness(state: RetailProviderReadinessSource): RetailProviderReadiness[] {
  const printers = state.retailPrinterAdapters.filter((adapter) => inScope(state, adapter));
  const certifiedPrinters = printers.filter(({ status }) => status === 'certified');
  const printerDispatches = state.retailLabelPrintDispatches.filter((dispatch) => inScope(state, dispatch));
  const acknowledgedDispatches = printerDispatches.filter(({ status }) => status === 'acknowledged');
  const printerBlockers: string[] = [];
  if (!certifiedPrinters.length) printerBlockers.push('Register and independently test at least one physical printer adapter.');
  if (certifiedPrinters.length && printerDispatches.some(({ status }) => status === 'prepared')) printerBlockers.push('A prepared label payload still needs independent device acknowledgement.');
  const scaleProfiles = state.retailScaleProfiles.filter((profile) => profile.active && inScope(state, profile));
  return [
    bankingReadiness(state, 'upi'),
    bankingReadiness(state, 'card'),
    {
      kind: 'printer',
      label: 'ESC/POS printer device',
      status: certifiedPrinters.length && !printerDispatches.some(({ status }) => status === 'prepared') ? 'ready' : certifiedPrinters.length ? 'external' : 'blocked',
      detail: certifiedPrinters.length ? `${certifiedPrinters.length} certified adapter(s); ${acknowledgedDispatches.length} acknowledged dispatch(es).` : 'No independently tested thermal printer is available for physical label output.',
      blockers: printerBlockers,
      evidenceReferences: certifiedPrinters.flatMap(({ lastTestEvidence }) => lastTestEvidence ? [lastTestEvidence] : []),
    },
    {
      kind: 'scale',
      label: 'Weighted-SKU scale controls',
      status: scaleProfiles.length ? 'ready' : 'blocked',
      detail: scaleProfiles.length ? `${scaleProfiles.length} active precision profile(s) protect weighted checkout.` : 'Weighted checkout has no active scale precision profile.',
      blockers: scaleProfiles.length ? [] : ['Create an active scale profile for every weighted SKU before enabling weighted checkout.'],
      evidenceReferences: [],
    },
  ];
}
