import { createHash } from 'node:crypto';
import type { ProviderCertificationHandoff, ProviderCertificationPackage, ProviderCertificationValidation } from '../shared/provider-certification-contract';
import type { ProviderConformanceCase, ProviderConnector } from '../shared/provider-contracts';

export interface ProviderConformanceValidation {
  ready: boolean;
  missing: string[];
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
