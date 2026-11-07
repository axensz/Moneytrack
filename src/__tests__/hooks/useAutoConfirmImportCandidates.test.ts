import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Categories, Transaction } from '../../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../../types/transactionImport';

const confirmTransactionImport = vi.fn(
  async (_userId: string, _candidateId: string, _reviewedExpense: unknown) =>
    ({}) as never,
);
vi.mock('../../hooks/firestore/transactionImportOrchestration', () => ({
  confirmTransactionImport: (
    userId: string,
    candidateId: string,
    reviewedExpense: unknown,
  ) => confirmTransactionImport(userId, candidateId, reviewedExpense),
}));

import { useAutoConfirmImportCandidates } from '../../hooks/firestore/useAutoConfirmImportCandidates';

type NotificationCandidate = Extract<
  PendingTransactionImportCandidate,
  { source: 'android-notification' }
>;

const categories: Categories = {
  expense: ['Alimentación', 'Transporte'],
  income: ['Salario'],
};

const instrument: PaymentInstrument = {
  id: 'wallet-1234',
  schemaVersion: 2,
  label: 'Oro',
  accountId: 'card',
  kind: 'wallet-token',
  last4: '1234',
  network: 'visa',
  active: true,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
};

const accounts: Account[] = [{
  id: 'card',
  name: 'TC principal',
  type: 'credit',
  isDefault: false,
  initialBalance: 0,
  creditLimit: 2_000_000,
  usedCredit: 0,
}];

const eligibleCandidate = (
  overrides: Partial<NotificationCandidate> = {},
): NotificationCandidate => ({
  id: 'a'.repeat(64),
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 1_200_000,
  currency: 'COP',
  merchant: 'Uber trip 123',
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
  ...overrides,
});

const ineligibleCandidate = (): NotificationCandidate =>
  eligibleCandidate({
    id: 'b'.repeat(64),
    merchant: 'Comercio Raro XYZ',
  });

const history: readonly Transaction[] = [];

const baseInput = () => ({
  userId: 'owner',
  enabled: true,
  isOnline: true,
  candidates: [eligibleCandidate()],
  instruments: [instrument],
  accounts,
  transactions: history,
  categories,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAutoConfirmImportCandidates', () => {
  it('auto-confirma solo los candidatos elegibles', async () => {
    renderHook(() => useAutoConfirmImportCandidates({
      ...baseInput(),
      candidates: [eligibleCandidate(), ineligibleCandidate()],
    }));

    await waitFor(() => expect(confirmTransactionImport).toHaveBeenCalledTimes(1));
    expect(confirmTransactionImport).toHaveBeenCalledWith(
      'owner',
      'a'.repeat(64),
      expect.objectContaining({
        accountId: 'card',
        category: 'Transporte',
        amount: 12_000,
        merchant: 'Uber trip 123',
        hasInterest: false,
        installments: 1,
        rememberInstrument: false,
      }),
    );
  });

  it('no dispara dos veces el mismo candidato (idempotencia de sesión)', async () => {
    const candidates = [eligibleCandidate()];
    const { rerender } = renderHook(
      (props: ReturnType<typeof baseInput>) => useAutoConfirmImportCandidates(props),
      { initialProps: { ...baseInput(), candidates } },
    );

    await waitFor(() => expect(confirmTransactionImport).toHaveBeenCalledTimes(1));
    rerender({ ...baseInput(), candidates });
    rerender({ ...baseInput(), candidates });
    expect(confirmTransactionImport).toHaveBeenCalledTimes(1);
  });

  it('no hace nada con la preferencia desactivada', () => {
    renderHook(() => useAutoConfirmImportCandidates({ ...baseInput(), enabled: false }));
    expect(confirmTransactionImport).not.toHaveBeenCalled();
  });

  it('no hace nada sin conexión', () => {
    renderHook(() => useAutoConfirmImportCandidates({ ...baseInput(), isOnline: false }));
    expect(confirmTransactionImport).not.toHaveBeenCalled();
  });

  it('no hace nada sin usuario', () => {
    renderHook(() => useAutoConfirmImportCandidates({ ...baseInput(), userId: null }));
    expect(confirmTransactionImport).not.toHaveBeenCalled();
  });

  it('expone el motivo correcto para los candidatos no elegibles', () => {
    const notEligible = ineligibleCandidate();
    const ambiguous = eligibleCandidate({ id: 'c'.repeat(64) });
    const { result } = renderHook(() => useAutoConfirmImportCandidates({
      ...baseInput(),
      candidates: [eligibleCandidate(), notEligible, ambiguous],
      instruments: [
        { ...instrument, id: 'one', accountId: 'card' },
        { ...instrument, id: 'two', accountId: 'card-b' },
      ],
      accounts: [...accounts, { ...accounts[0], id: 'card-b' }],
    }));

    // Con dos instrumentos last4 '1234' el match es ambiguo para todos.
    expect(result.current.getReviewReason(ambiguous)).toBe('cuenta-ambigua');
    expect(result.current.getReviewReason(notEligible)).toBe('cuenta-ambigua');
  });

  it('devuelve null como motivo cuando el candidato calificaría', () => {
    const candidate = eligibleCandidate();
    const { result } = renderHook(() => useAutoConfirmImportCandidates({
      ...baseInput(),
      enabled: false,
      candidates: [candidate],
    }));
    expect(result.current.getReviewReason(candidate)).toBeNull();
  });
});
