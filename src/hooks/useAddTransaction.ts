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
import toast from 'react-hot-toast';
import { TransactionValidator } from '../utils/validators';
import { calculateInterest } from '../utils/interestCalculator';
import {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  TRANSFER_CATEGORY,
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
  updateRecurringPayment,
  setNewTransaction,
  setShowForm,
  setShowWelcomeModal,
}: UseAddTransactionParams) {
  /**
   * Handler principal para agregar una transacción
   */
  const handleAddTransaction = useCallback(
    async (newTransaction: NewTransaction): Promise<void> => {
      // Validar que existan cuentas
      if (accounts.length === 0) {
        toast.error('Debes crear al menos una cuenta primero');
        setShowWelcomeModal(true);
        return;
      }

      // Obtener información de la cuenta
      const accountId = newTransaction.accountId || defaultAccount?.id;
      const selectedAccount = accounts.find((acc) => acc.id === accountId);

      if (!selectedAccount) {
        toast.error('Por favor selecciona una cuenta válida');
        return;
      }

      // Validación usando Strategy Pattern
      const validation = TransactionValidator.validate(
        newTransaction,
        selectedAccount,
        transactions
      );

      if (!validation.isValid) {
        validation.errors.forEach((error) => toast.error(error));
        return;
      }

      try {
        // Convertir amount de formato colombiano (1.234,56) a número
        const amountStr = newTransaction.amount
          .toString()
          .replace(/\./g, '')
          .replace(',', '.');
        const amount = parseFloat(amountStr);

        if (isNaN(amount)) {
          toast.error('Monto inválido');
          return;
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

        // Preparar datos de la transacción
        const transactionData: Omit<Transaction, 'id' | 'createdAt'> = {
          type: newTransaction.type,
          amount: amount,
          category:
            newTransaction.type === 'transfer'
              ? TRANSFER_CATEGORY
              : newTransaction.category,
          description: newTransaction.description.trim(),
          date: new Date(),
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

        // Cerrar modal inmediatamente (UX optimizada)
        resetForm();

        // Ejecutar operación asíncrona después del cierre
        await addTransaction(transactionData);
        toast.success(SUCCESS_MESSAGES.TRANSACTION_ADDED);
      } catch (error) {
        toast.error(ERROR_MESSAGES.ADD_TRANSACTION_ERROR);
        console.error(error);
      }
    },
    [
      accounts,
      transactions,
      recurringPayments,
      defaultAccount,
      addTransaction,
      updateRecurringPayment,
      setShowWelcomeModal,
    ]
  );

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

  return {
    handleAddTransaction,
    resetForm,
  };
}
