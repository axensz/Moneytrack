/**
 * Firestore-backed rolling-window rate limiter.
 *
 * Each key stores a bounded list of recent hit timestamps; `consume`
 * transactionally prunes expired hits and rejects when the budget is exceeded.
 * Budgets are configured per key-prefix. The limiter throws a
 * CallableError('resource-exhausted') so callable cores surface it directly.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { CallableError, type RateLimiter } from './deviceCallables.js';

export interface RateBudget {
  /** Maximum hits within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Resolve the budget for a key by its prefix (before the first ':'). */
export type BudgetResolver = (key: string) => RateBudget;

export const defaultBudgetResolver: BudgetResolver = (key) => {
  const prefix = key.split(':', 1)[0];
  switch (prefix) {
    case 'register':
      return { limit: 10, windowMs: 3_600_000 }; // 10 per user per hour
    case 'register-device':
      return { limit: 5, windowMs: 3_600_000 }; // 5 per device per hour
    case 'test':
      return { limit: 1, windowMs: 60_000 }; // 1 per device per minute
    default:
      return { limit: 30, windowMs: 3_600_000 };
  }
};

export const createRateLimiter = (
  db: Firestore,
  budgetResolver: BudgetResolver = defaultBudgetResolver,
): RateLimiter => ({
  async consume(key, now) {
    const budget = budgetResolver(key);
    const ref = db.doc(`rateLimits/${encodeURIComponent(key)}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cutoff = now.getTime() - budget.windowMs;
      const existing: number[] = snap.exists ? ((snap.data()?.hits as number[]) ?? []) : [];
      const recent = existing.filter((ms) => ms > cutoff);
      if (recent.length >= budget.limit) {
        throw new CallableError('resource-exhausted', `Rate limit exceeded for ${key}`);
      }
      recent.push(now.getTime());
      // Bound stored array to the budget limit to avoid unbounded growth.
      const trimmed = recent.slice(-budget.limit);
      tx.set(ref, { hits: trimmed, updatedAt: now.toISOString() });
    });
  },
});
