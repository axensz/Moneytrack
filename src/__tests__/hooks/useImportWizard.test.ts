import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Account, Categories, Transaction } from '../../types/finance';
import type { ImportRow } from '../../hooks/useImportTransactions';

// ── Mocks de dependencias del hook ──────────────────────────────────────────
const importTransactionsSpy = vi.fn(async () => {});
const resetSpy = vi.fn();
const setLearningRulesSpy = vi.fn();

vi.mock('../../contexts/GeminiKeyContext', () => ({
  useGeminiKey: () => ({ isConfigured: true, hasConsent: true }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('../../hooks/useImportTransactions', () => ({
  useImportTransactions: () => ({
    importTransactions: importTransactionsSpy,
    status: 'idle',
    progress: 0,
    result: null,
    reset: resetSpy,
  }),
}));
vi.mock('../../hooks/useLocalStorage', () => ({
  useLocalStorage: () => [[], setLearningRulesSpy],
}));

import { useImportWizard } from '../../hooks/useImportWizard';

const accounts: Account[] = [
  { id: 'acc1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 },
];
const categories: Categories = { expense: ['Otros', 'Alimentación'], income: ['Salario'] };
const existingTransactions: Transaction[] = [];

const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  date: new Date('2026-01-15'),
  description: 'COMPRA POS STARBUCKS',
  amount: 15000,
  category: 'Otros',
  type: 'expense',
  accountId: 'acc1',
  include: true,
  isDuplicate: false,
  ...overrides,
} as ImportRow);

function setup() {
  const onClose = vi.fn();
  const hook = renderHook(() => useImportWizard({ accounts, existingTransactions, categories, onClose }));
  return { ...hook, onClose };
}

describe('useImportWizard — caracterización de la lógica del wizard', () => {
  beforeEach(() => {
    importTransactionsSpy.mockClear();
    resetSpy.mockClear();
    setLearningRulesSpy.mockClear();
  });

  it('estado inicial: paso upload, sin filas', () => {
    const { result } = setup();
    expect(result.current.step).toBe('upload');
    expect(result.current.rows).toEqual([]);
    expect(result.current.includedCount).toBe(0);
  });

  it('handleToggleRow alterna include de una fila', () => {
    const { result } = setup();
    act(() => result.current.setRows([row(), row({ description: 'B' })]));
    expect(result.current.includedCount).toBe(2);
    act(() => result.current.handleToggleRow(0));
    expect(result.current.rows[0].include).toBe(false);
    expect(result.current.includedCount).toBe(1);
  });

  it('handleToggleAll incluye/excluye todas', () => {
    const { result } = setup();
    act(() => result.current.setRows([row(), row({ description: 'B' })]));
    act(() => result.current.handleToggleAll(false));
    expect(result.current.includedCount).toBe(0);
    act(() => result.current.handleToggleAll(true));
    expect(result.current.includedCount).toBe(2);
  });

  it('handleCategoryChange actualiza la categoría y persiste una regla aprendida', () => {
    const { result } = setup();
    act(() => result.current.setRows([row()]));
    act(() => result.current.handleCategoryChange(0, 'Alimentación'));
    expect(result.current.rows[0].category).toBe('Alimentación');
    expect(setLearningRulesSpy).toHaveBeenCalled();
  });

  it('handleImport envía las filas a importTransactions y pasa a done', async () => {
    const { result } = setup();
    const seeded = [row(), row({ description: 'B', include: false })];
    act(() => result.current.setRows(seeded));
    await act(async () => { await result.current.handleImport(); });
    expect(importTransactionsSpy).toHaveBeenCalledTimes(1);
    // importTransactions recibe TODAS las filas; el filtrado include lo hace el commit.
    expect(importTransactionsSpy.mock.calls[0][0]).toHaveLength(2);
    expect(result.current.step).toBe('done');
  });

  it('handleApplyAISuggestions sin sugerencias es no-op (no altera categorías)', () => {
    const { result } = setup();
    act(() => result.current.setRows([row(), row({ description: 'B' })]));
    act(() => result.current.handleApplyAISuggestions());
    expect(result.current.rows[0].category).toBe('Otros');
    expect(result.current.aiSuggestions).toEqual([]);
  });

  it('handleClose resetea el estado y llama onClose + reset', () => {
    const { result, onClose } = setup();
    act(() => result.current.setRows([row()]));
    act(() => result.current.setStep('review'));
    act(() => result.current.handleClose());
    expect(result.current.step).toBe('upload');
    expect(result.current.rows).toEqual([]);
    expect(resetSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
