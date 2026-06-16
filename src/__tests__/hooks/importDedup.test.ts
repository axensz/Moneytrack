/**
 * Dedup del wizard de import:
 *  - #10: la huella de transferencia (monto+día, sin descripción) solo debe
 *    poblarse desde tx que SON transferencia/pago, no desde toda tx; si no, un
 *    gasto normal de igual monto+día marca como duplicada una transferencia real.
 *  - #9: al cambiar la cuenta destino, el dedup debe recalcularse contra la nueva
 *    cuenta; si no, queda evaluado contra la anterior.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Account, Categories, Transaction } from '../../types/finance';

vi.mock('../../contexts/GeminiKeyContext', () => ({
  useGeminiKey: () => ({ isConfigured: true, hasConsent: true }),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../../hooks/useImportTransactions', () => ({
  useImportTransactions: () => ({
    importTransactions: vi.fn(async () => {}),
    status: 'idle', progress: 0, result: null, reset: vi.fn(),
  }),
}));
vi.mock('../../hooks/useLocalStorage', () => ({ useLocalStorage: () => [[], vi.fn()] }));

import { useImportWizard } from '../../hooks/useImportWizard';

const categories: Categories = { expense: ['Otros'], income: ['Salario'] };

function setup(accounts: Account[], existingTransactions: Transaction[]) {
  return renderHook(() => useImportWizard({ accounts, existingTransactions, categories, onClose: vi.fn() }));
}

async function upload(result: ReturnType<typeof setup>['result'], csv: string) {
  const file = new File([csv], 'extracto.csv', { type: 'text/csv' });
  type ChangeArg = Parameters<typeof result.current.handleFileChange>[0];
  await act(async () => {
    result.current.handleFileChange({ target: { files: [file] } } as unknown as ChangeArg);
  });
  await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
}

describe('useImportWizard dedup', () => {
  it('#10: un gasto normal de igual monto+día NO marca duplicada una transferencia real', async () => {
    const accounts: Account[] = [{ id: 'acc1', name: 'Ahorros', type: 'savings', isDefault: true, initialBalance: 0 }];
    // Existe un GASTO (no transferencia) de 50.000 el 10/03.
    const existing: Transaction[] = [
      { id: 't1', type: 'expense', amount: 50000, date: new Date(2026, 2, 10), description: 'COMPRA SUPERMERCADO', accountId: 'acc1', paid: true, category: 'Otros' } as Transaction,
    ];
    const { result } = setup(accounts, existing);
    // Importo una TRANSFERENCIA real de 50.000 el 10/03 (PAGO PSE NU).
    await upload(result, 'Fecha,Descripción,Valor\n10/03/2026,PAGO PSE NU,-50000\n');

    const transferRow = result.current.rows.find(r => r.description.includes('PAGO PSE'));
    expect(transferRow?.type).toBe('transfer');
    // El gasto no debe contaminar la huella de transferencias → no es duplicado.
    expect(transferRow?.isDuplicate).toBe(false);
  });

  it('#9: cambiar la cuenta destino recalcula los duplicados contra la nueva cuenta', async () => {
    const accounts: Account[] = [
      { id: 'accA', name: 'A', type: 'savings', isDefault: true, initialBalance: 0 },
      { id: 'accB', name: 'B', type: 'savings', isDefault: false, initialBalance: 0 },
    ];
    // La tx ya existe en la cuenta B, no en la A (la preseleccionada por defecto).
    const existing: Transaction[] = [
      { id: 't1', type: 'expense', amount: 30000, date: new Date(2026, 2, 12), description: 'RESTAURANTE', accountId: 'accB', paid: true, category: 'Otros' } as Transaction,
    ];
    const { result } = setup(accounts, existing);
    await upload(result, 'Fecha,Descripción,Valor\n12/03/2026,RESTAURANTE,-30000\n');

    // Dedup vs A (default): no es duplicado.
    expect(result.current.rows[0].isDuplicate).toBe(false);
    expect(result.current.rows[0].include).toBe(true);

    // Cambio a B, donde sí existe → debe recalcular y marcarla duplicada.
    act(() => result.current.handleAccountChange('accB'));
    expect(result.current.rows[0].isDuplicate).toBe(true);
    expect(result.current.rows[0].include).toBe(false);
  });
});
