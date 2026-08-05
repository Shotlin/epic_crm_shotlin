import { execFileSync } from 'node:child_process';

/** Resolves the immutable revision used to bind packaged release evidence. */
export function resolveBuildRevisionSync(): string {
  const explicit = process.env.EPIC_BOS_BUILD_REVISION?.trim();
  if (explicit) return explicit;
  try {
    const gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitRevision) return gitRevision;
  } catch {
    // A source archive without .git can still be packaged, but it is not
    // eligible for release approval until a CI revision is supplied.
  }
  return 'unversioned-local';
}
