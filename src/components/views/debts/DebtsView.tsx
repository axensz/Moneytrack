'use client';

import React, { useState } from 'react';
import { Plus, HandCoins, Users, CheckCircle2, ArrowDownLeft, ArrowUpRight, Trash2, X, DollarSign } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { formatNumberForInput, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import type { Debt } from '../../../types/finance';

/**
 * Vista de préstamos y deudas
 * Permite trackear dinero prestado y recibido con pagos parciales
 */
export const DebtsView: React.FC = () => {
  const {
    debts,
    accounts,
    addDebt,
    updateDebt,
    deleteDebt,
    registerDebtPayment,
    getDebtTransactions,
    debtStats,
    formatCurrency,
    hideBalances,
    setHideBalances,
  } = useFinance();

  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showSettled, setShowSettled] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    personName: '',
    type: 'lent' as 'lent' | 'borrowed',
    originalAmount: '',
    description: '',
    accountId: '',
  });

  const handleSubmit = async () => {
    const amount = parseFloat(unformatNumber(formData.originalAmount));
    if (!formData.personName.trim()) {
      showToast.error('Ingresa el nombre de la persona');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    await addDebt({
      personName: formData.personName.trim(),
      type: formData.type,
      originalAmount: amount,
      remainingAmount: amount,
      description: formData.description.trim(),
      accountId: formData.accountId || undefined, // Asegurar que sea undefined si está vacío
      isSettled: false,
    });

    showToast.success(formData.type === 'lent' ? 'Préstamo registrado' : 'Deuda registrada');
    setFormData({ personName: '', type: 'lent', originalAmount: '', description: '', accountId: '' });
    setShowForm(false);
  };

  const handlePayment = async (debtId: string) => {
    const amount = parseFloat(unformatNumber(paymentAmount));
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    await registerDebtPayment(debtId, amount);
    showToast.success('Pago registrado');
    setPaymentAmount('');
    setShowPaymentForm(null);
  };

  const handleDelete = async (debt: Debt) => {
    if (!confirm(`¿Eliminar ${debt.type === 'lent' ? 'préstamo a' : 'deuda con'} ${debt.personName}?`)) return;
    await deleteDebt(debt.id!);
    showToast.success('Eliminado');
  };

  const activeDebts = debts.filter(d => !d.isSettled);
  const settledDebts = debts.filter(d => d.isSettled);
  const lentDebts = activeDebts.filter(d => d.type === 'lent');
  const borrowedDebts = activeDebts.filter(d => d.type === 'borrowed');

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="space-y-6">
      {/* Header con descripción */}
      <div className="card">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Préstamos y Deudas
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Controla el dinero que prestas y debes
          </p>
        </div>

        {/* Stats Cards - Mejoradas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl p-4 sm:p-5 border-2 border-blue-200 dark:border-blue-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-xl">
                <ArrowUpRight className="text-blue-700 dark:text-blue-300" size={20} />
              </div>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-full">
                {debtStats.activeLentCount} activo{debtStats.activeLentCount !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">Me deben</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">{displayAmount(debtStats.totalLent)}</p>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 rounded-2xl p-4 sm:p-5 border-2 border-orange-200 dark:border-orange-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-orange-200 dark:bg-orange-800 rounded-xl">
                <ArrowDownLeft className="text-orange-700 dark:text-orange-300" size={20} />
              </div>
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/50 px-2 py-1 rounded-full">
                {debtStats.activeBorrowedCount} activo{debtStats.activeBorrowedCount !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-orange-700 dark:text-orange-400 font-medium mb-1">Debo</p>
            <p className="text-xl sm:text-2xl font-bold text-orange-900 dark:text-orange-100">{displayAmount(debtStats.totalBorrowed)}</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 rounded-2xl p-4 sm:p-5 border-2 border-green-200 dark:border-green-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-200 dark:bg-green-800 rounded-xl">
                <CheckCircle2 className="text-green-700 dark:text-green-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">Saldados</p>
            <p className="text-xl sm:text-2xl font-bold text-green-900 dark:text-green-100">{debtStats.settledCount}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 rounded-2xl p-4 sm:p-5 border-2 border-purple-200 dark:border-purple-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-xl">
                <Users className="text-purple-700 dark:text-purple-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-purple-700 dark:text-purple-400 font-medium mb-1">Balance neto</p>
            <p className={`text-xl sm:text-2xl font-bold ${debtStats.totalLent - debtStats.totalBorrowed >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {displayAmount(debtStats.totalLent - debtStats.totalBorrowed)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Gestionar Préstamos
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-submit text-sm flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Nuevo</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-2xl p-5 mb-6 space-y-4 border-2 border-purple-200 dark:border-purple-800 shadow-lg">
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setFormData(f => ({ ...f, type: 'lent' }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg ${formData.type === 'lent'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white ring-2 ring-blue-400 scale-105'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                <ArrowUpRight size={16} className="inline mr-2" />
                Yo presté
              </button>
              <button
                onClick={() => setFormData(f => ({ ...f, type: 'borrowed' }))}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg ${formData.type === 'borrowed'
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white ring-2 ring-orange-400 scale-105'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                <ArrowDownLeft size={16} className="inline mr-2" />
                Me prestaron
              </button>
            </div>

            <input
              type="text"
              value={formData.personName}
              onChange={e => setFormData(f => ({ ...f, personName: e.target.value }))}
              placeholder="Nombre de la persona"
              className="input-base"
            />

            <input
              type="text"
              inputMode="numeric"
              value={formatNumberForInput(formData.originalAmount)}
              onChange={e => setFormData(f => ({ ...f, originalAmount: unformatNumber(e.target.value) }))}
              placeholder="Monto"
              className="input-base"
            />

            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción (opcional)"
              className="input-base"
            />

            <select
              value={formData.accountId}
              onChange={e => setFormData(f => ({ ...f, accountId: e.target.value }))}
              className="input-base"
            >
              <option value="">Sin cuenta asociada (opcional)</option>
              {accounts.filter(a => a.type !== 'credit').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            <div className="flex gap-3">
              <button onClick={handleSubmit} className="btn-submit flex-1 shadow-md hover:shadow-lg">
                Registrar
              </button>
              <button onClick={() => setShowForm(false)} className="btn-cancel flex-1 shadow-md hover:shadow-lg">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Active Debts - Lent */}
        {lentDebts.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1.5">
              <ArrowUpRight size={14} />
              Me deben ({lentDebts.length})
            </h3>
            <div className="space-y-2">
              {lentDebts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  formatCurrency={formatCurrency}
                  showPaymentForm={showPaymentForm}
                  setShowPaymentForm={setShowPaymentForm}
                  paymentAmount={paymentAmount}
                  setPaymentAmount={setPaymentAmount}
                  onPayment={handlePayment}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Debts - Borrowed */}
        {borrowedDebts.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-2 flex items-center gap-1.5">
              <ArrowDownLeft size={14} />
              Debo ({borrowedDebts.length})
            </h3>
            <div className="space-y-2">
              {borrowedDebts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  formatCurrency={formatCurrency}
                  showPaymentForm={showPaymentForm}
                  setShowPaymentForm={setShowPaymentForm}
                  paymentAmount={paymentAmount}
                  setPaymentAmount={setPaymentAmount}
                  onPayment={handlePayment}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeDebts.length === 0 && !showForm && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <HandCoins size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay préstamos activos</p>
            <p className="text-xs mt-1">Registra un préstamo para empezar a rastrear</p>
          </div>
        )}

        {/* Settled toggle */}
        {settledDebts.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowSettled(!showSettled)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showSettled ? 'Ocultar' : 'Mostrar'} saldados ({settledDebts.length})
            </button>
            {showSettled && (
              <div className="mt-2 space-y-2 opacity-60">
                {settledDebts.map(debt => (
                  <div key={debt.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 line-through">
                        {debt.personName}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">{displayAmount(debt.originalAmount)}</span>
                    </div>
                    <CheckCircle2 size={16} className="text-green-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Subcomponent for debt card
interface DebtCardProps {
  debt: Debt;
  formatCurrency: (n: number) => string;
  showPaymentForm: string | null;
  setShowPaymentForm: (id: string | null) => void;
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;
  onPayment: (id: string) => void;
  onDelete: (debt: Debt) => void;
}

const DebtCard: React.FC<DebtCardProps> = ({
  debt,
  formatCurrency,
  showPaymentForm,
  setShowPaymentForm,
  paymentAmount,
  setPaymentAmount,
  onPayment,
  onDelete,
}) => {
  const progress = debt.originalAmount > 0
    ? Math.round(((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100)
    : 0;

  const isLent = debt.type === 'lent';
  const colorClass = isLent ? 'blue' : 'orange';

  return (
    <div className={`border rounded-xl p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {debt.personName}
            </span>
            {debt.description && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                — {debt.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-lg font-bold text-${colorClass}-600 dark:text-${colorClass}-400`}>
              {formatCurrency(debt.remainingAmount)}
            </span>
            {debt.remainingAmount !== debt.originalAmount && (
              <span className="text-xs text-gray-400 line-through">
                {formatCurrency(debt.originalAmount)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {progress > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{progress}% pagado</span>
                <span>Faltan {formatCurrency(debt.remainingAmount)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className={`bg-${colorClass}-500 h-1.5 rounded-full transition-all`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => {
              if (showPaymentForm === debt.id) {
                setShowPaymentForm(null);
              } else {
                setShowPaymentForm(debt.id!);
                setPaymentAmount('');
              }
            }}
            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
            title="Registrar pago"
          >
            <DollarSign size={16} />
          </button>
          <button
            onClick={() => onDelete(debt)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Payment form */}
      {showPaymentForm === debt.id && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={formatNumberForInput(paymentAmount)}
            onChange={e => setPaymentAmount(unformatNumber(e.target.value))}
            placeholder="Monto del pago"
            className="input-base flex-1 text-sm"
            autoFocus
          />
          <button
            onClick={() => onPayment(debt.id!)}
            className="btn-submit text-sm px-3"
          >
            Pagar
          </button>
          <button
            onClick={() => setShowPaymentForm(null)}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
