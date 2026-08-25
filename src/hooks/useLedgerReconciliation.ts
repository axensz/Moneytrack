'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  executeConfirmedLedgerRepair,
  loadServerLedgerReconciliationBundle,
} from '../services/ledgerReconciliation';
import type { Transaction } from '../types/finance';
import type { LedgerReconciliationReport } from '../utils/ledgerReconciliation';
import type { LedgerRepairPlan } from '../utils/ledgerRepairPlans';

export type LedgerReconciliationLoadStatus =
  | 'idle'
  | 'guest'
  | 'loading'
  | 'ready'
  | 'error';

interface LedgerReconciliationState {
  userId: string | null;
  report: LedgerReconciliationReport | null;
  transactions: Transaction[];
  status: LedgerReconciliationLoadStatus;
  refreshing: boolean;
  executing: boolean;
  error: Error | null;
}

const initialState = (): LedgerReconciliationState => ({
  userId: null,
  report: null,
  transactions: [],
  status: 'idle',
  refreshing: false,
  executing: false,
  error: null,
});

export function useLedgerReconciliation({
  userId,
  isOpen,
}: {
  userId: string | null;
  isOpen: boolean;
}) {
  const [state, setState] = useState<LedgerReconciliationState>(initialState);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      requestIdRef.current += 1;
      setState({
        ...initialState(),
        userId: null,
        status: 'guest',
      });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState(previous => {
      const hasCurrentReport = previous.userId === userId && previous.report !== null;
      return {
        userId,
        report: hasCurrentReport ? previous.report : null,
        transactions: hasCurrentReport ? previous.transactions : [],
        status: hasCurrentReport ? 'ready' : 'loading',
        refreshing: hasCurrentReport,
        executing: false,
        error: null,
      };
    });
    try {
      const bundle = await loadServerLedgerReconciliationBundle(userId);
      if (requestIdRef.current !== requestId) return;
      setState({
        userId,
        report: bundle.report,
        transactions: bundle.transactions,
        status: 'ready',
        refreshing: false,
        executing: false,
        error: null,
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const normalized = error instanceof Error ? error : new Error('No se pudo conciliar.');
      setState(previous => ({
        ...previous,
        userId,
        status: previous.report ? 'ready' : 'error',
        refreshing: false,
        executing: false,
        error: normalized,
      }));
    }
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  const executePlan = useCallback(async (
    plan: LedgerRepairPlan,
    confirmation: string,
  ): Promise<LedgerReconciliationReport> => {
    if (!userId) throw new Error('Inicia sesión para ejecutar un plan.');
    setState(previous => ({
      ...previous,
      executing: true,
      error: null,
    }));
    try {
      await executeConfirmedLedgerRepair(userId, plan, confirmation);
      const fresh = await loadServerLedgerReconciliationBundle(userId);
      setState({
        userId,
        report: fresh.report,
        transactions: fresh.transactions,
        status: 'ready',
        refreshing: false,
        executing: false,
        error: null,
      });
      return fresh.report;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('No se pudo ejecutar el plan.');
      setState(previous => ({
        ...previous,
        executing: false,
        error: normalized,
      }));
      throw normalized;
    }
  }, [userId]);

  const belongsToCurrentUser = state.userId === userId;
  return {
    report: belongsToCurrentUser ? state.report : null,
    transactions: belongsToCurrentUser ? state.transactions : [],
    status: !isOpen
      ? 'idle' as const
      : belongsToCurrentUser ? state.status : userId ? 'loading' as const : 'guest' as const,
    refreshing: belongsToCurrentUser && state.refreshing,
    executing: belongsToCurrentUser && state.executing,
    error: belongsToCurrentUser ? state.error : null,
    refresh,
    executePlan,
  };
}
