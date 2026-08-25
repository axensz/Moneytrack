import { useState, useCallback, useRef } from 'react';
import type { Account, NewAccount } from '../../../../types/finance';
import type { AccountUpdateOptions } from '../../../../hooks/useAccounts';
import { showToast } from '../../../../utils/toastHelpers';
import { formatNumberForInput, parseCurrency, unformatNumber } from '../../../../utils/formatters';
import { logger } from '../../../../utils/logger';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../../../config/constants';

const INITIAL_ACCOUNT: NewAccount = {
  name: '',
  type: 'savings',
  initialBalance: 0,
  creditLimit: 0,
  cutoffDay: 1,
  paymentDay: 10,
  monthlySpendingLimit: 0,
  bankAccountId: undefined,
  interestRate: 0,
};

interface UseAccountFormProps {
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (
    id: string,
    updates: Partial<Account>,
    options?: AccountUpdateOptions
  ) => Promise<void>;
  /**
   * false mientras el saldo aún se deriva de la ventana paginada (fetch del
   * historial completo en vuelo). En ese estado el ajuste de saldo se BLOQUEA:
   * el delta se calcularía contra un saldo transitorio incorrecto y quedaría
   * persistida una transacción de ajuste mal dimensionada. Por defecto true.
   */
  balancesReady?: boolean;
}

interface UseAccountFormReturn {
  showAccountForm: boolean;
  /** Guardado en curso: deshabilita el submit y muestra "Guardando…" (anti doble-submit en UI). */
  isSubmitting: boolean;
  editingAccount: Account | null;
  newAccount: NewAccount;
  balanceAdjustment: string;
  initialBalanceInput: string;
  creditLimitInput: string;
  monthlyLimitInput: string;
  interestRateInput: string;
  setNewAccount: (account: NewAccount) => void;
  setBalanceAdjustment: (value: string) => void;
  setInitialBalanceInput: (value: string) => void;
  setCreditLimitInput: (value: string) => void;
  setMonthlyLimitInput: (value: string) => void;
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
  balancesReady = true,
}: UseAccountFormProps): UseAccountFormReturn {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [newAccount, setNewAccount] = useState<NewAccount>(INITIAL_ACCOUNT);
  const [balanceAdjustment, setBalanceAdjustment] = useState('');
  const [initialBalanceInput, setInitialBalanceInput] = useState('');
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [monthlyLimitInput, setMonthlyLimitInput] = useState('');
  const [interestRateInput, setInterestRateInput] = useState('');
  // Evita el doble submit: un doble clic en "Actualizar" creaba DOS transacciones
  // de ajuste de saldo/deuda (el closeForm de la rama editar corre después de los
  // await). Un ref es síncrono → bloquea la segunda entrada en el mismo tick (#accounts-2).
  // El estado paralelo solo alimenta la UI (botón deshabilitado + "Guardando…").
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setNewAccount(INITIAL_ACCOUNT);
    setBalanceAdjustment('');
    setInitialBalanceInput('');
    setCreditLimitInput('');
    setMonthlyLimitInput('');
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
      monthlySpendingLimit: account.monthlySpendingLimit || 0,
      bankAccountId: account.bankAccountId,
      interestRate: account.interestRate || 0,
    });
    setInitialBalanceInput(account.initialBalance.toString());
    setCreditLimitInput((account.creditLimit || 0).toString());
    setMonthlyLimitInput((account.monthlySpendingLimit || 0).toString());

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
    if (submittingRef.current) return; // re-entrada (doble clic) → no-op
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
    if (!newAccount.name.trim()) {
      showToast.error(ERROR_MESSAGES.EMPTY_ACCOUNT_NAME);
      return;
    }

    if (
      newAccount.type === 'credit' &&
      (!Number.isFinite(newAccount.interestRate) || newAccount.interestRate < 0 || newAccount.interestRate > 200)
    ) {
      showToast.error('La tasa E.A. debe estar entre 0% y 200%');
      return;
    }

    try {
      if (editingAccount) {
        // EDITAR cuenta existente
        let targetBalance: number | undefined;

        if (balanceAdjustment.trim() !== '') {
          // Mientras el historial completo no haya asentado, el saldo actual es
          // transitorio (ventana paginada): un ajuste ahora persistiría un delta
          // mal dimensionado. Bloquear y pedir reintento.
          if (!balancesReady) {
            showToast.error('Los saldos aún se están calculando. Intenta de nuevo en unos segundos.');
            return;
          }
          const newBalance = parseCurrency(balanceAdjustment);

          if (!Number.isFinite(newBalance) || newBalance < 0) {
            showToast.error('Ingresa un saldo válido (debe ser mayor o igual a cero)');
            return;
          }
          targetBalance = newBalance;
        }

        const accountId = editingAccount.id!;

        const updates: Partial<Account> = { name: newAccount.name.trim() };

        if (editingAccount.type === 'credit') {
          const manualLimit = parseFloat(newAccount.monthlySpendingLimit.toString()) || 0;
          const creditLimit = parseFloat(newAccount.creditLimit.toString()) || 0;
          const cutoffDay = parseInt(newAccount.cutoffDay.toString());
          const paymentDay = parseInt(newAccount.paymentDay.toString());
          if (manualLimit < 0 || manualLimit > creditLimit) {
            showToast.error(ERROR_MESSAGES.INVALID_MONTHLY_SPENDING_LIMIT);
            return;
          }
          if (isNaN(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_CUTOFF_DAY);
            return;
          }
          if (isNaN(paymentDay) || paymentDay < 1 || paymentDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_PAYMENT_DAY);
            return;
          }
          if (newAccount.creditLimit) {
            updates.creditLimit = newAccount.creditLimit;
          }
          updates.cutoffDay = cutoffDay;
          updates.paymentDay = paymentDay;
          updates.interestRate = newAccount.interestRate || 0;
          updates.monthlySpendingLimit = newAccount.monthlySpendingLimit || 0;
        }

        if (targetBalance !== undefined) {
          await updateAccount(accountId, updates, { targetBalance });
          const msg = editingAccount.type === 'credit' 
            ? 'Cuenta actualizada y deuda ajustada correctamente'
            : 'Cuenta actualizada y saldo ajustado correctamente';
          closeForm();
          showToast.success(msg);
        } else {
          await updateAccount(accountId, updates);
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

          // isNaN: vaciar el input deja NaN, que pasaba el rango (NaN<1 y NaN>31
          // son ambos false) y se guardaba enmascarado con ||1/||10. Rechazar.
          if (isNaN(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_CUTOFF_DAY);
            return;
          }

          if (isNaN(paymentDay) || paymentDay < 1 || paymentDay > 31) {
            showToast.error(ERROR_MESSAGES.INVALID_PAYMENT_DAY);
            return;
          }

          const monthlySpendingLimit = parseFloat(newAccount.monthlySpendingLimit.toString()) || 0;
          if (monthlySpendingLimit < 0 || monthlySpendingLimit > creditLimit) {
            showToast.error(ERROR_MESSAGES.INVALID_MONTHLY_SPENDING_LIMIT);
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
          monthlySpendingLimit: parseFloat(newAccount.monthlySpendingLimit.toString()) || 0,
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
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    newAccount,
    editingAccount,
    balanceAdjustment,
    balancesReady,
    addAccount,
    updateAccount,
    closeForm,
  ]);

  return {
    showAccountForm,
    isSubmitting,
    editingAccount,
    newAccount,
    balanceAdjustment,
    initialBalanceInput,
    creditLimitInput,
    monthlyLimitInput,
    interestRateInput,
    setNewAccount,
    setBalanceAdjustment,
    setInitialBalanceInput,
    setCreditLimitInput,
    setMonthlyLimitInput,
    setInterestRateInput,
    openCreateForm,
    openEditForm,
    closeForm,
    handleSubmit,
    formatNumberForInput,
    unformatNumber,
  };
}
