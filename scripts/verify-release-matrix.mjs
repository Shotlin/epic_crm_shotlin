import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const root = path.resolve(args[0] ?? 'out/make');
const expectedVersion = args[1]?.trim() || undefined;
const expectedPlatforms = ['win32', 'darwin', 'linux'];

if (!existsSync(root)) fail(`Release matrix directory does not exist: ${root}`);

const manifests = walk(root).filter((file) => file.endsWith('.manifest.json'));
if (!manifests.length) fail(`No release artifact manifests found under ${root}.`);

const records = manifests.map((manifestPath) => {
  const metadata = readJson(manifestPath);
  if (!metadata.platform || !metadata.version) fail(`${relative(manifestPath)} is missing platform or version metadata.`);
  const verification = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, 'verify-release-artifact.mjs'), manifestPath],
    { encoding: 'utf8' },
  );
  if (verification.status !== 0) {
    fail(`${relative(manifestPath)}\n${(verification.stderr || verification.stdout).trim()}`);
  }
  return { manifestPath, metadata, verification: JSON.parse(verification.stdout) };
});

const filtered = expectedVersion
  ? records.filter(({ metadata }) => metadata.version === expectedVersion)
  : records;
if (!filtered.length) fail(`No release artifact manifests matched version ${expectedVersion}.`);

const observedVersions = [...new Set(records.map(({ metadata }) => String(metadata.version)))];
const versionMismatch = Boolean(expectedVersion && observedVersions.some((version) => version !== expectedVersion));
const rows = expectedPlatforms.map((platform) => {
  const platformRecords = filtered.filter(({ metadata }) => metadata.platform === platform);
  const identityKeys = [...new Set(platformRecords.map(({ metadata }) => JSON.stringify({
    productName: metadata.productName,
    version: metadata.version,
    schemaRevision: metadata.schemaRevision,
    buildRevision: metadata.buildRevision,
    releaseIdentitySha256: metadata.releaseIdentitySha256,
  })) )];
  const nonNative = platformRecords.some(({ metadata }) => metadata.buildEnvironment !== 'native');
  const status = platformRecords.length === 0 ? 'missing' : identityKeys.length !== 1 || versionMismatch ? 'inconsistent' : nonNative ? 'non-native' : 'verified';
  return {
    platform,
    status,
    artifactCount: platformRecords.length,
    artifacts: platformRecords.map(({ metadata, verification }) => ({
      reference: metadata.artifactReference,
      manifestReference: relative(records.find(({ metadata: candidate }) => candidate === metadata)?.manifestPath ?? ''),
      version: metadata.version,
      arch: metadata.arch,
      buildRevision: metadata.buildRevision,
      buildEnvironment: metadata.buildEnvironment,
      schemaRevision: metadata.schemaRevision,
      releaseIdentitySha256: metadata.releaseIdentitySha256,
      artifactSha256: verification.artifactSha256,
      manifestSha256: verification.manifestSha256,
    })),
    nextAction: versionMismatch
      ? `Remove stale artifacts from the matrix and keep only version ${expectedVersion}.`
      : platformRecords.length === 0
      ? `Build and upload the ${platform} artifact from its native release environment.`
      : nonNative
        ? `Rebuild the ${platform} artifact on its native release environment; cross/unknown builds are inspection-only.`
      : identityKeys.length === 1
        ? 'Artifact manifests and checksums agree for this platform.'
        : 'Rebuild the platform artifacts from one source/version/schema identity; mixed artifacts cannot be promoted.',
  };
});

const releaseLineKeys = [...new Set(filtered.map(({ metadata }) => JSON.stringify({
  productName: metadata.productName,
  version: metadata.version,
  schemaRevision: metadata.schemaRevision,
})) )];
const blocked = rows.filter(({ status }) => status !== 'verified');
const report = {
  schema: 'epic-bos.release-matrix-integrity.v1',
  generatedAt: new Date().toISOString(),
  root,
  expectedVersion: expectedVersion ?? null,
  observedVersions,
  releaseLineStatus: releaseLineKeys.length === 1 && !versionMismatch ? 'consistent' : 'inconsistent',
  artifactIntegrityStatus: blocked.length === 0 && releaseLineKeys.length === 1 ? 'verified' : 'blocked',
  releaseDecision: 'hold',
  certificationNote: 'This report verifies artifact integrity and records whether each artifact was built natively. Cross/unknown artifacts remain inspection-only. Code signing, notarisation, provider/device certification, human UAT and production approval remain separate gates.',
  rows,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.artifactIntegrityStatus !== 'verified') process.exitCode = 1;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`Could not read ${relative(file)}: ${error instanceof Error ? error.message : String(error)}`); }
}

function relative(file) {
  return file ? path.relative(process.cwd(), file).split(path.sep).join('/') : '';
}

function fail(message) {
  console.error(`Release matrix verification failed: ${message}`);
  process.exit(1);
}
