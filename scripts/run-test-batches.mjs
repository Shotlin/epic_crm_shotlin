import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Run the Electron renderer/unit suites in bounded, auditable batches.
 *
 * A single jsdom invocation is deliberately not used here: the application
 * currently has a large suite and one long-lived worker can exceed CI/desktop
 * runner limits without producing a useful failure boundary. Every batch is
 * independent, writes a log, and stops at the first non-zero/timeout result.
 */
const root = process.cwd();
const options = parseOptions(process.argv.slice(2).filter((argument) => argument !== '--'));
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const outputRoot = options.output
  ? path.resolve(root, options.output)
  : path.join(os.tmpdir(), 'epic-bos-test-batches', runId);
await mkdir(outputRoot, { recursive: true });

const discoveredFiles = (await walk(path.join(root, 'src')))
  .filter((file) => /\.test\.tsx?$/u.test(file))
  .sort((a, b) => a.localeCompare(b));
const testFiles = options.filter
  ? discoveredFiles.filter((file) => options.filter.test(path.relative(root, file).split(path.sep).join('/')))
  : discoveredFiles;
if (!testFiles.length) fail('No Electron test files were found under src/.');

const batches = chunk(testFiles, options.batchSize);
const startedAt = new Date().toISOString();
const results = [];
process.stdout.write(`Electron test batches: ${testFiles.length} files in ${batches.length} batches\n`);
process.stdout.write(`Evidence directory: ${path.relative(root, outputRoot).split(path.sep).join('/')}\n`);

for (let index = 0; index < batches.length; index += 1) {
  const batch = batches[index];
  const label = String(index + 1).padStart(String(batches.length).length, '0');
  const logFile = path.join(outputRoot, `batch-${label}.log`);
  const started = Date.now();
  process.stdout.write(`\n[${index + 1}/${batches.length}] ${batch.length} files\n`);
  const result = await runBatch(batch, logFile, options.timeoutMs);
  const record = {
    batch: index + 1,
    files: batch.map((file) => path.relative(root, file).split(path.sep).join('/')),
    log: path.relative(root, logFile).split(path.sep).join('/'),
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: Date.now() - started,
  };
  results.push(record);
  process.stdout.write(`[${index + 1}/${batches.length}] ${result.status} (${record.durationMs}ms)\n`);
  if (result.status !== 'passed') break;
}

const summary = {
  schema: 'epic-bos.electron-test-batches.v1',
  startedAt,
  completedAt: new Date().toISOString(),
  testFileCount: testFiles.length,
  batchSize: options.batchSize,
  timeoutMs: options.timeoutMs,
  completedBatchCount: results.length,
  passedBatchCount: results.filter((result) => result.status === 'passed').length,
  status: results.length === batches.length && results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
  results,
};
await import('node:fs/promises').then(({ writeFile }) => writeFile(
  path.join(outputRoot, 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
));
process.stdout.write(`\n${JSON.stringify({ ...summary, output: path.relative(root, outputRoot).split(path.sep).join('/') }, null, 2)}\n`);
if (summary.status !== 'passed') process.exitCode = 1;

function parseOptions(args) {
  const options = { batchSize: 24, timeoutMs: 120_000, output: process.env.EPIC_BOS_TEST_BATCH_OUT_DIR?.trim() || '', filter: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--batch-size') options.batchSize = positiveInteger(args[++index], 'batch-size');
    else if (argument === '--timeout-ms') options.timeoutMs = positiveInteger(args[++index], 'timeout-ms');
    else if (argument === '--output') options.output = args[++index] || '';
    else if (argument === '--filter') options.filter = regularExpression(args[++index]);
    else if (argument === '--help' || argument === '-h') {
      process.stdout.write('Usage: node scripts/run-test-batches.mjs [--batch-size 24] [--timeout-ms 120000] [--filter <regex>] [--output <dir>]\n');
      process.exit(0);
    } else fail(`Unknown option: ${argument}`);
  }
  return options;
}

function regularExpression(value) {
  if (!value) fail('--filter requires a regular expression.');
  try { return new RegExp(value, 'u'); } catch (error) { fail(`--filter is invalid: ${error.message}`); }
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) fail(`--${name} must be a positive integer.`);
  return parsed;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

function chunk(values, size) {
  const batches = [];
  for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size));
  return batches;
}

function runBatch(files, logFile, timeoutMs) {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['pnpm.cmd', 'exec', 'vitest', 'run', '--maxWorkers=1', '--minWorkers=1', '--reporter=dot', ...files].map(quoteWindowsArgument).join(' ')]
    : ['exec', 'vitest', 'run', '--maxWorkers=1', '--minWorkers=1', '--reporter=dot', ...files];
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, env: process.env, windowsHide: true });
    const chunks = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout?.on('data', (chunkValue) => chunks.push(chunkValue));
    child.stderr?.on('data', (chunkValue) => chunks.push(chunkValue));
    child.once('error', (error) => {
      clearTimeout(timer);
      chunks.push(Buffer.from(`\n${error.stack || error.message}\n`));
      import('node:fs/promises').then(({ writeFile }) => writeFile(logFile, Buffer.concat(chunks))).finally(() => {
        resolve({ status: 'failed', exitCode: null, signal: null });
      });
    });
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timer);
      import('node:fs/promises').then(({ writeFile }) => writeFile(logFile, Buffer.concat(chunks))).finally(() => {
        resolve({ status: timedOut ? 'timeout' : exitCode === 0 && !signal ? 'passed' : 'failed', exitCode, signal });
      });
    });
  });
}

function quoteWindowsArgument(argument) {
  const value = String(argument);
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\*)$/u, '$1$1')}"`;
}

function fail(message) {
  console.error(`Electron test batches failed: ${message}`);
  process.exit(1);
}
