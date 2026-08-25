/**
 * Orquestación Firestore CRUDA de cuentas (Q-useAccounts).
 *
 * Las operaciones MÁS peligrosas del repo, extraídas de useAccounts (hook de UI)
 * a funciones puras async testeables: cascade delete, merge de TC y setDefault.
 * Mueven dinero indirectamente vía reconciliación de usedCredit — la lógica es
 * IDÉNTICA a la versión previa en useAccounts (solo se relocalizó).
 *
 * INVARIANTES (no alterar):
 *  - Cada operación destructiva se confirma en UN solo writeBatch atómico.
 *  - Si el cascade supera su límite seguro, se rechaza ANTES de escribir.
 *  - usedCredit se RECONCILIA dentro del mismo batch desde el historial real.
 *  - Reconciliación sobre getAccountReferenceIds (cubre mergedAccountIds).
 */

import {
  doc,
  runTransaction,
  collection,
  writeBatch,
  getDocsFromServer,
  getDocFromServer,
  query,
  where,
  deleteField,
  serverTimestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import { safeFirestoreOperation, checkNetworkConnection, stripUndefined } from '../../utils/firestoreHelpers';
import { getAccountReferenceIds } from '../../utils/accountTransactions';
import { buildBalanceTargetAdjustment } from '../../utils/balanceTargetAdjustment';
import { getCreditAuthorityState } from '../../utils/creditAuthority';
import { creditDeltasByAccount, reconcileUsedCredit } from '../../utils/creditDeltas';
import { validateLinkedCreditPaymentPair } from '../../utils/creditPaymentPairs';
import type { Account, Transaction } from '../../types/finance';
import {
  RULE_SAFE_COMPLEX_WRITE_LIMIT,
  RULE_SAFE_SIMPLE_WRITE_LIMIT,
} from '../../config/firestoreLimits';
import { publishTransactionCacheMutation } from './transactionPaginationCache';

const ACCOUNT_OPERATION_LEASE_MS = 5 * 60 * 1000;

export type AccountOperationKind =
  | 'delete-account'
  | 'merge-credit-cards'
  | 'set-default-account'
  | 'delete-debt'
  | 'reassign-debt-account'
  | 'ledger-mutation';

interface AccountOperationLock {
  id: string;
  kind: AccountOperationKind;
  acquiredAt?: Date;
  releasedAt?: Date;
  /** Compatibilidad de lectura con locks creados antes del lease server-side. */
  expiresAt?: Date;
}

export const createAccountOperationId = (kind: AccountOperationKind): string => {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${kind}:${randomId}`;
};

const getTimestampMs = (value: unknown): number => {
  const timestamp = value as Date & { toMillis?: () => number };
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis();
  return timestamp instanceof Date ? timestamp.getTime() : 0;
};

const getLockExpirationMs = (lock: Partial<AccountOperationLock> | undefined): number => {
  if (getTimestampMs(lock?.releasedAt) > 0) return 0;
  const acquiredAtMs = getTimestampMs(lock?.acquiredAt);
  if (acquiredAtMs > 0) return acquiredAtMs + ACCOUNT_OPERATION_LEASE_MS;
  return getTimestampMs(lock?.expiresAt);
};

export const createAccountOperationRelease = (
  operationId: string,
  kind: AccountOperationKind
) => ({
  accountOperationLock: {
    id: operationId,
    kind,
    releasedAt: serverTimestamp(),
  },
});

/**
 * Serializa cualquier escritura de cuentas/transacciones/recurrentes/deudas.
 * Las reglas de Firestore consultan este mismo lock en el documento raíz del
 * usuario, por lo que también cubre otras pestañas, dispositivos y clientes
 * antiguos durante la ventana entre las consultas y el batch final.
 */
export async function acquireAccountOperationLock(
  userId: string,
  operationId: string,
  kind: AccountOperationKind
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async transaction => {
    const userSnap = await transaction.get(userRef);
    const currentLock = userSnap.exists()
      ? (userSnap.data().accountOperationLock as Partial<AccountOperationLock> | undefined)
      : undefined;
    const currentLockIsActive =
      Boolean(currentLock?.id) && getLockExpirationMs(currentLock) > Date.now();

    if (currentLockIsActive && currentLock?.id !== operationId) {
      throw new Error(
        'Ya hay otra operación de cuentas o deudas en curso. Espera unos segundos y vuelve a intentarlo.'
      );
    }

    transaction.set(
      userRef,
      {
        accountOperationLock: {
          id: operationId,
          kind,
          acquiredAt: serverTimestamp(),
        },
      },
      { mergeFields: ['accountOperationLock'] }
    );
  });
}

export async function releaseAccountOperationLock(
  userId: string,
  operationId: string,
  kind: AccountOperationKind
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async transaction => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) return;

    const currentLock = userSnap.data().accountOperationLock as
      | Partial<AccountOperationLock>
      | undefined;
    if (currentLock?.id === operationId) {
      transaction.set(
        userRef,
        createAccountOperationRelease(operationId, kind),
        { mergeFields: ['accountOperationLock'] }
      );
    }
  });
}

export async function renewAccountOperationLock(
  userId: string,
  operationId: string,
  kind: AccountOperationKind
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async transaction => {
    const userSnap = await transaction.get(userRef);
    const currentLock = userSnap.exists()
      ? (userSnap.data().accountOperationLock as Partial<AccountOperationLock> | undefined)
      : undefined;

    if (
      currentLock?.id !== operationId
    ) {
      throw new Error(
        'La operación de cuentas tardó demasiado y perdió su bloqueo seguro. Vuelve a intentarlo.'
      );
    }

    transaction.set(
      userRef,
      {
        accountOperationLock: {
          id: operationId,
          kind,
          acquiredAt: serverTimestamp(),
        },
      },
      { mergeFields: ['accountOperationLock'] }
    );
  });
}

export const assertAtomicBatchCapacity = (
  operation: string,
  operationCount: number,
  limit = RULE_SAFE_SIMPLE_WRITE_LIMIT
): void => {
  if (operationCount <= limit) return;

  throw new Error(
    `No se puede ${operation} de forma segura desde el navegador: requiere ${operationCount} cambios ` +
    `y el límite atómico es ${limit}. Reduce primero el historial asociado o solicita una migración administrada.`
  );
};

type BatchOperation = {
  type: 'set' | 'update' | 'delete';
  ref: DocumentReference;
  data?: Record<string, unknown>;
};

/**
 * Cascade delete de una cuenta (autenticado): borra la cuenta + sus
 * transacciones/recurrentes/deudas vinculadas en un único writeBatch atómico y
 * RECONCILIA el usedCredit de las TC afectadas recomputándolo desde los
 * sobrevivientes (SET idempotente). Limpia el bankAccountId colgante de TC
 * huérfanas (#23). El llamador valida la protección de cuenta default.
 */
export async function deleteAccountCascade(
  userId: string,
  id: string,
  options: { preserveTransactions?: boolean; allowDefaultDelete?: boolean } = {}
): Promise<void> {
  if (!checkNetworkConnection()) {
    throw new Error('Sin conexión a internet');
  }

  await safeFirestoreOperation(
    async () => {
      // Cada reintento necesita un id nuevo porque el intento anterior deja un
      // tombstone inactivo para impedir liberaciones ABA.
      const operationId = createAccountOperationId('delete-account');
      let committed = false;

      try {
        await acquireAccountOperationLock(userId, operationId, 'delete-account');
        // Todas las relaciones se descubren desde el servidor DESPUÉS del lock.
        // Los arrays de React pueden ir detrás de una escritura remota ya
        // confirmada y no son una fuente segura para un cascade destructivo.
        const accountCollection = collection(db, `users/${userId}/accounts`);
        const recurringCollection = collection(db, `users/${userId}/recurringPayments`);
        const debtCollection = collection(db, `users/${userId}/debts`);
        const accountSnapshot = await getDocsFromServer(accountCollection);
        const currentAccounts = accountSnapshot.docs.map(snapshot => ({
          id: snapshot.id,
          ...(snapshot.data() as Omit<Account, 'id'>),
        } as Account));
        const currentTarget = currentAccounts.find(account => account.id === id);
        if (currentTarget?.isDefault && !options.allowDefaultDelete) {
          throw new Error('No puedes eliminar la cuenta por defecto');
        }

        const targetReferenceIds = currentTarget
          ? getAccountReferenceIds(currentTarget)
          : [id];
        const [recurringSnapshots, debtSnapshots] = await Promise.all([
          Promise.all(targetReferenceIds.map(referenceId =>
            getDocsFromServer(
              query(recurringCollection, where('accountId', '==', referenceId))
            )
          )),
          Promise.all(targetReferenceIds.map(referenceId =>
            getDocsFromServer(
              query(debtCollection, where('accountId', '==', referenceId))
            )
          )),
        ]);
        const recurringIds = Array.from(new Set(
          recurringSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.id))
        ));
        const debtIds = Array.from(new Set(
          debtSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.id))
        ));
        // #23: las TC asociadas no se borran; se limpia su bankAccountId para
        // que no queden huérfanas al eliminar la cuenta bancaria.
        const orphanedCardIds = currentAccounts
          .filter(account =>
            account.type === 'credit' &&
            account.bankAccountId === id &&
            account.id &&
            account.id !== id
          )
          .map(account => account.id!);

        // Consultar Firestore (no solo memoria) por TODAS las transacciones que
        // referencian la cuenta, tanto como origen (accountId) como destino
        // (toAccountId), y deduplicar por id. El lock global impide que aparezcan
        // nuevas referencias mientras se prepara el batch final.
        const txCollection = collection(db, `users/${userId}/transactions`);
        const txDeletes = new Map<string, Transaction>();
        if (!options.preserveTransactions) {
          const transactionSnapshots = await Promise.all(
            targetReferenceIds.flatMap(referenceId => [
              getDocsFromServer(
                query(txCollection, where('accountId', '==', referenceId))
              ),
              getDocsFromServer(
                query(txCollection, where('toAccountId', '==', referenceId))
              ),
            ])
          );
          transactionSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(document => {
              txDeletes.set(document.id, {
                id: document.id,
                ...(document.data() as Transaction),
              });
            });
          });

          // Los pagos de TC son pares recíprocos. Si cualquiera de sus cuentas se
          // elimina, incluir también el movimiento espejo para no dejar dinero
          // huérfano ni una deuda reducida sin salida bancaria (o viceversa).
          const linkedIds = Array.from(new Set(
            Array.from(txDeletes.values())
              .map(transaction => transaction.linkedTransactionId)
              .filter((value): value is string => value !== undefined && !txDeletes.has(value))
          ));
          const linkedSnaps = await Promise.all(
            linkedIds.map(linkedId =>
              getDocFromServer(doc(db, `users/${userId}/transactions`, linkedId))
            )
          );
          const fetchedLinked = new Map<string, Transaction>();
          linkedSnaps.forEach((snap, index) => {
            if (!snap.exists()) return;
            const linkedId = linkedIds[index];
            fetchedLinked.set(linkedId, { id: linkedId, ...(snap.data() as Transaction) });
          });

          // El pointer solo amplía el cascade después de demostrar que ambas
          // filas forman el pago de TC que Moneytrack reconoce. Ante corrupción,
          // fallar cerrado evita borrar una transacción ajena.
          for (const transaction of Array.from(txDeletes.values())) {
            if (!transaction.linkedTransactionId) continue;
            const linked = txDeletes.get(transaction.linkedTransactionId)
              ?? fetchedLinked.get(transaction.linkedTransactionId);
            const pair = validateLinkedCreditPaymentPair(
              transaction,
              linked,
              currentAccounts,
            );
            if (!pair.valid) {
              throw new Error(
                `El vínculo de pago ${transaction.id} requiere reconciliación (${pair.reason}).`
              );
            }
          }
          fetchedLinked.forEach((transaction, linkedId) => {
            txDeletes.set(linkedId, transaction);
          });
        }

        // Identificar el conjunto de TC AFECTADAS por el borrado.
        const affectedCardIds = new Set<string>();
        for (const tx of txDeletes.values()) {
          const deltas = creditDeltasByAccount(tx, currentAccounts);
          for (const accId of deltas.keys()) {
            if (accId === id) continue;
            affectedCardIds.add(accId);
          }
        }

        // Preparar TODAS las actualizaciones de cuenta antes de escribir. Una TC
        // puede necesitar simultáneamente limpiar bankAccountId y reconciliar su
        // usedCredit; el Map garantiza una sola escritura por documento.
        const accountUpdates = new Map<string, Record<string, unknown>>();
        orphanedCardIds.forEach(cardId => {
          accountUpdates.set(cardId, { bankAccountId: deleteField() });
        });

        for (const cardId of affectedCardIds) {
          const cardRef = doc(db, `users/${userId}/accounts`, cardId);
          const cardSnap = await getDocFromServer(cardRef);
          if (!cardSnap.exists()) continue;

          const cardAccount = { id: cardId, ...(cardSnap.data() as Omit<Account, 'id'>) } as Account;
          if (!getCreditAuthorityState(cardAccount).ready) {
            throw new Error(
              `La tarjeta ${cardAccount.name} requiere reconciliación antes de eliminar esta cuenta.`
            );
          }
          const referenceIds = getAccountReferenceIds(cardAccount);
          const snapshots = await Promise.all(
            referenceIds.flatMap(refId => [
              getDocsFromServer(query(txCollection, where('accountId', '==', refId))),
              getDocsFromServer(query(txCollection, where('toAccountId', '==', refId))),
            ])
          );
          const survivors = new Map<string, Transaction>();
          snapshots.forEach(snapshot => {
            snapshot.docs.forEach(snap => {
              if (!txDeletes.has(snap.id)) {
                survivors.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
              }
            });
          });

          accountUpdates.set(cardId, {
            ...accountUpdates.get(cardId),
            usedCredit: reconcileUsedCredit(referenceIds, Array.from(survivors.values())),
          });
        }

        const allDeletes = [
          ...Array.from(txDeletes.keys()).map(txId => doc(db, `users/${userId}/transactions`, txId)),
          ...recurringIds.map(rId => doc(db, `users/${userId}/recurringPayments`, rId)),
          ...debtIds.map(dId => doc(db, `users/${userId}/debts`, dId)),
        ];

        // +1 libera el lock global en el mismo commit. Si todo no cabe, se
        // rechaza y el finally libera el lock sin tocar datos de dominio.
        const totalOps = allDeletes.length + accountUpdates.size + 2;
        assertAtomicBatchCapacity('eliminar esta cuenta', totalOps);

        // Renovar la concesión justo antes del commit por si las lecturas fueron
        // lentas. Las reglas siguen bloqueando escrituras concurrentes.
        await renewAccountOperationLock(userId, operationId, 'delete-account');

        const batch = writeBatch(db);
        allDeletes.forEach(ref => batch.delete(ref));
        accountUpdates.forEach((data, cardId) => {
          batch.update(doc(db, `users/${userId}/accounts`, cardId), data);
        });
        batch.delete(doc(db, `users/${userId}/accounts`, id));
        batch.set(
          doc(db, 'users', userId),
          createAccountOperationRelease(operationId, 'delete-account'),
          { mergeFields: ['accountOperationLock'] }
        );
        await batch.commit();
        committed = true;

        const deletedTransactionIds = Array.from(txDeletes.keys());
        if (deletedTransactionIds.length > 0) {
          publishTransactionCacheMutation({
            userId,
            type: 'delete',
            transactionIds: deletedTransactionIds,
          });
        }
      } finally {
        if (!committed) {
          await releaseAccountOperationLock(
            userId,
            operationId,
            'delete-account'
          ).catch(() => undefined);
        }
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
  uniqueSourceIds: string[];
  desiredDebt?: number;
}

const accountMergeRevision = (account: Account): string => JSON.stringify({
  name: account.name,
  type: account.type,
  isDefault: account.isDefault,
  initialBalance: account.initialBalance,
  creditLimit: account.creditLimit ?? null,
  cutoffDay: account.cutoffDay ?? null,
  paymentDay: account.paymentDay ?? null,
  monthlySpendingLimit: account.monthlySpendingLimit ?? null,
  bankAccountId: account.bankAccountId ?? null,
  mergedAccountIds: [...(account.mergedAccountIds ?? [])].sort(),
  order: account.order ?? null,
  interestRate: account.interestRate ?? null,
  paymentPairModelVersion: account.paymentPairModelVersion ?? null,
});

/**
 * Fusión de TC (autenticado): upsert del destino con el usedCredit consolidado,
 * reapunta tx/recurring/debts de los orígenes al destino y borra los orígenes,
 * en un único writeBatch atómico. El llamador hace la validación y computa
 * el plan (destinationAccount, mergedUsedCredit, etc.).
 */
export async function mergeCreditCardsOrchestrated(
  userId: string,
  plan: MergeCreditCardsPlan
): Promise<void> {
  const {
    destinationId, destinationAccount, existingDestination,
    uniqueSourceIds, desiredDebt,
  } = plan;

  if (!checkNetworkConnection()) {
    throw new Error('Sin conexión a internet');
  }

  await safeFirestoreOperation(
    async () => {
      const operationId = createAccountOperationId('merge-credit-cards');
      let committed = false;

      try {
        await acquireAccountOperationLock(userId, operationId, 'merge-credit-cards');
      const accountCollection = collection(db, `users/${userId}/accounts`);
      const accountSnapshot = await getDocsFromServer(accountCollection);
      const currentAccounts = accountSnapshot.docs.map(snapshot => ({
        id: snapshot.id,
        ...(snapshot.data() as Omit<Account, 'id'>),
      } as Account));
      const currentAccountsById = new Map(
        currentAccounts.flatMap(account => account.id ? [[account.id, account] as const] : [])
      );
      const currentSourceAccounts = uniqueSourceIds.map(sourceId =>
        currentAccountsById.get(sourceId)
      );
      const missingSourceId = uniqueSourceIds.find(
        (_, index) => !currentSourceAccounts[index]
      );
      if (missingSourceId) {
        throw new Error(
          `La tarjeta origen ${missingSourceId} cambió o ya no existe. Actualiza e intenta de nuevo.`
        );
      }
      if (currentSourceAccounts.some(account => account?.type !== 'credit')) {
        throw new Error('Todas las cuentas origen deben ser tarjetas de crédito');
      }

      const currentExistingDestination = currentAccountsById.get(destinationId);
      if (Boolean(existingDestination) !== Boolean(currentExistingDestination)) {
        throw new Error(
          'La tarjeta destino cambió mientras preparabas la operación. Actualiza e intenta de nuevo.'
        );
      }
      if (currentExistingDestination && currentExistingDestination.type !== 'credit') {
        throw new Error('La cuenta destino debe ser una tarjeta de crédito');
      }
      const unresolvedAuthority = [
        ...(currentSourceAccounts as Account[]),
        ...(currentExistingDestination ? [currentExistingDestination] : []),
      ].find(account => !getCreditAuthorityState(account).ready);
      if (unresolvedAuthority) {
        throw new Error(
          `La tarjeta ${unresolvedAuthority.name} requiere reconciliación antes de unificar.`
        );
      }
      if (
        currentExistingDestination &&
        existingDestination &&
        accountMergeRevision(currentExistingDestination) !==
          accountMergeRevision(existingDestination)
      ) {
        throw new Error(
          'La tarjeta destino cambió en otro dispositivo. Actualiza e intenta de nuevo para no sobrescribir esos cambios.'
        );
      }

      const sourceIdSet = new Set(uniqueSourceIds);
      const resolvedSourceAccounts = currentSourceAccounts as Account[];
      const sourceBankIds = resolvedSourceAccounts
        .map(account => account.bankAccountId)
        .filter((bankId): bankId is string => Boolean(bankId));
      if (
        sourceBankIds.length !== resolvedSourceAccounts.length ||
        new Set(sourceBankIds).size !== 1
      ) {
        throw new Error('Solo se pueden unificar tarjetas de crédito del mismo banco');
      }
      const sourceBankId = sourceBankIds[0];
      const destinationBankId =
        destinationAccount.bankAccountId ?? currentExistingDestination?.bankAccountId;
      if (destinationBankId && destinationBankId !== sourceBankId) {
        throw new Error('Solo se pueden unificar tarjetas de crédito del mismo banco');
      }
      const effectiveDestinationAccount = {
        ...(currentExistingDestination ?? {}),
        ...destinationAccount,
        id: destinationId,
        type: 'credit' as const,
        bankAccountId: destinationBankId ?? sourceBankId,
      } as Account;

      const makeDestinationDefault =
        Boolean(currentExistingDestination?.isDefault) ||
        resolvedSourceAccounts.some(account => account.isDefault) ||
        (!currentExistingDestination && Boolean(destinationAccount.isDefault));
      const operations: BatchOperation[] = [];

      if (makeDestinationDefault) {
        currentAccounts
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
      const sourceReferenceIds = new Set(
        resolvedSourceAccounts.flatMap(getAccountReferenceIds)
      );
      uniqueSourceIds.forEach(sourceId => sourceReferenceIds.add(sourceId));

      const destinationReferenceIds = Array.from(new Set([
        ...getAccountReferenceIds(effectiveDestinationAccount),
        ...(currentExistingDestination
          ? getAccountReferenceIds(currentExistingDestination)
          : []),
      ]));
      const allReferenceIds = Array.from(new Set([
        ...destinationReferenceIds,
        ...sourceReferenceIds,
      ]));
      const recurringCollection = collection(db, `users/${userId}/recurringPayments`);
      const debtCollection = collection(db, `users/${userId}/debts`);
      const [snapshots, recurringSnapshots, debtSnapshots] = await Promise.all([
        Promise.all(allReferenceIds.flatMap(refId => [
          getDocsFromServer(query(txCollection, where('accountId', '==', refId))),
          getDocsFromServer(query(txCollection, where('toAccountId', '==', refId))),
        ])),
        Promise.all(Array.from(sourceReferenceIds).map(referenceId =>
          getDocsFromServer(
            query(recurringCollection, where('accountId', '==', referenceId))
          )
        )),
        Promise.all(Array.from(sourceReferenceIds).map(referenceId =>
          getDocsFromServer(
            query(debtCollection, where('accountId', '==', referenceId))
          )
        )),
      ]);
      const recurringIds = Array.from(new Set(
        recurringSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.id))
      ));
      const debtIds = Array.from(new Set(
        debtSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.id))
      ));
      const relevantTransactions = new Map<string, Transaction>();
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(snap => {
          relevantTransactions.set(snap.id, { id: snap.id, ...(snap.data() as Transaction) });
        });
      });

      const txUpdates = new Map<string, Record<string, unknown>>();
      const rewrittenTransactions: Transaction[] = [];
      const updatedTransactionsForCache: Transaction[] = [];
      relevantTransactions.forEach(transaction => {
        const updates: Record<string, unknown> = {};
        if (sourceReferenceIds.has(transaction.accountId)) updates.accountId = destinationId;
        if (transaction.toAccountId && sourceReferenceIds.has(transaction.toAccountId)) {
          updates.toAccountId = destinationId;
        }
        const rewrittenTransaction = { ...transaction, ...updates } as Transaction;
        if (Object.keys(updates).length > 0) {
          txUpdates.set(transaction.id!, updates);
          updatedTransactionsForCache.push(rewrittenTransaction);
        }
        rewrittenTransactions.push(rewrittenTransaction);
      });

      const reconciledUsedCredit = reconcileUsedCredit(
        destinationReferenceIds,
        rewrittenTransactions
      );
      const adjustmentRef = desiredDebt === undefined ? null : doc(txCollection);
      const desiredDebtAdjustment = desiredDebt === undefined || !adjustmentRef
        ? null
        : buildBalanceTargetAdjustment({
            account: {
              ...effectiveDestinationAccount,
              id: destinationId,
              usedCredit: reconciledUsedCredit,
            },
            currentValue: reconciledUsedCredit,
            targetBalance: desiredDebt,
            operationId,
            transactionId: adjustmentRef.id,
          });
      const finalUsedCredit = desiredDebtAdjustment?.targetBalance
        ?? reconciledUsedCredit;

      if (desiredDebtAdjustment) {
        const verifiedTarget = reconcileUsedCredit(
          destinationReferenceIds,
          [...rewrittenTransactions, desiredDebtAdjustment]
        );
        if (verifiedTarget !== finalUsedCredit) {
          throw new Error('El ajuste de la fusión no coincide con la deuda objetivo');
        }
      }

      // El valor exacto queda en el mismo commit que el reapunte y los borrados;
      // no existe una segunda fase capaz de fallar y dejar la deuda desalineada.
      // Conservamos también las referencias históricas: una escritura offline
      // creada por un cliente antiguo puede llegar después de liberar el lock.
      const destinationData = stripUndefined({
        ...effectiveDestinationAccount,
        id: undefined,
        isDefault: makeDestinationDefault,
        mergedAccountIds: Array.from(
          new Set([...destinationReferenceIds, ...sourceReferenceIds])
        ).filter(referenceId => referenceId !== destinationId),
        usedCredit: finalUsedCredit,
      } as Record<string, unknown>);
      operations.unshift({
        type: currentExistingDestination ? 'update' : 'set',
        ref: doc(accountCollection, destinationId),
        data: destinationData,
      });

      txUpdates.forEach((updates, transactionId) => {
        operations.push({
          type: 'update',
          ref: doc(db, `users/${userId}/transactions`, transactionId),
          data: updates,
        });
      });

      if (adjustmentRef && desiredDebtAdjustment) {
        const persistedAdjustment = { ...desiredDebtAdjustment };
        delete persistedAdjustment.id;
        operations.push({
          type: 'set',
          ref: adjustmentRef,
          data: persistedAdjustment,
        });
        updatedTransactionsForCache.push(desiredDebtAdjustment);
      }

      recurringIds.forEach(paymentId => {
        operations.push({
          type: 'update',
          ref: doc(db, `users/${userId}/recurringPayments`, paymentId),
          data: { accountId: destinationId },
        });
      });

      debtIds.forEach(debtId => {
        operations.push({
          type: 'update',
          ref: doc(db, `users/${userId}/debts`, debtId),
          data: { accountId: destinationId },
        });
      });

      uniqueSourceIds.forEach(sourceId => {
        operations.push({
          type: 'delete',
          ref: doc(db, `users/${userId}/accounts`, sourceId),
        });
      });

      // +1 libera el lock en el mismo batch. Una operación grande no se
      // fragmenta porque eso volvería a introducir estados parciales.
      // Las actualizaciones de transacciones ejecutan la validación de reglas
      // más extensa del dominio; su cota debe ser menor que la de deletes.
      assertAtomicBatchCapacity(
        'unificar estas tarjetas',
        operations.length + 1,
        RULE_SAFE_COMPLEX_WRITE_LIMIT
      );

      await renewAccountOperationLock(userId, operationId, 'merge-credit-cards');

      const batch = writeBatch(db);
      operations.forEach(operation => {
        if (operation.type === 'delete') {
          batch.delete(operation.ref);
        } else if (operation.type === 'set') {
          batch.set(operation.ref, operation.data ?? {});
        } else {
          batch.update(operation.ref, operation.data ?? {});
        }
      });
      batch.set(
        doc(db, 'users', userId),
        createAccountOperationRelease(operationId, 'merge-credit-cards'),
        { mergeFields: ['accountOperationLock'] }
      );
      await batch.commit();
      committed = true;

      if (updatedTransactionsForCache.length > 0) {
        publishTransactionCacheMutation({
          userId,
          type: 'update',
          transactions: updatedTransactionsForCache,
        });
      }
      } finally {
        if (!committed) {
          await releaseAccountOperationLock(
            userId,
            operationId,
            'merge-credit-cards'
          ).catch(() => undefined);
        }
      }
    },
    'mergeCreditCards',
    { maxRetries: 2 }
  );
}

/**
 * Define la cuenta default (autenticado): bloquea escrituras del dominio,
 * consulta el conjunto actual desde el servidor y cambia todas las cuentas en
 * un único batch. Así otra pestaña no puede dejar dos defaults por usar un
 * snapshot React incompleto u obsoleto.
 */
export async function setDefaultAccountAtomic(
  userId: string,
  id: string
): Promise<void> {
  if (!checkNetworkConnection()) {
    throw new Error('Sin conexión a internet');
  }

  await safeFirestoreOperation(
    async () => {
      const operationId = createAccountOperationId('set-default-account');
      let committed = false;

      try {
        await acquireAccountOperationLock(
          userId,
          operationId,
          'set-default-account'
        );
        const accountCollection = collection(db, `users/${userId}/accounts`);
        const accountSnapshot = await getDocsFromServer(accountCollection);
        if (!accountSnapshot.docs.some(account => account.id === id)) {
          throw new Error(
            'La cuenta elegida cambió o ya no existe. Actualiza e intenta de nuevo.'
          );
        }

        assertAtomicBatchCapacity(
          'cambiar la cuenta por defecto',
          accountSnapshot.docs.length + 1
        );
        await renewAccountOperationLock(
          userId,
          operationId,
          'set-default-account'
        );

        const batch = writeBatch(db);
        accountSnapshot.docs.forEach(account => {
          batch.update(
            doc(accountCollection, account.id),
            { isDefault: account.id === id }
          );
        });
        batch.set(
          doc(db, 'users', userId),
          createAccountOperationRelease(operationId, 'set-default-account'),
          { mergeFields: ['accountOperationLock'] }
        );
        await batch.commit();
        committed = true;
      } finally {
        if (!committed) {
          await releaseAccountOperationLock(
            userId,
            operationId,
            'set-default-account'
          ).catch(() => undefined);
        }
      }
    },
    'setDefaultAccount',
    { maxRetries: 2 }
  );
}
