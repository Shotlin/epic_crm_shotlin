import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type {
  AdvanceRetailCutoverInput,
  CreateRetailCutoverPlanFromAssessmentInput,
  CreateRetailCutoverPlanInput,
  FetchRetailHubCutoverAssessmentInput,
  RetailCutoverCapability,
  RetailCutoverPlan,
  RetailHubCutoverAssessment,
  RetailHubCutoverCapability,
} from '../shared/retail-cutover-contracts';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';

const CAPABILITIES: RetailCutoverCapability[] = ['analytics', 'catalog-inventory', 'orders', 'delivery', 'finance'];
const HUB_CAPABILITIES = new Set(['catalog', 'inventory', 'customers', 'orders', 'delivery', 'settlements', 'campaigns', 'storefront']);
const SHA256 = /^[a-f0-9]{64}$/iu;

function label(value: string): string {
  return value === 'catalog-inventory' ? 'Catalog & inventory' : value.charAt(0).toUpperCase() + value.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Defense in depth for a value that should already be validated in main. */
function parseHubAssessment(value: unknown): RetailHubCutoverAssessment {
  const candidate = isRecord(value) && isRecord(value.assessment) ? value.assessment : value;
  if (!isRecord(candidate)) throw new Error('The Retail Hub response is not an assessment object.');
  const scope = candidate.scope;
  if (!isRecord(scope) || typeof scope.tenantId !== 'string' || typeof scope.companyId !== 'string' || typeof scope.branchId !== 'string') throw new Error('The Retail Hub assessment has an invalid tenant/company/branch scope.');
  if (candidate.source !== 'bakaloo' || candidate.writeBackAllowed !== false) throw new Error('Only read-only Bakaloo assessments are accepted.');
  if (typeof candidate.capability !== 'string' || !HUB_CAPABILITIES.has(candidate.capability)) throw new Error('The Retail Hub assessment capability is not supported.');
  if (candidate.status !== 'ready-for-parallel-run' && candidate.status !== 'blocked') throw new Error('The Retail Hub assessment status is invalid.');
  if (!Array.isArray(candidate.blockers) || !candidate.blockers.every((item) => typeof item === 'string')) throw new Error('The Retail Hub assessment blockers list is invalid.');
  if (!Array.isArray(candidate.requiredEntities) || !candidate.requiredEntities.every((item) => typeof item === 'string')) throw new Error('The Retail Hub assessment required entities are invalid.');
  if (typeof candidate.planId !== 'string' || candidate.planId.trim().length < 2) throw new Error('The Retail Hub assessment plan ID is missing.');
  for (const field of ['planChecksum', 'remoteChecksum', 'localChecksum', 'reconciliationChecksum']) {
    if (typeof candidate[field] !== 'string' || !SHA256.test(candidate[field])) throw new Error(`The Retail Hub assessment ${field} must be a SHA-256 checksum.`);
  }
  for (const field of ['remoteRecordCount', 'localRecordCount', 'differenceCount']) {
    if (typeof candidate[field] !== 'number' || !Number.isInteger(candidate[field]) || candidate[field] < 0) throw new Error(`The Retail Hub assessment ${field} must be a non-negative integer.`);
  }
  if (candidate.approvalDecisionId !== undefined && typeof candidate.approvalDecisionId !== 'string') throw new Error('The Retail Hub approval decision reference is invalid.');
  if (candidate.credentialRevision !== undefined && (typeof candidate.credentialRevision !== 'number' || !Number.isInteger(candidate.credentialRevision) || candidate.credentialRevision < 1)) throw new Error('The Retail Hub credential revision is invalid.');
  if (candidate.rollbackReference !== undefined && typeof candidate.rollbackReference !== 'string') throw new Error('The Retail Hub rollback reference is invalid.');
  return candidate as unknown as RetailHubCutoverAssessment;
}

export function RetailCutoverGuardPanel({
  plans,
  scope,
  busy,
  onRefresh,
  onCreateFromHubAssessment,
  onFetchHubAssessment,
  onAdvance,
}: {
  plans: RetailCutoverPlan[];
  scope: OperatingRecordScope;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  /**
   * Legacy development/test seam retained for call-site compatibility. Normal
   * operator UI deliberately never invokes it; production plans are created
   * only from fetched Hub assessments through onCreateFromHubAssessment.
   */
  onCreate?: (input: CreateRetailCutoverPlanInput) => Promise<void>;
  onCreateFromHubAssessment: (input: CreateRetailCutoverPlanFromAssessmentInput) => Promise<void>;
  onFetchHubAssessment: (input: FetchRetailHubCutoverAssessmentInput) => Promise<RetailHubCutoverAssessment>;
  onAdvance: (input: AdvanceRetailCutoverInput & { id: string }) => Promise<void>;
}): ReactNode {
  const [showHubAssessment, setShowHubAssessment] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [advanceEvidence, setAdvanceEvidence] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [rollbackWindowHours, setRollbackWindowHours] = useState('24');
  const [formError, setFormError] = useState('');
  const [hubAssessment, setHubAssessment] = useState<RetailHubCutoverAssessment | null>(null);
  const [hubBaseUrl, setHubBaseUrl] = useState('');
  const [hubBatchId, setHubBatchId] = useState('');
  const [hubCapability, setHubCapability] = useState<RetailHubCutoverCapability>('orders');

  const byCapability = useMemo(() => new Map(plans.map((plan) => [plan.capability, plan])), [plans]);
  const selectedPlan = selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) ?? null : null;

  async function registerHubAssessment(): Promise<void> {
    if (!hubAssessment) return;
    setFormError('');
    if (hubAssessment.status !== 'ready-for-parallel-run' || hubAssessment.blockers.length > 0) {
      setFormError('This assessment is blocked. Resolve the Hub blockers before registering a parallel-run plan.');
      return;
    }
    try {
      await onCreateFromHubAssessment({
        assessment: hubAssessment,
        scope,
        evidenceReference: `hub-assessment://${hubAssessment.planId}`,
      });
      setHubAssessment(null);
      setShowHubAssessment(false);
    } catch (errorValue: unknown) {
      setFormError(errorValue instanceof Error ? errorValue.message : 'The Hub assessment could not be registered.');
    }
  }

  async function fetchHubAssessment(): Promise<void> {
    setFormError('');
    try {
      const fetched = await onFetchHubAssessment({
        baseUrl: hubBaseUrl.trim(),
        batchId: hubBatchId.trim(),
        capability: hubCapability,
      });
      setHubAssessment(parseHubAssessment(fetched));
    } catch (errorValue: unknown) {
      setHubAssessment(null);
      setFormError(errorValue instanceof Error ? errorValue.message : 'The Retail Hub assessment could not be fetched.');
    }
  }

  async function advanceSelected(decision: AdvanceRetailCutoverInput['decision']): Promise<void> {
    if (!selectedPlan) return;
    setFormError('');
    try {
      await onAdvance({
        id: selectedPlan.id,
        decision,
        expectedVersion: selectedPlan.version,
        evidenceReference: advanceEvidence.trim() || undefined,
        reason: advanceReason.trim() || undefined,
        rollbackWindowHours: rollbackWindowHours ? Number(rollbackWindowHours) : undefined,
      });
      setAdvanceEvidence('');
      setAdvanceReason('');
    } catch (errorValue: unknown) {
      setFormError(errorValue instanceof Error ? errorValue.message : 'The cutover decision could not be recorded.');
    }
  }

  return (
    <section className="panel retail-cutover-guard" aria-labelledby="retail-cutover-guard-title">
      <div className="panel__header">
        <div>
          <span className="eyebrow">SAFE MIGRATION CONTROL</span>
          <h2 id="retail-cutover-guard-title">Bakaloo to Epic BOS cutover</h2>
          <p className="panel__description">Plans can only begin from a fetched, read-only Retail Hub assessment. Every capability stays shadow or parallel until Hub checksums, approvals and rollback evidence agree.</p>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>

      <div className="retail-cutover-guard__toolbar">
        <span>{plans.length} persisted plan{plans.length === 1 ? '' : 's'} - scope {scope.companyId}/{scope.branchId}</span>
        <div className="retail-cutover-guard__toolbar-actions">
          <button type="button" className="button button--quiet" disabled={busy} onClick={() => void onRefresh()}>
            <RefreshCw size={15} aria-hidden="true" />
            {busy ? 'Refreshing...' : 'Refresh status'}
          </button>
          <button type="button" className="button button--primary" disabled={busy} onClick={() => { setShowHubAssessment((open) => !open); setFormError(''); }}>
            {showHubAssessment ? 'Close assessment' : 'Open verified Hub assessment'}
          </button>
        </div>
      </div>

      {formError ? <p className="form-error" role="alert">{formError}</p> : null}

      {showHubAssessment ? (
        <div className="retail-cutover-guard__registration" aria-label="Verified Retail Hub assessment">
          <div className="retail-cutover-guard__form-heading">
            <strong>Get a verified Retail Hub assessment</strong>
            <small>This screen cannot create a plan from typed counts, checksums, or a locally imported JSON file. Fetch a scoped, read-only assessment from the authenticated Retail Hub instead.</small>
          </div>
          <div className="retail-cutover-guard__hub-import">
            <div className="retail-cutover-guard__hub-fetch">
              <label>Approved Hub HTTPS URL<input value={hubBaseUrl} onChange={(event) => setHubBaseUrl(event.target.value)} placeholder="https://hub.example.in" autoComplete="off" /></label>
              <label>Batch ID<input value={hubBatchId} onChange={(event) => setHubBatchId(event.target.value)} placeholder="bakaloo-batch-2026-08-04" autoComplete="off" /></label>
              <label>Hub capability<select aria-label="Hub capability" value={hubCapability} onChange={(event) => setHubCapability(event.target.value as RetailHubCutoverCapability)}><option value="catalog">Catalog</option><option value="inventory">Inventory</option><option value="customers">Customers</option><option value="orders">Orders</option><option value="delivery">Delivery</option><option value="settlements">Settlements</option><option value="campaigns">Campaigns</option><option value="storefront">Storefront</option></select></label>
              <button type="button" className="button button--primary" disabled={busy || !hubBaseUrl.trim() || !hubBatchId.trim()} onClick={() => void fetchHubAssessment()}><Download size={15} aria-hidden="true" /> Fetch verified assessment</button>
            </div>
            <small className="retail-cutover-guard__transport-note">GET only. No API key or request header is accepted from this screen; the Hub's authenticated server boundary remains authoritative. A fetched assessment is the only normal operator route to register a cutover plan.</small>
            {hubAssessment ? (
              <div className="retail-cutover-guard__hub-preview" role="status">
                <strong>{label(hubAssessment.capability)} - {hubAssessment.status}</strong>
                <span>Plan {hubAssessment.planId} - {hubAssessment.remoteRecordCount} remote / {hubAssessment.localRecordCount} local - {hubAssessment.differenceCount} difference(s)</span>
                <span>Credential revision {hubAssessment.credentialRevision ?? 'not supplied'} - write-back disabled</span>
                <span>System evidence: hub-assessment://{hubAssessment.planId}</span>
                {hubAssessment.blockers.length ? <span className="form-error">Blocked: {hubAssessment.blockers.join(' ')}</span> : null}
                <button type="button" className="button button--primary" disabled={busy || hubAssessment.status !== 'ready-for-parallel-run' || hubAssessment.blockers.length > 0} onClick={() => void registerHubAssessment()}>Register verified Hub assessment</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="retail-cutover-guard__grid">
        {CAPABILITIES.map((candidate) => {
          const plan = byCapability.get(candidate);
          return (
            <button className={`retail-cutover-guard__capability${plan?.id === selectedPlanId ? ' retail-cutover-guard__capability--selected' : ''}`} type="button" key={candidate} onClick={() => { setSelectedPlanId(plan?.id ?? null); setFormError(''); }}>
              <span><strong>{label(candidate)}</strong><em className={`retail-cutover-guard__phase retail-cutover-guard__phase--${plan?.phase ?? 'not-started'}`}>{plan?.phase ?? 'not started'}</em></span>
              {plan ? <small>v{plan.version} - {plan.transitions?.length ?? 0} evidence event{plan.transitions?.length === 1 ? '' : 's'} - {plan.reconciliation.differenceCount} difference{plan.reconciliation.differenceCount === 1 ? '' : 's'}</small> : <small>Read-only shadow plan not registered.</small>}
            </button>
          );
        })}
      </div>

      {selectedPlan ? (
        <div className="retail-cutover-guard__decision" aria-label={`Decision controls for ${label(selectedPlan.capability)}`}>
          <div><strong>{label(selectedPlan.capability)} - {selectedPlan.phase}</strong><small>{selectedPlan.transitions?.length ?? 0} immutable evidence event{selectedPlan.transitions?.length === 1 ? '' : 's'} - expected version {selectedPlan.version}</small></div>
          <div className="retail-cutover-guard__decision-fields"><label>Evidence reference<input value={advanceEvidence} onChange={(event) => setAdvanceEvidence(event.target.value)} placeholder="Required for reconciliation, approval, cutover and rollback" /></label><label>Block reason<input value={advanceReason} onChange={(event) => setAdvanceReason(event.target.value)} placeholder="Required only when blocking" /></label><label>Rollback hours<input type="number" min="1" max="720" step="1" value={rollbackWindowHours} onChange={(event) => setRollbackWindowHours(event.target.value)} /></label></div>
          <div className="retail-cutover-guard__form-actions">
            {selectedPlan.phase === 'shadow' ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void advanceSelected('start-parallel')}>Start parallel run</button> : null}
            {selectedPlan.phase === 'parallel' && selectedPlan.reconciliation.differenceCount === 0 ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void advanceSelected('reconciled')}>Record reconciliation</button> : null}
            {selectedPlan.phase === 'reconciled' ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void advanceSelected('approved')}>Approve independently</button> : null}
            {selectedPlan.phase === 'approved' ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void advanceSelected('cutover')}>Execute guarded cutover</button> : null}
            {selectedPlan.phase === 'rollback-window' ? <><button type="button" className="button button--quiet" disabled={busy} onClick={() => void advanceSelected('rollback')}>Rollback in window</button><button type="button" className="button button--primary" disabled={busy} onClick={() => void advanceSelected('retire')}>Retire after window</button></> : null}
            {!['blocked', 'retired', 'rolled-back'].includes(selectedPlan.phase) ? <button type="button" className="button button--quiet" disabled={busy} onClick={() => void advanceSelected('block')}>Block plan</button> : null}
          </div>
          <small className="retail-cutover-guard__decision-note">Every mutation is version-checked in the main process. The maker cannot approve their own plan, and blocked or finished plans cannot be resumed.</small>
        </div>
      ) : null}

      <footer className="retail-cutover-guard__footer"><strong>Go-live remains held</strong><span>Real provider credentials, device evidence and independent approval are still required before any retirement decision.</span></footer>
    </section>
  );
}
