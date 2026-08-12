import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const [artifactDirectory, smokeEvidencePath, outputDirectory, expectedPlatform, expectedVersion] = args;
if (!artifactDirectory || !smokeEvidencePath || !outputDirectory || !expectedPlatform || !expectedVersion) {
  fail('Usage: node scripts/create-release-certification-pack.mjs <artifact-directory> <smoke-evidence.json|-> <output-directory> <platform> <version>');
}

const root = process.cwd();
const artifactsRoot = path.resolve(root, artifactDirectory);
const outputRoot = path.resolve(root, outputDirectory);
if (!existsSync(artifactsRoot)) fail(`Artifact directory does not exist: ${artifactsRoot}`);
if (path.normalize(outputRoot).toLowerCase() === path.normalize(artifactsRoot).toLowerCase()) {
  fail('Certification output must be separate from the artifact directory.');
}

const manifests = walk(artifactsRoot)
  .filter((file) => file.endsWith('.manifest.json'))
  .map((file) => ({ file, metadata: readJson(file) }))
  .filter(({ metadata }) => metadata.platform === expectedPlatform && metadata.version === expectedVersion);
if (!manifests.length) fail(`No release manifests matched ${expectedPlatform}/${expectedVersion}.`);

for (const { file } of manifests) {
  const check = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'verify-release-artifact.mjs'),
    file,
    expectedPlatform,
    expectedVersion,
  ], { encoding: 'utf8' });
  if (check.status !== 0) fail(`Artifact verification failed for ${path.relative(root, file)}: ${(check.stderr || check.stdout).trim()}`);
}

const evidence = smokeEvidencePath === '-'
  ? { status: 'not-provided', reason: 'Native launch evidence was not supplied.' }
  : readSmokeEvidence(path.resolve(root, smokeEvidencePath), artifactsRoot, expectedPlatform, expectedVersion);
const buildRevisions = [...new Set(manifests.map(({ metadata }) => metadata.buildRevision).filter(Boolean))];
const releaseIdentityHashes = [...new Set(manifests.map(({ metadata }) => metadata.releaseIdentitySha256).filter(Boolean))];
const buildEnvironments = [...new Set(manifests.map(({ metadata }) => metadata.buildEnvironment).filter(Boolean))];
const index = {
  schema: 'epic-bos.release-certification-pack.v1',
  product: 'Epic BOS',
  platform: expectedPlatform,
  version: expectedVersion,
  generatedAt: new Date().toISOString(),
  artifactDirectory: path.relative(root, artifactsRoot).split(path.sep).join('/'),
  artifacts: manifests.map(({ file, metadata }) => ({
    reference: metadata.artifactReference,
    manifestReference: path.relative(root, file).split(path.sep).join('/'),
    artifactSha256: metadata.artifactSha256,
    manifestSha256: metadata.manifestSha256,
    releaseIdentitySha256: metadata.releaseIdentitySha256,
    schemaRevision: metadata.schemaRevision,
    buildRevision: metadata.buildRevision,
    buildEnvironment: metadata.buildEnvironment,
  })),
  smokeEvidence: evidence,
  externalGates: {
    codeSigning: 'required',
    macosNotarisation: expectedPlatform === 'darwin' ? 'required' : 'not-applicable',
    nativeLaunchReview: evidence.status === 'passed' ? 'submitted' : 'required',
    nativeBuild: buildEnvironments.length === 1 && buildEnvironments[0] === 'native' ? 'verified' : 'required',
    providerCertification: 'required',
    physicalDeviceCertification: 'required',
    independentReviewer: 'required',
  },
  releaseIdentityConsistent: buildRevisions.length === 1 && releaseIdentityHashes.length === 1,
  goNoGo: 'hold',
  holdReasons: [
    'This pack records unsigned evidence only.',
    ...(buildEnvironments.length === 1 && buildEnvironments[0] === 'native' ? [] : ['The artifact was not proven to come from a native target runner.']),
    'Provider and physical-device certification must be supplied by the selected production providers and store hardware.',
    ...(evidence.status === 'passed' ? [] : ['Native launch smoke evidence is missing or not independently verified.']),
  ],
};
const canonical = JSON.stringify(index);
const pack = { ...index, packSha256: createHash('sha256').update(canonical, 'utf8').digest('hex') };
mkdirSync(outputRoot, { recursive: true });
writeFileSync(path.join(outputRoot, 'release-certification-index.json'), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
writeFileSync(path.join(outputRoot, 'README.md'), renderReadme(pack), 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: path.relative(root, outputRoot).split(path.sep).join('/'), artifactCount: pack.artifacts.length, smokeStatus: pack.smokeEvidence.status, goNoGo: pack.goNoGo, packSha256: pack.packSha256 }, null, 2)}\n`);

function readSmokeEvidence(file, artifactRoot, platform, version) {
  if (!existsSync(file)) return { status: 'not-provided', reason: `Evidence file does not exist: ${path.relative(root, file)}` };
  const check = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-smoke-evidence.mjs'), artifactRoot, file, platform, version], { encoding: 'utf8' });
  if (check.status !== 0) return { status: 'invalid', reason: (check.stderr || check.stdout).trim() };
  return { status: 'passed', reference: path.relative(root, file).split(path.sep).join('/'), verification: JSON.parse(check.stdout) };
}

function renderReadme(pack) {
  return `# Epic BOS release certification pack\n\n- Platform: **${pack.platform}**\n- Version: **${pack.version}**\n- Go/no-go: **HOLD**\n- Pack checksum: \`${pack.packSha256}\`\n\n## Verified locally\n\n${pack.artifacts.map((artifact) => `- \`${artifact.reference}\` — artifact SHA-256 \`${artifact.artifactSha256}\`, build \`${artifact.buildRevision}\``).join('\n')}\n- Packaged smoke evidence: **${pack.smokeEvidence.status}**\n\n## Required before release\n\n- Code signing and independent signature verification\n- ${pack.externalGates.macosNotarisation === 'required' ? 'macOS notarisation and staple verification\n- ' : ''}Native launch/install review on the target operating system\n- Real provider certification using selected credentials and sandbox/production evidence\n- Real printer, scanner, cash-drawer, and weighing-scale certification where deployed\n- Independent release approval and rollback evidence\n\nThis pack is evidence collection only. It deliberately cannot certify external providers, hardware, signatures, or production readiness by itself.\n`;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

function fail(message) {
  console.error(`Release certification pack failed: ${message}`);
  process.exit(1);
}
