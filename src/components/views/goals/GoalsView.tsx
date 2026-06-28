'use client';

import React, { useState } from 'react';
import { Plus, Target, Trophy, Calendar, Trash2, DollarSign, X, Clock, CheckCircle2, Info, Lightbulb } from 'lucide-react';
import { useGoalsDomain } from '../../../hooks/useFinanceSelectors';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { formatCurrency, formatNumberForInput, unformatNumber, parseCurrency } from '../../../utils/formatters';
import { showToast } from '../../../utils/toastHelpers';
import { ConfirmDialog } from '../../modals/ConfirmDialog';
import type { SavingsGoal } from '../../../types/finance';

/**
 * Vista de metas de ahorro
 * Permite crear metas con montos objetivo y trackear progreso
 */
export const GoalsView: React.FC = () => {
  const {
    addGoal,
    deleteGoal,
    addSavings,
    goalStatuses,
    goalStats,
  } = useGoalsDomain();
  const { hideBalances } = useUIPreferences();

  const [showForm, setShowForm] = useState(false);
  const [showAddSavings, setShowAddSavings] = useState<string | null>(null);
  const [savingsAmount, setSavingsAmount] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    targetDate: '',
  });

  const handleSubmit = async () => {
    const amount = parseCurrency(formData.targetAmount);
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
    const amount = parseCurrency(savingsAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast.error('El monto debe ser mayor a 0');
      return;
    }

    await addSavings(goalId, amount);
    showToast.success('Ahorro registrado');
    setSavingsAmount('');
    setShowAddSavings(null);
  };

  const handleDelete = (goal: SavingsGoal) => {
    setGoalToDelete(goal);
  };

  const confirmDeleteGoal = async () => {
    if (!goalToDelete) return;
    await deleteGoal(goalToDelete.id!);
    setGoalToDelete(null);
    showToast.success('Meta eliminada');
  };

  const activeGoals = goalStatuses.filter(gs => !gs.goal.isCompleted);
  const completedGoals = goalStatuses.filter(gs => gs.goal.isCompleted);

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="card">
        {/* Header con descripción */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Metas de ahorro
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Define y alcanza tus objetivos financieros
          </p>
          {/* P-goals-isolated: las metas son un seguimiento informativo aparte.
              "Agregar ahorro" solo incrementa un contador; NO descuenta dinero de
              ninguna cuenta. Se divulga para evitar que el usuario crea que el
              dinero ahorrado dejó sus saldos (se contaría doble). */}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-info-muted border border-info/20 px-3 py-2">
            <Info size={14} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
            <p className="text-xs text-info">
              Seguimiento manual — registrar un ahorro aquí <strong>no mueve dinero</strong> de tus cuentas ni afecta tus saldos.
            </p>
          </div>
        </div>

        {/* Stats - planas y neutras (las metas son seguimiento, no estado) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Target className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Metas activas</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{goalStats.activeCount}</p>
          </div>
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Target className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Objetivo total</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{displayAmount(goalStats.totalTarget)}</p>
          </div>
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ahorrado</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{displayAmount(goalStats.totalSaved)}</p>
          </div>
          <div className="card-stat">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="text-gray-500 dark:text-gray-400" size={18} />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Completadas</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{goalStats.completedCount}</p>
          </div>
        </div>

        {/* Header con botón */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Mis metas
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary text-sm"
          >
            <Plus size={16} />
            Nueva meta
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
                Crear meta
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
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {goal.name}
                    </span>
                    {goal.targetDate && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {isOverdue ? (
                          <Clock size={12} className="text-destructive" />
                        ) : (
                          <Calendar size={12} className="text-gray-400" />
                        )}
                        <span className={`text-xs ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {isOverdue
                            ? `Vencida hace ${Math.abs(daysRemaining!)} ${Math.abs(daysRemaining!) === 1 ? 'día' : 'días'}`
                            : `${daysRemaining} ${daysRemaining === 1 ? 'día restante' : 'días restantes'}`
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
                      className="p-1.5 rounded-lg hover:bg-destructive-muted text-destructive"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {displayAmount(goal.currentAmount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    de {displayAmount(goal.targetAmount)}
                  </span>
                </div>

                {/* Progress bar — marca mientras avanza, éxito al completar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                  <div
                    className={`h-3 rounded-full transition-[width,background-color] duration-500 ${percentage >= 100 ? 'bg-success' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{percentage >= 100 ? 'Completada' : `${Math.min(100, percentage)}% completado`}</span>
                  <span>Faltan {displayAmount(remaining)}</span>
                </div>

                {suggestedMonthly && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                    <Lightbulb size={12} className="text-gray-400 shrink-0" />
                    Ahorra {displayAmount(suggestedMonthly)}/mes para alcanzar tu meta
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
                {showAddSavings === goal.id && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Solo actualiza el progreso de la meta; no descuenta de tus cuentas.
                  </p>
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
                  <div key={goal.id} className="flex items-center justify-between p-3 bg-success-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Trophy size={16} className="text-warning" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {goal.name}
                      </span>
                    </div>
                    <span className="text-sm text-success font-medium">
                      {displayAmount(goal.targetAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmación eliminar meta */}
      <ConfirmDialog
        isOpen={!!goalToDelete}
        title="Eliminar meta"
        message={goalToDelete && (
          <>
            ¿Eliminar la meta{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{goalToDelete.name}</span>?
          </>
        )}
        confirmLabel="Eliminar"
        onConfirm={confirmDeleteGoal}
        onClose={() => setGoalToDelete(null)}
      />
    </div>
  );
};
