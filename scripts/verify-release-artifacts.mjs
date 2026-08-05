import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const root = path.resolve(args[0] ?? 'out/make');
const expectedPlatform = args[1];
const expectedVersion = args[2];
if (!existsSync(root)) fail(`Artifact directory does not exist: ${root}`);

const manifests = walk(root).filter((file) => /(?:Setup\.exe|\.zip|\.nupkg)\.manifest\.json$/iu.test(file));
if (!manifests.length) fail(`No release artifact manifests found under ${root}.`);
const results = [];
for (const manifest of manifests) {
  const metadata = readJson(manifest);
  if (expectedPlatform && metadata.platform !== expectedPlatform) continue;
  if (expectedVersion && metadata.version !== expectedVersion) continue;
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'verify-release-artifact.mjs'), manifest, ...(expectedPlatform ? [expectedPlatform] : []), ...(expectedVersion ? [expectedVersion] : [])], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${path.relative(process.cwd(), manifest)}\n${(result.stderr || result.stdout).trim()}`);
  results.push(JSON.parse(result.stdout));
}
if (!results.length) fail('No manifests matched the requested platform/version filter.');
process.stdout.write(`${JSON.stringify({ ok: true, count: results.length, artifacts: results }, null, 2)}\n`);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

function fail(message) { console.error(`Release artifact directory verification failed: ${message}`); process.exit(1); }
