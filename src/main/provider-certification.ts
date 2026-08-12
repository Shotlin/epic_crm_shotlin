import { createHash } from 'node:crypto';
import type { ProviderCertificationHandoff, ProviderCertificationPackage, ProviderCertificationPackageVerification, ProviderCertificationValidation, CertificationProviderDomain } from '../shared/provider-certification-contract';
import type { ProviderConformanceCase, ProviderConnector } from '../shared/provider-contracts';

export interface ProviderConformanceValidation {
  ready: boolean;
  missing: string[];
}

const certificationDomains = new Set<CertificationProviderDomain>(['gsp-irp', 'banking', 'payroll', 'messaging', 'logistics']);
const prohibitedCredentialKey = /(?:password|secret|token|api[-_]?key|access[-_]?key|authorization|private[-_]?key|client[-_]?secret|signing[-_]?key|fingerprint)/i;
const providerPackageKeys = new Set(['domain', 'providerName', 'contractReference', 'sandboxEvidenceReference', 'credentialRevision', 'productionApprovalReference', 'credentialOwner', 'independentApprover', 'testCaseReferences', 'generatedAt', 'generatedBy', 'readyForSandbox', 'readyForProduction', 'missing', 'checksum']);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function collectProhibitedCredentialKeys(value: unknown, path = '$', found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectProhibitedCredentialKeys(item, `${path}[${index}]`, found));
    return found;
  }
  if (!isRecord(value)) return found;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (prohibitedCredentialKey.test(key)) found.push(childPath);
    collectProhibitedCredentialKeys(child, childPath, found);
  });
  return found;
}

/**
 * Verifies a provider handoff package independently of local provider state.
 * It validates the checksum and the derived readiness flags, but never imports
 * the package or treats it as a live provider acknowledgement.
 */
export function verifyProviderCertificationPackage(input: unknown, options: { currentCredentialRevision?: number } = {}): ProviderCertificationPackageVerification {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, declaredChecksum: '', missing: [], errors: ['Provider certification package must be a JSON object.'] };
  const declaredChecksum = typeof input.checksum === 'string' ? input.checksum : '';
  const { checksum: _checksum, ...unsigned } = input;
  void _checksum;
  const computedChecksum = createHash('sha256').update(JSON.stringify(unsigned), 'utf8').digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(declaredChecksum)) errors.push('Declared checksum is not a SHA-256 digest.');
  if (declaredChecksum.toLowerCase() !== computedChecksum) errors.push('Provider certification package checksum does not match its contents.');
  const prohibitedPaths = collectProhibitedCredentialKeys(input);
  if (prohibitedPaths.length) errors.push(`Provider certification package contains prohibited credential fields: ${prohibitedPaths.slice(0, 5).join(', ')}.`);
  Object.keys(input).filter((key) => !providerPackageKeys.has(key)).forEach((key) => errors.push(`Provider certification package contains an unknown field: ${key}.`));
  if (!certificationDomains.has(input.domain as CertificationProviderDomain)) errors.push('Provider certification domain is invalid.');
  if (!nonEmptyString(input.generatedAt) || !Number.isFinite(Date.parse(input.generatedAt))) errors.push('Generated timestamp is invalid.');
  if (!nonEmptyString(input.generatedBy)) errors.push('Accountable generator is missing.');
  const handoff: ProviderCertificationHandoff = {
    domain: input.domain as CertificationProviderDomain,
    providerName: typeof input.providerName === 'string' ? input.providerName : '',
    contractReference: typeof input.contractReference === 'string' ? input.contractReference : '',
    sandboxEvidenceReference: typeof input.sandboxEvidenceReference === 'string' ? input.sandboxEvidenceReference : '',
    credentialRevision: typeof input.credentialRevision === 'number' ? input.credentialRevision : 0,
    productionApprovalReference: typeof input.productionApprovalReference === 'string' ? input.productionApprovalReference : undefined,
    credentialOwner: typeof input.credentialOwner === 'string' ? input.credentialOwner : '',
    independentApprover: typeof input.independentApprover === 'string' ? input.independentApprover : undefined,
    testCaseReferences: Array.isArray(input.testCaseReferences) ? input.testCaseReferences.filter((reference): reference is string => typeof reference === 'string') : [],
  };
  const validation = validateProviderCertificationHandoff(handoff);
  const credentialRevision = typeof input.credentialRevision === 'number' ? input.credentialRevision : undefined;
  if (options.currentCredentialRevision !== undefined) {
    if (!Number.isSafeInteger(options.currentCredentialRevision) || options.currentCredentialRevision < 1) errors.push('Current credential revision is invalid.');
    else if (credentialRevision !== options.currentCredentialRevision) errors.push('Provider certification package uses a stale credential revision.');
  }
  const declaredMissing = Array.isArray(input.missing) ? input.missing.filter((item): item is string => typeof item === 'string') : [];
  if (!Array.isArray(input.missing) || input.missing.some((item) => typeof item !== 'string')) errors.push('Missing evidence list must contain only strings.');
  if (JSON.stringify([...declaredMissing].sort()) !== JSON.stringify([...validation.missing].sort())) errors.push('Missing evidence list does not match the handoff fields.');
  if (typeof input.readyForSandbox !== 'boolean' || input.readyForSandbox !== validation.readyForSandbox) errors.push('Sandbox readiness does not match the handoff evidence.');
  if (typeof input.readyForProduction !== 'boolean' || input.readyForProduction !== validation.readyForProduction) errors.push('Production readiness does not match the handoff evidence.');
  return {
    valid: errors.length === 0,
    declaredChecksum,
    computedChecksum,
    credentialRevision,
    readyForSandbox: typeof input.readyForSandbox === 'boolean' ? input.readyForSandbox : undefined,
    readyForProduction: typeof input.readyForProduction === 'boolean' ? input.readyForProduction : undefined,
    missing: declaredMissing,
    errors,
  };
}

/** Validates a conformance case as evidence, without treating a planned case as a pass. */
export function validateProviderConformanceCase(input: ProviderConformanceCase, expectedEnvironment?: ProviderConnector['environment']): ProviderConformanceValidation {
  const missing: string[] = [];
  if (!input.suiteName.trim()) missing.push('suite name');
  if (!input.suiteVersion.trim()) missing.push('suite version');
  if (!input.scenario.trim()) missing.push('scenario');
  if (expectedEnvironment && input.environment !== expectedEnvironment) missing.push('environment match');
  if (input.result !== 'passed') missing.push('passed result');
  if (!input.evidenceReference?.trim()) missing.push('evidence reference');
  if (!/^[a-f0-9]{64}$/i.test(input.resultChecksum ?? '')) missing.push('result checksum');
  if (!input.preparedBy.trim() || !Number.isFinite(Date.parse(input.preparedAt))) missing.push('preparer evidence');
  if (!input.assessedBy?.trim() || !input.assessedAt || !Number.isFinite(Date.parse(input.assessedAt))) missing.push('independent assessment');
  return { ready: missing.length === 0, missing };
}

export function validateProviderCertificationHandoff(input: ProviderCertificationHandoff): ProviderCertificationValidation {
  const missing: string[] = [];
  if (!input.providerName.trim()) missing.push('provider name');
  if (!input.contractReference.trim()) missing.push('provider contract reference');
  if (!input.sandboxEvidenceReference.trim()) missing.push('sandbox evidence reference');
  if (!Number.isSafeInteger(input.credentialRevision) || input.credentialRevision < 1) missing.push('credential revision');
  if (!input.credentialOwner.trim()) missing.push('credential owner');
  if (!input.testCaseReferences.length) missing.push('test-case references');
  if (!input.independentApprover?.trim()) missing.push('independent approver');
  return { readyForSandbox: missing.filter((item) => item !== 'independent approver').length === 0, readyForProduction: missing.length === 0 && Boolean(input.productionApprovalReference?.trim()), missing: input.productionApprovalReference?.trim() ? missing : [...missing, 'production approval reference'] };
}

/** Creates a redacted provider handoff artifact; it never contains credentials or signed payloads. */
export function createProviderCertificationPackage(input: ProviderCertificationHandoff, generatedBy: string, generatedAt = new Date().toISOString()): ProviderCertificationPackage {
  if (!generatedBy.trim() || !Number.isFinite(Date.parse(generatedAt))) throw new Error('Provider certification package requires an accountable actor and valid timestamp.');
  const validation = validateProviderCertificationHandoff(input);
  const unsigned = { ...input, testCaseReferences: [...input.testCaseReferences].map((reference) => reference.trim()).filter(Boolean).sort(), generatedAt, generatedBy: generatedBy.trim(), readyForSandbox: validation.readyForSandbox, readyForProduction: validation.readyForProduction, missing: [...validation.missing].sort() };
  return { ...unsigned, checksum: createHash('sha256').update(JSON.stringify(unsigned), 'utf8').digest('hex') };
}
