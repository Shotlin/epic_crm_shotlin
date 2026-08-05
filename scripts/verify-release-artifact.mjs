import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const manifestPath = args[0];
if (!manifestPath) fail('Usage: node scripts/verify-release-artifact.mjs <artifact.manifest.json> [platform] [version]');

const resolvedManifestPath = path.resolve(manifestPath);
const manifest = readJson(resolvedManifestPath, 'release manifest');
const required = ['productName', 'version', 'platform', 'arch', 'buildRevision', 'schemaRevision', 'releaseIdentitySha256', 'artifactReference', 'artifactSha256', 'generatedAt', 'canonicalJson', 'manifestSha256'];
for (const field of required) if (!(field in manifest)) fail(`Manifest is missing ${field}.`);
if (manifest.schemaVersion !== 1) fail('Unsupported release manifest schema.');
if (!['win32', 'darwin', 'linux'].includes(manifest.platform)) fail('Manifest platform is invalid.');
if (!Number.isInteger(manifest.schemaRevision) || manifest.schemaRevision < 1) fail('Manifest schema revision is invalid.');
if (!/^ci-[A-Za-z0-9._-]+$/u.test(manifest.buildRevision)) fail('Manifest build revision is not immutable.');
for (const [label, value] of [['release identity', manifest.releaseIdentitySha256], ['artifact', manifest.artifactSha256], ['manifest', manifest.manifestSha256]]) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/iu.test(value)) fail(`Manifest ${label} checksum is invalid.`);
}
if (!Number.isFinite(Date.parse(manifest.generatedAt))) fail('Manifest timestamp is invalid.');
if (args[1] && manifest.platform !== args[1]) fail(`Manifest platform is ${manifest.platform}, not ${args[1]}.`);
if (args[2] && manifest.version !== args[2]) fail(`Manifest version is ${manifest.version}, not ${args[2]}.`);

const canonicalPayload = {
  schemaVersion: 1,
  productName: manifest.productName,
  version: manifest.version,
  platform: manifest.platform,
  arch: manifest.arch,
  buildRevision: manifest.buildRevision,
  schemaRevision: manifest.schemaRevision,
  releaseIdentitySha256: manifest.releaseIdentitySha256,
  artifactReference: manifest.artifactReference,
  artifactSha256: manifest.artifactSha256,
  generatedAt: manifest.generatedAt,
};
const canonicalJson = JSON.stringify(canonicalPayload);
if (manifest.canonicalJson !== canonicalJson) fail('Manifest canonical JSON does not match its fields.');
if (sha256(canonicalJson) !== manifest.manifestSha256.toLowerCase()) fail('Manifest checksum does not match canonical JSON.');

const artifactPath = path.resolve(process.cwd(), manifest.artifactReference);
if (!existsSync(artifactPath)) fail(`Artifact does not exist: ${artifactPath}`);
const actualArtifactSha256 = sha256(readFileSync(artifactPath));
if (actualArtifactSha256 !== manifest.artifactSha256.toLowerCase()) fail(`Artifact checksum mismatch: expected ${manifest.artifactSha256}, got ${actualArtifactSha256}.`);

process.stdout.write(`${JSON.stringify({ ok: true, platform: manifest.platform, version: manifest.version, artifact: artifactPath, artifactSha256: actualArtifactSha256, manifestSha256: manifest.manifestSha256.toLowerCase() }, null, 2)}\n`);

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`Could not read ${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function fail(message) { console.error(`Release artifact verification failed: ${message}`); process.exit(1); }
