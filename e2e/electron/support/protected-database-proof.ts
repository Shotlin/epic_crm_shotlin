import { createRequire } from 'node:module';
import { access, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBinary = require('electron') as string;
const helper = path.resolve(process.cwd(), 'scripts', 'unseal-e2e-database.mjs');
const rewrapHelper = path.resolve(process.cwd(), 'scripts', 'rewrap-e2e-database.mjs');

/**
 * The production app removes its plaintext runtime database on graceful
 * shutdown. E2E evidence therefore asks a disposable Electron helper to
 * decrypt the sealed copy using the same OS-protected key, then reads that
 * independent SQLite copy with node:sqlite. The helper is hard-gated by
 * EPIC_BOS_E2E and is never part of the packaged application.
 */
export async function materializeProtectedE2eDatabase(legacyPath: string): Promise<string> {
  const profile = path.dirname(path.dirname(legacyPath));
  const encryptedPath = `${legacyPath}.enc`;
  const outputPath = `${legacyPath}.e2e-proof.sqlite3`;
  const parentEnvironment = { ...process.env };
  delete parentEnvironment.ELECTRON_RUN_AS_NODE;
  await rm(outputPath, { force: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(electronBinary, [helper, profile, encryptedPath, outputPath], {
      cwd: process.cwd(),
      env: { ...parentEnvironment, EPIC_BOS_E2E: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 && !signal) {
        resolve();
      } else {
        reject(new Error(`Could not materialize protected E2E database (exit ${code ?? signal}). ${stdout} ${stderr}`.trim()));
      }
    });
  });
  await access(outputPath);
  return outputPath;
}

/**
 * Re-seals a disposable E2E database after a test has deliberately changed
 * its isolated plaintext copy. This is never available to the packaged app;
 * it exists only to model authenticated recovery evidence without touching a
 * real workspace or provider database.
 */
export async function rewrapProtectedE2eDatabase(
  legacyPath: string,
  plaintextPath: string,
): Promise<void> {
  const profile = path.dirname(path.dirname(legacyPath));
  const encryptedPath = `${legacyPath}.enc`;
  const parentEnvironment = { ...process.env };
  delete parentEnvironment.ELECTRON_RUN_AS_NODE;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(electronBinary, [rewrapHelper, profile, plaintextPath, encryptedPath], {
      cwd: process.cwd(),
      env: { ...parentEnvironment, EPIC_BOS_E2E: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 && !signal) resolve();
      else reject(new Error(`Could not re-seal protected E2E database (exit ${code ?? signal}). ${stdout} ${stderr}`.trim()));
    });
  });
}
