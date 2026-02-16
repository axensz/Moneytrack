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
      accountId: formData.accountId || undefined,
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

  return (
    <div className="card">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
          <ArrowUpRight className="mx-auto text-blue-600 dark:text-blue-400 mb-1" size={20} />
          <p className="text-xs text-gray-600 dark:text-gray-400">Me deben</p>
          <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{formatCurrency(debtStats.totalLent)}</p>
          <p className="text-xs text-gray-500">{debtStats.activeLentCount} activo{debtStats.activeLentCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-center">
          <ArrowDownLeft className="mx-auto text-orange-600 dark:text-orange-400 mb-1" size={20} />
          <p className="text-xs text-gray-600 dark:text-gray-400">Debo</p>
          <p className="text-sm font-bold text-orange-700 dark:text-orange-300">{formatCurrency(debtStats.totalBorrowed)}</p>
          <p className="text-xs text-gray-500">{debtStats.activeBorrowedCount} activo{debtStats.activeBorrowedCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
          <CheckCircle2 className="mx-auto text-green-600 dark:text-green-400 mb-1" size={20} />
          <p className="text-xs text-gray-600 dark:text-gray-400">Saldados</p>
          <p className="text-sm font-bold text-green-700 dark:text-green-300">{debtStats.settledCount}</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
          <Users className="mx-auto text-purple-600 dark:text-purple-400 mb-1" size={20} />
          <p className="text-xs text-gray-600 dark:text-gray-400">Balance neto</p>
          <p className={`text-sm font-bold ${debtStats.totalLent - debtStats.totalBorrowed >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
            {formatCurrency(debtStats.totalLent - debtStats.totalBorrowed)}
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <HandCoins size={20} className="text-purple-600" />
          Préstamos y Deudas
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-submit text-sm flex items-center gap-1.5"
        >
          <Plus size={16} />
          Nuevo
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setFormData(f => ({ ...f, type: 'lent' }))}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                formData.type === 'lent'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              <ArrowUpRight size={14} className="inline mr-1" />
              Yo presté
            </button>
            <button
              onClick={() => setFormData(f => ({ ...f, type: 'borrowed' }))}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                formData.type === 'borrowed'
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 ring-2 ring-orange-400'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              <ArrowDownLeft size={14} className="inline mr-1" />
              Me prestaron
            </button>
          </div>

          <input
            type="text"
            value={formData.personName}
            onChange={e => setFormData(f => ({ ...f, personName: e.target.value }))}
            placeholder="Nombre de la persona"
            className="input-field"
          />

          <input
            type="text"
            inputMode="numeric"
            value={formatNumberForInput(formData.originalAmount)}
            onChange={e => setFormData(f => ({ ...f, originalAmount: unformatNumber(e.target.value) }))}
            placeholder="Monto"
            className="input-field"
          />

          <input
            type="text"
            value={formData.description}
            onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="input-field"
          />

          <select
            value={formData.accountId}
            onChange={e => setFormData(f => ({ ...f, accountId: e.target.value }))}
            className="input-field"
          >
            <option value="">Cuenta (opcional)</option>
            {accounts.filter(a => a.type !== 'credit').map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <button onClick={handleSubmit} className="btn-submit flex-1">
              Registrar
            </button>
            <button onClick={() => setShowForm(false)} className="btn-cancel flex-1">
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
                    <span className="text-xs text-gray-500 ml-2">{formatCurrency(debt.originalAmount)}</span>
                  </div>
                  <CheckCircle2 size={16} className="text-green-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
            className="input-field flex-1 text-sm"
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
