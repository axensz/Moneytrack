/**
 * Orquestación Firestore CRUDA de cuentas (Q-useAccounts).
 *
 * Las operaciones MÁS peligrosas del repo, extraídas de useAccounts (hook de UI)
 * a funciones puras async testeables: cascade delete, merge de TC y setDefault.
 * Mueven dinero indirectamente vía reconciliación de usedCredit — la lógica es
 * IDÉNTICA a la versión previa en useAccounts (solo se relocalizó).
 *
 * INVARIANTES (no alterar):
 *  - usedCredit se RECONCILIA por SET idempotente (no increment) desde los
 *    sobrevivientes, porque writeBatch multi-batch (>490 ops) NO es atómico.
 *  - BATCH_LIMIT=490 con flush incremental.
 *  - Reconciliación sobre getAccountReferenceIds (cubre mergedAccountIds).
 */

import {
  doc, runTransaction, collection, writeBatch, getDocs, getDoc, updateDoc, deleteDoc, query, where, deleteField,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { safeFirestoreOperation, checkNetworkConnection, stripUndefined } from '../../utils/firestoreHelpers';
import { getAccountReferenceIds } from '../../utils/accountTransactions';
import { creditDeltasByAccount, reconcileUsedCredit } from '../../utils/creditDeltas';
import type { Account, Transaction, RecurringPayment, Debt } from '../../types/finance';

const BATCH_LIMIT = 490; // Leave room for account + recurring + debts

type BatchOperation = {
  type: 'set' | 'update' | 'delete';
  ref: DocumentReference;
  data?: Record<string, unknown>;
};

interface DeleteAccountDeps {
  accounts: Account[];
  recurringPayments: RecurringPayment[];
  debts: Debt[];
}

/**
 * Cascade delete de una cuenta (autenticado): borra la cuenta + sus
 * transacciones/recurrentes/deudas vinculadas (writeBatch multi-batch 490-op) y
 * RECONCILIA el usedCredit de las TC afectadas recomputándolo desde los
 * sobrevivientes (SET idempotente). Limpia el bankAccountId colgante de TC
 * huérfanas (#23). El llamador valida la protección de cuenta default.
 */
export async function deleteAccountCascade(
  userId: string,
  id: string,
  { accounts, recurringPayments, debts }: DeleteAccountDeps,
  options: { preserveTransactions?: boolean; allowDefaultDelete?: boolean } = {}
): Promise<void> {
  if (!checkNetworkConnection()) {
    throw new Error('Sin conexión a internet');
  }

  // Find recurring payments and debts linked to this account
  const relatedRecurring = recurringPayments.filter(p => p.accountId === id);
  const relatedDebts = debts.filter(d => d.accountId === id);

  // #23: TC asociadas a la cuenta que se borra (bankAccountId === id). NO se
  // borran: solo se les limpia el bankAccountId colgante para que vuelvan a
  // aparecer como TC de nivel superior en vez de quedar huérfanas referenciando
  // una cuenta inexistente.
  const orphanedCardIds = accounts
    .filter(a => a.type === 'credit' && a.bankAccountId === id && a.id && a.id !== id)
    .map(a => a.id!);

  await safeFirestoreOperation(
    async () => {
      const recurringIds = relatedRecurring.map(p => p.id!);
      const debtIds = relatedDebts.map(d => d.id!);

      // Consultar Firestore (no solo memoria) por TODAS las transacciones que
      // referencian la cuenta, tanto como origen (accountId) como destino
      // (toAccountId), y deduplicar por id. Esto garantiza que la reconciliación
      // de usedCredit cubra transacciones que aún no estén en el estado en memoria.
      const txCollection = collection(db, `users/${userId}/transactions`);
      const txDeletes = new Map<string, Transaction>();
      if (!options.preserveTransactions) {
        const [bySource, byDestination] = await Promise.all([
          getDocs(query(txCollection, where('accountId', '==', id))),
          getDocs(query(txCollection, where('toAccountId', '==', id))),
        ]);
        [...bySource.docs, ...byDestination.docs].forEach(snap => {
          txDeletes.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
        });
      }

      // Identificar el conjunto de TC AFECTADAS por el borrado: cuentas tipo
      // credit, distintas de la que se borra, que estas transacciones tocaban
      // (gasto/ingreso por accountId, o transferencia por toAccountId). NO se
      // calcula aquí ningún delta de reversión: la deuda se reconcilia DESPUÉS
      // recomputando usedCredit desde las transacciones sobrevivientes.
      const affectedCardIds = new Set<string>();
      for (const tx of txDeletes.values()) {
        const deltas = creditDeltasByAccount(tx, accounts);
        for (const accId of deltas.keys()) {
          if (accId === id) continue; // la TC que se borra desaparece con su usedCredit
          affectedCardIds.add(accId);
        }
      }

      const allDeletes = [
        ...Array.from(txDeletes.keys()).map(txId => doc(db, `users/${userId}/transactions`, txId)),
        ...recurringIds.map(rId => doc(db, `users/${userId}/recurringPayments`, rId)),
        ...debtIds.map(dId => doc(db, `users/${userId}/debts`, dId)),
      ];

      // Operaciones totales del borrado: borrados + limpieza de TC huérfanas
      // (#23) + el account.
      const totalOps = allDeletes.length + orphanedCardIds.length + 1;

      if (totalOps === 1) {
        // Nada que cascada: solo borrar la cuenta.
        await deleteDoc(doc(db, `users/${userId}/accounts`, id));
        return;
      }

      // FASE 1 — Borrado. Acumular operaciones en writeBatch respetando
      // BATCH_LIMIT. Solo borrados (tx + recurrentes + deudas + la cuenta);
      // sin tocar usedCredit de otras TC aquí.
      let batch = writeBatch(db);
      let opCount = 0;
      const flush = async () => {
        if (opCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };
      const enqueue = async (fn: (b: ReturnType<typeof writeBatch>) => void) => {
        if (opCount >= BATCH_LIMIT) await flush();
        fn(batch);
        opCount++;
      };

      for (const ref of allDeletes) {
        await enqueue(b => b.delete(ref));
      }
      // #23: limpiar el bankAccountId colgante de las TC asociadas en el mismo
      // flujo de borrado (mismo esquema multi-batch). Se hace ANTES de borrar la
      // cuenta; usar deleteField() las devuelve a TC de nivel superior.
      for (const cardId of orphanedCardIds) {
        await enqueue(b => b.update(
          doc(db, `users/${userId}/accounts`, cardId),
          { bankAccountId: deleteField() }
        ));
      }
      // El borrado de la cuenta va al final.
      await enqueue(b => b.delete(doc(db, `users/${userId}/accounts`, id)));
      await flush();

      // FASE 2 — Reconciliación de usedCredit de las TC afectadas.
      //
      // Por qué reconciliar con SET (valor recomputado) y no revertir con
      // increment(-delta) dentro del batch: el borrado puede requerir varios
      // batches (>490 ops) y un writeBatch multi-batch NO es atómico. Si un
      // increment(-delta) se aplica y luego otro batch falla — o se reintenta
      // la operación completa — el increment se aplicaría de nuevo y corrompería
      // la deuda (doble resta). Recomputar usedCredit = max(0, suma de deltas de
      // las transacciones SOBREVIVIENTES) es idempotente: reejecutar deleteAccount
      // o reintentar tras un fallo parcial siempre converge al valor correcto,
      // porque no depende del estado previo del campo.
      for (const cardId of affectedCardIds) {
        const cardRef = doc(db, `users/${userId}/accounts`, cardId);
        const cardSnap = await getDoc(cardRef);
        if (!cardSnap.exists()) continue; // la TC ya no existe: nada que reconciliar

        // Si la TC es una tarjeta fusionada, las transacciones pueden
        // referenciarla por cualquiera de sus mergedAccountIds además del id
        // literal. Reconciliar contra TODAS las referencias para no subestimar
        // usedCredit (mismas referencias que usa el recompute de display).
        const cardAccount = { id: cardId, ...(cardSnap.data() as Omit<Account, 'id'>) } as Account;
        const referenceIds = getAccountReferenceIds(cardAccount);

        const queries = referenceIds.flatMap(refId => [
          getDocs(query(txCollection, where('accountId', '==', refId))),
          getDocs(query(txCollection, where('toAccountId', '==', refId))),
        ]);
        const snapshots = await Promise.all(queries);
        const survivors = new Map<string, Transaction>();
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(snap => {
            survivors.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
          });
        });

        // Reconciliación pura (idempotente): suma getCreditDelta sobre todas
        // las referencias de la TC, clampea a >= 0 y redondea centavos.
        const usedCredit = reconcileUsedCredit(
          referenceIds,
          Array.from(survivors.values())
        );

        await updateDoc(cardRef, { usedCredit });
      }
    },
    'deleteAccount',
    { maxRetries: 2 }
  );
}

interface MergeCreditCardsPlan {
  destinationId: string;
  destinationAccount: Account;
  existingDestination: Account | undefined;
  shouldMakeDestinationDefault: boolean;
  sourceIdSet: Set<string>;
  uniqueSourceIds: string[];
  accounts: Account[];
  recurringPayments: RecurringPayment[];
  debts: Debt[];
}

/**
 * Fusión de TC (autenticado): upsert del destino con el usedCredit consolidado,
 * reapunta tx/recurring/debts de los orígenes al destino y borra los orígenes,
 * en writeBatch multi-batch (490-op). El llamador hace la validación y computa
 * el plan (destinationAccount, mergedUsedCredit, etc.).
 */
export async function mergeCreditCardsOrchestrated(
  userId: string,
  plan: MergeCreditCardsPlan
): Promise<void> {
  const {
    destinationId, destinationAccount, existingDestination, shouldMakeDestinationDefault,
    sourceIdSet, uniqueSourceIds, accounts, recurringPayments, debts,
  } = plan;

  if (!checkNetworkConnection()) {
    throw new Error('Sin conexión a internet');
  }

  await safeFirestoreOperation(
    async () => {
      const accountCollection = collection(db, `users/${userId}/accounts`);
      const operations: BatchOperation[] = [];

      const destinationData = stripUndefined({
        ...destinationAccount,
        id: undefined,
      } as Record<string, unknown>);
      operations.push({
        type: existingDestination ? 'update' : 'set',
        ref: doc(accountCollection, destinationId),
        data: destinationData,
      });

      if (shouldMakeDestinationDefault) {
        accounts
          .filter(account => account.id && account.id !== destinationId && !sourceIdSet.has(account.id) && account.isDefault)
          .forEach(account => {
            operations.push({
              type: 'update',
              ref: doc(db, `users/${userId}/accounts`, account.id!),
              data: { isDefault: false },
            });
          });
      }

      // Reapuntar consultando Firestore, NO el array en memoria: la ventana
      // paginada (500) puede omitir transacciones antiguas, que quedarían
      // huérfanas apuntando a una tarjeta borrada (mismo patrón que el cascade).
      const txCollection = collection(db, `users/${userId}/transactions`);
      const txUpdates = new Map<string, Record<string, unknown>>();
      for (const sourceId of uniqueSourceIds) {
        const [byAccount, byDestinationRef] = await Promise.all([
          getDocs(query(txCollection, where('accountId', '==', sourceId))),
          getDocs(query(txCollection, where('toAccountId', '==', sourceId))),
        ]);
        byAccount.docs.forEach(snapshot => {
          txUpdates.set(snapshot.id, { ...txUpdates.get(snapshot.id), accountId: destinationId });
        });
        byDestinationRef.docs.forEach(snapshot => {
          txUpdates.set(snapshot.id, { ...txUpdates.get(snapshot.id), toAccountId: destinationId });
        });
      }
      txUpdates.forEach((updates, transactionId) => {
        operations.push({
          type: 'update',
          ref: doc(db, `users/${userId}/transactions`, transactionId),
          data: updates,
        });
      });

      recurringPayments.forEach(payment => {
        if (!payment.id || !payment.accountId || !sourceIdSet.has(payment.accountId)) return;

        operations.push({
          type: 'update',
          ref: doc(db, `users/${userId}/recurringPayments`, payment.id),
          data: { accountId: destinationId },
        });
      });

      debts.forEach(debt => {
        if (!debt.id || !debt.accountId || !sourceIdSet.has(debt.accountId)) return;

        operations.push({
          type: 'update',
          ref: doc(db, `users/${userId}/debts`, debt.id),
          data: { accountId: destinationId },
        });
      });

      uniqueSourceIds.forEach(sourceId => {
        operations.push({
          type: 'delete',
          ref: doc(db, `users/${userId}/accounts`, sourceId),
        });
      });

      for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        operations.slice(i, i + BATCH_LIMIT).forEach(operation => {
          if (operation.type === 'delete') {
            batch.delete(operation.ref);
          } else if (operation.type === 'set') {
            batch.set(operation.ref, operation.data ?? {});
          } else {
            batch.update(operation.ref, operation.data ?? {});
          }
        });
        await batch.commit();
      }

      // FASE 2 — Reconciliar usedCredit del destino desde las transacciones YA
      // reapuntadas (idempotente; mismo patrón y motivo que deleteAccountCascade).
      // El plan fija usedCredit sumando los valores PERSISTIDOS de cada tarjeta,
      // que pueden estar stale (una compra reciente aún no reflejada en el campo)
      // → la deuda consolidada quedaría mal y, al borrar los orígenes, ese error
      // se vuelve permanente. Recomputar desde las transacciones reales que ahora
      // referencian el destino converge al valor correcto y es seguro ante
      // reintentos / commits multi-batch no atómicos.
      const destinationRef = doc(accountCollection, destinationId);
      const destSnap = await getDoc(destinationRef);
      if (destSnap.exists()) {
        const destAccount = { id: destinationId, ...(destSnap.data() as Omit<Account, 'id'>) } as Account;
        const referenceIds = getAccountReferenceIds(destAccount);
        const snapshots = await Promise.all(
          referenceIds.flatMap(refId => [
            getDocs(query(txCollection, where('accountId', '==', refId))),
            getDocs(query(txCollection, where('toAccountId', '==', refId))),
          ])
        );
        const survivors = new Map<string, Transaction>();
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(snap => {
            survivors.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
          });
        });
        const usedCredit = reconcileUsedCredit(referenceIds, Array.from(survivors.values()));
        await updateDoc(destinationRef, { usedCredit });
      }
    },
    'mergeCreditCards',
    { maxRetries: 2 }
  );
}

/**
 * Define la cuenta default (autenticado): runTransaction atómico que pone
 * isDefault=true solo en la elegida y false en el resto.
 */
export async function setDefaultAccountAtomic(
  userId: string,
  id: string,
  accounts: Account[]
): Promise<void> {
  if (!checkNetworkConnection()) {
    throw new Error('Sin conexión a internet');
  }

  await safeFirestoreOperation(
    async () => {
      await runTransaction(db, async (transaction) => {
        for (const account of accounts) {
          const accountRef = doc(db, `users/${userId}/accounts`, account.id!);
          transaction.update(accountRef, { isDefault: account.id === id });
        }
      });
    },
    'setDefaultAccount',
    { maxRetries: 2 }
  );
}
