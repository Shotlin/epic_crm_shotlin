import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Resolves the immutable revision used to bind packaged release evidence.
 *
 * A clean checkout uses its Git SHA. A dirty checkout (which is common while
 * preparing a local milestone) gets a deterministic content-bound `ci-local-`
 * identity instead of silently reusing the parent commit and making a new
 * package indistinguishable from an older one.
 */
export function resolveBuildRevisionSync(): string {
  const explicit = process.env.EPIC_BOS_BUILD_REVISION?.trim();
  if (explicit) return explicit;
  try {
    const gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitRevision) return resolveCheckoutRevision(gitRevision);
  } catch {
    // A source archive without .git can still be packaged, but it is not
    // eligible for release approval until a CI revision is supplied.
  }
  return 'unversioned-local';
}

function resolveCheckoutRevision(gitRevision: string): string {
  try {
    // Bind the package to code/configuration that actually ships. Documentation,
    // test evidence, and local release notes must not force a different binary
    // identity after the package has already been built.
    const packagePaths = ['src', 'retail-hub/src', 'forge.config.ts', 'vite.main.config.ts', 'vite.preload.config.ts', 'vite.renderer.config.ts', 'package.json', 'pnpm-lock.yaml'];
    const trackedDiff = execFileSync('git', ['diff', '--binary', 'HEAD', '--', ...packagePaths], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString('utf8').split('\0').filter(Boolean).filter((filePath) => packagePaths.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`))).sort();
    // Status can contain documentation/evidence edits outside the shipped
    // paths; only the package diff determines whether this binary is dirty.
    if (trackedDiff.length === 0 && untracked.length === 0) return gitRevision;

    const digest = createHash('sha256').update(gitRevision).update(trackedDiff);
    for (const filePath of untracked) {
      digest.update('\0').update(filePath).update('\0').update(readFileSync(filePath));
    }
    return `ci-local-${digest.digest('hex').slice(0, 32)}`;
  } catch {
    // Keep the parent SHA if status inspection is unavailable. CI can still
    // provide an explicit EPIC_BOS_BUILD_REVISION for release-grade builds.
    return gitRevision;
  }
}
