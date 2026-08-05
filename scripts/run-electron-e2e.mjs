import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const outputRoot = process.env.EPIC_BOS_E2E_OUT_DIR?.trim()
  ? path.resolve(root, process.env.EPIC_BOS_E2E_OUT_DIR.trim())
  : path.join(os.tmpdir(), 'epic-bos-e2e-package', runId);
const artifactsRoot = process.env.EPIC_BOS_E2E_ARTIFACTS_DIR?.trim()
  ? path.resolve(root, process.env.EPIC_BOS_E2E_ARTIFACTS_DIR.trim())
  : path.join(os.tmpdir(), 'epic-bos-e2e-evidence', runId);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

await mkdir(artifactsRoot, { recursive: true });
await run(pnpm, ['package'], {
  ...process.env,
  EPIC_BOS_OUT_DIR: outputRoot,
});

const executable = executableForPlatform(outputRoot);
await access(executable);

process.stdout.write(`Electron E2E package: ${executable}\n`);
process.stdout.write(`Electron E2E evidence: ${artifactsRoot}\n`);
await run(pnpm, ['exec', 'vitest', 'run', '--config', 'vitest.electron-e2e.config.ts'], {
  ...process.env,
  EPIC_BOS_E2E_EXECUTABLE: executable,
  EPIC_BOS_E2E_ARTIFACTS_DIR: artifactsRoot,
});

function executableForPlatform(outDir) {
  if (process.platform === 'win32') {
    return path.join(outDir, 'Epic BOS-win32-x64', 'epic-bos.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(outDir, 'Epic BOS-darwin-x64', 'Epic BOS.app', 'Contents', 'MacOS', 'Epic BOS');
  }
  if (process.platform === 'linux') {
    return path.join(outDir, 'Epic BOS-linux-x64', 'epic-bos');
  }
  throw new Error(`Unsupported Electron E2E platform: ${process.platform}`);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const commandForPlatform = isWindows
      ? process.env.ComSpec || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
      : command;
    const argumentsForPlatform = isWindows
      ? ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArgument).join(' ')]
      : args;
    const child = spawn(commandForPlatform, argumentsForPlatform, {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 && !signal) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit ${code}`}.`));
    });
  });
}

function quoteWindowsArgument(argument) {
  const value = String(argument);
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\*)$/u, '$1$1')}"`;
}
