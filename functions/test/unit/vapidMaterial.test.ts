import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  generateVapidPair,
  validateVapidPair,
  atomicWriteFile,
} from '../../src/notifications/vapidMaterial.js';

import {
  prepareEmulatorNotificationConfig,
} from '../../scripts/prepare-emulator-notification-config.js';

const makeFakeRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-vapid-repo-'));
  fs.writeFileSync(path.join(root, '.firebaserc'), '{"projects":{"default":"demo-moneytrack"}}');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"moneytrack"}');
  fs.mkdirSync(path.join(root, 'functions'));
  fs.writeFileSync(path.join(root, 'functions', 'package.json'), '{"name":"moneytrack-functions"}');
  return fs.realpathSync(root);
};

describe('vapidMaterial', () => {
  it('generates a valid ephemeral web-push key pair', () => {
    const pair = generateVapidPair();
    expect(typeof pair.publicKey).toBe('string');
    expect(typeof pair.privateKey).toBe('string');
    expect(pair.publicKey.length).toBeGreaterThan(0);
    expect(pair.privateKey.length).toBeGreaterThan(0);
    expect(validateVapidPair(pair)).toBe(true);
  });

  it('rejects a mismatched or malformed pair', () => {
    const a = generateVapidPair();
    const b = generateVapidPair();
    expect(validateVapidPair({ publicKey: a.publicKey, privateKey: b.privateKey })).toBe(false);
    expect(validateVapidPair({ publicKey: '', privateKey: '' })).toBe(false);
  });

  it('atomicWriteFile writes exact content to a temp path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-atomic-'));
    const target = path.join(dir, 'out.txt');
    atomicWriteFile(target, 'hello');
    expect(fs.readFileSync(target, 'utf8')).toBe('hello');
  });
});

describe('prepareEmulatorNotificationConfig', () => {
  const injectKeygen = () => ({ publicKey: 'PUB_TEST_KEY', privateKey: 'PRIV_TEST_KEY' });

  it('refuses every project except demo-moneytrack', () => {
    const root = makeFakeRepo();
    const writes: Record<string, string> = {};
    expect(() =>
      prepareEmulatorNotificationConfig({
        argv: ['--project', 'moneytrack-889fe'],
        env: { INIT_CWD: root },
        generateVapidPair: injectKeygen,
        writeFile: (p, c) => {
          writes[p] = c;
        },
        appendFile: () => {},
        log: () => {},
      }),
    ).toThrow();
    expect(Object.keys(writes)).toHaveLength(0);
  });

  it('writes public-only .env.local and private-only .secret.local for demo-moneytrack', () => {
    const root = makeFakeRepo();
    const writes: Record<string, string> = {};
    const logged: string[] = [];
    prepareEmulatorNotificationConfig({
      argv: ['--project', 'demo-moneytrack'],
      env: { INIT_CWD: root },
      generateVapidPair: injectKeygen,
      writeFile: (p, c) => {
        writes[p] = c;
      },
      appendFile: () => {},
      log: (m) => logged.push(m),
    });

    const envLocalPath = path.join(root, 'functions', '.env.local');
    const secretLocalPath = path.join(root, 'functions', '.secret.local');

    expect(writes[envLocalPath]).toBeDefined();
    expect(writes[secretLocalPath]).toBeDefined();

    // .env.local: only public key + subject, no private key.
    expect(writes[envLocalPath]).toContain('WEB_PUSH_VAPID_PUBLIC_KEY=PUB_TEST_KEY');
    expect(writes[envLocalPath]).toContain('WEB_PUSH_VAPID_SUBJECT=');
    expect(writes[envLocalPath]).not.toContain('PRIV_TEST_KEY');
    expect(writes[envLocalPath]).not.toContain('WEB_PUSH_VAPID_PRIVATE_KEY');

    // .secret.local: only the private key.
    expect(writes[secretLocalPath]).toContain('WEB_PUSH_VAPID_PRIVATE_KEY=PRIV_TEST_KEY');
    expect(writes[secretLocalPath]).not.toContain('PUB_TEST_KEY');
    expect(writes[secretLocalPath]).not.toContain('WEB_PUSH_VAPID_PUBLIC_KEY');
  });

  it('never prints the private key to the log/stdout', () => {
    const root = makeFakeRepo();
    const logged: string[] = [];
    prepareEmulatorNotificationConfig({
      argv: ['--project', 'demo-moneytrack'],
      env: { INIT_CWD: root },
      generateVapidPair: injectKeygen,
      writeFile: () => {},
      appendFile: () => {},
      log: (m) => logged.push(m),
    });
    const joined = logged.join('\n');
    expect(joined).not.toContain('PRIV_TEST_KEY');
    expect(joined).not.toContain('WEB_PUSH_VAPID_PRIVATE_KEY');
  });

  it('appends only the public key to an explicitly supplied GitHub env file', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), `gh-env-${Date.now()}`);
    fs.writeFileSync(ghEnv, '');
    const appended: Array<{ p: string; c: string }> = [];
    prepareEmulatorNotificationConfig({
      argv: ['--project', 'demo-moneytrack', '--github-env', ghEnv],
      env: { INIT_CWD: root, GITHUB_ACTIONS: 'true', GITHUB_ENV: ghEnv },
      generateVapidPair: injectKeygen,
      writeFile: () => {},
      appendFile: (p, c) => appended.push({ p, c }),
      log: () => {},
    });
    expect(appended).toHaveLength(1);
    expect(appended[0].c).toContain('NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=PUB_TEST_KEY');
    expect(appended[0].c).not.toContain('PRIV_TEST_KEY');
  });

  it('refuses --github-env when GITHUB_ACTIONS is not true', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), `gh-env-off-${Date.now()}`);
    fs.writeFileSync(ghEnv, '');
    expect(() =>
      prepareEmulatorNotificationConfig({
        argv: ['--project', 'demo-moneytrack', '--github-env', ghEnv],
        env: { INIT_CWD: root, GITHUB_ACTIONS: 'false', GITHUB_ENV: ghEnv },
        generateVapidPair: injectKeygen,
        writeFile: () => {},
        appendFile: () => {},
        log: () => {},
      }),
    ).toThrow();
  });

  it('refuses --github-env when the resolved path differs from GITHUB_ENV', () => {
    const root = makeFakeRepo();
    const ghEnv = path.join(fs.realpathSync(os.tmpdir()), `gh-env-a-${Date.now()}`);
    const other = path.join(fs.realpathSync(os.tmpdir()), `gh-env-b-${Date.now()}`);
    fs.writeFileSync(ghEnv, '');
    fs.writeFileSync(other, '');
    expect(() =>
      prepareEmulatorNotificationConfig({
        argv: ['--project', 'demo-moneytrack', '--github-env', other],
        env: { INIT_CWD: root, GITHUB_ACTIONS: 'true', GITHUB_ENV: ghEnv },
        generateVapidPair: injectKeygen,
        writeFile: () => {},
        appendFile: () => {},
        log: () => {},
      }),
    ).toThrow();
  });
});
