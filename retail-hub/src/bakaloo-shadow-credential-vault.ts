import type { ShadowImportSourceAdapter } from './shadow-import-source-adapter';
import type { ShadowImportScope } from './shadow-import-postgres-repository';
import {
  createBakalooShadowHttpAdapter,
  type BakalooShadowHttpAdapterOptions,
  type BakalooShadowHttpRequest,
  type BakalooShadowHttpResponse,
  type BakalooShadowHttpRequester,
} from './bakaloo-shadow-http-adapter';

/** Secret material is resolved only inside the server-owned Hub process. */
export interface BakalooShadowCredentialMaterial {
  revision: number;
  headers: Readonly<Record<string, string>>;
}

export interface BakalooShadowCredentialVault {
  resolve(input: { scope: ShadowImportScope; credentialRef: string }): Promise<BakalooShadowCredentialMaterial | undefined>;
}

export interface BakalooShadowVaultRequester {
  request(request: BakalooShadowHttpRequest): Promise<BakalooShadowHttpResponse>;
}

export interface BakalooShadowCredentialVaultAdapterOptions extends Omit<BakalooShadowHttpAdapterOptions, 'requester' | 'credentialRevision' | 'resolveCredentialRevision'> {
  scope: ShadowImportScope;
  credentialRef: string;
  vault: BakalooShadowCredentialVault;
  transport: BakalooShadowVaultRequester | BakalooShadowHttpRequester;
}

/**
 * Builds a GET-only source adapter from a server-side credential vault. The
 * caller can provide a credential reference but never a secret header. Every
 * request must use the same vault revision; if the secret rotates mid-pull,
 * the adapter fails closed before sending the page request.
 */
export async function createBakalooShadowHttpAdapterFromVault(
  options: BakalooShadowCredentialVaultAdapterOptions,
): Promise<ShadowImportSourceAdapter> {
  const credentialRef = normalizeCredentialRef(options.credentialRef);
  if (!options.vault || typeof options.vault.resolve !== 'function') throw new Error('Bakaloo shadow credential vault must provide a server-side resolve function.');
  if (!options.transport || typeof options.transport === 'function' ? typeof options.transport !== 'function' : typeof options.transport.request !== 'function') {
    throw new Error('Bakaloo shadow vault transport must provide a server-side request function.');
  }
  const initial = await resolveMaterial(options, credentialRef);
  let expectedRevision = initial.revision;

  const requester: BakalooShadowHttpRequester = async (request) => {
    const material = await resolveMaterial(options, credentialRef);
    if (material.revision !== expectedRevision) throw new Error('Bakaloo shadow credentials rotated before the page request; discard this snapshot and start a new revision.');
    const headers = { ...request.headers, ...material.headers };
    return typeof options.transport === 'function'
      ? options.transport({ ...request, headers })
      : options.transport.request({ ...request, headers });
  };

  return createBakalooShadowHttpAdapter({
    baseUrl: options.baseUrl,
    pagePath: options.pagePath,
    requester,
    maxResponseBytes: options.maxResponseBytes,
    credentialRevision: initial.revision,
    resolveCredentialRevision: async () => {
      const material = await resolveMaterial(options, credentialRef);
      expectedRevision = material.revision;
      return material.revision;
    },
  });
}

async function resolveMaterial(options: BakalooShadowCredentialVaultAdapterOptions, credentialRef: string): Promise<BakalooShadowCredentialMaterial> {
  const material = await options.vault.resolve({ scope: options.scope, credentialRef });
  if (!material) throw new Error('Bakaloo shadow credential reference is not configured in the server vault.');
  if (!Number.isInteger(material.revision) || material.revision < 1) throw new Error('Bakaloo shadow vault returned an invalid credential revision.');
  if (!material.headers || typeof material.headers !== 'object' || Array.isArray(material.headers)) throw new Error('Bakaloo shadow vault returned invalid request headers.');
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(material.headers)) {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(key) || typeof value !== 'string' || value.length > 2_000) throw new Error('Bakaloo shadow vault returned invalid credential headers.');
    headers[key] = value;
  }
  if (!Object.keys(headers).length) throw new Error('Bakaloo shadow vault returned no credential headers.');
  return { revision: material.revision, headers };
}

function normalizeCredentialRef(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/.test(normalized)) throw new Error('Bakaloo shadow credential reference must be a non-secret vault identifier.');
  return normalized;
}
