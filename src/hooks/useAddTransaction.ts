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

import { useCallback } from 'react';
import { showToast } from '../utils/toastHelpers';
import { logger } from '../utils/logger';
import { TransactionValidator } from '../utils/validators';
import { calculateInterest } from '../utils/interestCalculator';
import { parseDateFromInput } from '../utils/formatters';
import {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  TRANSFER_CATEGORY,
  CREDIT_PAYMENT_CATEGORY,
  INITIAL_TRANSACTION,
} from '../config/constants';
import type {
  NewTransaction,
  Transaction,
  Account,
  RecurringPayment,
} from '../types/finance';

interface UseAddTransactionParams {
  accounts: Account[];
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  defaultAccount: Account | null;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  addCreditPaymentAtomic: (
    creditTx: Omit<Transaction, 'id' | 'createdAt'>,
    sourceTx: Omit<Transaction, 'id' | 'createdAt'>
  ) => Promise<void>;
  updateRecurringPayment: (id: string, updates: Partial<RecurringPayment>) => Promise<void>;
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
  addTransaction,
  addCreditPaymentAtomic,
  updateRecurringPayment,
  setNewTransaction,
  setShowForm,
  setShowWelcomeModal,
}: UseAddTransactionParams) {
  /**
   * Resetea el formulario a su estado inicial
   */
  const resetForm = useCallback(() => {
    setNewTransaction({
      ...INITIAL_TRANSACTION,
      accountId: defaultAccount?.id || '',
    });
    setShowForm(false);
  }, [defaultAccount, setNewTransaction, setShowForm]);

  /**
   * Resetea el formulario manteniendo cuenta y fecha (para modo continuo)
   */
  const resetFormKeepContext = useCallback((currentTransaction: NewTransaction) => {
    setNewTransaction({
      ...INITIAL_TRANSACTION,
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

      // Validación usando Strategy Pattern
      const validation = TransactionValidator.validate(
        newTransaction,
        selectedAccount,
        transactions
      );

      if (!validation.isValid) {
        validation.errors.forEach((error) => showToast.error(error));
        return false;
      }

      try {
        // Convertir amount de formato colombiano (1.234,56) a número
        const amountStr = newTransaction.amount
          .toString()
          .replace(/\./g, '')
          .replace(',', '.');
        const amount = parseFloat(amountStr);

        if (isNaN(amount)) {
          showToast.error('Monto inválido');
          return false;
        }

        // Si es un pago periódico con monto diferente, actualizar el monto base
        if (newTransaction.recurringPaymentId) {
          const recurringPayment = recurringPayments.find(
            (p) => p.id === newTransaction.recurringPaymentId
          );
          if (recurringPayment && recurringPayment.amount !== amount) {
            await updateRecurringPayment(newTransaction.recurringPaymentId, {
              amount,
            });
          }
        }

        // Determinar categoría
        const isTCPayment = selectedAccount.type === 'credit' && newTransaction.type === 'income';
        let category = newTransaction.category;
        if (newTransaction.type === 'transfer') {
          category = TRANSFER_CATEGORY;
        } else if (isTCPayment) {
          category = CREDIT_PAYMENT_CATEGORY;
        }

        // Preparar datos de la transacción
        const transactionData: Omit<Transaction, 'id' | 'createdAt'> = {
          type: newTransaction.type,
          amount: amount,
          category,
          description: newTransaction.description.trim(),
          date: newTransaction.date ? parseDateFromInput(newTransaction.date) : new Date(),
          paid: newTransaction.paid,
          accountId: newTransaction.accountId || defaultAccount?.id || '',
          toAccountId: newTransaction.toAccountId || undefined,
          recurringPaymentId: newTransaction.recurringPaymentId || undefined,
        };

        // Calcular intereses si es un gasto en TC con cuotas
        if (
          selectedAccount.type === 'credit' &&
          newTransaction.type === 'expense' &&
          newTransaction.installments &&
          newTransaction.installments > 0
        ) {
          const annualRate = selectedAccount.interestRate || 0;
          const interestResult = calculateInterest(
            amount,
            annualRate,
            newTransaction.installments,
            newTransaction.hasInterest
          );

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
            const sourceTx: Omit<Transaction, 'id' | 'createdAt'> = {
              type: 'expense',
              amount: amount,
              category: CREDIT_PAYMENT_CATEGORY,
              description: `Pago a ${selectedAccount.name}${newTransaction.description.trim() ? ': ' + newTransaction.description.trim() : ''}`,
              date: newTransaction.date ? parseDateFromInput(newTransaction.date) : new Date(),
              paid: true,
              accountId: sourceAccount.id!,
            };
            await addCreditPaymentAtomic(transactionData, sourceTx);
          } else {
            // Cuenta origen no encontrada — solo registrar el ingreso al crédito
            await addTransaction(transactionData);
          }
        } else {
          await addTransaction(transactionData);
        }

        return true;
      } catch (error) {
        showToast.error(ERROR_MESSAGES.ADD_TRANSACTION_ERROR);
        logger.error('Error adding transaction', error);
        return false;
      }
    },
    [
      accounts,
      transactions,
      recurringPayments,
      defaultAccount,
      addTransaction,
      addCreditPaymentAtomic,
      updateRecurringPayment,
      setShowWelcomeModal,
    ]
  );

  /**
   * Handler principal para agregar una transacción (cierra el formulario)
   */
  const handleAddTransaction = useCallback(
    async (newTransaction: NewTransaction): Promise<void> => {
      // Cerrar modal inmediatamente (UX optimizada)
      resetForm();

      const success = await processTransaction(newTransaction);
      if (success) {
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
