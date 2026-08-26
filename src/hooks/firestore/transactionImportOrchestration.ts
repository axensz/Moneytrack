import {
  collection,
  doc,
  getDocFromServer,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import type {
  LedgerMutationIntent,
  Transaction,
} from '../../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
  TransactionImportCandidate,
} from '../../types/transactionImport';
import { calculateInterest } from '../../utils/interestCalculator';
import { normalizeLedgerAmount } from '../../utils/ledgerMutation';
import { matchPaymentInstrument } from '../../utils/paymentInstrumentMatching';
import {
  decodePaymentInstrument,
  decodeTransactionImportCandidate,
} from '../../utils/transactionImportDecoder';
import {
  executeAuthenticatedLedgerMutation,
  loadServerLedgerTransaction,
  planCreditAuthorityChanges,
  validateLedgerMutationOperationId,
} from './ledgerMutationOrchestration';

const CANDIDATE_ID_PATTERN = /^[a-f0-9]{64}$/;

export interface ReviewedTransactionImportExpense {
  expectedCandidate: PendingTransactionImportCandidate;
  accountId: string;
  category: string;
  amount: number;
  merchant: string;
  occurredAt: Date;
  hasInterest: boolean;
  installments: number;
  paymentInstrumentId?: string;
  rememberInstrument: boolean;
}

interface ServerDocumentSnapshot {
  id: string;
  exists(): boolean;
  data(): Record<string, unknown>;
}

const loadCandidate = async (
  userId: string,
  candidateId: string,
): Promise<TransactionImportCandidate> => {
  const snapshot = await getDocFromServer(
    doc(db, 'users', userId, 'transactionImportCandidates', candidateId),
  ) as unknown as ServerDocumentSnapshot;
  if (!snapshot.exists()) {
    throw new Error('El candidato ya no existe. Actualiza la bandeja para continuar.');
  }

  const decoded = decodeTransactionImportCandidate(snapshot);
  if (!decoded.ok) throw new Error(decoded.issue.message);
  return decoded.candidate;
};

const loadInstrument = async (
  userId: string,
  instrumentId: string,
): Promise<PaymentInstrument> => {
  const snapshot = await getDocFromServer(
    doc(db, 'users', userId, 'paymentInstruments', instrumentId),
  ) as unknown as ServerDocumentSnapshot;
  if (!snapshot.exists()) {
    throw new Error('El medio de pago seleccionado ya no existe. Elige otro.');
  }

  const decoded = decodePaymentInstrument(snapshot);
  if (!decoded.ok) throw new Error(decoded.issue.message);
  return decoded.instrument;
};

const sameCandidate = (
  current: PendingTransactionImportCandidate,
  expected: PendingTransactionImportCandidate,
): boolean => (
  current.id === expected.id
  && current.schemaVersion === expected.schemaVersion
  && current.source === expected.source
  && current.sourcePackage === expected.sourcePackage
  && current.occurredAt.getTime() === expected.occurredAt.getTime()
  && current.amountMinor === expected.amountMinor
  && current.currency === expected.currency
  && current.merchant === expected.merchant
  && current.cardLast4 === expected.cardLast4
  && current.observedInstrumentLabel === expected.observedInstrumentLabel
  && current.parserId === expected.parserId
  && current.parserVersion === expected.parserVersion
  && current.confidence === expected.confidence
  && current.status === expected.status
);

const requireCurrentPendingCandidate = (
  candidate: TransactionImportCandidate,
  expected: PendingTransactionImportCandidate,
): PendingTransactionImportCandidate => {
  if (candidate.status !== 'pending') {
    throw new Error('El candidato cambió de estado. Actualiza la bandeja para continuar.');
  }
  if (!sameCandidate(candidate, expected)) {
    throw new Error('El candidato cambió en el servidor. Revisa sus datos nuevamente.');
  }
  return candidate;
};

const requireReviewedExpense = (
  candidateId: string,
  reviewedExpense: ReviewedTransactionImportExpense,
): number => {
  if (!CANDIDATE_ID_PATTERN.test(candidateId)) {
    throw new Error('El identificador del candidato no es válido.');
  }
  if (
    reviewedExpense.expectedCandidate.id !== candidateId
    || reviewedExpense.expectedCandidate.status !== 'pending'
  ) {
    throw new Error('La revisión no corresponde al candidato solicitado.');
  }
  if (!reviewedExpense.accountId.trim()) {
    throw new Error('Selecciona una cuenta válida.');
  }
  if (!reviewedExpense.category.trim()) {
    throw new Error('Selecciona una categoría válida.');
  }
  if (!reviewedExpense.merchant.trim() || reviewedExpense.merchant.length > 500) {
    throw new Error('Ingresa un comercio válido.');
  }
  if (
    !(reviewedExpense.occurredAt instanceof Date)
    || !Number.isFinite(reviewedExpense.occurredAt.getTime())
  ) {
    throw new Error('Selecciona una fecha válida.');
  }
  if (
    !Number.isInteger(reviewedExpense.installments)
    || reviewedExpense.installments < 1
    || reviewedExpense.installments > 36
  ) {
    throw new Error('El número de cuotas debe estar entre 1 y 36.');
  }
  if (reviewedExpense.paymentInstrumentId && reviewedExpense.rememberInstrument) {
    throw new Error('Elige un medio existente o recuerda uno nuevo, no ambos.');
  }
  if (
    reviewedExpense.rememberInstrument
    && !reviewedExpense.expectedCandidate.cardLast4
    && !reviewedExpense.expectedCandidate.observedInstrumentLabel
  ) {
    throw new Error('Solo puedes recordar un medio cuando Wallet aporta una referencia válida.');
  }
  return normalizeLedgerAmount(reviewedExpense.amount);
};

const requireCommittedAndroidTransaction = async (
  userId: string,
  operationId: string,
): Promise<Transaction> => {
  const transaction = await loadServerLedgerTransaction(userId, operationId);
  if (
    !transaction
    || transaction.id !== operationId
    || transaction.operationId !== operationId
    || transaction.mutationKind !== 'create'
    || transaction.mutationSource !== 'android'
  ) {
    throw new Error(
      'La identidad de la transacción confirmada no coincide. Actualiza la bandeja.',
    );
  }
  return transaction;
};

const returnTerminalCandidate = async (
  userId: string,
  candidate: TransactionImportCandidate,
  operationId: string,
): Promise<Transaction> => {
  if (candidate.status === 'dismissed') {
    throw new Error('El candidato ya fue descartado y no se puede confirmar.');
  }
  if (candidate.status !== 'confirmed') {
    throw new Error('El candidato todavía no tiene una confirmación terminal.');
  }
  if (candidate.transactionId !== operationId) {
    throw new Error('La identidad del candidato confirmado no coincide.');
  }
  return requireCommittedAndroidTransaction(userId, operationId);
};

export async function confirmTransactionImport(
  userId: string,
  candidateId: string,
  reviewedExpense: ReviewedTransactionImportExpense,
): Promise<Transaction> {
  if (!userId.trim()) throw new Error('Debes iniciar sesión para confirmar.');
  const amount = requireReviewedExpense(candidateId, reviewedExpense);
  const operationId = validateLedgerMutationOperationId(
    `ledger-mutation:android:${candidateId}`,
  );

  const initialCandidate = await loadCandidate(userId, candidateId);
  if (initialCandidate.status !== 'pending') {
    return returnTerminalCandidate(userId, initialCandidate, operationId);
  }
  requireCurrentPendingCandidate(
    initialCandidate,
    reviewedExpense.expectedCandidate,
  );

  return executeAuthenticatedLedgerMutation(
    userId,
    async ({ operationId: writerOperationId, loadContext }) => {
      const currentCandidate = requireCurrentPendingCandidate(
        await loadCandidate(userId, candidateId),
        reviewedExpense.expectedCandidate,
      );
      const context = await loadContext([reviewedExpense.accountId]);
      const accountId = context.canonicalAccountId(reviewedExpense.accountId);
      const selectedAccount = context.accounts.find(account => account.id === accountId);
      if (!selectedAccount) {
        throw new Error(`La cuenta ${reviewedExpense.accountId} no existe.`);
      }

      if (reviewedExpense.paymentInstrumentId) {
        const instrument = await loadInstrument(
          userId,
          reviewedExpense.paymentInstrumentId,
        );
        if (!instrument.active) {
          throw new Error('El medio de pago seleccionado está inactivo. Elige otro.');
        }
        if (instrument.accountId !== accountId) {
          throw new Error('El medio de pago cambió de cuenta. Revisa la selección.');
        }
        const currentMatch = matchPaymentInstrument({
          cardLast4: currentCandidate.cardLast4,
          observedInstrumentLabel: currentCandidate.observedInstrumentLabel,
        }, [instrument]);
        if (
          currentMatch.status !== 'matched'
          || currentMatch.instrumentId !== instrument.id
        ) {
          throw new Error('El medio de pago ya no coincide con la candidata revisada.');
        }
      }

      if (
        selectedAccount.type !== 'credit'
        && (reviewedExpense.hasInterest || reviewedExpense.installments !== 1)
      ) {
        throw new Error('Las cuotas y el interés solo aplican a tarjetas de crédito.');
      }

      const createdAt = new Date();
      const transaction: Transaction = {
        id: writerOperationId,
        type: 'expense',
        amount,
        category: reviewedExpense.category.trim(),
        description: reviewedExpense.merchant.trim(),
        date: new Date(reviewedExpense.occurredAt.getTime()),
        paid: true,
        accountId,
        createdAt,
        operationId: writerOperationId,
        mutationKind: 'create',
        mutationSource: 'android',
      };

      if (selectedAccount.type === 'credit') {
        const hasInterest = reviewedExpense.hasInterest
          && reviewedExpense.installments > 1;
        const interestRate = selectedAccount.interestRate ?? 0;
        const interest = calculateInterest(
          amount,
          interestRate,
          reviewedExpense.installments,
          hasInterest,
        );
        Object.assign(transaction, {
          hasInterest,
          installments: reviewedExpense.installments,
          monthlyInstallmentAmount: interest.monthlyInstallmentAmount,
          totalInterestAmount: interest.totalInterestAmount,
          interestRate,
        });
      }

      const intent: LedgerMutationIntent = {
        kind: 'create',
        before: [],
        after: [transaction],
        metadata: {
          operationId: writerOperationId,
          mutationSource: 'android',
        },
      };
      const creditChanges = planCreditAuthorityChanges(intent, context);
      const transactionRef = doc(
        db,
        'users',
        userId,
        'transactions',
        writerOperationId,
      );
      const rememberedInstrumentRef = reviewedExpense.rememberInstrument
        ? doc(collection(db, 'users', userId, 'paymentInstruments'))
        : null;

      return {
        intent,
        context,
        writeCount: 2 + creditChanges.length + (rememberedInstrumentRef ? 1 : 0),
        stage: batch => {
          const persistedTransaction = { ...transaction };
          delete persistedTransaction.id;
          batch.set(transactionRef, persistedTransaction);
          creditChanges.forEach(({ accountId: changedAccountId, delta }) => {
            batch.update(
              doc(db, 'users', userId, 'accounts', changedAccountId),
              { usedCredit: increment(delta) },
            );
          });
          if (rememberedInstrumentRef) {
            batch.set(rememberedInstrumentRef, {
              schemaVersion: 2,
              label: currentCandidate.observedInstrumentLabel
                ?? `Tarjeta •••• ${currentCandidate.cardLast4}`,
              accountId,
              kind: 'wallet-token',
              ...(currentCandidate.cardLast4
                ? { last4: currentCandidate.cardLast4 }
                : {}),
              network: 'unknown',
              active: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          batch.update(
            doc(
              db,
              'users',
              userId,
              'transactionImportCandidates',
              candidateId,
            ),
            {
              status: 'confirmed',
              transactionId: writerOperationId,
              confirmedAt: serverTimestamp(),
            },
          );
        },
        result: transaction,
      };
    },
    { operationId },
  );
}
