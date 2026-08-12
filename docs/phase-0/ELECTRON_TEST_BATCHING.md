# Electron test batching

Epic BOS has a large mixed Electron/jsdom suite. Running all files in one Vitest
worker can exceed a desktop or CI command limit before Vitest prints a useful
failure boundary. `scripts/run-test-batches.mjs` provides a deterministic,
auditable alternative: files are sorted, split into bounded batches, run
sequentially with one worker, and each batch writes a log plus a signed-in-time
summary JSON.

## Run

```powershell
pnpm.cmd run test:batches
```

Useful options:

```powershell
pnpm.cmd run test:batches -- --batch-size 16 --timeout-ms 180000 --output test-evidence/electron-batches
```

For a bounded local check, use a regular-expression filter:

```powershell
pnpm.cmd run test:batches -- --filter "key-store|artifact-key-rotation" --output test-evidence/electron-security
```

The command stops at the first failed or timed-out batch. A passing summary
means every discovered `src/**/*.test.ts(x)` file passed in that run; it does
not replace native packaged-app smoke testing or the independent UI/UAT gate.

## Evidence contract

Each run contains `summary.json` and `batch-NN.log` files. Keep the summary with
the release certification pack when the run is part of a release candidate.
The script never claims provider, hardware, signing, or cross-platform
certification; those remain external gates.
