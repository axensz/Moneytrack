/**
 * 🆕 HOOK: useAddTransaction
 *
 * Extrae la lógica de creación de transacciones de finance-tracker.tsx
 * Siguiendo Single Responsibility Principle
 *
 * RESPONSABILIDADES:
 * - Validación de transacciones
 * - Cálculo de intereses para TC
 * - Actualización de pagos periódicos
 * - Manejo de estado del formulario
 */

import { useCallback, useRef } from 'react';
import { showToast } from '../utils/toastHelpers';
import { logger } from '../utils/logger';
import { TransactionValidator } from '../utils/validators';
import { calculateInterest } from '../utils/interestCalculator';
import { parseDateWithTime, parseCurrency, roundMoney } from '../utils/formatters';
import { cycleKey } from '../utils/recurringDates';
import {
  balanceReadinessBlock,
  isBalanceSensitiveCreate,
} from '../utils/ledgerReadiness';
import {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  TRANSFER_CATEGORY,
  CREDIT_PAYMENT_CATEGORY,
  createInitialTransaction,
  TRANSACTION_VALIDATION,
} from '../config/constants';
import type {
  NewTransaction,
  Transaction,
  Account,
  RecurringPayment,
} from '../types/finance';

const parseSignedCurrency = (value: string | number): number => {
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  const sign = trimmed.startsWith('-') ? -1 : 1;
  return sign * parseCurrency(trimmed);
};

interface UseAddTransactionParams {
  accounts: Account[];
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  defaultAccount: Account | null;
  /**
   * false mientras el historial completo asienta (ventana paginada en vuelo).
   * En ese estado se OMITE la validación de saldo/cupo para no rechazar
   * transacciones legítimas con un falso "Saldo insuficiente". Por defecto true.
   */
  balancesReady?: boolean;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  addCreditPaymentAtomic: (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  addRecurringTransactionAtomic: (
    transaction: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  setNewTransaction: (transaction: NewTransaction) => void;
  setShowForm: (show: boolean) => void;
  setShowWelcomeModal: (show: boolean) => void;
}

/**
 * Hook para gestionar la creación de transacciones
 */
export function useAddTransaction({
  accounts,
  transactions,
  recurringPayments,
  defaultAccount,
  balancesReady = true,
  addTransaction,
  addCreditPaymentAtomic,
  addRecurringTransactionAtomic,
  setNewTransaction,
  setShowForm,
  setShowWelcomeModal,
}: UseAddTransactionParams) {
  // Bloquea reentradas concurrentes de processTransaction (doble clic). #tx-3
  const submittingRef = useRef(false);

  /**
   * Resetea el formulario a su estado inicial
   */
  const resetForm = useCallback(() => {
    setNewTransaction({
      ...createInitialTransaction(),
      accountId: defaultAccount?.id || '',
    });
    setShowForm(false);
  }, [defaultAccount, setNewTransaction, setShowForm]);

  /**
   * Resetea el formulario manteniendo cuenta y fecha (para modo continuo)
   */
  const resetFormKeepContext = useCallback((currentTransaction: NewTransaction) => {
    setNewTransaction({
      ...createInitialTransaction(),
      accountId: currentTransaction.accountId,
      date: currentTransaction.date,
    });
  }, [setNewTransaction]);

  /**
   * Lógica común para preparar y guardar una transacción.
   * Retorna true si se guardó correctamente, false si hubo error.
   */
  const processTransaction = useCallback(
    async (newTransaction: NewTransaction): Promise<boolean> => {
      // Guard anti doble-submit: un doble clic en "Agregar" creaba dos
      // transacciones (el detector de duplicados solo compara contra lo ya
      // persistido, no contra el envío en vuelo). El ref es síncrono (#tx-3).
      if (submittingRef.current) return false;
      submittingRef.current = true;
      try {
      // Validar que existan cuentas
      if (accounts.length === 0) {
        showToast.error('Debes crear al menos una cuenta primero');
        setShowWelcomeModal(true);
        return false;
      }

      // Obtener información de la cuenta
      const accountId = newTransaction.accountId || defaultAccount?.id;
      const selectedAccount = accounts.find((acc) => acc.id === accountId);

      if (!selectedAccount) {
        showToast.error('Por favor selecciona una cuenta válida');
        return false;
      }

      const readinessError = balanceReadinessBlock(
        balancesReady,
        isBalanceSensitiveCreate(newTransaction, selectedAccount),
      );
      if (readinessError) {
        showToast.error(readinessError);
        return false;
      }

      // Validación usando Strategy Pattern. Mientras el historial completo no
      // asienta (balancesReady=false) se OMITE la validación de saldo/cupo
      // (transactions=undefined): de otro modo se valida contra la ventana
      // paginada incompleta y se rechazan transacciones legítimas con un falso
      // "Saldo insuficiente" (#3). Misma decisión que el path de edición.
      const typedAmount = parseSignedCurrency(newTransaction.amount.toString());
      const isForeignCreditExpense =
        selectedAccount.type === 'credit' &&
        newTransaction.type === 'expense' &&
        newTransaction.currency === 'USD';
      const exchangeRate = isForeignCreditExpense
        ? parseSignedCurrency((newTransaction.exchangeRate || '').toString())
        : undefined;

      if (!Number.isFinite(typedAmount)) {
        showToast.error('Monto inválido');
        return false;
      }

      if (isForeignCreditExpense && (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
        showToast.error('Ingresa una TRM válida para convertir el gasto a COP');
        return false;
      }

      const amount = isForeignCreditExpense
        ? roundMoney(typedAmount * exchangeRate!)
        : typedAmount;

      const creditInterestResult = selectedAccount.type === 'credit' &&
        newTransaction.type === 'expense' &&
        newTransaction.installments && newTransaction.installments > 0 &&
        amount > 0
        ? calculateInterest(
            amount,
            selectedAccount.interestRate || 0,
            newTransaction.installments,
            !!newTransaction.hasInterest
          )
        : null;
      const validationAmount = roundMoney(
        amount + (creditInterestResult?.totalInterestAmount ?? 0)
      );

      const validation = TransactionValidator.validate(
        { ...newTransaction, amount: validationAmount.toString() },
        selectedAccount,
        balancesReady ? transactions : undefined
      );

      if (!validation.isValid) {
        validation.errors.forEach((error) => showToast.error(error));
        return false;
      }

      if (newTransaction.type === 'transfer' && newTransaction.toAccountId) {
        const destination = accounts.find(account => account.id === newTransaction.toAccountId);
        if (destination?.type === 'credit') {
          const destinationValidation = TransactionValidator.validate(
            {
              ...newTransaction,
              type: 'income',
              amount: amount.toString(),
              accountId: destination.id!,
            },
            destination,
            balancesReady ? transactions : undefined
          );
          if (!destinationValidation.isValid) {
            destinationValidation.errors.forEach((error) => showToast.error(error));
            return false;
          }
        }
      }

      try {
        // El input entrega formato es-CO ("88.888" o "88.888,5"); parseCurrency
        // maneja la coma decimal sin perder centavos (parseFloat la truncaría).
        if (!Number.isFinite(amount)) {
          showToast.error('Monto inválido');
          return false;
        }

        // Validar monto máximo
        if (amount > TRANSACTION_VALIDATION.amount.max) {
          showToast.error(TRANSACTION_VALIDATION.amount.errorMessage);
          return false;
        }

        // Pago periódico elegido (si hay): se estampa el ciclo y el writer
        // autenticado actualiza monto base + última fecha dentro del mismo batch.
        const recurringPayment = newTransaction.recurringPaymentId
          ? recurringPayments.find((p) => p.id === newTransaction.recurringPaymentId)
          : undefined;

        // Determinar categoría
        const isTCPayment = selectedAccount.type === 'credit' && newTransaction.type === 'income';
        let category = newTransaction.category;
        if (newTransaction.type === 'transfer') {
          category = TRANSFER_CATEGORY;
        } else if (isTCPayment) {
          category = CREDIT_PAYMENT_CATEGORY;
        }

        // Día elegido + hora actual → orden cronológico real (no medianoche).
        // Se calcula una sola vez para que el par de un pago de TC comparta hora.
        const txDate = newTransaction.date ? parseDateWithTime(newTransaction.date) : new Date();

        // Preparar datos de la transacción
        const transactionData: Omit<Transaction, 'id' | 'createdAt'> = {
          type: newTransaction.type,
          amount: amount,
          category,
          description: newTransaction.description.trim(),
          date: txDate,
          paid: newTransaction.paid,
          accountId: newTransaction.accountId || defaultAccount?.id || '',
          toAccountId: newTransaction.toAccountId || undefined,
          beneficiary: newTransaction.beneficiary?.trim() || undefined,
          recurringPaymentId: newTransaction.recurringPaymentId || undefined,
          // Estampar el ciclo de la fecha del pago → isPaidForMonth lo atribuye a
          // ese ciclo de forma explícita y estable (no depende de la ventana ni de
          // que cambie hoy / el dueDay). Boundary cases se reajustan con re-vincular.
          recurringCycle: recurringPayment ? cycleKey(recurringPayment, txDate) : undefined,
        };

        if (isForeignCreditExpense) {
          transactionData.currency = 'COP';
          transactionData.originalAmount = typedAmount;
          transactionData.originalCurrency = 'USD';
          transactionData.exchangeRate = exchangeRate;
        }

        // Calcular intereses si es un gasto en TC con cuotas
        if (
          selectedAccount.type === 'credit' &&
          newTransaction.type === 'expense' &&
          newTransaction.installments &&
          newTransaction.installments > 0
        ) {
          const annualRate = selectedAccount.interestRate || 0;
          const interestResult = creditInterestResult!;

          transactionData.hasInterest = newTransaction.hasInterest;
          transactionData.installments = newTransaction.installments;
          transactionData.monthlyInstallmentAmount =
            interestResult.monthlyInstallmentAmount;
          transactionData.totalInterestAmount =
            interestResult.totalInterestAmount;
          transactionData.interestRate = annualRate;
        }

        // AUDIT-FIX (CRÍTICO-01): Pago de crédito atómico
        // Si es un pago de crédito con cuenta origen, ambas transacciones se crean atómicamente
        if (
          selectedAccount.type === 'credit' &&
          newTransaction.type === 'income' &&
          newTransaction.toAccountId
        ) {
          const sourceAccount = accounts.find(acc => acc.id === newTransaction.toAccountId);
          if (sourceAccount) {
            const sourceValidation = TransactionValidator.validate(
              {
                type: 'expense',
                amount: amount.toString(),
                category: CREDIT_PAYMENT_CATEGORY,
                description: newTransaction.description,
                accountId: sourceAccount.id!,
                beneficiary: newTransaction.beneficiary,
              } as NewTransaction,
              sourceAccount,
              balancesReady ? transactions : undefined
            );
            if (!sourceValidation.isValid) {
              sourceValidation.errors.forEach((error) => showToast.error(error));
              return false;
            }
            const sourceTx: Omit<Transaction, 'id' | 'createdAt'> = {
              type: 'expense',
              amount: amount,
              category: CREDIT_PAYMENT_CATEGORY,
              description: `Pago a ${selectedAccount.name}${newTransaction.description.trim() ? ': ' + newTransaction.description.trim() : ''}`,
              date: txDate,
              paid: true,
              accountId: sourceAccount.id!,
              beneficiary: newTransaction.beneficiary?.trim() || undefined,
            };
            await addCreditPaymentAtomic(transactionData, sourceTx);
          } else {
            throw new Error(
              'La cuenta origen del pago no está disponible. Actualiza las cuentas e intenta de nuevo.'
            );
          }
        } else if (recurringPayment && transactionData.paid) {
          await addRecurringTransactionAtomic(transactionData);
        } else {
          await addTransaction(transactionData);
        }

        return true;
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : ERROR_MESSAGES.ADD_TRANSACTION_ERROR;
        showToast.error(message);
        logger.error('Error adding transaction', error);
        return false;
      }
      } finally {
        submittingRef.current = false;
      }
    },
    [
      accounts,
      transactions,
      recurringPayments,
      defaultAccount,
      balancesReady,
      addTransaction,
      addCreditPaymentAtomic,
      addRecurringTransactionAtomic,
      setShowWelcomeModal,
    ]
  );

  /**
   * Handler principal para agregar una transacción (cierra el formulario)
   */
  const handleAddTransaction = useCallback(
    async (newTransaction: NewTransaction): Promise<void> => {
      // Procesar primero: si la validación falla (p. ej. falta categoría) o el
      // guardado da error, mantenemos el formulario abierto con los datos para
      // que el usuario pueda corregir, en vez de cerrarlo y perder lo escrito.
      const success = await processTransaction(newTransaction);
      if (success) {
        resetForm();
        showToast.success(SUCCESS_MESSAGES.TRANSACTION_ADDED);
      }
    },
    [resetForm, processTransaction]
  );

  /**
   * Handler para agregar y continuar (mantiene el formulario abierto con cuenta y fecha)
   */
  const handleAddAndContinue = useCallback(
    async (newTransaction: NewTransaction): Promise<boolean> => {
      const success = await processTransaction(newTransaction);
      if (success) {
        showToast.success(SUCCESS_MESSAGES.TRANSACTION_ADDED);
        resetFormKeepContext(newTransaction);
      }
      return success;
    },
    [processTransaction, resetFormKeepContext]
  );

  return {
    handleAddTransaction,
    handleAddAndContinue,
    resetForm,
  };
}
