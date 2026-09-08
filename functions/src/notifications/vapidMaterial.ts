/**
 * Smallest injectable VAPID material helpers.
 *
 * `web-push` owns key generation and validation; this module wraps it plus an
 * atomic file write. The production VAPID private key lives only in Secret
 * Manager (plus the short-lived validated local file for the demo emulator) —
 * never in Firestore or the repository.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';

export interface VapidPair {
  publicKey: string;
  privateKey: string;
}

/** Generate an ephemeral VAPID key pair via web-push. */
export const generateVapidPair = (): VapidPair => {
  const keys = webpush.generateVAPIDKeys();
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
};

/**
 * Validate a VAPID pair by re-deriving the public P-256 point from the private
 * scalar and comparing it byte-for-byte with the supplied public key. This
 * catches mismatched pairs, which `web-push`'s header builder does NOT.
 *
 * VAPID keys are base64url: private = 32-byte scalar, public = 65-byte
 * uncompressed point (0x04 || X || Y).
 */
export const validateVapidPair = (pair: VapidPair): boolean => {
  if (!pair || !pair.publicKey || !pair.privateKey) {
    return false;
  }
  // web-push rejects structurally invalid keys (wrong length/alphabet).
  try {
    webpush.getVapidHeaders(
      'https://push.example.com',
      'mailto:ops@example.com',
      pair.publicKey,
      pair.privateKey,
      'aes128gcm',
    );
  } catch {
    return false;
  }
  try {
    const privateScalar = Buffer.from(pair.privateKey, 'base64url');
    const providedPublic = Buffer.from(pair.publicKey, 'base64url');
    if (privateScalar.length !== 32 || providedPublic.length !== 65 || providedPublic[0] !== 0x04) {
      return false;
    }
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateScalar);
    const derivedPublic = ecdh.getPublicKey(); // uncompressed 65-byte point
    return derivedPublic.length === providedPublic.length
      && derivedPublic.equals(providedPublic);
  } catch {
    return false;
  }
};

/** Atomically write `content` to `target` (temp file in the same dir + rename). */
export const atomicWriteFile = (target: string, content: string): void => {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(tmp, target);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort cleanup */
    }
    throw error;
  }
};

/** Default temp directory helper for callers that want an OS-scoped location. */
export const tmpDir = (): string => fs.realpathSync(os.tmpdir());
