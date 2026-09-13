import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { buildAndroidUpdateManifest } from '../../../scripts/write-android-update-manifest.mjs';

const APK_URL =
  'https://github.com/axensz/Moneytrack/releases/download/android-capture-v0.2.0/MoneyTrack-0.2.0.apk';
const execFileAsync = promisify(execFile);

const temporaryDirectories: string[] = [];

async function createFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'moneytrack-update-manifest-'));
  temporaryDirectories.push(directory);
  const apkPath = path.join(directory, 'MoneyTrack.apk');
  await writeFile(apkPath, Buffer.from('moneytrack-apk-fixture'));
  return apkPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('buildAndroidUpdateManifest', () => {
  it('builds the exact deterministic manifest from the APK bytes', async () => {
    const apkPath = await createFixture();

    await expect(
      buildAndroidUpdateManifest({
        apkPath,
        versionCode: 2,
        versionName: '0.2.0',
        apkUrl: APK_URL,
        releaseNotes: ['Atajo de gasto rápido', 'Actualizaciones privadas'],
      }),
    ).resolves.toBe(`{
  "schemaVersion": 1,
  "channel": "canary",
  "versionCode": 2,
  "versionName": "0.2.0",
  "apkUrl": "${APK_URL}",
  "sha256": "4a494c1f2b292333e02d37699b0a3b0764f077c51b29928e1e50c2ba34ee1fd6",
  "sizeBytes": 22,
  "releaseNotes": [
    "Atajo de gasto rápido",
    "Actualizaciones privadas"
  ]
}
`);
  });

  it.each([
    ['an untrusted APK URL', { apkUrl: 'https://example.com/MoneyTrack.apk' }],
    ['a non-integer version code', { versionCode: 2.5 }],
    ['an empty version name', { versionName: '' }],
    ['an unsafe version name', { versionName: '0.2.0 beta/1' }],
  ])('rejects %s', async (_label, override) => {
    const apkPath = await createFixture();

    await expect(
      buildAndroidUpdateManifest({
        apkPath,
        versionCode: 2,
        versionName: '0.2.0',
        apkUrl: APK_URL,
        releaseNotes: ['Actualización interna'],
        ...override,
      }),
    ).rejects.toThrow();
  });

  it('rejects a missing APK file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'moneytrack-update-manifest-'));
    temporaryDirectories.push(directory);

    await expect(
      buildAndroidUpdateManifest({
        apkPath: path.join(directory, 'missing.apk'),
        versionCode: 2,
        versionName: '0.2.0',
        apkUrl: APK_URL,
        releaseNotes: ['Actualización interna'],
      }),
    ).rejects.toThrow();
  });
});

describe('Android private release contract', () => {
  it('uses bootstrap code 2 and requires all external signing values', async () => {
    const buildFile = await readFile(
      path.join(process.cwd(), 'android-capture/app/build.gradle.kts'),
      'utf8',
    );

    expect(buildFile).toContain('versionCode = 2');
    expect(buildFile).toContain('versionName = "0.2.0"');
    expect(buildFile).toContain('MONEYTRACK_ANDROID_KEYSTORE_PATH');
    expect(buildFile).toContain('MONEYTRACK_ANDROID_KEY_ALIAS');
    expect(buildFile).toContain('MONEYTRACK_ANDROID_KEYSTORE_PASSWORD');
    expect(buildFile).toContain('MONEYTRACK_ANDROID_KEY_PASSWORD');
    expect(buildFile).toContain('privateRelease');
    expect(buildFile).toContain('Release signing is not configured');
    expect(buildFile).toContain(
      'Release signing requires --no-configuration-cache',
    );
  });

  it('writes the manifest through explicit CLI flags', async () => {
    const apkPath = await createFixture();
    const outputPath = path.join(path.dirname(apkPath), 'update.json');
    const scriptPath = path.join(
      process.cwd(),
      'scripts/write-android-update-manifest.mjs',
    );

    await execFileAsync(process.execPath, [
      scriptPath,
      '--apk',
      apkPath,
      '--version-code',
      '2',
      '--version-name',
      '0.2.0',
      '--apk-url',
      APK_URL,
      '--release-note',
      'Actualización interna',
      '--output',
      outputPath,
    ]);

    const output = await readFile(outputPath, 'utf8');
    expect(output.endsWith('\n')).toBe(true);
    expect(JSON.parse(output)).toEqual({
      schemaVersion: 1,
      channel: 'canary',
      versionCode: 2,
      versionName: '0.2.0',
      apkUrl: APK_URL,
      sha256: '4a494c1f2b292333e02d37699b0a3b0764f077c51b29928e1e50c2ba34ee1fd6',
      sizeBytes: 22,
      releaseNotes: ['Actualización interna'],
    });
  });
});
