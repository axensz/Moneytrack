'use client';

import React, { useState } from 'react';
import { Plus, Target, Trophy, Calendar, Trash2, DollarSign, X, Clock, CheckCircle2 } from 'lucide-react';
import { useFinance } from '../../../contexts/FinanceContext';
import { formatNumberForInput, unformatNumber } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import type { SavingsGoal } from '../../../types/finance';

/**
 * Vista de metas de ahorro
 * Permite crear metas con montos objetivo y trackear progreso
 */
export const GoalsView: React.FC = () => {
  const {
    savingsGoals,
    addGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    goalStats,
    formatCurrency,
    hideBalances,
    setHideBalances,
  } = useFinance();

  const [showForm, setShowForm] = useState(false);
  const [showAddSavings, setShowAddSavings] = useState<string | null>(null);
  const [savingsAmount, setSavingsAmount] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    targetDate: '',
  });

  const handleSubmit = async () => {
    const amount = parseFloat(unformatNumber(formData.targetAmount));
    if (!formData.name.trim()) {
      showToast.error('Ingresa un nombre para la meta');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto objetivo debe ser mayor a 0');
      return;
    }

    await addGoal({
      name: formData.name.trim(),
      targetAmount: amount,
      currentAmount: 0,
      targetDate: formData.targetDate ? new Date(formData.targetDate) : undefined,
      isCompleted: false,
    });

    showToast.success('Meta creada');
    setFormData({ name: '', targetAmount: '', targetDate: '' });
    setShowForm(false);
  };

  const handleAddSavings = async (goalId: string) => {
    const amount = parseFloat(unformatNumber(savingsAmount));
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    await addSavings(goalId, amount);
    showToast.success('Ahorro registrado');
    setSavingsAmount('');
    setShowAddSavings(null);
  };

  const handleDelete = async (goal: SavingsGoal) => {
    if (!confirm(`¿Eliminar la meta "${goal.name}"?`)) return;
    await deleteGoal(goal.id!);
    showToast.success('Meta eliminada');
  };

  const activeGoals = goalStatuses.filter(gs => !gs.goal.isCompleted);
  const completedGoals = goalStatuses.filter(gs => gs.goal.isCompleted);

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="space-y-6">
      <div className="card">
        {/* Header con descripción */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Metas de Ahorro
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Define y alcanza tus objetivos financieros
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 rounded-2xl p-4 sm:p-5 border-2 border-purple-200 dark:border-purple-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-xl">
                <Target className="text-purple-700 dark:text-purple-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-purple-700 dark:text-purple-400 font-medium mb-1">Metas activas</p>
            <p className="text-2xl sm:text-3xl font-bold text-purple-900 dark:text-purple-100">{goalStats.activeCount}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl p-4 sm:p-5 border-2 border-blue-200 dark:border-blue-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-xl">
                <Target className="text-blue-700 dark:text-blue-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">Objetivo total</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">{displayAmount(goalStats.totalTarget)}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 rounded-2xl p-4 sm:p-5 border-2 border-green-200 dark:border-green-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-200 dark:bg-green-800 rounded-xl">
                <CheckCircle2 className="text-green-700 dark:text-green-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">Ahorrado</p>
            <p className="text-xl sm:text-2xl font-bold text-green-900 dark:text-green-100">{displayAmount(goalStats.totalSaved)}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 rounded-2xl p-4 sm:p-5 border-2 border-amber-200 dark:border-amber-700 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-amber-200 dark:bg-amber-800 rounded-xl">
                <Trophy className="text-amber-700 dark:text-amber-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Completadas</p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-900 dark:text-amber-100">{goalStats.completedCount}</p>
          </div>
        </div>

        {/* Header con botón */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Mis Metas
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-submit text-sm flex items-center gap-1.5"
          >
            <Plus size={16} />
            Nueva Meta
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 space-y-3">
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre de la meta (ej: Vacaciones)"
              className="input-base"
            />

            <input
              type="text"
              inputMode="numeric"
              value={formatNumberForInput(formData.targetAmount)}
              onChange={e => setFormData(f => ({ ...f, targetAmount: unformatNumber(e.target.value) }))}
              placeholder="Monto objetivo (COP)"
              className="input-base"
            />

            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Fecha límite (opcional)
              </label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={e => setFormData(f => ({ ...f, targetDate: e.target.value }))}
                className="input-base"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmit} className="btn-submit flex-1">
                Crear Meta
              </button>
              <button onClick={() => setShowForm(false)} className="btn-cancel flex-1">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Active Goals */}
        {activeGoals.length > 0 ? (
          <div className="space-y-3">
            {activeGoals.map(({ goal, percentage, remaining, suggestedMonthly, daysRemaining, isOverdue }) => (
              <div
                key={goal.id}
                className="border rounded-xl p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {goal.name}
                    </h3>
                    {goal.targetDate && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {isOverdue ? (
                          <Clock size={12} className="text-red-500" />
                        ) : (
                          <Calendar size={12} className="text-gray-400" />
                        )}
                        <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                          {isOverdue
                            ? `Vencida hace ${Math.abs(daysRemaining!)} días`
                            : `${daysRemaining} días restantes`
                          }
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (showAddSavings === goal.id) {
                          setShowAddSavings(null);
                        } else {
                          setShowAddSavings(goal.id!);
                          setSavingsAmount('');
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
                      title="Agregar ahorro"
                    >
                      <DollarSign size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(goal)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    {displayAmount(goal.currentAmount)}
                  </span>
                  <span className="text-xs text-gray-500">
                    de {displayAmount(goal.targetAmount)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${percentage >= 100 ? 'bg-green-500' : percentage >= 75 ? 'bg-blue-500' : 'bg-purple-500'
                      }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{percentage}% completado</span>
                  <span>Faltan {displayAmount(remaining)}</span>
                </div>

                {suggestedMonthly && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    💡 Ahorra {displayAmount(suggestedMonthly)}/mes para alcanzar tu meta
                  </p>
                )}

                {/* Add savings form */}
                {showAddSavings === goal.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberForInput(savingsAmount)}
                      onChange={e => setSavingsAmount(unformatNumber(e.target.value))}
                      placeholder="Monto a ahorrar"
                      className="input-base flex-1 text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => handleAddSavings(goal.id!)}
                      className="btn-submit text-sm px-3"
                    >
                      Ahorrar
                    </button>
                    <button
                      onClick={() => setShowAddSavings(null)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Target size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay metas de ahorro</p>
              <p className="text-xs mt-1">Crea una meta para empezar a ahorrar con propósito</p>
            </div>
          )
        )}

        {/* Completed Goals */}
        {completedGoals.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showCompleted ? 'Ocultar' : 'Mostrar'} completadas ({completedGoals.length})
            </button>
            {showCompleted && (
              <div className="mt-2 space-y-2">
                {completedGoals.map(({ goal }) => (
                  <div key={goal.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Trophy size={16} className="text-amber-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {goal.name}
                      </span>
                    </div>
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                      {displayAmount(goal.targetAmount)}
                    </span>
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
