import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const [artifactDirectory, evidencePath, expectedPlatform, expectedVersion] = args;
if (!artifactDirectory || !evidencePath || !expectedPlatform || !expectedVersion) {
  fail('Usage: node scripts/verify-smoke-evidence.mjs <artifact-directory> <evidence.json> <platform> <version>');
}
const evidence = readJson(path.resolve(evidencePath), 'smoke evidence');
if (evidence.schema !== 'epic-bos.packaged-smoke-evidence.v1') fail('Unsupported smoke evidence schema.');
if (evidence.platform !== expectedPlatform) fail(`Smoke evidence platform is ${evidence.platform}, not ${expectedPlatform}.`);
if (evidence.version !== expectedVersion) fail(`Smoke evidence version is ${evidence.version}, not ${expectedVersion}.`);
if (evidence.status !== 'passed' || evidence.marker !== 'EPIC_BOS_SMOKE_OK') fail('Smoke evidence does not record a passed packaged launch.');
if (evidence.isolatedProfile !== true) fail('Smoke evidence does not prove an isolated profile.');
if (typeof evidence.buildRevision !== 'string' || !/^(?:[a-f0-9]{7,64}|ci-[a-z0-9][a-z0-9._-]{1,127})$/iu.test(evidence.buildRevision)) fail('Smoke evidence build revision is not immutable.');
if (typeof evidence.outputSha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(evidence.outputSha256)) fail('Smoke evidence output checksum is invalid.');
if (!Number.isFinite(Date.parse(evidence.recordedAt))) fail('Smoke evidence timestamp is invalid.');

const manifests = walk(path.resolve(artifactDirectory)).filter((file) => file.endsWith('.manifest.json')).map((file) => readJson(file, 'release manifest'));
const matching = manifests.filter((manifest) => manifest.platform === expectedPlatform && manifest.version === expectedVersion);
if (!matching.length) fail('No release manifests match the smoke evidence platform and version.');
for (const manifest of matching) {
  if (manifest.buildRevision !== evidence.buildRevision) fail(`Build revision mismatch for ${manifest.artifactReference || 'release manifest'}.`);
}

process.stdout.write(`${JSON.stringify({ ok: true, platform: expectedPlatform, version: expectedVersion, buildRevision: evidence.buildRevision, manifestCount: matching.length, evidence: path.resolve(evidencePath) }, null, 2)}\n`);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`Could not read ${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

function fail(message) { console.error(`Smoke evidence verification failed: ${message}`); process.exit(1); }
