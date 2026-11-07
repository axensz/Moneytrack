import { useEffect, useMemo, useRef } from 'react';
import type { Account, Categories, Transaction } from '../../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../../types/transactionImport';
import {
  buildMerchantCategoryHistory,
  evaluateAutoConfirmCandidate,
  type AutoConfirmReason,
} from '../../utils/autoConfirmImport';
import { logger } from '../../utils/logger';
import { confirmTransactionImport } from './transactionImportOrchestration';

/**
 * Orquestación CLIENTE de la auto-confirmación de candidatos de importación.
 *
 * DECISIÓN DE DISEÑO EXPLÍCITA DEL USUARIO: por reducir trabajo manual, cuando el
 * usuario tiene la preferencia activada, los candidatos INEQUÍVOCOS se confirman
 * solos (rompiendo a propósito la filosofía manual original). Los dudosos siguen
 * en la bandeja para revisión manual.
 *
 * La app es estática (`next export`, GitHub Pages): no hay servidor, así que esta
 * lógica corre en el navegador al cargar/recibir candidatos pendientes. NO se
 * reimplementa el commit: se invoca `confirmTransactionImport` (motor probado que
 * hace el batch atómico con lock, `operationId` determinista y update de
 * `usedCredit`). El motor ya es idempotente por `operationId`; además aquí se
 * lleva un `Set` de candidatos ya intentados en la sesión para evitar dobles
 * disparos mientras llega el snapshot con estado `confirmed`.
 */
export interface UseAutoConfirmImportCandidatesInput {
  userId: string | null;
  enabled: boolean;
  isOnline: boolean;
  candidates: readonly PendingTransactionImportCandidate[];
  instruments: readonly PaymentInstrument[];
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  categories: Categories;
}

export interface UseAutoConfirmImportCandidatesResult {
  /** Motivo por el que un candidato quedó en revisión; `null` si calificaría. */
  getReviewReason: (
    candidate: PendingTransactionImportCandidate,
  ) => AutoConfirmReason | null;
}

export function useAutoConfirmImportCandidates(
  input: UseAutoConfirmImportCandidatesInput,
): UseAutoConfirmImportCandidatesResult {
  const {
    userId,
    enabled,
    isOnline,
    candidates,
    instruments,
    accounts,
    transactions,
    categories,
  } = input;

  // Historial de categorías por comercio: se calcula una sola vez por cambio de
  // transacciones y se reutiliza para evaluar todos los candidatos.
  const history = useMemo(
    () => buildMerchantCategoryHistory(transactions),
    [transactions],
  );

  // Evaluación de cada candidato pendiente (memoizada). Sirve tanto para disparar
  // la auto-confirmación como para exponer el motivo de revisión a la UI.
  const evaluations = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof evaluateAutoConfirmCandidate>
    >();
    for (const candidate of candidates) {
      map.set(
        candidate.id,
        evaluateAutoConfirmCandidate({
          candidate,
          instruments,
          accounts,
          expenseCategories: categories.expense,
          history,
        }),
      );
    }
    return map;
  }, [candidates, instruments, accounts, categories.expense, history]);

  // Candidatos ya intentados en esta sesión (anti-carreras / anti-doble-disparo).
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !isOnline || !userId) return;
    const attempted = attemptedRef.current;

    for (const candidate of candidates) {
      if (attempted.has(candidate.id)) continue;
      const evaluation = evaluations.get(candidate.id);
      if (!evaluation || !evaluation.autoConfirm) continue;

      // Marcar ANTES de disparar para evitar que un re-render dispare dos veces.
      attempted.add(candidate.id);

      confirmTransactionImport(userId, candidate.id, {
        expectedCandidate: candidate,
        accountId: evaluation.accountId,
        category: evaluation.category,
        amount: candidate.amountMinor / 100,
        merchant: candidate.merchant,
        occurredAt: candidate.occurredAt,
        hasInterest: false,
        installments: 1,
        rememberInstrument: false,
      }).catch(error => {
        // Si falla, el candidato se queda en la bandeja para revisión manual. No
        // reintentamos automáticamente en esta sesión para no insistir en bucle.
        logger.error('Auto-confirmación de candidato falló', error);
      });
    }
  }, [enabled, isOnline, userId, candidates, evaluations]);

  const getReviewReason = (
    candidate: PendingTransactionImportCandidate,
  ): AutoConfirmReason | null => {
    const evaluation = evaluations.get(candidate.id)
      ?? evaluateAutoConfirmCandidate({
        candidate,
        instruments,
        accounts,
        expenseCategories: categories.expense,
        history,
      });
    return evaluation.autoConfirm ? null : evaluation.reason;
  };

  return { getReviewReason };
}
