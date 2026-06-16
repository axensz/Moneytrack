import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Account, Categories, Transaction } from '../../types/finance';
import type { ImportRow } from '../../hooks/useImportTransactions';

// ── Mocks de dependencias del hook ──────────────────────────────────────────
const importTransactionsSpy = vi.fn(async (_rows: ImportRow[]) => {});
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

  it('handleImport ignora doble clic concurrente (guard síncrono): solo importa una vez', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    importTransactionsSpy.mockImplementationOnce(async () => { await gate; });
    const { result } = setup();
    act(() => result.current.setRows([row()]));
    await act(async () => {
      const p1 = result.current.handleImport();
      const p2 = result.current.handleImport(); // segundo clic mientras el primero corre
      release();
      await Promise.all([p1, p2]);
    });
    expect(importTransactionsSpy).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe('done');
  });

  it('handleApplyAISuggestions sin sugerencias es no-op (no altera categorías)', () => {
    const { result } = setup();
    act(() => result.current.setRows([row(), row({ description: 'B' })]));
    act(() => result.current.handleApplyAISuggestions());
    expect(result.current.rows[0].category).toBe('Otros');
    expect(result.current.aiSuggestions).toEqual([]);
  });

  it('dedup contra el historial recibido: re-importar una tx ya existente la excluye (idempotente)', async () => {
    const existing: Transaction[] = [
      { id: 't1', type: 'expense', amount: 50000, date: new Date(2026, 2, 10), description: 'SUPERMERCADO', accountId: 'acc1', paid: true, category: 'Otros' } as Transaction,
    ];
    const onClose = vi.fn();
    const { result } = renderHook(() => useImportWizard({ accounts, existingTransactions: existing, categories, onClose }));

    const csv = 'Fecha,Descripción,Valor\n10/03/2026,SUPERMERCADO,-50000\n11/03/2026,CAFE NUEVO,-8000\n';
    const file = new File([csv], 'extracto.csv', { type: 'text/csv' });
    type ChangeArg = Parameters<typeof result.current.handleFileChange>[0];

    await act(async () => {
      result.current.handleFileChange({ target: { files: [file] } } as unknown as ChangeArg);
    });
    await waitFor(() => expect(result.current.rows.length).toBe(2));

    const dup = result.current.rows.find(r => r.description.includes('SUPERMERCADO'));
    const fresh = result.current.rows.find(r => r.description.includes('CAFE'));
    // La que ya está en el historial: marcada duplicado y excluida → re-import no la reescribe.
    expect(dup?.isDuplicate).toBe(true);
    expect(dup?.include).toBe(false);
    // La nueva: se incluye normalmente.
    expect(fresh?.isDuplicate).toBe(false);
    expect(fresh?.include).toBe(true);
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
