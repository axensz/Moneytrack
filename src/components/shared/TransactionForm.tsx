import React, { useEffect, useMemo, memo, useState } from 'react';
import { X, Repeat, Zap } from 'lucide-react';
import { UI_LABELS } from '@/config/constants';
import { formatNumberForInput, unformatNumber, formatCurrency } from '@/utils/formatters';
import { BalanceCalculator } from '@/utils/balanceCalculator';
import { INSTALLMENT_OPTIONS } from '@/utils/interestCalculator';
import type { NewTransaction, Account, Categories, Transaction, RecurringPayment } from '@/types/finance';

interface TransactionFormProps {
  newTransaction: NewTransaction;
  setNewTransaction: (tx: NewTransaction) => void;
  accounts: Account[];
  transactions: Transaction[];
  categories: Categories;
  defaultAccount: Account | null;
  recurringPayments?: RecurringPayment[];
  onSubmit: () => void;
  onSubmitAndContinue?: () => void;
  onCancel: () => void;
  batchCount?: number;
}

export const TransactionForm: React.FC<TransactionFormProps> = memo(({
  newTransaction,
  setNewTransaction,
  accounts,
  transactions,
  categories,
  defaultAccount,
  recurringPayments = [],
  onSubmit,
  onSubmitAndContinue,
  onCancel,
  batchCount = 0,
}) => {
  // Obtener cuenta seleccionada para validar restricciones
  const selectedAccount = accounts.find(acc => acc.id === newTransaction.accountId) || defaultAccount;
  const isCreditCard = selectedAccount?.type === 'credit';

  // Calcular cupo usado si es TC y está pagando
  const creditUsed = useMemo(() => {
    if (isCreditCard && newTransaction.type === 'income' && selectedAccount) {
      return BalanceCalculator.calculateCreditCardUsed(selectedAccount, transactions);
    }
    return 0;
  }, [isCreditCard, newTransaction.type, selectedAccount, transactions]);

  // Efecto: Inicializar accountId con defaultAccount si está vacío
  useEffect(() => {
    if (!newTransaction.accountId && defaultAccount?.id) {
      setNewTransaction({
        ...newTransaction,
        accountId: defaultAccount.id
      });
    }
    // Solo depender de accountId y defaultAccount para evitar loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTransaction.accountId, defaultAccount?.id]);

  // Efecto: Si cambia a TC y está en "transfer", cambiar a "expense"
  useEffect(() => {
    if (isCreditCard && newTransaction.type === 'transfer') {
      setNewTransaction({
        ...newTransaction,
        type: 'expense',
        toAccountId: ''
      });
    }
    // Solo depender de isCreditCard y type para evitar loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreditCard, newTransaction.type]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nueva Transacción</h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X size={24} />
            </button>
          </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="label-base">Cuenta</label>
          <select
            value={newTransaction.accountId}
            onChange={(e) => setNewTransaction({...newTransaction, accountId: e.target.value})}
            className="input-base"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} {acc.isDefault ? UI_LABELS.forms.defaultAccount : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-base">Tipo</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'expense', category: '', toAccountId: ''})}
              className={`btn-type ${
                newTransaction.type === 'expense'
                  ? 'btn-type-active-destructive'
                  : 'btn-type-inactive'
              }`}
            >
              {UI_LABELS.transactionTypes.expense}
            </button>
            <button
              type="button"
              onClick={() => setNewTransaction({...newTransaction, type: 'income', category: '', toAccountId: ''})}
              className={`btn-type ${
                newTransaction.type === 'income'
                  ? 'btn-type-active-success'
                  : 'btn-type-inactive'
              }`}
            >
              {isCreditCard ? 'Pagar TC' : UI_LABELS.transactionTypes.income}
            </button>
            {!isCreditCard && (
              <button
                type="button"
                onClick={() => setNewTransaction({...newTransaction, type: 'transfer', category: 'Transferencia', toAccountId: ''})}
                className={`btn-type ${
                  newTransaction.type === 'transfer'
                    ? 'btn-type-active-info'
                    : 'btn-type-inactive'
                }`}
              >
                {UI_LABELS.transactionTypes.transfer}
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="label-base">Monto</label>
          <input
            type="text"
            value={formatNumberForInput(newTransaction.amount)}
            onChange={(e) => {
              const unformatted = unformatNumber(e.target.value);
              setNewTransaction({...newTransaction, amount: unformatted});
            }}
            placeholder="0"
            className="input-base"
          />
          {isCreditCard && newTransaction.type === 'income' && creditUsed > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Deuda pendiente: {formatCurrency(creditUsed)}
            </p>
          )}
        </div>

        <div>
          <label className="label-base">
            {newTransaction.type === 'transfer' ? 'Cuenta Destino' : 'Categoría'}
          </label>
          {newTransaction.type === 'transfer' ? (
            <select
              value={newTransaction.toAccountId}
              onChange={(e) => setNewTransaction({...newTransaction, toAccountId: e.target.value})}
              className="input-base"
            >
              <option value="">{UI_LABELS.forms.selectDestination}</option>
              {accounts.filter(acc => acc.id !== newTransaction.accountId).length === 0 ? (
                <option value="" disabled>No hay otras cuentas disponibles</option>
              ) : (
                accounts
                  .filter(acc => acc.id !== newTransaction.accountId)
                  .map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))
              )}
            </select>
          ) : (
            <select
              value={newTransaction.category}
              onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
              className="input-base"
            >
              <option value="">{UI_LABELS.forms.selectCategory}</option>
              {categories[newTransaction.type].map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="label-base">Fecha</label>
          <input
            type="date"
            value={newTransaction.date}
            onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
            className="input-base"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label-base">Descripción</label>
        <input
          type="text"
          value={newTransaction.description}
          onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
          placeholder="Ej: Compra en supermercado"
          className="input-base"
        />
      </div>

      {/* Campos de cuotas e intereses - solo para gastos en TC */}
      {isCreditCard && newTransaction.type === 'expense' && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
            Configuración de cuotas
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Número de cuotas</label>
              <select
                value={newTransaction.installments}
                onChange={(e) => {
                  const installments = parseInt(e.target.value);
                  setNewTransaction({
                    ...newTransaction,
                    installments,
                    hasInterest: installments === 1 ? false : newTransaction.hasInterest
                  });
                }}
                className="input-base"
              >
                {INSTALLMENT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-base">Tipo de compra</label>
              <div className="flex items-center gap-4 min-h-[42px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTransaction.hasInterest}
                    onChange={(e) => setNewTransaction({...newTransaction, hasInterest: e.target.checked})}
                    disabled={newTransaction.installments === 1}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Con intereses
                  </span>
                </label>
              </div>
            </div>
          </div>

          {newTransaction.hasInterest && newTransaction.installments > 1 && selectedAccount?.interestRate ? (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Nota:</strong> Esta compra se financiará a <strong>{newTransaction.installments} cuotas</strong> con una tasa E.A. del <strong>{selectedAccount.interestRate}%</strong>. Los intereses se calcularán automáticamente al guardar.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* 🆕 Asociar a pago periódico - Destacado visualmente */}
      {newTransaction.type === 'expense' && recurringPayments.length > 0 && (
        <div className={`mt-4 p-4 rounded-xl border-2 transition-all ${
          newTransaction.recurringPaymentId 
            ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700' 
            : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 border-dashed'
        }`}>
          <label className="label-base flex items-center gap-2 mb-2">
            <Repeat size={18} className={newTransaction.recurringPaymentId ? 'text-purple-600' : 'text-gray-400'} />
            <span className={newTransaction.recurringPaymentId ? 'text-purple-700 dark:text-purple-300' : ''}>
              ¿Es un pago periódico?
            </span>
          </label>
          <select
            value={newTransaction.recurringPaymentId || ''}
            onChange={(e) => {
              const paymentId = e.target.value || undefined;
              const payment = recurringPayments.find(p => p.id === paymentId);
              setNewTransaction({
                ...newTransaction,
                recurringPaymentId: paymentId,
                // Auto-completar campos si selecciona un pago (excepto cuenta - el usuario elige)
                ...(payment && {
                  category: payment.category,
                  description: payment.name,
                  amount: payment.amount.toString()
                })
              });
            }}
            className="input-base"
          >
            <option value="">No, es un gasto normal</option>
            <optgroup label="Mis pagos periódicos">
              {recurringPayments.filter(p => p.isActive).map(payment => (
                <option key={payment.id} value={payment.id}>
                  🔄 {payment.name} ({formatCurrency(payment.amount)}/mes)
                </option>
              ))}
            </optgroup>
          </select>
          {newTransaction.recurringPaymentId && (
            <div className="mt-2 flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
              <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
              Se marcará como pagado para este mes
            </div>
          )}
        </div>
      )}

          <div className="flex flex-wrap gap-3 mt-6 items-center">
            <button onClick={onSubmit} className="btn-submit">
              Agregar
            </button>
            {onSubmitAndContinue && (
              <button
                onClick={onSubmitAndContinue}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-sm"
                title="Agregar y seguir ingresando (mantiene cuenta y fecha)"
              >
                <Zap size={16} />
                Agregar y continuar
              </button>
            )}
            <button onClick={onCancel} className="btn-cancel">
              Cancelar
            </button>
            {batchCount > 0 && (
              <span className="ml-auto text-sm text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-900/30 px-3 py-1.5 rounded-full">
                {batchCount} agregada{batchCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

TransactionForm.displayName = 'TransactionForm';