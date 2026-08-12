import { app, safeStorage } from 'electron';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (process.env.EPIC_BOS_E2E !== '1') {
  throw new Error('The protected database rewrap helper is test-only.');
}

const [profile, plaintextPath, encryptedPath] = process.argv.slice(2).map((value) => value?.trim());
if (!profile || !plaintextPath || !encryptedPath) {
  throw new Error('Usage: electron scripts/rewrap-e2e-database.mjs <profile> <plaintext-path> <encrypted-path>');
}

const HEADER = Buffer.from('EPIC-BOS-ENCRYPTED-FILE\0', 'utf8');
const VERSION = 2;
const IV_BYTES = 12;
const AAD = Buffer.from('epic-bos/encrypted-file/v2', 'utf8');

async function run() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS safe storage is unavailable for E2E database evidence.');
  const key = await readMasterKey(profile);
  if (key.length !== 32) throw new Error('The E2E database key is invalid.');
  const plaintext = await readFile(plaintextPath);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveArtifactKey(key, 'runtime-database', VERSION), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = Buffer.concat([HEADER, Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]);
  const temporaryPath = `${encryptedPath}.rewrap`;
  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, envelope, { flag: 'wx', mode: 0o600 });
  await rm(encryptedPath, { force: true });
  await rename(temporaryPath, encryptedPath);
  await rm(plaintextPath, { force: true });
  process.stdout.write(JSON.stringify({ ok: true, encryptedPath, bytes: envelope.length }) + '\n');
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

app.setPath('userData', path.resolve(profile));
app.whenReady().then(() => run()).then(
  () => app.exit(0),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    app.exit(1);
  },
);
