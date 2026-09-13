import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_APK_PREFIX =
  'https://github.com/axensz/Moneytrack/releases/download/';
const VERSION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const MAX_RELEASE_NOTES = 5;
const MAX_RELEASE_NOTE_LENGTH = 160;
const MAX_MANIFEST_BYTES = 32 * 1024;

function assertValidApkUrl(value) {
  if (typeof value !== 'string' || !value.startsWith(ALLOWED_APK_PREFIX)) {
    throw new Error('apkUrl must use the trusted MoneyTrack GitHub Releases prefix');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('apkUrl must be a valid HTTPS URL');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !parsed.pathname.startsWith('/axensz/Moneytrack/releases/download/')
  ) {
    throw new Error('apkUrl must use the trusted MoneyTrack GitHub Releases prefix');
  }
}

function assertValidReleaseNotes(releaseNotes) {
  if (!Array.isArray(releaseNotes) || releaseNotes.length > MAX_RELEASE_NOTES) {
    throw new Error(`releaseNotes must contain at most ${MAX_RELEASE_NOTES} items`);
  }

  for (const note of releaseNotes) {
    if (
      typeof note !== 'string' ||
      note.trim().length === 0 ||
      [...note].length > MAX_RELEASE_NOTE_LENGTH
    ) {
      throw new Error(
        `each release note must contain 1-${MAX_RELEASE_NOTE_LENGTH} characters`,
      );
    }
  }
}

export async function buildAndroidUpdateManifest({
  apkPath,
  versionCode,
  versionName,
  apkUrl,
  releaseNotes,
}) {
  if (typeof apkPath !== 'string' || apkPath.trim().length === 0) {
    throw new Error('apkPath is required');
  }
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
    throw new Error('versionCode must be a positive integer');
  }
  if (typeof versionName !== 'string' || !VERSION_NAME_PATTERN.test(versionName)) {
    throw new Error('versionName is invalid');
  }
  assertValidApkUrl(apkUrl);
  assertValidReleaseNotes(releaseNotes);

  const apkStats = await stat(apkPath);
  if (!apkStats.isFile() || apkStats.size <= 0) {
    throw new Error('apkPath must point to a non-empty APK file');
  }

  const apkBytes = await readFile(apkPath);
  if (apkBytes.byteLength === 0) {
    throw new Error('apkPath must point to a non-empty APK file');
  }
  const manifest = {
    schemaVersion: 1,
    channel: 'canary',
    versionCode,
    versionName,
    apkUrl,
    sha256: createHash('sha256').update(apkBytes).digest('hex'),
    sizeBytes: apkBytes.byteLength,
    releaseNotes,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  if (Buffer.byteLength(serialized, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new Error('generated manifest exceeds the Android size limit');
  }

  return serialized;
}

function readCliArguments(argv) {
  const values = new Map();
  const releaseNotes = [];
  const supportedFlags = new Set([
    '--apk',
    '--version-code',
    '--version-name',
    '--apk-url',
    '--release-note',
    '--output',
  ]);

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!supportedFlags.has(flag) || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid or incomplete argument: ${flag ?? '(missing)'}`);
    }
    if (flag === '--release-note') {
      releaseNotes.push(value);
    } else if (values.has(flag)) {
      throw new Error(`duplicate argument: ${flag}`);
    } else {
      values.set(flag, value);
    }
  }

  for (const required of [
    '--apk',
    '--version-code',
    '--version-name',
    '--apk-url',
    '--output',
  ]) {
    if (!values.has(required)) throw new Error(`missing argument: ${required}`);
  }

  const rawVersionCode = values.get('--version-code');
  if (!/^[1-9][0-9]*$/.test(rawVersionCode)) {
    throw new Error('--version-code must be a positive integer');
  }

  return {
    apkPath: values.get('--apk'),
    versionCode: Number(rawVersionCode),
    versionName: values.get('--version-name'),
    apkUrl: values.get('--apk-url'),
    releaseNotes,
    outputPath: values.get('--output'),
  };
}

async function runCli() {
  const { outputPath, ...manifestInput } = readCliArguments(process.argv.slice(2));
  const manifest = await buildAndroidUpdateManifest(manifestInput);
  await writeFile(outputPath, manifest, 'utf8');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stderr.write(`Could not write Android update manifest: ${message}\n`);
    process.exitCode = 1;
  });
}
