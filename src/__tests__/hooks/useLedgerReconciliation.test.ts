import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../types/finance';
import { buildLedgerReconciliationReport } from '../../utils/ledgerReconciliation';
import type { LedgerRepairPlan } from '../../utils/ledgerRepairPlans';

const services = vi.hoisted(() => ({
  load: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../../services/ledgerReconciliation', () => ({
  loadServerLedgerReconciliationBundle: services.load,
  executeConfirmedLedgerRepair: services.execute,
}));

import { useLedgerReconciliation } from '../../hooks/useLedgerReconciliation';

const account: Account = {
  id: 'account-1',
  name: 'Cuenta',
  type: 'savings',
  isDefault: true,
  initialBalance: 10,
};

const report = buildLedgerReconciliationReport({
  source: 'server',
  complete: true,
  accounts: [account],
  transactions: [],
  transactionIssues: [],
  debts: [],
  recurringPayments: [],
});

const bundle = { report, transactions: [] };

beforeEach(() => {
  services.load.mockReset();
  services.execute.mockReset();
  services.load.mockResolvedValue(bundle);
});

describe('useLedgerReconciliation', () => {
  it('no consulta mientras está cerrado y distingue el modo invitado', async () => {
    const { result, rerender } = renderHook(
      ({ userId, isOpen }) => useLedgerReconciliation({ userId, isOpen }),
      { initialProps: { userId: 'user-1' as string | null, isOpen: false } },
    );
    expect(result.current.status).toBe('idle');
    expect(services.load).not.toHaveBeenCalled();

    rerender({ userId: null, isOpen: true });

    await waitFor(() => expect(result.current.status).toBe('guest'));
    expect(services.load).not.toHaveBeenCalled();
  });

  it('carga solo al abrir y conserva el reporte durante una actualización', async () => {
    const { result } = renderHook(() => (
      useLedgerReconciliation({ userId: 'user-1', isOpen: true })
    ));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.report).toBe(report);
    expect(services.load).toHaveBeenCalledTimes(1);

    let rejectRefresh: ((error: Error) => void) | undefined;
    services.load.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectRefresh = reject;
    }));
    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    expect(result.current.report).toBe(report);
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      rejectRefresh?.(new Error('offline'));
      await refreshPromise;
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.error?.message).toBe('offline');
  });

  it('ejecuta solo por llamada explícita y reemplaza el estado con fuente fresca', async () => {
    const nextReport = { ...report, fingerprint: 'ledger-v1-next' };
    const plan = {
      confirmationPhrase: 'APLICAR plan',
    } as LedgerRepairPlan;
    services.execute.mockResolvedValue(nextReport);
    services.load
      .mockResolvedValueOnce(bundle)
      .mockResolvedValueOnce({ report: nextReport, transactions: [] });
    const { result } = renderHook(() => (
      useLedgerReconciliation({ userId: 'user-1', isOpen: true })
    ));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(services.execute).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.executePlan(plan, plan.confirmationPhrase);
    });

    expect(services.execute).toHaveBeenCalledWith(
      'user-1',
      plan,
      plan.confirmationPhrase,
    );
    expect(services.load).toHaveBeenCalledTimes(2);
    expect(result.current.report?.fingerprint).toBe('ledger-v1-next');
    expect(result.current.executing).toBe(false);
  });
});
