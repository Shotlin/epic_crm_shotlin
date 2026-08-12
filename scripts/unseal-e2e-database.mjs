import { app, safeStorage } from 'electron';
import { createDecipheriv, createHmac } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

if (process.env.EPIC_BOS_E2E !== '1') {
  throw new Error('The protected database unseal helper is test-only.');
}

const [profile, encryptedPath, outputPath] = process.argv.slice(2).map((value) => value?.trim());
if (!profile || !encryptedPath || !outputPath) {
  throw new Error('Usage: electron scripts/unseal-e2e-database.mjs <profile> <encrypted-path> <output-path>');
}

app.setPath('userData', path.resolve(profile));

const HEADER = Buffer.from('EPIC-BOS-ENCRYPTED-FILE\0', 'utf8');
const SUPPORTED_VERSIONS = new Set([1, 2]);
const IV_BYTES = 12;
const TAG_BYTES = 16;

async function run() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS safe storage is unavailable for E2E database evidence.');
  const key = await readMasterKey(profile);
  if (key.length !== 32) throw new Error('The E2E database key is invalid.');
  const envelope = await readFile(encryptedPath);
  if (!envelope.subarray(0, HEADER.length).equals(HEADER)) throw new Error('The protected database envelope header is missing.');
  const versionOffset = HEADER.length;
  const version = envelope[versionOffset];
  if (!SUPPORTED_VERSIONS.has(version)) throw new Error('The protected database envelope version is unsupported.');
  const ivStart = versionOffset + 1;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  if (envelope.length <= ciphertextStart) throw new Error('The protected database envelope is truncated.');
  const decipher = createDecipheriv('aes-256-gcm', version === 2 ? deriveArtifactKey(key, 'runtime-database', 2) : key, envelope.subarray(ivStart, tagStart));
  decipher.setAAD(version === 2 ? Buffer.from('epic-bos/encrypted-file/v2', 'utf8') : Buffer.from('epic-bos/encrypted-file/v1', 'utf8'));
  decipher.setAuthTag(envelope.subarray(tagStart, ciphertextStart));
  const plaintext = Buffer.concat([decipher.update(envelope.subarray(ciphertextStart)), decipher.final()]);
  await rm(outputPath, { force: true });
  await writeFile(outputPath, plaintext, { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ ok: true, outputPath, bytes: plaintext.length }) + '\n');
}

function deriveArtifactKey(masterKey, namespace, version) {
  return createHmac('sha256', masterKey).update(`${namespace}/v${version}`, 'utf8').digest();
}

async function readMasterKey(profilePath) {
  const secrets = path.join(profilePath, 'data', 'secrets');
  try {
    const keyring = JSON.parse(await readFile(path.join(secrets, 'keyring.v2.json'), 'utf8'));
    const entry = keyring?.keys?.[0];
    if (keyring?.schema !== 'epic-bos/protected-keyring'
      || keyring.version !== 2
      || keyring.activeKeyId !== 'local-master-v1'
      || entry?.id !== 'local-master-v1'
      || entry.keyVersion !== 1
      || typeof entry.protectedKey !== 'string') {
      throw new Error('The v2 E2E keyring is invalid.');
    }
    return Buffer.from(await decryptProtectedKey(Buffer.from(entry.protectedKey, 'base64')), 'base64');
  } catch (error) {
    // Profiles created before the v2 keyring migration remain readable for
    // recovery evidence. A malformed v2 keyring must fail closed rather than
    // silently falling back to an unrelated legacy key.
    if (error?.code !== 'ENOENT') throw error;
    const legacy = await readFile(path.join(secrets, 'vault-key.v1.bin'));
    return Buffer.from(await decryptProtectedKey(legacy), 'base64');
  }
}

async function decryptProtectedKey(material) {
  if (typeof safeStorage.decryptStringAsync === 'function') {
    const result = await safeStorage.decryptStringAsync(material);
    return result.result;
  }
  return safeStorage.decryptString(material);
}

app.whenReady().then(() => run()).then(
  () => app.exit(0),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    app.exit(1);
  },
);
