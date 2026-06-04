import { useState, useCallback } from 'react';
import type { Account, NewAccount, Transaction } from '../../../../types/finance';
import { showToast } from '../../../../utils/toastHelpers';
import { formatNumberForInput, unformatNumber } from '../../../../utils/formatters';
import { logger } from '../../../../utils/logger';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, BALANCE_ADJUSTMENT_CATEGORY } from '../../../../config/constants';

const INITIAL_ACCOUNT: NewAccount = {
  name: '',
  type: 'savings',
  initialBalance: 0,
  creditLimit: 0,
  cutoffDay: 1,
  paymentDay: 10,
  bankAccountId: undefined,
  interestRate: 0,
};

interface UseAccountFormProps {
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  getAccountBalance: (id: string) => number;
  getCreditUsed: (id: string) => number;
  formatCurrency: (amount: number) => string;
}

interface UseAccountFormReturn {
  showAccountForm: boolean;
  editingAccount: Account | null;
  newAccount: NewAccount;
  balanceAdjustment: string;
  initialBalanceInput: string;
  creditLimitInput: string;
  interestRateInput: string;
  setNewAccount: (account: NewAccount) => void;
  setBalanceAdjustment: (value: string) => void;
  setInitialBalanceInput: (value: string) => void;
  setCreditLimitInput: (value: string) => void;
  setInterestRateInput: (value: string) => void;
  openCreateForm: () => void;
  openEditForm: (account: Account) => void;
  closeForm: () => void;
  handleSubmit: () => Promise<void>;
  formatNumberForInput: typeof formatNumberForInput;
  unformatNumber: typeof unformatNumber;
}

/**
 * Hook para manejar el formulario de cuentas (crear/editar)
 */
export function useAccountForm({
  addAccount,
  updateAccount,
  addTransaction,
  getAccountBalance,
  getCreditUsed,
  formatCurrency,
}: UseAccountFormProps): UseAccountFormReturn {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [newAccount, setNewAccount] = useState<NewAccount>(INITIAL_ACCOUNT);
  const [balanceAdjustment, setBalanceAdjustment] = useState('');
  const [initialBalanceInput, setInitialBalanceInput] = useState('');
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [interestRateInput, setInterestRateInput] = useState('');

  const resetForm = useCallback(() => {
    setNewAccount(INITIAL_ACCOUNT);
    setBalanceAdjustment('');
    setInitialBalanceInput('');
    setCreditLimitInput('');
    setInterestRateInput('');
  }, []);

  const closeForm = useCallback(() => {
    setShowAccountForm(false);
    setEditingAccount(null);
    resetForm();
  }, [resetForm]);

  const openCreateForm = useCallback(() => {
    setEditingAccount(null);
    resetForm();
    setShowAccountForm(true);
  }, [resetForm]);

  const openEditForm = useCallback((account: Account) => {
    setEditingAccount(account);
    setNewAccount({
      name: account.name,
      type: account.type,
      initialBalance: account.initialBalance,
      creditLimit: account.creditLimit || 0,
      cutoffDay: account.cutoffDay || 1,
      paymentDay: account.paymentDay || 10,
      bankAccountId: account.bankAccountId,
      interestRate: account.interestRate || 0,
    });
    setInitialBalanceInput(account.initialBalance.toString());
    setCreditLimitInput((account.creditLimit || 0).toString());

    // Formatear interestRate para el input
    const rate = account.interestRate || 0;
    const rateAsInteger = Math.round(rate * 100).toString().padStart(1, '0');
    const formattedRate = rateAsInteger.length > 2
      ? rateAsInteger.slice(0, -2) + ',' + rateAsInteger.slice(-2)
      : rateAsInteger;
    setInterestRateInput(formattedRate);

    setShowAccountForm(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!newAccount.name.trim()) {
      showToast.error(ERROR_MESSAGES.EMPTY_ACCOUNT_NAME);
      return;
    }

    try {
      if (editingAccount) {
        // EDITAR cuenta existente
        let needsBalanceAdjustment = false;
        let adjustmentData: Omit<Transaction, 'id'> | null = null;

        if (balanceAdjustment.trim() !== '') {
          const cleanValue = balanceAdjustment.trim().replace(/\./g, '').replace(',', '.');
          const newBalance = parseFloat(cleanValue);

          if (isNaN(newBalance) || newBalance < 0) {
            showToast.error('Ingresa un saldo válido (debe ser un número positivo)');
            return;
          }

          if (editingAccount.type === 'credit') {
            // Para TC: ajustar la deuda pendiente
            const currentDebt = getCreditUsed(editingAccount.id!);
            const debtDifference = newBalance - currentDebt;

            if (Math.abs(debtDifference) >= 0.01) {
              needsBalanceAdjustment = true;
              // Si la deuda nueva es mayor, agregar un gasto de ajuste
              // Si la deuda nueva es menor, agregar un ingreso (pago) de ajuste
              adjustmentData = {
                type: debtDifference > 0 ? 'expense' : 'income',
                amount: Math.abs(debtDifference),
                category: BALANCE_ADJUSTMENT_CATEGORY,
                description: `Ajuste de deuda TC: ${debtDifference > 0 ? '+' : '-'}${formatCurrency(Math.abs(debtDifference))}`,
                date: new Date(),
                paid: true,
                accountId: editingAccount.id!,
              };
            }
          } else {
            // Para cuentas normales: ajustar saldo
            const currentBalance = getAccountBalance(editingAccount.id!);
            const adjustment = newBalance - currentBalance;

            if (Math.abs(adjustment) >= 0.01) {
              needsBalanceAdjustment = true;
              adjustmentData = {
                type: adjustment > 0 ? 'income' : 'expense',
                amount: Math.abs(adjustment),
                category: BALANCE_ADJUSTMENT_CATEGORY,
                description: `Ajuste de saldo: ${adjustment > 0 ? '+' : ''}${formatCurrency(adjustment)}`,
                date: new Date(),
                paid: true,
                accountId: editingAccount.id!,
              };
            }
          }
        }

        const accountId = editingAccount.id!;

        const updates: Partial<Account> = { name: newAccount.name.trim() };

        if (editingAccount.type === 'credit') {
          if (newAccount.creditLimit) {
            updates.creditLimit = newAccount.creditLimit;
          }
          updates.interestRate = newAccount.interestRate || 0;
        }

        await updateAccount(accountId, updates);

        if (needsBalanceAdjustment && adjustmentData) {
          await addTransaction(adjustmentData);
          const msg = editingAccount.type === 'credit' 
            ? 'Cuenta actualizada y deuda ajustada correctamente'
            : 'Cuenta actualizada y saldo ajustado correctamente';
          closeForm();
          showToast.success(msg);
        } else {
          closeForm();
          showToast.success(SUCCESS_MESSAGES.ACCOUNT_UPDATED);
        }
      } else {
        // CREAR nueva cuenta
        if (newAccount.type === 'credit') {
          const creditLimit = parseFloat(newAccount.creditLimit.toString());
          if (!newAccount.creditLimit || isNaN(creditLimit) || creditLimit <= 0) {
            showToast.error(ERROR_MESSAGES.INVALID_CREDIT_LIMIT);
            return;
          }

          const cutoffDay = parseInt(newAccount.cutoffDay.toString());
          const paymentDay = parseInt(newAccount.paymentDay.toString());

          if (cutoffDay < 1 || cutoffDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_CUTOFF_DAY);
            return;
          }

          if (paymentDay < 1 || paymentDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_PAYMENT_DAY);
            return;
          }
        } else {
          const initialBalance = parseFloat(newAccount.initialBalance.toString());
          if (newAccount.initialBalance && isNaN(initialBalance)) {
            showToast.error(ERROR_MESSAGES.INVALID_INITIAL_BALANCE);
            return;
          }
        }

        const accountData = {
          name: newAccount.name.trim(),
          type: newAccount.type,
          isDefault: false,
          initialBalance: parseFloat(newAccount.initialBalance.toString()) || 0,
          creditLimit: parseFloat(newAccount.creditLimit.toString()) || 0,
          cutoffDay: parseInt(newAccount.cutoffDay.toString()) || 1,
          paymentDay: parseInt(newAccount.paymentDay.toString()) || 10,
          bankAccountId: newAccount.bankAccountId,
          interestRate: parseFloat(newAccount.interestRate.toString()) || 0,
        };

        closeForm();
        await addAccount(accountData);
        showToast.success(SUCCESS_MESSAGES.ACCOUNT_ADDED);
      }
    } catch (error) {
      showToast.error(ERROR_MESSAGES.ADD_ACCOUNT_ERROR);
      logger.error('Error saving account', error);
    }
  }, [
    newAccount,
    editingAccount,
    balanceAdjustment,
    addAccount,
    updateAccount,
    addTransaction,
    getAccountBalance,
    getCreditUsed,
    formatCurrency,
    closeForm,
  ]);

  return {
    showAccountForm,
    editingAccount,
    newAccount,
    balanceAdjustment,
    initialBalanceInput,
    creditLimitInput,
    interestRateInput,
    setNewAccount,
    setBalanceAdjustment,
    setInitialBalanceInput,
    setCreditLimitInput,
    setInterestRateInput,
    openCreateForm,
    openEditForm,
    closeForm,
    handleSubmit,
    formatNumberForInput,
    unformatNumber,
  };
}
