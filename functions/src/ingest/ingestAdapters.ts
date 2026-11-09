/**
 * Firestore-backed (Admin SDK) implementations of the ingest core interfaces.
 *
 * Follows the repo pattern (firestoreStore.ts factories): `create*Store(db,
 * uid)` return implementations of the pure interfaces from `ingestCore.ts`, and
 * the thin HTTP/callable adapters in `index.ts` assemble them. No business
 * logic here beyond Admin SDK I/O.
 *
 * Collection layout (all server-owned; client rules default-deny for the ingest
 * surface):
 *   users/{uid}/accounts/{accountId}
 *   users/{uid}/transactionImportCandidates/{candidateId}
 *   apiKeys/{hmacHex}                         (global, maps keyed-hash -> owner)
 *   users/{uid}/apiKeys/{hmacHex}             (mirror so users can list/rotate)
 *
 * El candidato escrito tiene el shape EXACTO del shortcut schemaVersion 3 que el
 * decoder/las reglas aceptan: `createdAt` es `FieldValue.serverTimestamp()`
 * (== request.time que exigen las reglas) y `occurredAt` es un `Timestamp`.
 */

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AccountLookup, CandidateStore, ShortcutCandidate } from './ingestCore.js';
import { hashApiKey } from './ingestCore.js';

interface AccountDocument {
  name?: unknown;
}

/** Reads users/{uid}/accounts and returns {id, name} pairs (Account.name). */
export const createAccountLookup = (db: Firestore, uid: string): AccountLookup => ({
  async list() {
    const snap = await db.collection(`users/${uid}/accounts`).get();
    return snap.docs
      .map((doc) => {
        const data = doc.data() as AccountDocument;
        return { id: doc.id, name: typeof data.name === 'string' ? data.name : '' };
      })
      .filter((account) => account.name.length > 0);
  },
});

/**
 * Candidate store over users/{uid}/transactionImportCandidates/{candidateId}.
 * `create` writes ONLY the allowed shortcut keys, stamping `createdAt` with the
 * server timestamp (the pipeline contract requires request.time, not the clock
 * Date) and `occurredAt` as a Firestore Timestamp.
 */
export const createCandidateStore = (db: Firestore, uid: string): CandidateStore => {
  const docRef = (candidateId: string) =>
    db.doc(`users/${uid}/transactionImportCandidates/${candidateId}`);
  return {
    async exists(candidateId) {
      const snap = await docRef(candidateId).get();
      return snap.exists;
    },
    async create(candidateId, candidate: ShortcutCandidate) {
      await docRef(candidateId).set({
        schemaVersion: candidate.schemaVersion,
        source: candidate.source,
        occurredAt: Timestamp.fromDate(candidate.occurredAt),
        amountMinor: candidate.amountMinor,
        currency: candidate.currency,
        merchant: candidate.merchant,
        suggestedAccountId: candidate.suggestedAccountId,
        suggestedCategory: candidate.suggestedCategory,
        status: candidate.status,
        createdAt: FieldValue.serverTimestamp(),
      });
    },
  };
};

interface ApiKeyDocument {
  uid?: unknown;
  revoked?: unknown;
}

/**
 * Resolve the owning uid for a raw API key: keyed-hash (HMAC) with the core
 * helper + server pepper, look up apiKeys/{hash} (O(1), no index). Missing or
 * revoked => null.
 */
export const resolveApiKey = async (
  db: Firestore,
  rawKey: string,
  pepper: string,
): Promise<string | null> => {
  const hash = hashApiKey(rawKey, pepper);
  const snap = await db.doc(`apiKeys/${hash}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as ApiKeyDocument;
  if (data.revoked === true) return null;
  return typeof data.uid === 'string' && data.uid.length > 0 ? data.uid : null;
};
