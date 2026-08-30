import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const platform = String(process.argv.slice(2).find((argument) => argument !== '--') || process.platform);
const root = process.cwd();
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const outputRoot = process.env.EPIC_BOS_OUT_DIR?.trim() || 'out';
const executableByPlatform = {
  win32: path.join(root, outputRoot, 'Epic BOS-win32-x64', 'epic-bos.exe'),
  linux: path.join(root, outputRoot, 'Epic BOS-linux-x64', 'epic-bos'),
  darwin: path.join(root, outputRoot, 'Epic BOS-darwin-x64', 'Epic BOS.app', 'Contents', 'MacOS', 'Epic BOS'),
};
const executable = executableByPlatform[platform];
if (!executable) throw new Error(`Unsupported packaged smoke platform: ${platform}`);
if (!existsSync(executable)) throw new Error(`Packaged executable is missing: ${executable}`);
const buildRevision = resolveBuildRevision();

const userData = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-smoke-'));
const child = spawn(executable, [], {
  cwd: root,
  env: { ...process.env, EPIC_BOS_SMOKE: '1', EPIC_BOS_SMOKE_USER_DATA: userData },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
const collect = (chunk) => {
  output += String(chunk);
  process.stdout.write(chunk);
};
child.stdout.on('data', collect);
child.stderr.on('data', collect);

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 30_000);
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});
clearTimeout(timeout);
await rm(userData, { recursive: true, force: true });
if (exitCode !== 0 || !output.includes('EPIC_BOS_SMOKE_OK')) {
  throw new Error(`Packaged ${platform} smoke failed (exit ${exitCode}).`);
}
const evidencePath = process.env.EPIC_BOS_SMOKE_EVIDENCE?.trim();
if (evidencePath) {
  await mkdir(path.dirname(path.resolve(root, evidencePath)), { recursive: true });
  await writeFile(
    path.resolve(root, evidencePath),
    `${JSON.stringify({
      schema: 'epic-bos.packaged-smoke-evidence.v1',
      platform,
      version,
      buildRevision,
      executable: path.relative(root, executable),
      status: 'passed',
      marker: 'EPIC_BOS_SMOKE_OK',
      outputSha256: createHash('sha256').update(output).digest('hex'),
      isolatedProfile: true,
      recordedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  );
}
console.log(`Packaged ${platform} smoke passed.`);

function resolveBuildRevision() {
  const declared = process.env.EPIC_BOS_BUILD_REVISION?.trim();
  if (declared) return declared;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}
