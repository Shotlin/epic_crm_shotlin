import type { ShadowImportSourceAdapter, ShadowImportSourcePage } from './shadow-import-source-adapter';

export interface BakalooShadowHttpRequest {
  method: 'GET';
  url: string;
  headers: Readonly<Record<string, string>>;
}

export interface BakalooShadowHttpResponse {
  status: number;
  body: unknown;
  contentType?: string;
  byteLength?: number;
}

/**
 * Server-owned transport seam. The requester may add credentials from a vault,
 * but callers cannot supply headers or a write-capable method through this
 * adapter.
 */
export type BakalooShadowHttpRequester = (request: BakalooShadowHttpRequest) => Promise<BakalooShadowHttpResponse>;

export interface BakalooShadowHttpAdapterOptions {
  baseUrl: string;
  pagePath: string;
  requester: BakalooShadowHttpRequester;
  maxResponseBytes?: number;
  /** Non-secret vault generation bound to every page request. */
  credentialRevision?: number;
  /** Optional authoritative vault check executed before every page request. */
  resolveCredentialRevision?: () => number | Promise<number>;
}

const defaultMaxResponseBytes = 5 * 1024 * 1024;

/** Creates a GET-only adapter for a future approved Bakaloo source boundary. */
export function createBakalooShadowHttpAdapter(options: BakalooShadowHttpAdapterOptions): ShadowImportSourceAdapter {
  const baseUrl = safeBaseUrl(options.baseUrl);
  const pagePath = safePagePath(options.pagePath);
  if (typeof options.requester !== 'function') throw new Error('Bakaloo shadow HTTP adapter requires a server-side requester.');
  if (options.credentialRevision !== undefined && (!Number.isInteger(options.credentialRevision) || options.credentialRevision < 1)) throw new Error('Bakaloo shadow HTTP credential revision must be a positive integer.');
  if (options.resolveCredentialRevision !== undefined && typeof options.resolveCredentialRevision !== 'function') throw new Error('Bakaloo shadow HTTP credential revision resolver must be a function.');
  const maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 50 * 1024 * 1024) throw new Error('Bakaloo shadow HTTP response limit must be between 1024 and 52428800 bytes.');

  return {
    source: 'bakaloo',
    credentialRevision: options.credentialRevision,
    async pullPage(input) {
      if (options.credentialRevision !== undefined && options.resolveCredentialRevision) {
        const currentRevision = await options.resolveCredentialRevision();
        if (currentRevision !== options.credentialRevision) throw new Error('Bakaloo shadow HTTP credentials rotated during the pull; discard this snapshot and start a new revision.');
      }
      const url = new URL(pagePath, baseUrl);
      if (input.cursor !== undefined) {
        const cursor = input.cursor.trim();
        if (!cursor) throw new Error('Bakaloo shadow HTTP cursor must not be blank.');
        url.searchParams.set('cursor', cursor);
      }
      const response = await options.requester({ method: 'GET', url: url.toString(), headers: { accept: 'application/json' } });
      if (!Number.isInteger(response.status) || response.status !== 200) throw new Error(`Bakaloo shadow HTTP source returned status ${response.status}; no evidence was accepted.`);
      if (response.contentType && !/^application\/json(?:\s*;|$)/i.test(response.contentType)) throw new Error('Bakaloo shadow HTTP source must return application/json.');
      const serialized = safeJson(response.body);
      const byteLength = response.byteLength ?? Buffer.byteLength(serialized, 'utf8');
      if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > maxResponseBytes) throw new Error(`Bakaloo shadow HTTP response exceeds the ${maxResponseBytes}-byte safety limit.`);
      if (!response.body || typeof response.body !== 'object' || Array.isArray(response.body)) throw new Error('Bakaloo shadow HTTP source must return a JSON page object.');
      return response.body as ShadowImportSourcePage;
    },
  };
}

function safeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Bakaloo shadow HTTP base URL must be a credential-free HTTPS origin or path.');
  return url.toString().replace(/\/$/, '');
}

function safePagePath(value: string): string {
  const path = value.trim();
  if (!path.startsWith('/') || path.includes('://') || path.includes('..') || path.includes('#')) throw new Error('Bakaloo shadow HTTP page path must be a safe same-origin path.');
  return path;
}

function safeJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('undefined');
    return serialized;
  } catch {
    throw new Error('Bakaloo shadow HTTP response is not JSON-serializable.');
  }
}
