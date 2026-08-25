import { useMemo, useCallback } from 'react';
import { useFirestoreData } from '../contexts/FirestoreContext';
import { useGuestLedger } from './useGuestLedger';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { safeFirestoreOperation, checkNetworkConnection } from '../utils/firestoreHelpers';
import { generateId, roundMoney } from '../utils/formatters';
import { getAccountReferenceIds, transactionUsesAccount } from '../utils/accountTransactions';
import { getCreditCardUsedCredit } from '../utils/accountStrategies';
import { getCreditAuthorityState } from '../utils/creditAuthority';
import {
  buildBalanceTargetAdjustment,
  normalizeBalanceTarget,
} from '../utils/balanceTargetAdjustment';
import { CURRENT_CREDIT_DEBT_MODEL_VERSION } from '../utils/creditDeltas';
import { CURRENT_PAYMENT_PAIR_MODEL_VERSION } from '../utils/creditPaymentPairs';
import { deleteAccountCascade, mergeCreditCardsOrchestrated, setDefaultAccountAtomic } from './firestore/accountOrchestration';
import {
  sanitizeBalanceTargetAccountUpdates,
  updateAccountWithBalanceTarget,
} from './firestore/accountBalanceTarget';
import type { Account, Transaction } from '../types/finance';

export type MergeCreditCardsDestination = Pick<Account, 'name'> & Partial<Omit<Account, 'id' | 'name' | 'type' | 'createdAt'>> & {
  id?: string;
};

export interface MergeCreditCardsParams {
  sourceAccountIds: string[];
  destination: MergeCreditCardsDestination;
  desiredDebt?: number;
}

export interface AccountUpdateOptions {
  targetBalance?: number;
}

export function useAccounts(
  userId: string | null,
  transactions: Transaction[],
  deleteTransactionFn: (id: string) => Promise<unknown>,
  // false mientras el primer fetch del historial completo está en vuelo (ventana
  // paginada): cualquier cálculo derivado de `transactions` puede subcontar.
  balancesReady: boolean = true
) {
  const {
    accounts: firestoreAccounts,
    loading: firestoreLoading,
    addAccount: firestoreAddAccount,
    updateAccount: firestoreUpdateAccount
  } = useFirestoreData();

  const {
    accounts: localAccounts,
    mutate: mutateGuestLedger,
  } = useGuestLedger();

  // Usar Firebase si hay usuario, localStorage si no
  const accounts = userId ? firestoreAccounts : localAccounts;

  // Loading es true si hay userId y Firestore aún está cargando
  // Importante: confiar en el loading de useFirestore que ahora espera a que los datos lleguen
  const loading = userId ? firestoreLoading : false;

  const accountsById = useMemo(
    () => new Map(accounts.flatMap(account => account.id ? [[account.id, account] as const] : [])),
    [accounts]
  );

  const balanceSnapshot = useMemo(
    () => BalanceCalculator.calculateBalanceSnapshot(accounts, transactions),
    [accounts, transactions]
  );

  const getAccountBalance = useCallback((accountId: string): number => {
    return balanceSnapshot.balancesByAccountId.get(accountId) ?? 0;
  }, [balanceSnapshot]);

  const getTransactionCountForAccount = useCallback((accountId: string): number => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;
    const direct = transactions.filter(t => transactionUsesAccount(t, account));
    const relatedIds = new Set(direct.flatMap(t => [t.id, t.linkedTransactionId]).filter(
      (value): value is string => Boolean(value)
    ));
    return transactions.filter(t => t.id && relatedIds.has(t.id)).length;
  }, [accounts, transactions]);

  // Cupo usado (deuda pendiente) de una TC. Centralizado aquí —como
  // getAccountBalance— para que NINGÚN consumidor re-derive el cupo desde un
  // array elegido a mano: usa el mismo `transactions` de SALDO (historial
  // completo, no la ventana paginada), que para una TC legacy sin usedCredit
  // persistido evita subcontar la deuda (#4a/#11).
  const getCreditUsed = useCallback((accountId: string): number => {
    const account = accountsById.get(accountId);
    if (!account || account.type !== 'credit') return 0;
    return balanceSnapshot.creditUsedByAccountId.get(accountId) ?? 0;
  }, [accountsById, balanceSnapshot]);

  const totalBalance = balanceSnapshot.totalBalance;

  const addAccount = async (newAcc: Omit<Account, 'id' | 'createdAt'>) => {
    const isFirst = accounts.length === 0;
    const accountData = {
      ...newAcc,
      ...(newAcc.type === 'credit' && {
        usedCredit: newAcc.usedCredit ?? 0,
        creditDebtModelVersion: CURRENT_CREDIT_DEBT_MODEL_VERSION,
        paymentPairModelVersion: CURRENT_PAYMENT_PAIR_MODEL_VERSION,
      }),
      isDefault: isFirst
    };

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      await safeFirestoreOperation(
        () => firestoreAddAccount(accountData),
        'addAccount',
        { maxRetries: 2 }
      );
    } else {
      const newAccount = {
        ...accountData,
        id: generateId(),
        createdAt: new Date()
      };
      await mutateGuestLedger(draft => {
        draft.accounts.push(newAccount);
      }, { operationId: `guest-add-account:${newAccount.id}` });
    }
  };

  const updateAccount = async (
    id: string,
    updates: Partial<Account>,
    options: AccountUpdateOptions = {}
  ) => {
    const targetBalance = options.targetBalance;

    if (userId) {
      if (!checkNetworkConnection()) {
        throw new Error('Sin conexión a internet');
      }

      if (targetBalance === undefined) {
        await safeFirestoreOperation(
          () => firestoreUpdateAccount(id, updates),
          'updateAccount',
          { maxRetries: 2 }
        );
      } else {
        await safeFirestoreOperation(
          () => updateAccountWithBalanceTarget(userId, id, updates, targetBalance),
          'updateAccountWithBalanceTarget',
          { maxRetries: 2 }
        );
      }
    } else {
      const operationId = targetBalance === undefined
        ? `guest-update-account:${id}:${generateId()}`
        : `guest-balance-adjustment:${generateId()}`;
      const transactionId = targetBalance === undefined ? undefined : generateId();
      await mutateGuestLedger(draft => {
        const account = draft.accounts.find(candidate => candidate.id === id);
        if (!account) throw new Error('La cuenta ya no existe');
        let safeUpdates = updates;
        let adjustment: Transaction | null = null;

        if (targetBalance !== undefined) {
          const snapshot = BalanceCalculator.calculateBalanceSnapshot(
            draft.accounts,
            draft.transactions,
          );
          const currentValue = account.type === 'credit'
            ? snapshot.creditUsedByAccountId.get(id) ?? 0
            : snapshot.balancesByAccountId.get(id) ?? 0;
          adjustment = buildBalanceTargetAdjustment({
            account,
            currentValue,
            targetBalance,
            operationId,
            transactionId: transactionId!,
          });
          safeUpdates = {
            ...sanitizeBalanceTargetAccountUpdates(updates),
            ...(account.type === 'credit'
              ? { usedCredit: adjustment?.targetBalance ?? roundMoney(targetBalance) }
              : {}),
          };
        }

        draft.accounts = draft.accounts.map(candidate => (
          candidate.id === id ? { ...candidate, ...safeUpdates } : candidate
        ));
        if (adjustment) draft.transactions.push(adjustment);
      }, { operationId });
    }
  };

  const deleteAccount = async (id: string, options: { preserveTransactions?: boolean; allowDefaultDelete?: boolean } = {}) => {
    const account = accounts.find(a => a.id === id);
    if (userId && account?.isDefault && !options.allowDefaultDelete) {
      throw new Error('No puedes eliminar la cuenta por defecto');
    }

    if (userId) {
      await deleteAccountCascade(
        userId,
        id,
        options
      );
    } else {
      // Paridad con deleteAccountCascade (#accounts-1): el borrado en modo
      // invitado NO debe dejar transacciones/deudas/recurrentes huérfanas,
      // debe limpiar el bankAccountId colgante de las TC asociadas y conservar
      // la invariante de "exactamente una cuenta por defecto". Antes solo
      // quitaba la cuenta y corrompía saldos/stats con referencias colgantes.
      await mutateGuestLedger(draft => {
        const currentAccount = draft.accounts.find(candidate => candidate.id === id);
        if (!currentAccount) return;
        if (currentAccount.isDefault && !options.allowDefaultDelete) {
          throw new Error('No puedes eliminar la cuenta por defecto');
        }
        if (!options.preserveTransactions) {
          const direct = draft.transactions.filter(t => t.accountId === id || t.toAccountId === id);
          const deleteIds = new Set(direct.flatMap(t => [t.id, t.linkedTransactionId]).filter(
            (value): value is string => Boolean(value)
          ));
          draft.transactions = draft.transactions.filter(t => !t.id || !deleteIds.has(t.id));
        }
        draft.debts = draft.debts.filter(debt => debt.accountId !== id);
        draft.recurringPayments = draft.recurringPayments.filter(payment => payment.accountId !== id);
        let remaining = draft.accounts
          .filter(acc => acc.id !== id)
          .map(acc => (acc.bankAccountId === id ? { ...acc, bankAccountId: undefined } : acc));
        // Si se borró la cuenta por defecto, promover otra para no quedar sin default.
        if (currentAccount.isDefault && remaining.length > 0 && !remaining.some(a => a.isDefault)) {
          remaining = remaining.map((acc, i) => (i === 0 ? { ...acc, isDefault: true } : acc));
        }
        draft.accounts = remaining;
      }, { operationId: `guest-delete-account:${id}:${generateId()}` });
    }
  };

  const mergeCreditCards = async ({
    sourceAccountIds,
    destination,
    desiredDebt,
  }: MergeCreditCardsParams) => {
    const normalizedDesiredDebt = desiredDebt === undefined
      ? undefined
      : normalizeBalanceTarget(desiredDebt);
    const uniqueSourceIds = Array.from(new Set(sourceAccountIds.filter(Boolean)));

    if (uniqueSourceIds.length === 0) {
      throw new Error('Debes seleccionar al menos una tarjeta de crédito origen');
    }

    if (destination.id && uniqueSourceIds.includes(destination.id)) {
      throw new Error('La tarjeta destino no puede ser también una tarjeta origen');
    }

    const sourceIdSet = new Set(uniqueSourceIds);
    const sourceAccounts = uniqueSourceIds.map(id => accounts.find(account => account.id === id));
    const missingSourceId = uniqueSourceIds.find((_, index) => !sourceAccounts[index]);
    if (missingSourceId) {
      throw new Error(`La cuenta origen ${missingSourceId} no existe`);
    }

    const nonCreditSource = sourceAccounts.find(account => account?.type !== 'credit');
    if (nonCreditSource) {
      throw new Error(`La cuenta origen ${nonCreditSource.name} no es una tarjeta de crédito`);
    }

    const existingDestination = destination.id
      ? accounts.find(account => account.id === destination.id)
      : undefined;

    if (destination.id && !existingDestination) {
      throw new Error(`La cuenta destino ${destination.id} no existe`);
    }

    if (existingDestination && existingDestination.type !== 'credit') {
      throw new Error(`La cuenta destino ${existingDestination.name} no es una tarjeta de crédito`);
    }

    // Validar que todas las tarjetas pertenezcan al mismo banco
    const allCardsForBankCheck = [...sourceAccounts.filter(Boolean) as Account[]];
    if (existingDestination) allCardsForBankCheck.push(existingDestination);

    const bankIds = allCardsForBankCheck
      .map(account => account.bankAccountId)
      .filter((id): id is string => id != null);

    if (bankIds.length === 0) {
      throw new Error('Las tarjetas deben estar asociadas a una cuenta bancaria para poder unificarse');
    }

    const uniqueBanks = new Set(bankIds);
    if (uniqueBanks.size > 1) {
      throw new Error('Solo se pueden unificar tarjetas de crédito del mismo banco');
    }

    // Si alguna tiene banco y otra no, también es inconsistente
    if (bankIds.length < allCardsForBankCheck.length) {
      throw new Error('Solo se pueden unificar tarjetas de crédito del mismo banco (algunas tarjetas no tienen banco asignado)');
    }

    const sourceHadDefault = sourceAccounts.some(account => account?.isDefault);
    // sourceHadDefault SIEMPRE fuerza default en el destino: si una tarjeta origen
    // era la default, al borrarla en la fusión no se debe quedar el usuario sin
    // ninguna. Con `??` un destination.isDefault=false explícito ignoraba
    // sourceHadDefault → cero defaults (#accounts-4).
    const shouldMakeDestinationDefault =
      (destination.isDefault ?? existingDestination?.isDefault ?? false) || sourceHadDefault;
    const destinationId = destination.id ?? generateId();

    // Consolidar el cupo utilizado: la deuda del destino pasa a ser la suma de la
    // deuda de TODAS las tarjetas unificadas (destino + orígenes), ya que sus
    // transacciones se reapuntan al destino. Sin esto la deuda de las tarjetas
    // origen se perdería al eliminarlas. Se prefiere el valor persistido; si una
    // tarjeta aún no lo tiene, se calcula desde sus transacciones en memoria.
    const cardsToConsolidate = [existingDestination, ...sourceAccounts].filter(
      (account): account is Account => Boolean(account)
    );
    // El fallback (sin usedCredit persistido) deriva la deuda del historial:
    // con la ventana paginada aún sin asentar subcontaría. Bloquear hasta ready.
    if (!balancesReady && cardsToConsolidate.some(account => account.usedCredit == null)) {
      throw new Error('Los saldos aún se están calculando. Intenta unificar de nuevo en unos segundos.');
    }
    const mergedUsedCredit = cardsToConsolidate.reduce(
      (sum, account) =>
        sum +
        (account.usedCredit != null
          ? Math.max(0, account.usedCredit)
          : getCreditCardUsedCredit(account, transactions)),
      0
    );

    const destinationAccount: Account = {
      ...(existingDestination ?? {
        id: destinationId,
        type: 'credit' as const,
        initialBalance: 0,
        createdAt: new Date(),
        isDefault: shouldMakeDestinationDefault,
      }),
      ...destination,
      id: destinationId,
      type: 'credit',
      initialBalance: 0,
      isDefault: shouldMakeDestinationDefault,
      createdAt: existingDestination?.createdAt ?? new Date(),
      mergedAccountIds: Array.from(new Set(
        cardsToConsolidate.flatMap(getAccountReferenceIds)
      )).filter(referenceId => referenceId !== destinationId),
      usedCredit: normalizedDesiredDebt ?? mergedUsedCredit,
      creditDebtModelVersion: CURRENT_CREDIT_DEBT_MODEL_VERSION,
    };

    const migrateAccountReference = (accountId?: string): string | undefined => (
      accountId && sourceIdSet.has(accountId) ? destinationId : accountId
    );

    if (userId) {
      await mergeCreditCardsOrchestrated(userId, {
        destinationId,
        destinationAccount,
        existingDestination,
        uniqueSourceIds,
        desiredDebt: normalizedDesiredDebt,
      });
    } else {
      const guestMergeOperationId = `guest-merge-credit-cards:${generateId()}`;
      await mutateGuestLedger(draft => {
        const localSourceAccounts = uniqueSourceIds.map(id => (
          draft.accounts.find(account => account.id === id)
        ));
        const missingLocalSourceId = uniqueSourceIds.find((_, index) => !localSourceAccounts[index]);
        if (missingLocalSourceId) {
          throw new Error(`La cuenta origen ${missingLocalSourceId} ya no existe`);
        }
        const invalidLocalSource = localSourceAccounts.find(account => account?.type !== 'credit');
        if (invalidLocalSource) {
          throw new Error(`La cuenta origen ${invalidLocalSource.name} ya no es una tarjeta de crédito`);
        }
        const existingLocalDestination = destination.id
          ? draft.accounts.find(account => account.id === destination.id)
          : undefined;
        if (destination.id && !existingLocalDestination) {
          throw new Error(`La cuenta destino ${destination.id} ya no existe`);
        }
        if (existingLocalDestination && existingLocalDestination.type !== 'credit') {
          throw new Error(`La cuenta destino ${existingLocalDestination.name} ya no es una tarjeta de crédito`);
        }

        const localCardsToConsolidate = [
          existingLocalDestination,
          ...localSourceAccounts,
        ].filter((account): account is Account => Boolean(account));
        const localBankIds = localCardsToConsolidate
          .map(account => account.bankAccountId)
          .filter((id): id is string => Boolean(id));
        if (
          localBankIds.length !== localCardsToConsolidate.length
          || new Set(localBankIds).size !== 1
        ) {
          throw new Error('Las tarjetas cambiaron y ya no pertenecen al mismo banco');
        }
        if (localCardsToConsolidate.some(account => !getCreditAuthorityState(account).ready)) {
          throw new Error('Las tarjetas requieren reconciliación antes de unificarse');
        }
        const localMergedUsedCredit = localCardsToConsolidate.reduce(
          (sum, account) => sum + (account.usedCredit ?? 0),
          0,
        );
        const localShouldMakeDefault =
          (destination.isDefault ?? existingLocalDestination?.isDefault ?? false)
          || localSourceAccounts.some(account => account?.isDefault);
        const localDestinationAccount: Account = {
          ...(existingLocalDestination ?? {
            id: destinationId,
            type: 'credit' as const,
            initialBalance: 0,
            createdAt: new Date(),
            isDefault: localShouldMakeDefault,
          }),
          ...destination,
          id: destinationId,
          type: 'credit',
          initialBalance: 0,
          isDefault: localShouldMakeDefault,
          createdAt: existingLocalDestination?.createdAt ?? new Date(),
          mergedAccountIds: Array.from(new Set(
            localCardsToConsolidate.flatMap(getAccountReferenceIds)
          )).filter(referenceId => referenceId !== destinationId),
          usedCredit: normalizedDesiredDebt ?? localMergedUsedCredit,
          creditDebtModelVersion: CURRENT_CREDIT_DEBT_MODEL_VERSION,
        };
        const localDesiredDebtAdjustment = normalizedDesiredDebt === undefined
          ? null
          : buildBalanceTargetAdjustment({
              account: localDestinationAccount,
              currentValue: localMergedUsedCredit,
              targetBalance: normalizedDesiredDebt,
              operationId: guestMergeOperationId,
              transactionId: generateId(),
            });

        const withoutSourcesAndDestination = draft.accounts.filter(account =>
          account.id !== destinationId && (!account.id || !sourceIdSet.has(account.id))
        );

        draft.accounts = [
          ...withoutSourcesAndDestination.map(account => ({
            ...account,
            isDefault: localShouldMakeDefault ? false : account.isDefault,
          })),
          localDestinationAccount,
        ];
        const rewritten = draft.transactions.map(transactionItem => ({
          ...transactionItem,
          accountId: migrateAccountReference(transactionItem.accountId) ?? transactionItem.accountId,
          toAccountId: migrateAccountReference(transactionItem.toAccountId),
        }));
        draft.transactions = localDesiredDebtAdjustment
          ? [...rewritten, localDesiredDebtAdjustment]
          : rewritten;
        draft.recurringPayments = draft.recurringPayments.map(payment => ({
        ...payment,
        accountId: migrateAccountReference(payment.accountId) ?? payment.accountId,
        }));
        draft.debts = draft.debts.map(debt => ({
        ...debt,
        accountId: migrateAccountReference(debt.accountId) ?? debt.accountId,
        }));
      }, {
        operationId: guestMergeOperationId,
      });
    }
  };

  const setDefaultAccount = async (id: string) => {
    if (userId) {
      await setDefaultAccountAtomic(userId, id);
    } else {
      await mutateGuestLedger(draft => {
        if (!draft.accounts.some(account => account.id === id)) {
          throw new Error('La cuenta ya no existe');
        }
        draft.accounts = draft.accounts.map(account => ({
          ...account,
          isDefault: account.id === id,
        }));
      }, { operationId: `guest-default-account:${id}:${generateId()}` });
    }
  };

  const defaultAccount = accounts.find(a => a.isDefault);

  return {
    accounts,
    loading,
    addAccount,
    updateAccount,
    deleteAccount,
    mergeCreditCards,
    setDefaultAccount,
    getAccountBalance,
    getCreditUsed,
    getTransactionCountForAccount,
    totalBalance,
    defaultAccount
  };
}
