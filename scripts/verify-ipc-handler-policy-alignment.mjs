import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registryPath = path.join(root, 'docs', 'phase-0', 'CAPABILITY_REGISTRY.json');
const ipcPath = path.join(root, 'src', 'main', 'ipc.ts');

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const source = await readFile(ipcPath, 'utf8');
const permissioned = new Set(
  registry.capabilities
    .filter((capability) => capability.capability_id.startsWith('epic-bos.ipc.') && typeof capability.permissions?.resource === 'string')
    .map((capability) => capability.capability_id.slice('epic-bos.ipc.'.length)),
);
const handlers = [...source.matchAll(/ipcMain\.handle\(IPC_CHANNELS\.([A-Za-z0-9_]+),/g)];
const violations = [];

for (let index = 0; index < handlers.length; index += 1) {
  const key = handlers[index][1];
  if (!permissioned.has(key)) continue;
  const start = handlers[index].index;
  const end = index + 1 < handlers.length ? handlers[index + 1].index : source.length;
  const handler = source.slice(start, end);
  if (handler.includes('assertAuthenticated(event)')) violations.push(key);
}

if (violations.length) {
  console.error(`Permissioned IPC handlers use generic authentication fallback: ${violations.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`IPC handler/policy alignment is current: ${permissioned.size} permissioned handlers checked.`);
}
