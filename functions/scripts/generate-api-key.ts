/**
 * CLI to mint an API key for a given uid (operational convenience).
 *
 * Follows the repo CLI pattern (prepare-emulator-notification-config.ts):
 * injectable core (deps: generateKey, hashKey, writeDocs, log) + an
 * `isDirectRun()` entrypoint. The clear key is emitted to stdout EXACTLY once
 * and is NEVER persisted or logged beyond that single emission; only its
 * sha256 hash is stored.
 *
 * Usage: node lib/scripts/generate-api-key.js --uid <uid> [--label <label>]
 */

import { getAdminApp } from '../src/adminApp.js';
import {
  generateApiKey as defaultGenerateApiKey,
  hashApiKey as defaultHashApiKey,
} from '../src/ingest/ingestCore.js';

export interface GenerateApiKeyDeps {
  argv: string[];
  generateKey: () => string;
  hashKey: (raw: string) => string;
  /** Persists the hash + metadata (never the clear key) for `uid` under `hash`. */
  writeDocs: (hash: string, uid: string, label?: string) => Promise<void>;
  /** stdout sink — the clear key is written here exactly once. */
  emit: (message: string) => void;
}

const readFlag = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
};

export const generateApiKeyCli = async (deps: GenerateApiKeyDeps): Promise<void> => {
  const uid = readFlag(deps.argv, '--uid');
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new Error('--uid <uid> is required');
  }
  const label = readFlag(deps.argv, '--label');

  const rawKey = deps.generateKey();
  const hash = deps.hashKey(rawKey);
  await deps.writeDocs(hash, uid, label);

  // The clear key is surfaced only here, once. Never logged elsewhere.
  deps.emit(rawKey);
};

// Executable entrypoint (only runs when invoked as a script, not when imported).
const isDirectRun = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  return entry.endsWith('generate-api-key.js') || entry.endsWith('generate-api-key.ts');
};

if (isDirectRun()) {
  const run = async (): Promise<void> => {
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore(getAdminApp());
    await generateApiKeyCli({
      argv: process.argv.slice(2),
      generateKey: defaultGenerateApiKey,
      hashKey: defaultHashApiKey,
      writeDocs: async (hash, uid, label) => {
        const batch = db.batch();
        batch.set(db.doc(`apiKeys/${hash}`), {
          uid,
          createdAt: FieldValue.serverTimestamp(),
          revoked: false,
          ...(label !== undefined ? { label } : {}),
        });
        batch.set(db.doc(`users/${uid}/apiKeys/${hash}`), {
          hash,
          createdAt: FieldValue.serverTimestamp(),
          revoked: false,
          ...(label !== undefined ? { label } : {}),
        });
        await batch.commit();
      },
      emit: (message) => process.stdout.write(`${message}\n`),
    });
  };
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
