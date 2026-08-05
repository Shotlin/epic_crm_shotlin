import { CheckCircle2, Clock3, MapPin, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  assessPincodeServiceability,
  buildDeliveryPromiseDispatchQueue,
  freezeDeliveryAddress,
} from '../domain/pincode-serviceability';
import type { KernelSnapshot } from '../shared/kernel-contracts';
import type { PartySnapshot } from '../shared/party-contracts';
import type {
  CreateDeliveryPromiseInput,
  CreatePincodeServiceabilityRuleInput,
  DecidePincodeServiceabilityRuleInput,
  DeliveryServiceLevel,
  RevenueOpsSnapshot,
} from '../shared/revenue-ops-contracts';
import './PincodeServiceabilityPanel.css';

type PincodeServiceabilityPanelProps = {
  revenue: RevenueOpsSnapshot;
  party: PartySnapshot;
  kernel: KernelSnapshot;
  actorId: string;
  busy: boolean;
  onCreateRule: (input: CreatePincodeServiceabilityRuleInput) => Promise<void>;
  onDecideRule: (input: DecidePincodeServiceabilityRuleInput) => Promise<void>;
  onCreatePromise: (input: CreateDeliveryPromiseInput) => Promise<void>;
};

const WEEKDAYS = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
] as const;

const serviceLevelLabel: Record<DeliveryServiceLevel, string> = {
  standard: 'Standard',
  express: 'Express',
  freight: 'Freight',
};

function formatPolicyDate(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(parsed);
}

function humanizeStatus(value: string): string {
  return value.replaceAll('-', ' ');
}

function customerCommitmentTotal(order: RevenueOpsSnapshot['salesOrders'][number] | undefined): number {
  return order?.taxPreview.grandTotal ?? 0;
}

function deliveryPromiseLabel(promise: { id: string; ruleCode: string }): string {
  return `DPR-${promise.id.slice(0, 8).toUpperCase()} · ${promise.ruleCode}`;
}

function indiaDateTimeInput(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function indiaDateTimeToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function indiaCurrentDate(): string {
  return indiaDateTimeInput(new Date().toISOString()).slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The governed action could not be completed.';
}

export function PincodeServiceabilityPanel({
  revenue,
  party,
  kernel,
  actorId,
  busy,
  onCreateRule,
  onDecideRule,
  onCreatePromise,
}: PincodeServiceabilityPanelProps): ReactNode {
  const goodsProducts = useMemo(() => new Set(revenue.products.filter(({ active, kind }) => active && kind === 'goods').map(({ id }) => id)), [revenue.products]);
  const eligibleOrders = useMemo(
    () => revenue.salesOrders.filter((order) => !['cancelled', 'completed'].includes(order.status) && order.lines.some((line) => line.catalogProductId !== undefined && goodsProducts.has(line.catalogProductId))),
    [goodsProducts, revenue.salesOrders],
  );
  const activeLocations = useMemo(() => revenue.stockLocations.filter(({ active }) => active), [revenue.stockLocations]);
  const availableCarriers = useMemo(() => revenue.carrierAdapters.filter(({ status }) => status !== 'disabled'), [revenue.carrierAdapters]);
  const [orderId, setOrderId] = useState(eligibleOrders[0]?.id ?? '');
  const [addressId, setAddressId] = useState('');
  const [originLocationId, setOriginLocationId] = useState(activeLocations[0]?.id ?? '');
  const [carrierAdapterId, setCarrierAdapterId] = useState('');
  const [serviceLevel, setServiceLevel] = useState<DeliveryServiceLevel>('standard');
  const [paymentMode, setPaymentMode] = useState<'prepaid' | 'cod'>('prepaid');
  const [estimatedWeightKg, setEstimatedWeightKg] = useState('1');
  const [requestedAt, setRequestedAt] = useState(() => new Date().toISOString());
  const [notice, setNotice] = useState('');

  const selectedOrder = eligibleOrders.find(({ id }) => id === orderId) ?? eligibleOrders[0];
  const customerAddresses = useMemo(
    () => party.addresses.filter((address) => address.accountId === selectedOrder?.accountId && address.status === 'active'),
    [party.addresses, selectedOrder?.accountId],
  );
  const selectedAddress = customerAddresses.find(({ id }) => id === addressId) ?? customerAddresses[0];

  useEffect(() => {
    setOrderId((current) => eligibleOrders.some(({ id }) => id === current) ? current : eligibleOrders[0]?.id ?? '');
  }, [eligibleOrders]);

  useEffect(() => {
    setAddressId((current) => customerAddresses.some(({ id }) => id === current) ? current : customerAddresses[0]?.id ?? '');
  }, [customerAddresses]);

  useEffect(() => {
    setOriginLocationId((current) => activeLocations.some(({ id }) => id === current) ? current : activeLocations[0]?.id ?? '');
  }, [activeLocations]);

  const assessment = useMemo(() => {
    if (!selectedAddress || !originLocationId) return undefined;
    return assessPincodeServiceability(revenue, {
      address: freezeDeliveryAddress(selectedAddress, requestedAt),
      originLocationId,
      carrierAdapterId: carrierAdapterId || undefined,
      serviceLevel,
      paymentMode,
      estimatedWeightKg: Number(estimatedWeightKg),
      orderValue: customerCommitmentTotal(selectedOrder),
      requestedAt,
    });
  }, [carrierAdapterId, estimatedWeightKg, originLocationId, paymentMode, requestedAt, revenue, selectedAddress, selectedOrder, serviceLevel]);

  const dispatchQueue = useMemo(() => buildDeliveryPromiseDispatchQueue(revenue), [revenue]);
  const actor = kernel.users.find(({ id }) => id === actorId);
  const canApprovePolicy = Boolean(actor?.roleIds.some((roleId) => {
    const role = kernel.roles.find(({ id }) => id === roleId);
    return role?.grantIds.some((grantId) => {
      const grant = kernel.grants.find(({ id }) => id === grantId);
      return grant?.resource === 'inventory.execution' && grant.actions.includes('approve');
    });
  }));

  async function createPromise(): Promise<void> {
    if (!selectedOrder || !selectedAddress || !assessment || assessment.status !== 'serviceable') return;
    setNotice('');
    try {
      await onCreatePromise({
        salesOrderId: selectedOrder.id,
        shipToAddressId: selectedAddress.id,
        originLocationId,
        carrierAdapterId: carrierAdapterId || undefined,
        serviceLevel,
        paymentMode,
        estimatedWeightKg: Number(estimatedWeightKg),
        requestedAt,
      });
      setNotice('Customer commitment created from the active internal policy. It is ready for package handoff.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function submitRule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice('');
    try {
      await onCreateRule({
        code: String(form.get('code')),
        name: String(form.get('name')),
        originLocationId: String(form.get('originLocationId')),
        carrierAdapterId: String(form.get('carrierAdapterId')) || undefined,
        destinationStateCode: String(form.get('destinationStateCode')) || undefined,
        pinMatchKind: String(form.get('pinMatchKind')) as CreatePincodeServiceabilityRuleInput['pinMatchKind'],
        pinStart: String(form.get('pinStart')),
        pinEnd: String(form.get('pinEnd')) || undefined,
        serviceLevel: String(form.get('serviceLevel')) as DeliveryServiceLevel,
        serviceable: form.get('serviceable') === 'on',
        codAllowed: form.get('codAllowed') === 'on',
        codMaximumAmount: form.get('codMaximumAmount') ? Number(form.get('codMaximumAmount')) : undefined,
        maximumWeightKg: form.get('maximumWeightKg') ? Number(form.get('maximumWeightKg')) : undefined,
        cutoffLocalTime: String(form.get('cutoffLocalTime')) || undefined,
        dispatchLeadBusinessDays: Number(form.get('dispatchLeadBusinessDays')),
        transitMinBusinessDays: Number(form.get('transitMinBusinessDays')),
        transitMaxBusinessDays: Number(form.get('transitMaxBusinessDays')),
        workingDays: form.getAll('workingDays').map(String) as CreatePincodeServiceabilityRuleInput['workingDays'],
        priority: Number(form.get('priority')),
        effectiveFrom: String(form.get('effectiveFrom')),
        effectiveTo: String(form.get('effectiveTo')) || undefined,
        evidenceReference: String(form.get('evidenceReference')),
      });
      event.currentTarget.reset();
      setNotice('Draft PIN policy saved. A different authorised user must activate it before a customer can rely on it.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function decideRule(id: string, decision: 'activate' | 'suspend', expectedVersion: number): Promise<void> {
    setNotice('');
    try {
      await onDecideRule({
        id,
        decision,
        expectedVersion,
        rationale: decision === 'activate'
          ? 'Internal PIN policy, service calendar, origin, and commercial boundary independently verified.'
          : 'Serviceability policy suspended pending a fresh operational review.',
      });
      setNotice(`PIN policy ${decision === 'activate' ? 'activated' : 'suspended'} with independent decision evidence.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return <article className="tower-panel tower-panel--promise" aria-labelledby="pincode-serviceability-title">
    <div className="tower-panel__head">
      <div><span>02A / India delivery promise</span><h4 id="pincode-serviceability-title">PIN-code serviceability desk</h4></div>
      <MapPin size={19} aria-hidden="true" />
    </div>
    <p className="tower-boundary">A delivery date is a governed internal commitment, not a carrier ETA. Epic BOS uses an effective-dated PIN policy and weekly working calendar only; public holidays, carrier feeds, and external portal outcomes are never invented.</p>

    <div className="promise-workbench">
      <form className="promise-form" onSubmit={(event) => { event.preventDefault(); void createPromise(); }}>
        <div className="promise-form__heading"><Truck size={16} /><div><strong>Assess before you promise</strong><small>Freeze the customer address only after policy selection.</small></div></div>
        <label>Goods order<select value={selectedOrder?.id ?? ''} onChange={(event) => setOrderId(event.target.value)}>{eligibleOrders.length ? eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.number} · ₹{customerCommitmentTotal(order).toLocaleString('en-IN')}</option>) : <option value="">No eligible goods order</option>}</select></label>
        <label>Customer delivery address<select value={selectedAddress?.id ?? ''} onChange={(event) => setAddressId(event.target.value)}>{customerAddresses.length ? customerAddresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.city} · {address.postalCode}</option>) : <option value="">Add an active Party Master address first</option>}</select></label>
        <div className="promise-form__row"><label>Ship from<select value={originLocationId} onChange={(event) => setOriginLocationId(event.target.value)}>{activeLocations.length ? activeLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.stateCode}</option>) : <option value="">No active stock location</option>}</select></label><label>Carrier boundary<select value={carrierAdapterId} onChange={(event) => setCarrierAdapterId(event.target.value)}><option value="">Internal policy only</option>{availableCarriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.code} · {carrier.status}</option>)}</select></label></div>
        <div className="promise-form__row"><label>Service<select value={serviceLevel} onChange={(event) => setServiceLevel(event.target.value as DeliveryServiceLevel)}>{Object.entries(serviceLevelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Payment<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as 'prepaid' | 'cod')}><option value="prepaid">Prepaid</option><option value="cod">Cash on delivery</option></select></label></div>
        <div className="promise-form__row"><label>Estimated kg<input value={estimatedWeightKg} onChange={(event) => setEstimatedWeightKg(event.target.value)} type="number" min="0.01" step="0.01" required /></label><label>Requested at <small>(Asia/Kolkata)</small><input value={indiaDateTimeInput(requestedAt)} onChange={(event) => { const next = indiaDateTimeToIso(event.target.value); if (next) setRequestedAt(next); }} type="datetime-local" required /></label></div>
        <button className="button button--primary" type="submit" disabled={busy || assessment?.status !== 'serviceable' || !selectedOrder || !selectedAddress}><CheckCircle2 size={15} />Create controlled promise</button>
      </form>

      <section className="promise-assessment" data-status={assessment?.status ?? 'configuration-required'} aria-live="polite">
        <header><span>Decision</span><strong>{assessment ? humanizeStatus(assessment.status) : 'configuration required'}</strong></header>
        <p>{assessment?.reason ?? 'Select an active goods order, Party Master address, and origin to assess domestic serviceability.'}</p>
        {assessment?.rule ? <div className="promise-policy-tag"><ShieldCheck size={14} /><span>{assessment.rule.code} · v{assessment.rule.version} · {serviceLevelLabel[assessment.rule.serviceLevel]}</span></div> : null}
        {assessment?.status === 'serviceable' ? <dl><div><dt><Clock3 size={13} />Dispatch by</dt><dd>{formatPolicyDate(assessment.dispatchBy)}</dd></div><div><dt>Delivery window</dt><dd>{formatPolicyDate(assessment.deliveryFrom)} – {formatPolicyDate(assessment.deliveryTo)}</dd></div><div><dt>Basis</dt><dd>Weekly policy calendar only</dd></div><div><dt>Source</dt><dd>Internal policy, not carrier ETA</dd></div></dl> : <footer><small>Resolve the stated policy or master-data condition before making a customer-facing delivery commitment.</small></footer>}
      </section>
    </div>

    {notice ? <p className="promise-notice" role="status">{notice}</p> : null}

    <section className="promise-queue" aria-label="Delivery promise dispatch queue">
      <header><div><span>Promise to dispatch queue</span><strong>Every commitment stays traceable to its package</strong></div><small>{dispatchQueue.length} active or fulfilled commitment{dispatchQueue.length === 1 ? '' : 's'}</small></header>
      <div className="promise-queue__list">{dispatchQueue.length ? dispatchQueue.map(({ promise, packageNumber, status }) => <div key={promise.id} data-status={status}><i>{status === 'fulfilled' ? <CheckCircle2 size={15} /> : <Truck size={15} />}</i><div><span>{deliveryPromiseLabel(promise)} · {promise.status}</span><strong>{revenue.salesOrders.find(({ id }) => id === promise.salesOrderId)?.number ?? promise.salesOrderId} · {promise.shipToAddress.city} {promise.shipToAddress.postalCode}</strong><small>Dispatch {formatPolicyDate(promise.dispatchBy)} · delivery {formatPolicyDate(promise.deliveryFrom)} – {formatPolicyDate(promise.deliveryTo)} · {promise.calendarBasis}</small></div><em>{packageNumber ?? humanizeStatus(status)}</em></div>) : <p className="promise-queue__empty">No active delivery commitments. Assess a valid domestic order before packaging it.</p>}</div>
    </section>

    <details className="promise-policy-editor">
      <summary><span>Policy administration</span><strong>Configure effective-dated domestic PIN rules</strong><small>Maker–checker activation is required.</small></summary>
      <div className="promise-policy-editor__body">
        <form className="promise-rule-form" onSubmit={(event) => void submitRule(event)}>
          <div className="promise-form__heading"><ShieldCheck size={16} /><div><strong>Draft a new service policy</strong><small>These dates are internal planning controls, never external carrier evidence.</small></div></div>
          <div className="promise-form__row"><label>Rule code<input name="code" placeholder="MH-PUNE-STD" required /></label><label>Rule name<input name="name" placeholder="Pune standard delivery" required /></label></div>
          <div className="promise-form__row"><label>Origin<select name="originLocationId" defaultValue={activeLocations[0]?.id ?? ''}>{activeLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label><label>Carrier boundary<select name="carrierAdapterId" defaultValue=""><option value="">Internal policy only</option>{availableCarriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.code}</option>)}</select></label></div>
          <div className="promise-form__row"><label>PIN match<select name="pinMatchKind" defaultValue="prefix"><option value="exact">Exact six-digit PIN</option><option value="prefix">PIN prefix</option><option value="range">PIN range</option></select></label><label>PIN start<input name="pinStart" inputMode="numeric" placeholder="411" required /></label></div>
          <div className="promise-form__row"><label>PIN end <small>(ranges only)</small><input name="pinEnd" inputMode="numeric" placeholder="411099" /></label><label>Destination GST state <small>(optional)</small><input name="destinationStateCode" inputMode="numeric" placeholder="27" maxLength={2} /></label></div>
          <div className="promise-form__row"><label>Service<select name="serviceLevel" defaultValue="standard">{Object.entries(serviceLevelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Cut-off <small>(Asia/Kolkata)</small><input name="cutoffLocalTime" type="time" defaultValue="14:00" /></label></div>
          <div className="promise-form__row promise-form__row--three"><label>Dispatch days<input name="dispatchLeadBusinessDays" type="number" min="0" max="90" defaultValue="1" required /></label><label>Transit min<input name="transitMinBusinessDays" type="number" min="0" max="120" defaultValue="1" required /></label><label>Transit max<input name="transitMaxBusinessDays" type="number" min="0" max="120" defaultValue="3" required /></label></div>
          <fieldset><legend>Service controls</legend><label><input name="serviceable" type="checkbox" defaultChecked />Serviceable</label><label><input name="codAllowed" type="checkbox" />Allow COD</label><label>COD cap (₹)<input name="codMaximumAmount" type="number" min="1" step="1" placeholder="Optional" /></label><label>Weight cap (kg)<input name="maximumWeightKg" type="number" min="0.01" step="0.01" placeholder="Optional" /></label></fieldset>
          <fieldset><legend>Weekly working calendar</legend>{WEEKDAYS.map(([value, label]) => <label key={value}><input name="workingDays" value={value} type="checkbox" defaultChecked={value !== 'sun'} />{label}</label>)}</fieldset>
          <div className="promise-form__row promise-form__row--three"><label>Priority<input name="priority" type="number" min="0" max="10000" defaultValue="100" required /></label><label>Effective from<input name="effectiveFrom" type="date" defaultValue={indiaCurrentDate()} required /></label><label>Effective to <small>(optional)</small><input name="effectiveTo" type="date" /></label></div>
          <label>Evidence reference<input name="evidenceReference" placeholder="OPS-POLICY-2026-001" required /></label>
          <button className="button button--quiet" type="submit" disabled={busy || !activeLocations.length}>Save draft for independent activation</button>
        </form>
        <div className="promise-rule-list">{revenue.pincodeServiceabilityRules.length ? revenue.pincodeServiceabilityRules.map((rule) => {
          const actionable = rule.status === 'draft' || rule.status === 'suspended';
          const canActivate = canApprovePolicy && rule.createdBy !== actorId;
          return <article key={rule.id} data-status={rule.status}><header><div><span>{rule.code} · priority {rule.priority}</span><strong>{rule.name}</strong><small>{rule.pinMatchKind} {rule.pinStart}{rule.pinEnd ? `–${rule.pinEnd}` : ''} · {rule.serviceLevel} · effective {formatPolicyDate(rule.effectiveFrom)}{rule.effectiveTo ? ` to ${formatPolicyDate(rule.effectiveTo)}` : ''}</small></div><em>{rule.status}</em></header><p>{rule.serviceable ? 'Serviceable' : 'Blocked'} · {rule.codAllowed ? 'COD allowed' : 'Prepaid only'} · {rule.workingDays.join(', ')} · evidence {rule.evidenceReference}</p>{actionable ? <footer>{canActivate ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void decideRule(rule.id, 'activate', rule.version)}>Activate independently</button> : <small>{rule.createdBy === actorId ? 'Maker–checker control: another authorised user must activate this policy.' : 'You need inventory-execution approval to activate this policy.'}</small>}</footer> : rule.status === 'active' && canApprovePolicy ? <footer><button type="button" className="button button--quiet" disabled={busy} onClick={() => void decideRule(rule.id, 'suspend', rule.version)}>Suspend for review</button></footer> : null}</article>;
        }) : <p className="promise-queue__empty">No policy exists yet. Add an active origin and create the first reviewed domestic PIN rule.</p>}</div>
      </div>
    </details>
  </article>;
}
