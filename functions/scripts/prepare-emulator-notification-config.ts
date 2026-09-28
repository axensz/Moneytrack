/**
 * Prepares local-only VAPID config for the Firebase emulator.
 *
 * Hard-locked to the demo project `demo-moneytrack`. Writes the public key +
 * subject to `functions/.env.local` (git-ignored) and the private key to
 * `functions/.secret.local` (git-ignored). It NEVER prints the private key or
 * file contents. With `--github-env <path>` (only under GITHUB_ACTIONS with the
 * exact GITHUB_ENV path) it appends ONLY the public key for later CI steps.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveInvocationPath } from '../src/admin/cliRuntime.js';
import { generateVapidPair as defaultGenerateVapidPair, atomicWriteFile } from '../src/notifications/vapidMaterial.js';
import type { VapidPair } from '../src/notifications/vapidMaterial.js';

const DEMO_PROJECT = 'demo-moneytrack';
const VAPID_SUBJECT = 'mailto:notifications@moneytrack.local';

export interface PrepareEmulatorConfigDeps {
  argv: string[];
  env: Record<string, string | undefined>;
  generateVapidPair: () => VapidPair;
  writeFile: (path: string, content: string) => void;
  appendFile: (path: string, content: string) => void;
  log: (message: string) => void;
}

const readFlag = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
};

export const prepareEmulatorNotificationConfig = (deps: PrepareEmulatorConfigDeps): void => {
  const project = readFlag(deps.argv, '--project');
  if (project !== DEMO_PROJECT) {
    throw new Error(`prepare-emulator refuses project "${String(project)}"; only ${DEMO_PROJECT} is allowed`);
  }

  const initCwd = deps.env.INIT_CWD;
  if (typeof initCwd !== 'string' || initCwd.length === 0) {
    throw new Error('INIT_CWD is required');
  }
  // Repository-root-relative targets (resolved+validated, not required to exist yet).
  const envLocalPath = resolveInvocationPath({
    env: deps.env,
    relativePath: path.join('functions', '.env.local'),
    mustExist: false,
  });
  const secretLocalPath = resolveInvocationPath({
    env: deps.env,
    relativePath: path.join('functions', '.secret.local'),
    mustExist: false,
  });

  const githubEnvArg = readFlag(deps.argv, '--github-env');
  let resolvedGithubEnv: string | undefined;
  if (githubEnvArg !== undefined) {
    // Closed external case: only under GITHUB_ACTIONS with exact GITHUB_ENV equality.
    resolvedGithubEnv = resolveInvocationPath({
      env: deps.env,
      externalPath: githubEnvArg,
      scope: 'github-env',
      mustExist: true,
    });
  }

  const pair = deps.generateVapidPair();

  // Public-only .env.local
  deps.writeFile(
    envLocalPath,
    `WEB_PUSH_VAPID_PUBLIC_KEY=${pair.publicKey}\nWEB_PUSH_VAPID_SUBJECT=${VAPID_SUBJECT}\n`,
  );
  // Private-only .secret.local
  deps.writeFile(secretLocalPath, `WEB_PUSH_VAPID_PRIVATE_KEY=${pair.privateKey}\n`);

  if (resolvedGithubEnv !== undefined) {
    deps.appendFile(
      resolvedGithubEnv,
      `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=${pair.publicKey}\n`,
    );
  }

  // Never log the private key or file contents.
  deps.log(`Prepared emulator VAPID config for ${DEMO_PROJECT} (public key only surfaced).`);
};

// Executable entrypoint (only runs when invoked as a script, not when imported).
const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.endsWith('prepare-emulator-notification-config.js')
    || entry.endsWith('prepare-emulator-notification-config.ts');
};

if (isDirectRun()) {
  prepareEmulatorNotificationConfig({
    argv: process.argv.slice(2),
    env: process.env,
    generateVapidPair: defaultGenerateVapidPair,
    writeFile: (target, content) => atomicWriteFile(target, content),
    appendFile: (target, content) => fs.appendFileSync(target, content, { encoding: 'utf8' }),
    log: (message) => console.log(message),
  });
}
