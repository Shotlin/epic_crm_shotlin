import { createBakalooShadowHttpAdapterFromVault, type BakalooShadowCredentialVaultAdapterOptions } from './bakaloo-shadow-credential-vault';
import { pullAndRegisterScopedShadowImport, type RegisterScopedShadowImportPullInput, type RegisteredScopedShadowImportPull } from './shadow-import-postgres-pull-runtime';
import type { ShadowImportPostgresRepository } from './shadow-import-postgres-repository';

export interface RegisterBakalooShadowImportFromVaultOptions {
  source: BakalooShadowCredentialVaultAdapterOptions;
  repository: ShadowImportPostgresRepository;
  input: RegisterScopedShadowImportPullInput;
  registeredAt?: string;
}

/**
 * The single durable entry point for a real Bakaloo shadow pull. It resolves
 * secrets inside the Hub, performs only bounded GET requests, binds evidence
 * to the credential generation, and registers through immutable scoped SQL.
 */
export async function pullAndRegisterBakalooShadowImportFromVault(
  options: RegisterBakalooShadowImportFromVaultOptions,
): Promise<RegisteredScopedShadowImportPull> {
  if (await options.repository.getPlan(options.source.scope, options.input.batchId)) throw new Error('Shadow-import batch already exists; use a new batch ID instead of replacing reviewed evidence.');
  const adapter = await createBakalooShadowHttpAdapterFromVault(options.source);
  return pullAndRegisterScopedShadowImport(adapter, options.repository, options.source.scope, options.input, options.registeredAt);
}
