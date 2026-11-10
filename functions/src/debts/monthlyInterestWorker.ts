import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getMonthlyInterestAccrual } from '../shared/debtMonthlyInterest.js';

const ACCOUNT_OPERATION_LEASE_MS = 5 * 60 * 1000;

function timestampMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return typeof value === 'string' ? new Date(value).getTime() : 0;
}

function hasActiveAccountOperation(value: unknown, now: Date): boolean {
  if (!value || typeof value !== 'object') return false;
  const lock = value as { id?: unknown; acquiredAt?: unknown; releasedAt?: unknown; expiresAt?: unknown };
  if (!lock.id || timestampMs(lock.releasedAt) > 0) return false;
  const acquiredAt = timestampMs(lock.acquiredAt);
  const expiresAt = acquiredAt > 0 ? acquiredAt + ACCOUNT_OPERATION_LEASE_MS : timestampMs(lock.expiresAt);
  return expiresAt > now.getTime();
}

export async function runMonthlyInterestPass(db: Firestore, now = new Date(), pageSize = 100): Promise<{ updated: number; overLimit: number }> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('Invalid interest worker page size.');
  const due = db.collectionGroup('debts')
    .where('interestAccrual', '==', 'monthly')
    .where('nextInterestDate', '<=', now)
    .orderBy('nextInterestDate')
    .limit(pageSize);
  let cursor: QueryDocumentSnapshot | undefined;
  let updated = 0;
  let overLimit = 0;
  for (;;) {
    const page = await (cursor ? due.startAfter(cursor) : due).get();
    for (const doc of page.docs) {
      const path = doc.ref.path.split('/');
      if (path.length !== 4 || path[0] !== 'users' || path[2] !== 'debts') continue;
      const userRef = db.doc(`users/${path[1]}`);
      const applied = await db.runTransaction(async transaction => {
        // Reading the user in this transaction serializes with client lease acquisition.
        const [debtSnapshot, userSnapshot] = await transaction.getAll(doc.ref, userRef);
        if (!debtSnapshot.exists || hasActiveAccountOperation(userSnapshot.data()?.accountOperationLock, now)) return false;
        const debt = debtSnapshot.data() as Parameters<typeof getMonthlyInterestAccrual>[0];
        const patch = getMonthlyInterestAccrual(debt, now);
        if (!patch) return false;
        transaction.update(doc.ref, patch);
        return true;
      }).catch((error: unknown) => {
        if (!(error instanceof RangeError)) throw error;
        overLimit++;
        return false;
      });
      if (applied) updated++;
    }
    if (page.size < pageSize) break;
    cursor = page.docs[page.size - 1];
  }
  return { updated, overLimit };
}
