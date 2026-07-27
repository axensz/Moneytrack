/**
 * One-time migration/repair: calcula usedCredit para cuentas TC.
 * Hace un query sin limit a Firestore para obtener TODAS las transacciones
 * de cada TC y corrige el usedCredit persistido si falta o está desfasado.
 */

import { useEffect, useRef } from 'react';
import { collection, getDocs, doc, updateDoc, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import type { Account, Transaction } from '../../types/finance';
import { logger } from '../../utils/logger';
import {
  CURRENT_CREDIT_DEBT_MODEL_VERSION,
  reconcileUsedCredit,
} from '../../utils/creditDeltas';
import {
  CURRENT_PAYMENT_PAIR_MODEL_VERSION,
  findHistoricalCreditPaymentPairs,
  isHistoricalCreditPaymentPair,
} from '../../utils/creditPaymentPairs';

export function calculateCreditUsedFromTransactions(
  account: Pick<Account, 'id' | 'mergedAccountIds'>,
  transactions: Transaction[]
): number {
  if (!account.id) return 0;

  return reconcileUsedCredit([account.id, ...(account.mergedAccountIds ?? [])], transactions);
}

export function useCreditMigration(userId: string | null, accounts: Account[]) {
  const migratedRef = useRef<Set<string>>(new Set());
  const paymentPairsMigratedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId || accounts.length === 0) return;

    // v2 incorpora intereses financiados en la deuda contractual. Cada cuenta
    // legacy se recalcula una sola vez desde su historial completo.
    const creditAccountsNeedingMigration = accounts.filter(
      a => a.type === 'credit' && a.id &&
        a.creditDebtModelVersion !== CURRENT_CREDIT_DEBT_MODEL_VERSION &&
        !migratedRef.current.has(a.id)
    );

    if (creditAccountsNeedingMigration.length === 0) return;

    const migrate = async () => {
      const base = `users/${userId}`;

      for (const account of creditAccountsNeedingMigration) {
        if (!account.id) continue;
        migratedRef.current.add(account.id);

        try {
          // Query ALL transactions for this account (no limit)
          const allIds = [account.id, ...(account.mergedAccountIds ?? [])];
          
          // Firestore 'in' queries support max 30 values
          const allTxs: Transaction[] = [];
          for (let i = 0; i < allIds.length; i += 30) {
            const chunk = allIds.slice(i, i + 30);
            const expSnap = await getDocs(
              query(collection(db, `${base}/transactions`), where('accountId', 'in', chunk))
            );
            allTxs.push(...expSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
          }

          // Also get transfers TO this account
          for (let i = 0; i < allIds.length; i += 30) {
            const chunk = allIds.slice(i, i + 30);
            const transferSnap = await getDocs(
              query(collection(db, `${base}/transactions`), where('toAccountId', 'in', chunk))
            );
            const transferDocs = transferSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
            // Add only transfers not already included
            const existingIds = new Set(allTxs.map(t => t.id));
            allTxs.push(...transferDocs.filter(t => !existingIds.has(t.id)));
          }

          // Siempre persistir (incluso 0): así el campo deja de ser null y la
          // cuenta no se vuelve a evaluar en el próximo montaje (idempotente).
          const usedCredit = calculateCreditUsedFromTransactions(account, allTxs);
          await updateDoc(doc(db, `${base}/accounts`, account.id), {
            usedCredit,
            creditDebtModelVersion: CURRENT_CREDIT_DEBT_MODEL_VERSION,
          });
          logger.info(`Backfilled usedCredit for ${account.name}: ${usedCredit}`);
        } catch (err) {
          logger.error(`Error migrating usedCredit for ${account.name}`, err);
        }
      }
    };

    migrate();
  }, [userId, accounts]);

  useEffect(() => {
    if (!userId || accounts.length === 0) return;

    const creditAccountsNeedingPairMigration = accounts.filter(
      account => account.type === 'credit' && account.id &&
        account.paymentPairModelVersion !== CURRENT_PAYMENT_PAIR_MODEL_VERSION &&
        !paymentPairsMigratedRef.current.has(account.id)
    );
    if (creditAccountsNeedingPairMigration.length === 0) return;

    const migratePaymentPairs = async () => {
      const base = `users/${userId}`;
      try {
        creditAccountsNeedingPairMigration.forEach(account => paymentPairsMigratedRef.current.add(account.id!));
        const snapshot = await getDocs(collection(db, `${base}/transactions`));
        const allTransactions = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Transaction));

        for (const account of creditAccountsNeedingPairMigration) {
          const pairs = findHistoricalCreditPaymentPairs(account, allTransactions);
          for (const pair of pairs) {
            await runTransaction(db, async firestoreTransaction => {
              const creditRef = doc(db, `${base}/transactions`, pair.creditTransactionId);
              const sourceRef = doc(db, `${base}/transactions`, pair.sourceTransactionId);
              const [creditSnapshot, sourceSnapshot] = await Promise.all([
                firestoreTransaction.get(creditRef),
                firestoreTransaction.get(sourceRef),
              ]);
              if (!creditSnapshot.exists() || !sourceSnapshot.exists()) return;

              const creditTransaction = {
                id: creditSnapshot.id,
                ...creditSnapshot.data(),
              } as Transaction;
              const sourceTransaction = {
                id: sourceSnapshot.id,
                ...sourceSnapshot.data(),
              } as Transaction;
              if (!isHistoricalCreditPaymentPair(creditTransaction, sourceTransaction, account)) return;

              firestoreTransaction.update(creditRef, { linkedTransactionId: sourceRef.id });
              firestoreTransaction.update(sourceRef, { linkedTransactionId: creditRef.id });
            });
          }

          await updateDoc(doc(db, `${base}/accounts`, account.id!), {
            paymentPairModelVersion: CURRENT_PAYMENT_PAIR_MODEL_VERSION,
          });
          logger.info(`Linked ${pairs.length} historical card payment pair(s) for ${account.name}`);
        }
      } catch (err) {
        creditAccountsNeedingPairMigration.forEach(account => paymentPairsMigratedRef.current.delete(account.id!));
        logger.error('Error migrating historical card payment pairs', err);
      }
    };

    void migratePaymentPairs();
  }, [userId, accounts]);
}
