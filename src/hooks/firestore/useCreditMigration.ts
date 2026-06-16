/**
 * One-time migration/repair: calcula usedCredit para cuentas TC.
 * Hace un query sin limit a Firestore para obtener TODAS las transacciones
 * de cada TC y corrige el usedCredit persistido si falta o está desfasado.
 */

import { useEffect, useRef } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Account, Transaction } from '../../types/finance';
import { logger } from '../../utils/logger';

export function calculateCreditUsedFromTransactions(
  account: Pick<Account, 'id' | 'mergedAccountIds'>,
  transactions: Transaction[]
): number {
  if (!account.id) return 0;

  const allIds = [account.id, ...(account.mergedAccountIds ?? [])];

  const expenses = transactions
    .filter(t => t.type === 'expense' && allIds.includes(t.accountId))
    .reduce((sum, t) => sum + t.amount, 0);

  const incomes = transactions
    .filter(t => t.type === 'income' && allIds.includes(t.accountId))
    .reduce((sum, t) => sum + t.amount, 0);

  const transfersIn = transactions
    .filter(t => t.type === 'transfer' && t.toAccountId && allIds.includes(t.toAccountId))
    .reduce((sum, t) => sum + t.amount, 0);

  return Math.max(0, expenses - incomes - transfersIn);
}

export function useCreditMigration(userId: string | null, accounts: Account[]) {
  const migratedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId || accounts.length === 0) return;

    // Solo cuentas SIN usedCredit persistido (legacy, anteriores al campo). Una
    // vez fijado, el valor lo mantienen las escrituras incrementales y la
    // reconciliación en borrado/fusión; re-migrar en cada montaje re-consultaba
    // toda la colección y podía pisar un valor fresco escrito atómicamente por
    // otra vía (carrera). Backfill-once por campo nulo = idempotente (#accounts-7).
    const creditAccountsNeedingMigration = accounts.filter(
      a => a.type === 'credit' && a.id && a.usedCredit == null && !migratedRef.current.has(a.id)
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
          await updateDoc(doc(db, `${base}/accounts`, account.id), { usedCredit });
          logger.info(`Backfilled usedCredit for ${account.name}: ${usedCredit}`);
        } catch (err) {
          logger.error(`Error migrating usedCredit for ${account.name}`, err);
        }
      }
    };

    migrate();
  }, [userId, accounts]);
}
