// Epic BOS API client. Talks to the same Fastify backend the Electron app bundles,
// over the same origin the SPA is served from (/ui/app/ -> /api). Fully offline-capable.
const KEY = "dev-key-change-me";

// When served at /ui/app/, the API is at ../../api relative to origin root.
const BASE = "/api";

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: { "x-api-key": KEY } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `POST ${path} -> ${res.status}`);
  }
  return res.json();
}

// Convenience for entity CRUD
export const listEntity = <T = any>(entity: string) => apiGet<T[]>(`/${entity}`);
export const createEntity = <T = any>(entity: string, data: any) => apiPost<T>(`/${entity}`, { data });
